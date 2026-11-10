import React from "react";
import { Octicon } from "./Octicon";

export type StateKind = "open" | "merged" | "closed" | "draft" | "funded";

interface StateBadgeProps {
  state: StateKind | string;
  className?: string;
  label?: string;
}

export function StateBadge({ state, className = "", label }: StateBadgeProps) {
  switch (state.toLowerCase()) {
    case "open":
    case "published":
      return (
        <span className={`State State--open ${className}`}>
          <Octicon name="issue-opened" size={16} />
          {label ?? "Open"}
        </span>
      );
    case "merged":
    case "settled":
      return (
        <span className={`State State--merged ${className}`}>
          <Octicon name="git-merge" size={16} />
          {label ?? (state === "settled" ? "Settled" : "Merged")}
        </span>
      );
    case "closed":
      return (
        <span className={`State State--closed ${className}`}>
          <Octicon name="issue-closed" size={16} />
          {label ?? "Closed"}
        </span>
      );
    case "funded":
      return (
        <span className={`State State--open ${className}`}>
          <Octicon name="check-circle-fill" size={16} />
          {label ?? "Funded"}
        </span>
      );
    case "draft":
    case "unfunded":
    default:
      return (
        <span className={`State State--draft ${className}`}>
          <Octicon name="clock" size={16} />
          {label ?? state}
        </span>
      );
  }
}
