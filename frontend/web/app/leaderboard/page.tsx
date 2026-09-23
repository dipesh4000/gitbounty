import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "../components/AppShell";
import { LeaderboardContent } from "../components/LeaderboardContent";
import { Skeleton } from "../components/States";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Who has earned the most points on GitBounty, overall, this month and this week.",
};

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Suspense fallback={<main id="main" className="app-main"><div className="wrap app-wrap"><Skeleton /></div></main>}>
        <LeaderboardContent />
      </Suspense>
    </AppShell>
  );
}
