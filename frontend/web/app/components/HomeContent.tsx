"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { CATEGORIES, type LeaderboardResponse } from "../lib/types";
import { useSignedIn } from "../lib/useSignedIn";
import { Board } from "./Board";
import { ErrorState, Skeleton, State } from "./States";
import { SignInButton } from "./SignInButton";

export function HomeContent() {
  const signedIn = useSignedIn();
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiGet<LeaderboardResponse>("/api/leaderboard?limit=3")
      .then(setLeaderboard)
      .catch(setError);
  }, []);

  return (
    <main id="main">
      <section className="landing-hero">
        <div className="wrap app-wrap">
          <span className="hero-eyebrow">Open source, worth points</span>
          <h1>The pull requests you already ship should count for something.</h1>
          <p className="lede">
            A maintainer decides what fixing their issue is worth. You fix it, it gets merged, and those points
            are yours. No invoices, no wallet, no crypto — just a score that says what you&apos;ve actually shipped.
          </p>

          <div className="hero-buttons">
            {signedIn ? (
              <>
                <Link className="btn btn-primary btn-lg" href="/points">Go to your points</Link>
                <Link className="btn btn-outline btn-lg" href="/leaderboard">Leaderboard</Link>
              </>
            ) : (
              <>
                <SignInButton large />
                <Link className="btn btn-outline btn-lg" href="/leaderboard">Browse the leaderboard</Link>
              </>
            )}
          </div>
          <p className="hero-fineprint">
            {signedIn
              ? "You're signed in with the test login. Sign out from the header."
              : "Test login: one click, no GitHub account needed. Real GitHub sign-in isn't built yet."}
          </p>
        </div>
      </section>

      <section className="landing-section">
        <div className="wrap app-wrap">
          <h2>How it works</h2>
          <p className="lede">Three steps, and GitHub does most of them for you.</p>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number" aria-hidden="true">1</div>
              <h3>A maintainer sets a price</h3>
              <p>They label an issue <code>gitbounty:40</code>, or set it on GitBounty. That&apos;s what fixing it is worth — they decide, not us.</p>
            </div>
            <div className="step-card">
              <div className="step-number" aria-hidden="true">2</div>
              <h3>You fix it and it gets merged</h3>
              <p>Work exactly the way you already do. Open a pull request that closes the issue and get it reviewed.</p>
            </div>
            <div className="step-card">
              <div className="step-number" aria-hidden="true">3</div>
              <h3>The points are yours</h3>
              <p>We check your own GitHub account for merged pull requests. Every merge earns something; one that closes a priced issue earns that too.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="wrap app-wrap">
          <h2>Find work you can actually do</h2>
          <p className="lede">
            Every issue and every merge is sorted into one of these, so someone who writes CSS isn&apos;t handed a database migration.
          </p>
          <div className="cat-strip">
            {CATEGORIES.map((category) => (
              <Link className="pill" href={`/leaderboard?category=${category}`} key={category}>{category}</Link>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="wrap app-wrap">
          <div className="mini-board-head">
            <div>
              <h2>Who&apos;s ahead</h2>
              <p className="app-section-note">Live from the leaderboard.</p>
            </div>
            <Link href="/leaderboard">See the full board →</Link>
          </div>
          {error ? <ErrorState error={error} /> : leaderboard ? (
            leaderboard.entries.length ? <Board entries={leaderboard.entries} /> : (
              <State title="No one on the board yet" message="Be the first: sign in and sync your merged pull requests." />
            )
          ) : <Skeleton rows={3} />}
        </div>
      </section>
    </main>
  );
}
