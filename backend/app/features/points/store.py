"""Reading and writing points.

Plain SQL against the schema in `migrations/`. Every query is written out in full rather than built, so
that what runs against the real database is exactly what can be read here.

**The ledger is the record.** `points_ledger` is append-only: a total is `sum(points)` over a user's
entries, a correction is a new negative entry, and nothing is ever edited. `merged_prs` remains the record
of *which pull requests have been seen*, which is a different question from *what has been awarded*.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

import asyncpg

from ..merged_prs.models import Category
from ..merged_prs.lifecycle import TrackedPullRequest
from ..merged_prs.service import DetectedMerge, PublishedBounty
from .rules import RULE_VERSION, baseline_award

logger = logging.getLogger("gitbounty.points")

CATEGORY_VALUES: tuple[str, ...] = tuple(category.value for category in Category)


@dataclass(frozen=True)
class SaveOutcome:
    """What one sync changed."""

    #: Pull requests stored for the first time.
    newly_counted: int
    #: Pull requests already stored, seen again. Nothing was awarded for them a second time.
    already_counted: int
    #: Ledger entries written by this sync.
    awards_written: int
    #: Points those entries came to.
    points_awarded: int
    #: Bounty awards that were refused because the bounty had already been awarded to somebody.
    bounties_already_claimed: int


@dataclass(frozen=True)
class MergeRow:
    """One stored merge, for showing a contributor where their points came from."""

    github_pr_id: int
    repo_full_name: str
    number: int
    title: str
    url: str
    category: str
    merged_at: datetime
    bounty_repo_full_name: str | None
    bounty_issue_number: int | None
    bounty_points: int | None
    points: int


@dataclass(frozen=True)
class LedgerRow:
    """One entry in a user's points history."""

    id: int
    kind: str
    points: int
    category: str
    category_source: str
    rule_version: str
    reason: str
    pr_repo_full_name: str | None
    pr_number: int | None
    pr_url: str | None
    bounty_repo_full_name: str | None
    bounty_issue_number: int | None
    bounty_points_at_award: int | None
    merged_at: datetime | None
    created_at: datetime


@dataclass(frozen=True)
class LeaderboardRow:
    rank: int
    github_login: str
    avatar_url: str | None
    points: int
    merges: int


@dataclass(frozen=True)
class LeaderboardPage:
    rows: list[LeaderboardRow]
    total: int


async def upsert_user(
    connection: asyncpg.Connection,
    github_id: int,
    github_login: str,
    avatar_url: str | None = None,
) -> int:
    """Make sure a user row exists and return its id.

    Keyed on `github_id` rather than the login, because a person can rename their GitHub account and their
    login changes with it -- the numeric id does not.
    """
    return await connection.fetchval(
        """
        insert into users (github_id, github_login, avatar_url)
        values ($1, $2, $3)
        on conflict (github_id) do update
            set github_login = excluded.github_login,
                avatar_url   = coalesce(excluded.avatar_url, users.avatar_url)
        returning id
        """,
        github_id,
        github_login,
        avatar_url,
    )


async def published_bounties(connection: asyncpg.Connection) -> dict[tuple[str, int], PublishedBounty]:
    """Every currently published bounty, keyed for matching against a pull request's closing references.

    Unpublished and archived bounties are excluded: they are not on offer, so they do not award. A bounty
    that was unpublished *after* it was awarded keeps its ledger entry -- history is not rewritten.
    """
    rows = await connection.fetch(
        """
        select ip.repo_full_name,
               ip.issue_number,
               ip.points,
               ip.set_by_user_id,
               coalesce(i.category, 'other') as category
        from issue_points ip
        left join repositories r on lower(r.full_name) = lower(ip.repo_full_name)
        left join issues i on i.repository_id = r.id and i.number = ip.issue_number
        where ip.status = 'published'
        """
    )
    found: dict[tuple[str, int], PublishedBounty] = {}
    for row in rows:
        category = row["category"] if row["category"] in CATEGORY_VALUES else "other"
        bounty = PublishedBounty(
            repo_full_name=row["repo_full_name"],
            issue_number=row["issue_number"],
            points=row["points"],
            category=Category(category),
            maintainer_user_id=row["set_by_user_id"],
        )
        found[bounty.key] = bounty
    return found


async def record_merges(
    connection: asyncpg.Connection,
    user_id: int | None,
    merges: Sequence[DetectedMerge],
    *,
    github_id: int | None = None,
) -> SaveOutcome:
    """Store a sync's merges and write the ledger entries they earn. Safe to run repeatedly.

    Idempotency is the database's job, not this function's:

      - `merged_prs (user_id, github_pr_id)` is unique, so a pull request is stored once.
      - `points_ledger_baseline_once` allows one baseline entry per pull request per person.
      - `points_ledger_bounty_once` allows one bounty award per published bounty, to anybody, ever -- so a
        second pull request closing the same bounty earns nothing from it, and two people cannot both be
        paid for one bounty.

    Nothing already in the ledger is updated or deleted here. A merge seen again awards nothing a second
    time, and a bounty whose value the maintainer has since changed does not retroactively change a
    recorded award: `bounty_points_at_award` is what it was worth when it was awarded. Corrections are
    separate `adjustment` entries (see `record_adjustment`).
    """
    if not merges:
        return SaveOutcome(0, 0, 0, 0, 0)

    newly_counted = 0
    already_counted = 0
    awards_written = 0
    points_awarded = 0
    bounties_already_claimed = 0

    for merge in merges:
        pr = merge.pr
        inserted = None
        if user_id is not None:
            inserted = await connection.fetchval(
                """
                insert into merged_prs (
                    user_id, github_pr_id, repo_full_name, number, title, url, merged_at,
                    category, closed_issue_repo, closed_issue_number, issue_points, points
                ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                on conflict (user_id, github_pr_id) do nothing
                returning id
                """,
                user_id,
                pr.github_pr_id,
                pr.repo_full_name,
                pr.number,
                pr.title,
                pr.url,
                pr.merged_at,
                str(merge.category),
                merge.bounty.repo_full_name if merge.bounty else None,
                merge.bounty.issue_number if merge.bounty else None,
                merge.bounty.points if merge.bounty else None,
                merge.eligible_points,
            )
        if inserted is None:
            already_counted += 1
        else:
            newly_counted += 1

        if merge.baseline_eligible:
            written = await _insert_award(
                connection,
                user_id=user_id,
                github_id=github_id,
                kind="baseline_award",
                points=baseline_award(),
                category=str(merge.category),
                category_source=merge.category_source,
                merge=merge,
                bounty=None,
                reason="Flat award for a merged pull request in a participating repository.",
            )
            if written:
                awards_written += 1
                points_awarded += baseline_award()

        if merge.bounty is not None:
            written = await _insert_award(
                connection,
                user_id=user_id,
                github_id=github_id,
                kind="bounty_award",
                points=merge.bounty.points,
                category=str(merge.bounty.category),
                category_source="maintainer",
                merge=merge,
                bounty=merge.bounty,
                reason=(
                    f"Merged pull request closed the bounty published on "
                    f"{merge.bounty.repo_full_name}#{merge.bounty.issue_number}."
                ),
            )
            if written:
                awards_written += 1
                points_awarded += merge.bounty.points
            else:
                bounties_already_claimed += 1
                logger.info("bounty already claimed", extra={
                    "event": "points.bounty_already_claimed", "user_id": user_id,
                    "bounty": f"{merge.bounty.repo_full_name}#{merge.bounty.issue_number}",
                    "github_pr_id": pr.github_pr_id,
                })

    return SaveOutcome(
        newly_counted=newly_counted,
        already_counted=already_counted,
        awards_written=awards_written,
        points_awarded=points_awarded,
        bounties_already_claimed=bounties_already_claimed,
    )


async def _insert_award(
    connection: asyncpg.Connection,
    *,
    user_id: int | None,
    github_id: int | None,
    kind: str,
    points: int,
    category: str,
    category_source: str,
    merge: DetectedMerge,
    bounty: PublishedBounty | None,
    reason: str,
) -> bool:
    """Write one award, or return False because the database already holds it.

    `on conflict do nothing` against the two partial unique indexes is the whole anti-double-award
    mechanism. Doing it in SQL rather than with a prior SELECT means two syncs running at the same time
    cannot both decide the award is missing.
    """
    from .allocations import reserve

    if github_id is None:
        github_id = await connection.fetchval("select github_id from users where id = $1", user_id)
    if github_id is None:
        raise ValueError("An award requires a verified GitHub identity")
    return await reserve(connection, github_id, {
        "kind": kind, "points": points, "category": category, "category_source": category_source,
        "rule_version": RULE_VERSION, "reason": reason,
        "github_pr_id": merge.pr.github_pr_id, "pr_repo_full_name": merge.pr.repo_full_name,
        "pr_number": merge.pr.number, "pr_author_login": merge.pr.author_login,
        "merged_at": merge.pr.merged_at, "title": merge.pr.title, "url": merge.pr.url,
        "bounty_repo_full_name": bounty.repo_full_name if bounty else None,
        "bounty_issue_number": bounty.issue_number if bounty else None,
        "bounty_points_at_award": bounty.points if bounty else None,
        "maintainer_user_id": bounty.maintainer_user_id if bounty else None,
    }, user_id)



async def record_adjustment(
    connection: asyncpg.Connection,
    *,
    user_id: int,
    points: int,
    reason: str,
    category: str = "other",
    kind: str = "adjustment",
    github_pr_id: int | None = None,
    bounty_repo_full_name: str | None = None,
    bounty_issue_number: int | None = None,
) -> int:
    """Append a correction. The only way a total goes down.

    Positive or negative, always with a reason, and never by editing what is already there. A moderator
    withdrawing an award writes `kind="void"` with the negation of the original value; the original entry
    stays, so the history shows both what happened and that it was undone.
    """
    if not reason.strip():
        raise ValueError("An adjustment needs a reason.")
    entry_id = await connection.fetchval(
        """
        insert into points_ledger (
            user_id, kind, points, category, category_source, rule_version, reason,
            github_pr_id, bounty_repo_full_name, bounty_issue_number
        ) values ($1, $2, $3, $4, 'inferred', $5, $6, $7, $8, $9)
        returning id
        """,
        user_id, kind, points, category, RULE_VERSION, reason.strip(),
        github_pr_id, bounty_repo_full_name, bounty_issue_number,
    )
    logger.info("ledger adjustment", extra={
        "event": "points.adjusted", "user_id": user_id, "kind": kind, "points": points,
        "entry_id": entry_id, "reason": reason.strip()[:200],
    })
    return entry_id


async def user_totals(connection: asyncpg.Connection, user_id: int) -> dict[str, int]:
    """One user's points and merge count.

    Points come from the ledger, merges from `merged_prs`: a person's score and the number of pull requests
    behind it are two different facts, and summing a signed ledger would not give the second.
    """
    row = await connection.fetchrow(
        """
        select
            (select coalesce(sum(points), 0)::int from points_ledger where user_id = $1) as points,
            (select count(*)::int from merged_prs where user_id = $1)                     as merges
        """,
        user_id,
    )
    return {"points": row["points"], "merges": row["merges"]}


async def user_points_since(
    connection: asyncpg.Connection, user_id: int, since: datetime
) -> int:
    """One user's points inside a real time window, used by the popup's weekly score.

    Windowed on the merge the entry came from where there is one, and on when the entry was written
    otherwise -- an adjustment made today belongs in today's window even if the merge it corrects is old.
    """
    return await connection.fetchval(
        """
        select coalesce(sum(points), 0)::int
        from points_ledger
        where user_id = $1 and coalesce(merged_at, created_at) >= $2
        """,
        user_id,
        since,
    )


async def user_points_by_category(connection: asyncpg.Connection, user_id: int) -> dict[str, int]:
    """One user's points, split by category. Only categories they actually have appear."""
    rows = await connection.fetch(
        """
        select category, sum(points)::int as points
        from points_ledger
        where user_id = $1
        group by category
        having sum(points) <> 0
        order by points desc, category asc
        """,
        user_id,
    )
    return {row["category"]: row["points"] for row in rows}


async def leaderboard(
    connection: asyncpg.Connection,
    *,
    since: datetime | None = None,
    category: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> LeaderboardPage:
    """Ranked users, most points first, with the total number of ranked users.

    `since` gives the weekly or monthly board, `category` the per-category one, and both together a
    combination. Ties break on merge count and then login, so the same data always produces the same order
    -- a leaderboard that reshuffles between refreshes looks broken. `total` is returned so a caller can
    page without guessing, and so a user outside the first page can still be told their rank.

    Users whose entries net to zero or less are left out: a withdrawn award should not leave somebody
    sitting at the bottom of a public board.
    """
    rows = await connection.fetch(
        """
        with scored as (
            select l.user_id,
                   sum(l.points)::int as points,
                   count(distinct l.github_pr_id) filter (where l.github_pr_id is not null)::int as merges
            from points_ledger l
            where ($1::timestamptz is null or coalesce(l.merged_at, l.created_at) >= $1)
              and ($2::text is null or l.category = $2)
            group by l.user_id
            having sum(l.points) > 0
        ),
        ranked as (
            select scored.*,
                   u.github_login,
                   u.avatar_url,
                   rank() over (order by scored.points desc, scored.merges desc, u.github_login asc) as position,
                   count(*) over () as total
            from scored
            join users u on u.id = scored.user_id
        )
        select github_login, avatar_url, points, merges, position, total
        from ranked
        order by position, github_login
        limit $3 offset $4
        """,
        since,
        category,
        limit,
        offset,
    )

    total = rows[0]["total"] if rows else 0
    return LeaderboardPage(
        rows=[
            LeaderboardRow(
                rank=row["position"],
                github_login=row["github_login"],
                avatar_url=row["avatar_url"],
                points=row["points"],
                merges=row["merges"],
            )
            for row in rows
        ],
        total=total,
    )


async def leaderboard_position(
    connection: asyncpg.Connection,
    user_id: int,
    *,
    since: datetime | None = None,
    category: str | None = None,
) -> LeaderboardRow | None:
    """Where one user sits on a board, however far down it they are.

    Without this, somebody at rank 150 is told nothing at all by a 100-row page.
    """
    row = await connection.fetchrow(
        """
        with scored as (
            select l.user_id,
                   sum(l.points)::int as points,
                   count(distinct l.github_pr_id) filter (where l.github_pr_id is not null)::int as merges
            from points_ledger l
            where ($1::timestamptz is null or coalesce(l.merged_at, l.created_at) >= $1)
              and ($2::text is null or l.category = $2)
            group by l.user_id
            having sum(l.points) > 0
        ),
        ranked as (
            select scored.*,
                   u.github_login,
                   u.avatar_url,
                   rank() over (order by scored.points desc, scored.merges desc, u.github_login asc) as position
            from scored
            join users u on u.id = scored.user_id
        )
        select github_login, avatar_url, points, merges, position from ranked where user_id = $3
        """,
        since,
        category,
        user_id,
    )
    if row is None:
        return None
    return LeaderboardRow(
        rank=row["position"],
        github_login=row["github_login"],
        avatar_url=row["avatar_url"],
        points=row["points"],
        merges=row["merges"],
    )


async def recent_merges(
    connection: asyncpg.Connection, user_id: int, limit: int = 25
) -> list[MergeRow]:
    """A user's most recent counted merges, newest first, with what the ledger actually awarded each.

    `points` is summed from the ledger rather than read from `merged_prs.points`, so what a contributor is
    shown is what they were actually credited -- including a correction.
    """
    rows = await connection.fetch(
        """
        select m.github_pr_id,
               m.repo_full_name,
               m.number,
               m.title,
               m.url,
               -- The ledger decides, where it has an opinion. A bounty published *after* the merge was
               -- first seen is awarded on the next sync, but the merged_prs row is inserted once and
               -- never updated -- so reading the bounty from it showed "no bounty" next to a row worth
               -- 45, which contradicts the award beside it.
               coalesce(award.category, m.category)        as category,
               m.merged_at,
               coalesce(award.bounty_repo, m.closed_issue_repo)     as bounty_repo_full_name,
               coalesce(award.bounty_number, m.closed_issue_number) as bounty_issue_number,
               coalesce(award.bounty_points, m.issue_points)        as bounty_points,
               coalesce(ledger.points, 0)                           as points
        from merged_prs m
        left join lateral (
            select sum(l.points)::int as points
            from points_ledger l
            where l.user_id = m.user_id and l.github_pr_id = m.github_pr_id
        ) ledger on true
        left join lateral (
            select l.bounty_repo_full_name  as bounty_repo,
                   l.bounty_issue_number    as bounty_number,
                   l.bounty_points_at_award as bounty_points,
                   l.category               as category
            from points_ledger l
            where l.user_id = m.user_id
              and l.github_pr_id = m.github_pr_id
              and l.kind = 'bounty_award'
            limit 1
        ) award on true
        where m.user_id = $1
        order by m.merged_at desc
        limit $2
        """,
        user_id,
        limit,
    )
    return [
        MergeRow(
            github_pr_id=row["github_pr_id"],
            repo_full_name=row["repo_full_name"],
            number=row["number"],
            title=row["title"],
            url=row["url"],
            category=row["category"],
            merged_at=row["merged_at"],
            bounty_repo_full_name=row["bounty_repo_full_name"],
            bounty_issue_number=row["bounty_issue_number"],
            bounty_points=row["bounty_points"],
            points=row["points"],
        )
        for row in rows
    ]


async def points_history(
    connection: asyncpg.Connection, user_id: int, *, limit: int = 50, offset: int = 0
) -> tuple[list[LedgerRow], int]:
    """A user's ledger entries, newest first, with the total count for paging.

    This is the auditable history: every entry says what kind it is, which pull request and which bounty it
    came from, which version of the rules produced it, and why.
    """
    rows = await connection.fetch(
        """
        select l.id, l.kind, l.points, l.category, l.category_source, l.rule_version, l.reason,
               l.pr_repo_full_name, l.pr_number, m.url as pr_url,
               l.bounty_repo_full_name, l.bounty_issue_number, l.bounty_points_at_award,
               l.merged_at, l.created_at,
               count(*) over () as total
        from points_ledger l
        left join merged_prs m on m.user_id = l.user_id and m.github_pr_id = l.github_pr_id
        where l.user_id = $1
        order by l.created_at desc, l.id desc
        limit $2 offset $3
        """,
        user_id,
        limit,
        offset,
    )
    total = rows[0]["total"] if rows else 0
    return (
        [
            LedgerRow(
                id=row["id"],
                kind=row["kind"],
                points=row["points"],
                category=row["category"],
                category_source=row["category_source"],
                rule_version=row["rule_version"],
                reason=row["reason"],
                pr_repo_full_name=row["pr_repo_full_name"],
                pr_number=row["pr_number"],
                pr_url=row["pr_url"],
                bounty_repo_full_name=row["bounty_repo_full_name"],
                bounty_issue_number=row["bounty_issue_number"],
                bounty_points_at_award=row["bounty_points_at_award"],
                merged_at=row["merged_at"],
                created_at=row["created_at"],
            )
            for row in rows
        ],
        total,
    )


# --- the pull-request lifecycle ---------------------------------------------


@dataclass(frozen=True)
class PullRequestRow:
    """One tracked pull request, with what it is expected to earn and what it has actually earned."""

    github_pr_id: int
    repo_full_name: str
    number: int
    title: str
    url: str
    state: str
    is_draft: bool
    category: str
    category_source: str
    bounty_repo_full_name: str | None
    bounty_issue_number: int | None
    bounty_points: int | None
    baseline_eligible: bool
    eligible: bool
    ineligible_reason: str | None
    expected_points: int
    awarded_points: int
    pr_created_at: datetime | None
    pr_updated_at: datetime | None
    merged_at: datetime | None
    closed_at: datetime | None


async def record_pull_requests(
    connection: asyncpg.Connection,
    user_id: int,
    tracked: Sequence[TrackedPullRequest],
) -> int:
    """Store what GitHub currently says about each pull request. Returns how many rows were written.

    Unlike the ledger this table is **mutable on purpose**: it is a cache of GitHub, and a pull request's
    state is whatever GitHub says today. A draft becomes open, an approval becomes a merge, a review is
    withdrawn. `on conflict do update` is therefore correct here and would be wrong one table over.

    `first_seen_at` is the one column never updated, so "when did GitBounty first see this?" survives.
    Nothing here awards anything: only `record_merges` writes to points_ledger.
    """
    if not tracked:
        return 0

    for item in tracked:
        pr = item.pr
        await connection.execute(
            """
            insert into pull_requests (
                user_id, github_pr_id, repo_full_name, number, title, url, author_login,
                state, is_draft, category, category_source,
                bounty_repo_full_name, bounty_issue_number, bounty_points, baseline_eligible,
                eligible, ineligible_reason,
                pr_created_at, pr_updated_at, merged_at, closed_at, last_synced_at
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
            on conflict (user_id, github_pr_id) do update set
                repo_full_name = excluded.repo_full_name,
                number = excluded.number,
                title = excluded.title,
                url = excluded.url,
                state = excluded.state,
                is_draft = excluded.is_draft,
                category = excluded.category,
                category_source = excluded.category_source,
                bounty_repo_full_name = excluded.bounty_repo_full_name,
                bounty_issue_number = excluded.bounty_issue_number,
                bounty_points = excluded.bounty_points,
                baseline_eligible = excluded.baseline_eligible,
                eligible = excluded.eligible,
                ineligible_reason = excluded.ineligible_reason,
                pr_updated_at = excluded.pr_updated_at,
                merged_at = excluded.merged_at,
                closed_at = excluded.closed_at,
                last_synced_at = now()
            """,
            user_id, pr.github_pr_id, pr.repo_full_name, pr.number, pr.title, pr.url, pr.author_login,
            str(item.state), pr.is_draft, str(item.category), item.category_source,
            item.bounty.repo_full_name if item.bounty else None,
            item.bounty.issue_number if item.bounty else None,
            item.bounty.points if item.bounty else None,
            item.baseline_eligible, item.eligible, item.ineligible_reason,
            pr.created_at, pr.updated_at, pr.merged_at, pr.closed_at,
        )
    return len(tracked)


async def list_pull_requests(
    connection: asyncpg.Connection,
    user_id: int,
    *,
    states: Sequence[str] | None = None,
    limit: int = 25,
    offset: int = 0,
) -> tuple[list[PullRequestRow], int, dict[str, int]]:
    """A user's pull requests, newest activity first, with the per-state counts for the filter chips.

    `awarded_points` comes from the ledger, never from this table: what was actually credited is the
    ledger's answer, and a cache of GitHub has no business claiming it.
    """
    counts = {
        row["state"]: row["count"]
        for row in await connection.fetch(
            "select state, count(*)::int as count from pull_requests where user_id = $1 group by state",
            user_id,
        )
    }

    rows = await connection.fetch(
        """
        select p.github_pr_id, p.repo_full_name, p.number, p.title, p.url, p.state, p.is_draft,
               p.category, p.category_source,
               p.bounty_repo_full_name, p.bounty_issue_number, p.bounty_points,
               p.baseline_eligible, p.eligible, p.ineligible_reason,
               p.pr_created_at, p.pr_updated_at, p.merged_at, p.closed_at,
               coalesce((
                   select sum(l.points)::int from points_ledger l
                   where l.user_id = p.user_id and l.github_pr_id = p.github_pr_id
               ), 0) as awarded_points,
               count(*) over () as total
        from pull_requests p
        where p.user_id = $1
          and ($2::text[] is null or p.state = any($2::text[]))
        order by coalesce(p.merged_at, p.closed_at, p.pr_updated_at, p.pr_created_at) desc nulls last,
                 p.github_pr_id desc
        limit $3 offset $4
        """,
        user_id,
        list(states) if states else None,
        limit,
        offset,
    )

    total = rows[0]["total"] if rows else 0
    return (
        [
            PullRequestRow(
                github_pr_id=row["github_pr_id"],
                repo_full_name=row["repo_full_name"],
                number=row["number"],
                title=row["title"],
                url=row["url"],
                state=row["state"],
                is_draft=row["is_draft"],
                category=row["category"],
                category_source=row["category_source"],
                bounty_repo_full_name=row["bounty_repo_full_name"],
                bounty_issue_number=row["bounty_issue_number"],
                bounty_points=row["bounty_points"],
                baseline_eligible=row["baseline_eligible"],
                eligible=row["eligible"],
                ineligible_reason=row["ineligible_reason"],
                expected_points=_expected(row),
                awarded_points=row["awarded_points"],
                pr_created_at=row["pr_created_at"],
                pr_updated_at=row["pr_updated_at"],
                merged_at=row["merged_at"],
                closed_at=row["closed_at"],
            )
            for row in rows
        ],
        total,
        counts,
    )


def _expected(row: asyncpg.Record) -> int:
    """What a pull request would earn if merged as it stands. Zero when it is not eligible."""
    if not row["eligible"]:
        return 0
    return (row["bounty_points"] or 0) + (baseline_award() if row["baseline_eligible"] else 0)
