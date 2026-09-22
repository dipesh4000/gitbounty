"""Categorisation: file paths first, labels and title as a fallback."""

from datetime import datetime, timezone

import pytest

from app.features.merged_prs.categorise import categorise, classify_path
from app.features.merged_prs.models import Category, MergedPR


def make_pr(title: str = "Fix the thing", labels: tuple[str, ...] = ()) -> MergedPR:
    return MergedPR(
        github_pr_id=1,
        repo_full_name="some-org/project",
        number=7,
        title=title,
        url="https://github.com/some-org/project/pull/7",
        merged_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        author_login="aastha-malik",
        labels=labels,
    )


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        # Documentation wins over whatever the file extension is
        ("docs/install.md", Category.DOCS),
        ("docs/snippet.js", Category.DOCS),
        ("README", Category.DOCS),
        ("README.md", Category.DOCS),
        ("CONTRIBUTING.rst", Category.DOCS),
        # Frontend
        ("src/components/Nav.jsx", Category.FRONTEND),
        ("styles/main.css", Category.FRONTEND),
        ("index.html", Category.FRONTEND),
        ("app/views/home.vue", Category.FRONTEND),
        # Backend
        ("backend/app/main.py", Category.BACKEND),
        ("migrations/0001_init.sql", Category.BACKEND),
        ("api/routes.js", Category.BACKEND),
        ("Dockerfile", Category.BACKEND),
        ("cmd/server/main.go", Category.BACKEND),
        # The outermost directory decides, not any segment anywhere in the path
        ("frontend/api/client.ts", Category.FRONTEND),
        ("api/frontend_helpers.py", Category.BACKEND),
        # Says nothing on its own
        ("package.json", None),
        ("config.yml", None),
        ("LICENSE.bin", Category.DOCS),  # by filename, extension ignored
        ("", None),
    ],
)
def test_classify_path(path: str, expected: Category | None) -> None:
    assert classify_path(path) == expected


def test_all_frontend_files_is_frontend() -> None:
    files = ["src/components/Nav.jsx", "styles/main.css", "index.html"]
    assert categorise(make_pr(), files) == Category.FRONTEND


def test_all_backend_files_is_backend() -> None:
    files = ["backend/app/main.py", "migrations/0001_init.sql"]
    assert categorise(make_pr(), files) == Category.BACKEND


def test_only_documentation_files_is_docs() -> None:
    assert categorise(make_pr(), ["docs/install.md", "README.md"]) == Category.DOCS


def test_meaningful_work_on_both_sides_is_fullstack() -> None:
    files = ["backend/app/main.py", "backend/app/models.py", "src/components/Nav.jsx", "styles/main.css"]
    assert categorise(make_pr(), files) == Category.FULLSTACK


def test_one_stray_file_does_not_make_it_fullstack() -> None:
    """A backend PR that touches a single template is still a backend PR."""
    files = [f"backend/app/module_{i}.py" for i in range(9)] + ["templates/email.html"]
    assert categorise(make_pr(), files) == Category.BACKEND


def test_an_even_split_is_fullstack() -> None:
    assert categorise(make_pr(), ["api/routes.py", "styles/main.css"]) == Category.FULLSTACK


def test_documentation_alongside_code_does_not_hide_the_code() -> None:
    files = ["README.md", "docs/api.md", "docs/usage.md", "backend/app/main.py"]
    assert categorise(make_pr(), files) == Category.BACKEND


def test_falls_back_to_labels_when_files_say_nothing() -> None:
    assert categorise(make_pr(labels=("backend", "bug")), ["package.json"]) == Category.BACKEND


def test_falls_back_to_labels_when_no_files_are_given() -> None:
    assert categorise(make_pr(labels=("documentation",))) == Category.DOCS
    assert categorise(make_pr(labels=("ui", "good first issue"))) == Category.FRONTEND


def test_labels_are_trusted_over_the_title() -> None:
    pr = make_pr(title="Update the CSS on the login page", labels=("backend",))
    assert categorise(pr) == Category.BACKEND


def test_falls_back_to_the_title_when_there_are_no_labels() -> None:
    assert categorise(make_pr(title="Fix typo in the readme")) == Category.DOCS
    assert categorise(make_pr(title="Add a database migration for sessions")) == Category.BACKEND


def test_labels_naming_both_sides_are_fullstack() -> None:
    assert categorise(make_pr(labels=("frontend", "api"))) == Category.FULLSTACK
    assert categorise(make_pr(labels=("full-stack",))) == Category.FULLSTACK


def test_no_evidence_at_all_is_other() -> None:
    assert categorise(make_pr(title="Bump version to 2.1.0")) == Category.OTHER
    assert categorise(make_pr(title="Bump version"), ["package.json", "config.yml"]) == Category.OTHER


def test_a_word_inside_another_word_is_not_a_match() -> None:
    """'rapid' contains 'api', 'docsomething' contains 'doc' -- neither is evidence."""
    assert categorise(make_pr(title="Make the rapid path faster")) == Category.OTHER
