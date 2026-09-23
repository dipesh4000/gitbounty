import type { Metadata } from "next";
import { AppShell } from "../components/AppShell";
import { PointsContent } from "../components/PointsContent";

export const metadata: Metadata = {
  title: "Your points",
  description: "Your GitBounty points, where they came from, and the pull requests that earned them.",
};

export default function PointsPage() {
  return <AppShell><PointsContent /></AppShell>;
}
