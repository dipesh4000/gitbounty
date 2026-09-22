"""GitBounty API.

One FastAPI app, with each feature in its own module under `features/` so the two people working on it
don't collide. See feature-split.md for who owns what.
"""

from fastapi import FastAPI

app = FastAPI(title="GitBounty API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. Used to confirm the app is up, nothing more."""
    return {"status": "ok"}
