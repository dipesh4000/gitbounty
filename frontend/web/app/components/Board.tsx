import type { LeaderboardEntry } from "../lib/types";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function Board({ entries, viewer }: { entries: LeaderboardEntry[]; viewer?: string | null }) {
  return (
    <ol className="board">
      {entries.map((entry) => {
        const isYou = entry.github_login === viewer;
        return (
          <li className={`board-entry${isYou ? " is-you" : ""}`} key={`${entry.rank}-${entry.github_login}`}>
            <span className="entry-rank">{entry.rank}</span>
            <span className="entry-who">
              {entry.avatar_url ? (
                // GitHub avatar hosts vary, so a native img keeps the API-provided URL usable without config drift.
                // eslint-disable-next-line @next/next/no-img-element
                <img className="entry-avatar" src={entry.avatar_url} alt="" loading="lazy" />
              ) : (
                <span className="entry-avatar is-placeholder" aria-hidden="true">
                  {(entry.github_login[0] || "?").toUpperCase()}
                </span>
              )}
              <span className="entry-login">{entry.github_login}</span>
              {isYou ? <span className="entry-you-tag">you</span> : null}
            </span>
            <span className="entry-merges">{plural(entry.merges, "merge")}</span>
            <span className="entry-points">{entry.points}<span>pts</span></span>
          </li>
        );
      })}
    </ol>
  );
}
