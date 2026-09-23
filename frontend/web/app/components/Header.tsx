"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { setSignedIn } from "../lib/session";
import type { MeResponse } from "../lib/types";
import { useSignedIn } from "../lib/useSignedIn";
import { SignInButton } from "./SignInButton";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const signedIn = useSignedIn();
  const [login, setLogin] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn) {
      apiGet<MeResponse>("/api/me")
        .then((me) => setLogin(me.github_login))
        .catch(() => setLogin(null));
    }
  }, [signedIn]);

  function signOut() {
    setSignedIn(false);
    router.push("/");
  }

  const nav = (
    <>
      <Link href="/leaderboard" aria-current={pathname === "/leaderboard" ? "page" : undefined}>
        Leaderboard
      </Link>
      <Link href="/points" aria-current={pathname === "/points" ? "page" : undefined}>
        Your points
      </Link>
    </>
  );

  return (
    <header className={`site-header${menuOpen ? " is-open" : ""}`}>
      <div className="wrap app-wrap header-inner">
        <Link className="brand" href="/" aria-label="GitBounty home">
          <Image src="/assets/logo_mark.svg" alt="" className="brand-mark" width={28} height={25} priority />
          <span className="brand-name">GitBounty</span>
        </Link>

        <nav className="main-nav" aria-label="Primary">{nav}</nav>

        <div className="account">
          {signedIn ? (
            <>
              <span className="account-who">{login ? <b>@{login}</b> : null}</span>
              <button className="btn btn-outline" type="button" onClick={signOut}>Sign out</button>
            </>
          ) : <SignInButton />}
        </div>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label="Open menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span></span><span></span><span></span>
        </button>
      </div>

      <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile" onClick={() => setMenuOpen(false)}>
        {nav}
      </nav>
    </header>
  );
}
