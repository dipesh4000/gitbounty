-- 0010_backfill_points_ledger.sql
-- Changes: writes points_ledger entries for merged_prs rows that predate the ledger.
-- Depends on: 0005_merged_prs.sql and 0008_points_ledger.sql.
--
-- Why this is needed.
--
-- Before 0008, a user's total was `sum(points)` over merged_prs. After it, the
-- total is `sum(points)` over points_ledger. A database that already held
-- merged_prs rows therefore went to **zero points for everybody** the moment
-- 0008 was applied: the rows were still there, but nothing read them any more.
--
-- Verified on a copy: a database carrying one merged_prs row worth 45 reported
-- 45 before the upgrade and 0 after it. Silently erasing somebody's reputation
-- is exactly the failure the ledger exists to prevent, so the upgrade has to
-- carry the old awards across rather than abandon them.
--
-- What this writes.
--
-- One entry per pre-existing merged_prs row, reconstructed as faithfully as the
-- old data allows:
--
--   * a `bounty_award` of merged_prs.issue_points, when that row recorded an
--     issue value and which issue it closed;
--   * a `baseline_award` for the remainder (points - issue_points), when that
--     remainder is positive.
--
-- rule_version is 'points-v0-backfill', NOT 'points-v1'. These awards were not
-- produced by the current rules and must not claim to have been: the old rules
-- had no maximum, paid the baseline for a merge into any repository at all, and
-- took a value from a GitHub label nobody had authenticated. Anyone auditing a
-- total can tell a reconstructed entry from an earned one by that string alone.
--
-- Safety.
--
--   * `on conflict do nothing` against the two partial unique indexes, so this
--     is idempotent and cannot double-award. Re-running it writes nothing.
--   * A database with no merged_prs rows -- a fresh install -- gets nothing.
--   * A bounty already awarded to somebody else is skipped by
--     points_ledger_bounty_once, which is the correct outcome: one bounty, one
--     award, and the ledger's rule wins over the reconstruction.
--   * Nothing is updated or deleted. merged_prs is left exactly as it was.

-- The bounty half: what the issue was worth, where the old row recorded one.
insert into points_ledger (
    user_id, kind, points, category, category_source, rule_version, reason,
    github_pr_id, pr_repo_full_name, pr_number, merged_at,
    bounty_repo_full_name, bounty_issue_number, bounty_points_at_award
)
select m.user_id,
       'bounty_award',
       m.issue_points,
       m.category,
       'inferred',
       'points-v0-backfill',
       'Reconstructed when the points ledger was introduced, from a merge counted under the earlier rules.',
       m.github_pr_id,
       m.repo_full_name,
       m.number,
       m.merged_at,
       m.closed_issue_repo,
       m.closed_issue_number,
       m.issue_points
from merged_prs m
where m.issue_points is not null
  and m.issue_points > 0
  and m.closed_issue_repo is not null
  and m.closed_issue_number is not null
on conflict do nothing;

-- The baseline half: whatever the merge was worth beyond the issue's value.
insert into points_ledger (
    user_id, kind, points, category, category_source, rule_version, reason,
    github_pr_id, pr_repo_full_name, pr_number, merged_at
)
select m.user_id,
       'baseline_award',
       m.points - coalesce(
           case
               when m.issue_points > 0
                    and m.closed_issue_repo is not null
                    and m.closed_issue_number is not null
               then m.issue_points
           end, 0),
       m.category,
       'inferred',
       'points-v0-backfill',
       'Reconstructed when the points ledger was introduced, from a merge counted under the earlier rules.',
       m.github_pr_id,
       m.repo_full_name,
       m.number,
       m.merged_at
from merged_prs m
where m.points - coalesce(
          case
              when m.issue_points > 0
                   and m.closed_issue_repo is not null
                   and m.closed_issue_number is not null
              then m.issue_points
          end, 0) > 0
on conflict do nothing;
