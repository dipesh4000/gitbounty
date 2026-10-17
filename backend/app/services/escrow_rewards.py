"""Cash eligibility that is stricter than the existing points award rule."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

import httpx

from .. import github_app
from ..features.merged_prs.issue_links import find_closed_issues


class EscrowIneligible(ValueError):
    """Verified GitHub facts do not satisfy the frozen cash rules."""


@dataclass(frozen=True)
class CashEvidence:
    terms: dict
    issue: dict
    closed_event: dict
    closing_reference: str


async def _closed_event(
    client: httpx.AsyncClient,
    token: str,
    repo_full_name: str,
    issue_number: int,
    github_pr_id: int,
) -> dict:
    owner, name = repo_full_name.split("/", 1)
    query = """
      query($owner:String!,$name:String!,$number:Int!,$before:String) {
        repository(owner:$owner,name:$name) {
          issue(number:$number) {
            timelineItems(last:100,before:$before,itemTypes:[CLOSED_EVENT]) {
              pageInfo { hasPreviousPage startCursor }
              nodes { ... on ClosedEvent {
                id createdAt closer { __typename ... on PullRequest { databaseId } }
              }}
            }
          }
        }
      }
    """
    before = None
    matches: list[dict] = []
    while True:
        result = await github_app.request(
            client, "POST", "/graphql", token,
            json={"query": query, "variables": {
                "owner": owner, "name": name, "number": issue_number, "before": before,
            }},
        )
        if result.get("errors"):
            raise RuntimeError("GitHub closure evidence is unavailable.")
        timeline = (((result.get("data") or {}).get("repository") or {}).get("issue") or {}).get("timelineItems")
        if not timeline:
            raise EscrowIneligible("GitHub has no issue-closure evidence.")
        matches.extend(
            node for node in timeline.get("nodes", [])
            if ((node or {}).get("closer") or {}).get("__typename") == "PullRequest"
            and ((node or {}).get("closer") or {}).get("databaseId") == github_pr_id
        )
        page = timeline.get("pageInfo") or {}
        if not page.get("hasPreviousPage"):
            break
        before = page.get("startCursor")
        if not before:
            raise RuntimeError("GitHub closure pagination is invalid.")
    if len(matches) != 1:
        raise EscrowIneligible("GitHub closure evidence is missing or ambiguous.")
    return matches[0]


async def validate_cash_eligibility(
    connection,
    client: httpx.AsyncClient,
    token: str,
    repo: dict,
    pr: dict,
    author_github_id: int,
    issue_number: int,
) -> CashEvidence:
    full_name = repo["full_name"]
    if (pr.get("user") or {}).get("type") == "Bot":
        raise EscrowIneligible("Bot authors cannot receive cash rewards.")
    if not pr.get("merged") or not pr.get("merged_at") or (pr.get("user") or {}).get("id") != author_github_id:
        raise EscrowIneligible("A verified merged PR author is required.")
    if pr.get("base", {}).get("ref") != repo.get("default_branch"):
        raise EscrowIneligible("Cash rewards require a merge into the default branch.")
    if author_github_id == repo.get("owner", {}).get("id"):
        raise EscrowIneligible("Repository owners cannot collect their own cash bounty.")

    body_references = [
        ref for ref in find_closed_issues(pr.get("body") or "", full_name)
        if ref.repo_full_name.casefold() == full_name.casefold()
    ]
    funded = await connection.fetch(
        """select t.*, f.funded_at from escrow_reward_terms t
           join issue_points ip on ip.id = t.bounty_id
           join escrow_funding_events f on f.bounty_id = t.bounty_id
           where lower(ip.repo_full_name) = lower($1)
             and ip.issue_number = any($2::int[])""",
        full_name, [ref.number for ref in body_references] or [0],
    )
    if len(funded) != 1 or not any(ref.number == issue_number for ref in body_references):
        raise EscrowIneligible("The PR body must close exactly one funded issue in this repository.")
    terms = dict(funded[0])
    if terms["payer_github_id"] == author_github_id:
        raise EscrowIneligible("The bounty payer cannot collect the cash reward.")
    merged_at = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))
    if merged_at < terms["funded_at"] or merged_at >= terms["work_ends_at"]:
        raise EscrowIneligible("The pull request merged outside the funded work window.")
    if terms["repository_github_id"] != repo["id"]:
        raise EscrowIneligible("The funded repository identity does not match GitHub.")

    issue = await github_app.request(client, "GET", f"/repos/{full_name}/issues/{issue_number}", token)
    if issue.get("id") != terms["issue_github_id"] or issue.get("state") != "closed" or "pull_request" in issue:
        raise EscrowIneligible("The funded issue identity or state does not match GitHub.")
    event = await _closed_event(client, token, full_name, issue_number, pr["id"])
    return CashEvidence(
        terms=terms,
        issue=issue,
        closed_event=event,
        closing_reference=f"{full_name}#{issue_number}",
    )


async def reserve_cash_allocation(connection, evidence: CashEvidence, pr: dict, author_github_id: int) -> bool:
    allocation_id = await connection.fetchval(
        """select id from reward_allocations
           where github_id = $1 and github_pr_id = $2 and kind = 'bounty_award'
             and lower(bounty_repo_full_name) = lower($3) and bounty_issue_number = $4""",
        author_github_id, pr["id"], evidence.closing_reference.rsplit("#", 1)[0], evidence.issue["number"],
    )
    if allocation_id is None:
        return False
    event_at = datetime.fromisoformat(evidence.closed_event["createdAt"].replace("Z", "+00:00"))
    merged_at = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))
    result = await connection.execute(
        """insert into escrow_allocations
           (allocation_id, bounty_id, author_github_id, github_pr_id, repository_github_id,
            issue_github_id, merged_at, closing_reference, pr_snapshot,
            closed_event_id, closed_event_at, eligibility_snapshot)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb)
           on conflict do nothing""",
        allocation_id, evidence.terms["bounty_id"], author_github_id, pr["id"],
        evidence.terms["repository_github_id"], evidence.terms["issue_github_id"], merged_at,
        evidence.closing_reference,
        json.dumps({"id": pr["id"], "number": pr["number"], "body": pr.get("body") or "",
                    "base": pr.get("base"), "author": pr.get("user"), "merged_at": pr["merged_at"]}),
        evidence.closed_event["id"], event_at,
        json.dumps({"rule_version": "escrow-v1", "funded_at": evidence.terms["funded_at"].isoformat(),
                    "closed_event_id": evidence.closed_event["id"]}),
    )
    return result == "INSERT 0 1"
