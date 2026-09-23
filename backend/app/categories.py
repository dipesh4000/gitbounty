"""Sorting issues into the four categories the board filters by.

The point of categories is the problem in overview.md: someone who only knows
CSS should not be shown a database migration issue.

A category is decided by the repository's main language, with one override —
anything labelled as documentation is docs regardless of language.
"""

from __future__ import annotations

CATEGORIES = ("frontend", "backend", "fullstack", "docs")

FRONTEND_LANGUAGES = frozenset(
    {"javascript", "typescript", "css", "html", "scss", "vue", "svelte"}
)

BACKEND_LANGUAGES = frozenset(
    {"python", "go", "rust", "java", "ruby", "php", "c#", "c++", "elixir", "kotlin", "scala"}
)

# Lower-cased label names that mean "this is a documentation task".
DOC_LABELS = frozenset({"documentation", "docs", "doc", "good first doc"})


def classify(language: str | None, labels: list[str] | None = None) -> str:
    """Return one of CATEGORIES for an issue."""
    names = {label.lower() for label in (labels or [])}
    if names & DOC_LABELS:
        return "docs"

    lang = (language or "").lower()
    if lang in FRONTEND_LANGUAGES:
        return "frontend"
    if lang in BACKEND_LANGUAGES:
        return "backend"
    return "fullstack"


# Languages the sync job searches. Kept deliberately short: each entry is one
# call to GitHub's search API, which allows about 30 per minute.
SYNC_LANGUAGES = (
    "javascript",
    "typescript",
    "css",
    "python",
    "go",
    "rust",
    "java",
)


def sync_queries() -> list[str]:
    """The GitHub issue searches the sync job runs.

    Restricted to unassigned "good first issue" tickets on active repos, which
    is what someone looking for work to pick up actually wants. Widen this list
    if the board starts looking thin.
    """
    base = "is:issue is:open no:assignee archived:false"
    queries = [f'{base} label:"good first issue" language:{lang}' for lang in SYNC_LANGUAGES]
    queries.append(f"{base} label:documentation")
    return queries
