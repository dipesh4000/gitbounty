import { InteriorPage } from "../components/InteriorPage";
import { pageMetadata } from "../lib/pageMetadata";
export const metadata = pageMetadata("status");
export default function StatusPage() { return <InteriorPage page="status" />; }
