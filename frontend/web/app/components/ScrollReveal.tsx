"use client";

import { useEffect } from "react";

/* The fade-and-rise that cards and headings do as they scroll into view, carried over from the static site.

   The static version waited two animation frames after DOMContentLoaded so the first paint was done before
   anything was hidden. A React effect already runs after paint, so the wait is unnecessary here -- and the
   nested requestAnimationFrame it needed could outlive its own cleanup, which left the effect doing nothing at
   all when React mounts, cleans up and remounts (as it does in development).

   The cleanup puts back every style it set. Without that, a re-run could leave elements stuck at opacity 0 with
   no observer left to reveal them: an invisible page.

   It renders nothing; it only applies the effect to elements already on the page. */
const TARGETS =
  ".section-head, .step, .feature, .audience-card, .price-card, .bounty-card, .trust-card";

export function ScrollReveal() {
  useEffect(() => {
    if (!window.IntersectionObserver) return;

    /* Someone who has asked for less motion gets the page as it is, with nothing hidden and nothing animated. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>(TARGETS));

    const observer = new IntersectionObserver(
      (entries, self) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.style.opacity = "1";
          target.style.transform = "translateY(0)";
          self.unobserve(target);
        }
      },
      { threshold: 0.12 }
    );

    for (const element of elements) {
      element.style.opacity = "0";
      element.style.transform = "translateY(18px)";
      element.style.transition = "opacity .5s ease, transform .5s ease";
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      for (const element of elements) {
        element.style.opacity = "";
        element.style.transform = "";
        element.style.transition = "";
      }
    };
  }, []);

  return null;
}
