"""Work out which category a merged pull request belongs to.

Two sources of evidence, strongest first:

1. **The files it changed.** What a PR touched is the most honest description of what it was. This needs one extra
   GitHub request per PR, so the caller decides whether to pay for it.
2. **Its labels and title.** Free -- they already arrive with the PR -- but much weaker, since labels are whatever
   the repo happens to use and titles are prose.

Everything here is a pure function: same input, same answer, no network. That keeps the guessing honest and
testable, and means the rules can be tightened later without touching the code that fetches from GitHub.

The category list is shared with Nishika's issue browser (feature-seams.md, seam 3). Changing it is a change to
that agreement, not a local decision.
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

_TEST_DIRECTORIES = {"test", "tests", "spec", "specs", "__tests__", "e2e", "integration_tests", "testing"}
_TEST_FILENAME_PATTERN = re.compile(r"(^test_|_test$|\.test$|\.spec$|^conftest$|^test$)")

_DEVOPS_DIRECTORIES = {
    ".github", ".gitlab", ".circleci", "ci", "cd", "deploy", "deployment", "k8s", "kubernetes",
    "helm", "terraform", "ansible", "infra", "infrastructure", ".husky",
}
_DEVOPS_EXTENSIONS = {".tf", ".tfvars"}
_DEVOPS_FILENAMES = {
    "dockerfile", "docker-compose", "jenkinsfile", "procfile", "makefile", "vagrantfile",
    ".dockerignore", "nginx",
}

_MOBILE_DIRECTORIES = {"android", "ios", "mobile", "flutter"}
_MOBILE_EXTENSIONS = {".swift", ".dart", ".xib", ".storyboard"}
_MOBILE_FILENAMES = {"androidmanifest", "podfile", "info"}

_DESIGN_DIRECTORIES = {"design", "designs", "mockups", "wireframes", "branding"}
_DESIGN_EXTENSIONS = {".fig", ".sketch", ".psd", ".ai", ".xd"}

_FRONTEND_EXTENSIONS = {".css", ".scss", ".sass", ".less", ".html", ".htm", ".vue", ".svelte", ".jsx", ".tsx"}
_FRONTEND_DIRECTORIES = {
    "components", "component", "styles", "style", "css", "public", "static", "assets",
    "ui", "views", "pages", "templates", "frontend", "client", "web",
}

# .kt is here rather than under mobile because Kotlin is used on both sides; an Android one lives under an
# android/ or mobile/ directory, which is checked first.
_BACKEND_EXTENSIONS = {".py", ".go", ".rb", ".java", ".kt", ".php", ".rs", ".cs", ".ex", ".exs", ".sql", ".sh"}
_BACKEND_DIRECTORIES = {
    "api", "server", "backend", "migrations", "migration", "models", "model", "controllers",
    "services", "db", "database", "routes", "middleware", "handlers", "schemas", "jobs", "workers",
}
_BACKEND_FILENAMES = {"requirements", "pyproject", "gemfile", "pom", "go"}

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

    The checks run in a deliberate order, most specific first, because a file can honestly belong to several:
    `tests/frontend/nav.test.js` is testing work, and `.github/workflows/deploy.yml` is devops, not backend.
    Documentation comes first of all, so `docs/install.js` is a doc that happens to ship a snippet.
    """
    directories, stem, extension = _split(path)
    segments = set(directories)

    if segments & _DOC_DIRECTORIES or extension in _DOC_EXTENSIONS or stem in _DOC_FILENAMES:
        return Category.DOCS

    if segments & _TEST_DIRECTORIES or _TEST_FILENAME_PATTERN.search(stem):
        return Category.TESTING

    if segments & _DEVOPS_DIRECTORIES or extension in _DEVOPS_EXTENSIONS or stem in _DEVOPS_FILENAMES:
        return Category.DEVOPS

    if segments & _MOBILE_DIRECTORIES or extension in _MOBILE_EXTENSIONS or stem in _MOBILE_FILENAMES:
        return Category.MOBILE

    if segments & _DESIGN_DIRECTORIES or extension in _DESIGN_EXTENSIONS:
        return Category.DESIGN

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


# When two categories are tied on file count, the earlier one here wins. Code beats tests, because a PR with one
# source file and one test file is a code change that was tested, not a testing PR -- testing only wins when it is
# genuinely the bulk of the work.
_TIE_BREAK_ORDER = (
    Category.FULLSTACK,
    Category.BACKEND,
    Category.FRONTEND,
    Category.MOBILE,
    Category.DEVOPS,
    Category.TESTING,
    Category.DESIGN,
)


def _stack_verdict(frontend: int, backend: int) -> tuple[Category | None, int]:
    """Collapse frontend and backend counts into one verdict and its weight."""
    code = frontend + backend
    if code == 0:
        return None, 0
    # Real work on both sides is fullstack, but a single stray file shouldn't relabel a PR. A side has to be at
    # least a quarter of the code files touched to count as genuine.
    if frontend and backend and min(frontend, backend) / code >= 0.25:
        return Category.FULLSTACK, code
    if frontend == backend:
        return Category.FULLSTACK, code
    return (Category.FRONTEND if frontend > backend else Category.BACKEND), code


def _from_file_paths(paths: Iterable[str]) -> Category | None:
    """Combine per-file verdicts into one category for the whole PR."""
    votes = Counter(category for path in paths if (category := classify_path(path)) is not None)
    if not votes:
        return None

    stack_category, stack_count = _stack_verdict(votes[Category.FRONTEND], votes[Category.BACKEND])

    contenders: list[tuple[int, Category]] = [
        (votes[category], category)
        for category in (Category.TESTING, Category.DEVOPS, Category.DESIGN, Category.MOBILE)
        if votes[category]
    ]
    if stack_category is not None:
        contenders.append((stack_count, stack_category))

    if not contenders:
        return Category.DOCS  # only documentation files carried any signal

    best = max(count for count, _ in contenders)
    tied = [category for count, category in contenders if count == best]
    return min(tied, key=_TIE_BREAK_ORDER.index)


# --- Label and title evidence ------------------------------------------------------------------------------

_KEYWORDS: dict[Category, frozenset[str]] = {
    Category.DOCS: frozenset({"docs", "doc", "documentation", "readme", "typo", "wording", "changelog"}),
    Category.FRONTEND: frozenset({
        "frontend", "front-end", "ui", "ux", "css", "styling", "styles", "html",
        "layout", "responsive", "accessibility", "a11y",
    }),
    Category.BACKEND: frozenset({
        "backend", "back-end", "api", "server", "database", "db", "sql", "migration", "migrations",
        "endpoint", "query", "auth",
    }),
    Category.FULLSTACK: frozenset({"fullstack", "full-stack"}),
    Category.TESTING: frozenset({"test", "tests", "testing", "coverage", "flaky", "e2e", "unit-test"}),
    Category.DEVOPS: frozenset({
        "ci", "cd", "devops", "docker", "kubernetes", "k8s", "deploy", "deployment", "pipeline",
        "infra", "infrastructure", "terraform", "helm", "release", "workflow",
    }),
    Category.DESIGN: frozenset({"design", "mockup", "figma", "branding", "icon", "logo", "theme", "visual"}),
    Category.MOBILE: frozenset({"mobile", "android", "ios", "react-native", "flutter", "swift"}),
}

# Same idea as _TIE_BREAK_ORDER: when a label set names several things, the most specific claim wins.
_TEXT_PRIORITY = (
    Category.MOBILE,
    Category.DEVOPS,
    Category.TESTING,
    Category.DESIGN,
    Category.BACKEND,
    Category.FRONTEND,
    Category.DOCS,
)


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

        matched = {category for category in _TEXT_PRIORITY if words & _KEYWORDS[category]}
        if not matched:
            continue
        if {Category.FRONTEND, Category.BACKEND} <= matched:
            return Category.FULLSTACK

        # Documentation alongside anything else: the other thing is what the PR was really about.
        specific = matched - {Category.DOCS}
        return min(specific or matched, key=_TEXT_PRIORITY.index)
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
