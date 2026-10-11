import { LoginScreen, type WorkspaceDestination } from "../components/AuthProvider";

export const metadata = { title: "Sign in — GitBounty", description: "Sign in with GitHub to explore bounties and build your contribution history." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination: WorkspaceDestination = next === "/maintainers" || next === "/leaderboard" || next === "/explore#points" ? next : "/explore";
  return <LoginScreen destination={destination} redirectSignedIn />;
}
