"use client";

import { useRouter } from "next/navigation";
import { setSignedIn } from "../lib/session";
import { GithubIcon } from "./GithubIcon";

export function SignInButton({ large = false }: { large?: boolean }) {
  const router = useRouter();

  function signIn() {
    setSignedIn(true);
    router.push("/points");
  }

  return (
    <button className={`btn btn-primary${large ? " btn-lg" : ""}`} type="button" onClick={signIn}>
      <GithubIcon />
      Sign in with GitHub
    </button>
  );
}
