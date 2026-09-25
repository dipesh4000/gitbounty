import { InteriorPage } from "../components/InteriorPage";
import { pageMetadata } from "../lib/pageMetadata";
export const metadata = pageMetadata("docs");
export default function DocsPage() { return <InteriorPage page="docs" />; }
