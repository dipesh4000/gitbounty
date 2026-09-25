import { InteriorPage } from "../components/InteriorPage";
import { pageMetadata } from "../lib/pageMetadata";
export const metadata = pageMetadata("extension");
export default function ExtensionPage() { return <InteriorPage page="extension" />; }
