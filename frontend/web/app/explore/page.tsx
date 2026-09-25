import { InteriorPage } from "../components/InteriorPage";
import { pageMetadata } from "../lib/pageMetadata";
export const metadata = pageMetadata("explore");
export default function ExplorePage() { return <InteriorPage page="explore" />; }
