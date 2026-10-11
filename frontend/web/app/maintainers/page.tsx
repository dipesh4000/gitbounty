import { ContributorWorkspace } from "../components/ContributorWorkspace";
import { pageMetadata } from "../components/InteriorPage";
export const metadata = pageMetadata("maintainers");
export default function Page() { return <ContributorWorkspace initialView="maintain" />; }
