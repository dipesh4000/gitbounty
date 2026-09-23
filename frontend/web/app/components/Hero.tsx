"use client";

import { useEffect, useState } from "react";
import { api, formatStars, type CategoryCounts, type IssueList } from "../lib/api";
import { useAuth } from "./AuthProvider";

export function Hero() {
  const { user, connect } = useAuth();
  const [issues, setIssues] = useState<IssueList["items"]>([]);
  const [count, setCount] = useState("—");

  useEffect(() => {
    Promise.all([
      api<IssueList>("/api/issues?sort=stars&per_page=5"),
      api<CategoryCounts>("/api/issues/categories"),
    ]).then(([top, counts]) => {
      setIssues(top.items);
      setCount(`${Object.values(counts).reduce((sum, value) => sum + value, 0)} open`);
    }).catch(() => {
      setIssues([]);
      setCount("offline");
    });
  }, []);

  return (
    <section className="hero" id="top">
      <div className="wrap hero-inner">
        <div className="hero-copy">
          <h1>Open-source work,<br />paid the day it ships.</h1>
          <p className="hero-sub">
            Maintainers attach a bounty to any GitHub issue. Contributors merge a fix and get paid straight to
            their wallet — no invoices, no 20% cut, no waiting on someone to run payroll.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={() => connect("page")}>
              {user ? "Browse issues" : "Connect GitHub"}
            </button>
            <a className="btn btn-outline btn-lg" href="#bounties">Browse open bounties</a>
          </div>
          <p className="hero-note">Free for individual bounties. No wallet setup, no seed phrase.</p>
        </div>

        <div className="hero-board" aria-label="Preview of open bounties">
          <div className="board-card">
            <div className="board-card-head">
              <span className="board-dot" aria-hidden="true"></span>
              <span>Open issues</span>
              <span className="board-count">{count}</span>
            </div>
            <ul className="board-rows">
              {issues.map((issue) => (
                <li className="board-row" key={issue.id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="row-repo">{issue.repository}</span>
                    <span className="row-title">{issue.title}</span>
                  </div>
                  <span className="row-amount">★ {formatStars(issue.stars)}</span>
                </li>
              ))}
              {count === "offline" ? (
                <li className="board-row"><span className="row-title">Backend unavailable.</span></li>
              ) : count !== "—" && issues.length === 0 ? (
                <li className="board-row"><span className="row-title">No issues synced yet.</span></li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
