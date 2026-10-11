"""Representative path classification and fallback precedence."""

from datetime import datetime, timezone

import pytest

from app.features.merged_prs.categorise import categorise, classify_path
from app.features.merged_prs.models import Category, MergedPR


def _pr(title="Fix the thing", labels=()) -> MergedPR:
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
        ("docs/snippet.js", Category.DOCS),
        ("src/components/Nav.jsx", Category.FRONTEND),
        ("backend/app/main.py", Category.BACKEND),
        ("backend/tests/test_api.py", Category.TESTING),
        (".github/workflows/ci.yml", Category.DEVOPS),
        ("android/app/src/Main.kt", Category.MOBILE),
        ("design/mockup.fig", Category.DESIGN),
        ("frontend/api/client.ts", Category.FRONTEND),
        ("api/frontend_helpers.py", Category.BACKEND),
        ("package.json", None),
    ],
)
def test_classify_representative_paths(path: str, expected: Category | None) -> None:
    assert classify_path(path) == expected


def test_file_evidence_uses_dominant_code_and_detects_fullstack() -> None:
    assert categorise(_pr(), ["api/routes.py", "styles/main.css"]) == Category.FULLSTACK
    mostly_backend = [f"backend/module_{i}.py" for i in range(9)] + [
        "templates/email.html"
    ]
    assert categorise(_pr(), mostly_backend) == Category.BACKEND
    assert (
        categorise(_pr(), ["README.md", "docs/api.md", "backend/main.py"])
        == Category.BACKEND
    )
    assert (
        categorise(_pr(), ["app/thing.py", "tests/test_thing.py"]) == Category.BACKEND
    )


def test_fallback_prefers_labels_then_title() -> None:
    assert (
        categorise(_pr(title="Update CSS", labels=("backend",)), ["package.json"])
        == Category.BACKEND
    )
    assert categorise(_pr(labels=("frontend", "api"))) == Category.FULLSTACK
    assert categorise(_pr(title="Fix typo in the readme")) == Category.DOCS
    assert categorise(_pr(title="Make the rapid path faster")) == Category.OTHER


def test_category_values_are_stable_api_values() -> None:
    assert [category.value for category in Category] == [
        "frontend",
        "backend",
        "fullstack",
        "docs",
        "testing",
        "devops",
        "design",
        "mobile",
        "other",
    ]
