"use client";

import Image from "next/image";
import logoMark from "../../public/assets/logo_mark.svg";

import { useEffect, useRef, useState } from "react";

/* The header from the static site: sticky bar, mobile menu, and the nav link for the section you're looking at
   lit up. The observer margins and behaviour are carried over unchanged. */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  /* The bottom border firms up once you've scrolled off the top. */
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const onScroll = () => {
      header.style.borderBottomColor = window.scrollY > 10 ? "var(--border)" : "var(--border-soft)";
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sections = document.querySelectorAll("section[id]");
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.getAttribute("id"));
        }
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const navLink = (href: string, label: string) => (
    <a href={href} style={href === `#${activeSection}` ? { color: "var(--text)" } : undefined}>
      {label}
    </a>
  );

  return (
    <header className={`site-header${menuOpen ? " is-open" : ""}`} ref={headerRef}>
      <div className="wrap header-inner">
        <a className="brand" href="#top" aria-label="GitBounty home">
          <Image src={logoMark} alt="" className="brand-mark" width={28} height={25} priority />
          <span className="brand-name">GitBounty</span>
        </a>

        <nav className="main-nav" aria-label="Primary">
          {navLink("#bounties", "Bounties")}
          {navLink("#audience", "For maintainers")}
        </nav>

        <div className="header-cta">
          <button className="btn btn-ghost" type="button">Sign in</button>
          <button className="btn btn-primary" type="button">Connect GitHub</button>
        </div>

        <button
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label="Open menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span></span><span></span><span></span>
        </button>
      </div>

      <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile">
        <a href="#bounties" onClick={() => setMenuOpen(false)}>Bounties</a>
        <a href="#audience" onClick={() => setMenuOpen(false)}>For maintainers</a>
        <button className="btn btn-primary" type="button">Connect GitHub</button>
      </nav>
    </header>
  );
}
