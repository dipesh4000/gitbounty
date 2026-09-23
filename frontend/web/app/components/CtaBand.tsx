"use client";

import { useAuth } from "./AuthProvider";

export function CtaBand() {
  const { user, connect } = useAuth();
  return (
    <section className="cta-band">
      <div className="cta-pattern" aria-hidden="true">
        <span className="cta-orbit cta-orbit-large"></span>
        <span className="cta-orbit cta-orbit-small"></span>
      </div>
      <div className="wrap cta-band-inner">
        <h2>Fund your first bounty in under a minute.</h2>
        <button className="btn btn-primary btn-lg" type="button" onClick={() => connect("page")}>
          {user ? "Browse issues" : "Connect GitHub"}
        </button>
      </div>
    </section>
  );
}
