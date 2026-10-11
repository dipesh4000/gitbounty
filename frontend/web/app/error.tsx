"use client";

import { useEffect } from "react";

/*
  The error boundary for the whole app.

  It says what happened in plain words and offers a retry, and it deliberately does not print the
  exception: in a production build React replaces the message with a digest anyway, and showing a stack
  trace to a visitor helps nobody and can leak internals. The digest is shown because it is the one thing
  that makes a bug report useful.
*/
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The browser console is where a developer will look; the server log has the real stack.
    console.error("GitBounty page error", error);
  }, [error]);

  return (
    <main className="app-loading" aria-live="assertive">
      <div className="app-empty">
        <strong>Something on this page broke.</strong>
        <span>
          This is a fault in GitBounty, not in anything you did. Nothing on GitHub was changed, and no
          points were altered.
        </span>
        {error.digest && <span className="mono">Reference: {error.digest}</span>}
        <button type="button" onClick={reset}>Try again</button>
        <a href="/">Back to the landing page</a>
      </div>
    </main>
  );
}
