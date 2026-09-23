import { SiteHeader } from "./components/SiteHeader";
import { Hero } from "./components/Hero";
import { Facts } from "./components/Facts";
import { BountyBoard } from "./components/BountyBoard";
import { HowItWorks } from "./components/HowItWorks";
import { WhyGitBounty } from "./components/WhyGitBounty";
import { Audience } from "./components/Audience";
import { Security } from "./components/Security";
import { Pricing } from "./components/Pricing";
import { CtaBand } from "./components/CtaBand";
import { SiteFooter } from "./components/SiteFooter";
import { ScrollReveal } from "./components/ScrollReveal";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <SiteHeader />

      <main id="main">
        <Hero />
        <Facts />
        <BountyBoard />
        <HowItWorks />
        <WhyGitBounty />
        <Audience />
        <Security />
        <Pricing />
        <CtaBand />
      </main>

      <SiteFooter />
      <ScrollReveal />
    </>
  );
}
