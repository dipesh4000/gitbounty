"""Work out which category a merged pull request belongs to.

Two sources of evidence, strongest first:

1. **The files it changed.** What a PR touched is the most honest description of what it was. This needs one extra
   GitHub request per PR, so the caller decides whether to pay for it.
2. **Its labels and title.** Free -- they already arrive with the PR -- but much weaker, since labels are whatever
   the repo happens to use and titles are prose.

Everything here is a pure function: same input, same answer, no network. That keeps the guessing honest and
testable, and means the rules can be tightened later without touching the code that fetches from GitHub.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Sequence

from .models import Category, MergedPR

# --- File-path evidence ------------------------------------------------------------------------------------

_DOC_EXTENSIONS = {".md", ".mdx", ".rst", ".adoc", ".txt"}
_DOC_DIRECTORIES = {"docs", "doc", "documentation", "man"}
_DOC_FILENAMES = {"readme", "changelog", "contributing", "license", "licence", "authors", "codeowners"}

_FRONTEND_EXTENSIONS = {".css", ".scss", ".sass", ".less", ".html", ".htm", ".vue", ".svelte", ".jsx", ".tsx"}
_FRONTEND_DIRECTORIES = {
    "components", "component", "styles", "style", "css", "public", "static", "assets",
    "ui", "views", "pages", "templates", "frontend", "client", "web",
}

_BACKEND_EXTENSIONS = {".py", ".go", ".rb", ".java", ".kt", ".php", ".rs", ".cs", ".ex", ".exs", ".sql", ".sh"}
_BACKEND_DIRECTORIES = {
    "api", "server", "backend", "migrations", "migration", "models", "model", "controllers",
    "services", "db", "database", "routes", "middleware", "handlers", "schemas", "jobs", "workers",
}
_BACKEND_FILENAMES = {"dockerfile", "makefile", "requirements", "pyproject", "gemfile", "pom", "go"}

# Extensions that genuinely could be either -- .js and .ts run on both sides of the wire. These are judged by the
# directory they sit in, and count for nothing if that gives no hint.
_AMBIGUOUS_EXTENSIONS = {".js", ".ts", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".toml"}


def _split(path: str) -> tuple[list[str], str, str]:
    """Return (lowercased directory segments, lowercased filename stem, lowercased extension)."""
    clean = path.strip().strip("/").casefold()
    segments = clean.split("/")
    filename = segments[-1] if segments else ""
    directories = segments[:-1]
    stem, _, extension = filename.rpartition(".")
    if not stem:  # a name with no dot, such as "Dockerfile"
        return directories, filename, ""
    return directories, stem, f".{extension}"


def classify_path(path: str) -> Category | None:
    """Categorise a single changed file, or None when it says nothing useful.

    Directory names are checked before extensions: `docs/install.js` is documentation that happens to ship a
    snippet, and `frontend/api/client.ts` is frontend code talking to an API, not backend code.
    """
    directories, stem, extension = _split(path)
    segments = set(directories)

    if segments & _DOC_DIRECTORIES or extension in _DOC_EXTENSIONS or stem in _DOC_FILENAMES:
        return Category.DOCS

    # The outermost directory wins, so a path is judged by where it lives rather than by any segment anywhere
    # in it. `frontend/api/client.ts` is frontend; `api/frontend_helpers.py` is backend.
    for directory in directories:
        if directory in _FRONTEND_DIRECTORIES:
            return Category.FRONTEND
        if directory in _BACKEND_DIRECTORIES:
            return Category.BACKEND

    if extension in _FRONTEND_EXTENSIONS:
        return Category.FRONTEND
    if extension in _BACKEND_EXTENSIONS or stem in _BACKEND_FILENAMES:
        return Category.BACKEND
    if extension in _AMBIGUOUS_EXTENSIONS:
        return None  # no directory hint, and the extension alone proves nothing

    return None


def _from_file_paths(paths: Iterable[str]) -> Category | None:
    """Combine per-file verdicts into one category for the whole PR."""
    votes = Counter(category for path in paths if (category := classify_path(path)) is not None)
    if not votes:
        return None

    frontend = votes[Category.FRONTEND]
    backend = votes[Category.BACKEND]
    code = frontend + backend

    if code == 0:
        return Category.DOCS  # only documentation files carried any signal

    # Real work on both sides is fullstack, but a single stray file shouldn't relabel a PR. A side has to be at
    # least a quarter of the code files touched to count as genuine.
    if frontend and backend and min(frontend, backend) / code >= 0.25:
        return Category.FULLSTACK
    if frontend == backend:
        return Category.FULLSTACK
    return Category.FRONTEND if frontend > backend else Category.BACKEND


# --- Label and title evidence ------------------------------------------------------------------------------

_KEYWORDS: dict[Category, frozenset[str]] = {
    Category.DOCS: frozenset({"docs", "doc", "documentation", "readme", "typo", "wording", "changelog"}),
    Category.FRONTEND: frozenset({
        "frontend", "front-end", "ui", "ux", "css", "styling", "styles", "html", "design",
        "layout", "responsive", "accessibility", "a11y",
    }),
    Category.BACKEND: frozenset({
        "backend", "back-end", "api", "server", "database", "db", "sql", "migration", "migrations",
        "endpoint", "query", "auth", "infra", "deployment",
    }),
    Category.FULLSTACK: frozenset({"fullstack", "full-stack"}),
}


def _words(text: str) -> set[str]:
    """Words in the text, lowercased, hyphenated compounds kept whole and also split."""
    lowered = text.casefold()
    found = set(re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", lowered))
    for word in list(found):
        found.update(word.split("-"))
    return found


def _from_text(labels: Sequence[str], title: str) -> Category | None:
    """Fall back to what the PR calls itself. Labels are trusted over the title."""
    for source in (" ".join(labels), title):
        words = _words(source)
        if not words:
            continue
        if words & _KEYWORDS[Category.FULLSTACK]:
            return Category.FULLSTACK

        matched = {category for category in (Category.DOCS, Category.FRONTEND, Category.BACKEND)
                   if words & _KEYWORDS[category]}
        if len(matched) == 1:
            return matched.pop()
        if matched == {Category.FRONTEND, Category.BACKEND}:
            return Category.FULLSTACK
        if len(matched) > 1:
            # Documentation alongside a side of the stack: the code is what the PR was really about.
            return (matched - {Category.DOCS}).pop()
    return None


# --- The one function callers use --------------------------------------------------------------------------

def categorise(pr: MergedPR, file_paths: Sequence[str] | None = None) -> Category:
    """Categorise a merged PR, preferring the files it changed over what it calls itself.

    `file_paths` is optional because fetching it costs one GitHub request per PR. Without it the answer is a
    guess from labels and title, and `OTHER` when even that says nothing -- never a wrong confident answer.
    """
    if file_paths:
        if (category := _from_file_paths(file_paths)) is not None:
            return category
    return _from_text(pr.labels, pr.title) or Category.OTHER
