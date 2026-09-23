"use client";

import { useEffect } from "react";

/* The fade-and-rise that cards and headings do as they scroll into view. Carried over from the static site,
   including the two-frame wait so the first paint is done before anything is hidden.

   It renders nothing; it only applies the effect to elements already on the page. */
const TARGETS =
  ".section-head, .step, .feature, .audience-card, .price-card, .bounty-card, .trust-card";

export function ScrollReveal() {
  useEffect(() => {
    if (!window.IntersectionObserver) return;

    /* Respect a reader who has asked for less motion: show everything, animate nothing. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let observer: IntersectionObserver | null = null;

    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const elements = Array.from(document.querySelectorAll<HTMLElement>(TARGETS));

        observer = new IntersectionObserver(
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
      })
    );

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return null;
}
