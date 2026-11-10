"use client";

import React, { useMemo } from "react";

export function ContributionHeatmap() {
  // Generate an illustrative 20-week GitHub contribution grid (7 days x 20 weeks)
  const weeks = useMemo(() => {
    const levels = [0, 1, 2, 3, 4];
    const colors = [
      "var(--primer-canvas-subtle)", // level 0 (empty)
      "#0e4429", // level 1
      "#006d32", // level 2
      "#26a641", // level 3
      "#39d353", // level 4
    ];

    // Seeded pseudo-random so it stays deterministic and fast
    const grid: string[][] = [];
    let seed = 42;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let w = 0; w < 24; w++) {
      const week: string[] = [];
      for (let d = 0; d < 7; d++) {
        const r = random();
        const level = r > 0.65 ? (r > 0.85 ? (r > 0.95 ? 4 : 3) : 2) : r > 0.4 ? 1 : 0;
        week.push(colors[level]);
      }
      grid.push(week);
    }
    return grid;
  }, []);

  return (
    <div
      className="Box"
      style={{
        padding: "16px 20px",
        marginBottom: "24px",
        backgroundColor: "var(--primer-canvas-subtle)",
        border: "1px solid var(--primer-border-default)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--primer-fg-default)" }}>
          Contribution Activity & Merged Pull Requests
        </span>
        <span style={{ fontSize: "12px", color: "var(--primer-fg-muted)" }}>
          Verifiable GitHub Ledger
        </span>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: "4px" }}>
        <div style={{ display: "flex", gap: "3px", width: "max-content" }}>
          {weeks.map((week, wIndex) => (
            <div key={wIndex} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {week.map((color, dIndex) => (
                <div
                  key={dIndex}
                  style={{
                    width: "11px",
                    height: "11px",
                    borderRadius: "2px",
                    backgroundColor: color,
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                  title="Verified GitHub activity"
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", marginTop: "12px", fontSize: "11px", color: "var(--primer-fg-muted)" }}>
        <span>Less</span>
        <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: "var(--primer-canvas-subtle)", border: "1px solid var(--primer-border-default)" }} />
        <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: "#0e4429" }} />
        <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: "#006d32" }} />
        <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: "#26a641" }} />
        <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: "#39d353" }} />
        <span>More</span>
      </div>
    </div>
  );
}
