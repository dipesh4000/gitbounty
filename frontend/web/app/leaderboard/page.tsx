import { ContributorWorkspace } from "../components/ContributorWorkspace";
import { pageMetadata } from "../components/InteriorPage";
export const metadata = pageMetadata("leaderboard");
export default function Page() { return <ContributorWorkspace initialView="leaderboard" />; }
