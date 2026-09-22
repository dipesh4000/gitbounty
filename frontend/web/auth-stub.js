/* ---------------------------------------------------------
   GitBounty — FAKE sign-in. Delete this file when the real GitHub Login lands.

   GitHub Login is Nishika's feature and is not built yet (feature-split.md). This stands in for it so the rest
   of the site can be clicked through: pressing "Sign in with GitHub" sets a flag in this browser and sends you
   to your points page. It contacts nothing, checks nothing, and proves nothing.

   The backend has a matching stub: it treats every request as the user named by DEV_GITHUB_LOGIN. So "signing
   in" here does not choose who you are -- the backend already decided that. Clearing the flag only changes what
   this browser shows you.

   Because it would be genuinely bad if this were mistaken for working authentication, every page that uses it
   says so on screen.

   To remove: delete this file, drop the <script> tags that load it, and replace GitBountySession with whatever
   the real login provides.
--------------------------------------------------------- */

(function () {
  const SESSION_KEY = "gitbounty-dev-session";
  const HOME = "home.html";
  const AFTER_SIGN_IN = "points.html";

  /* localStorage throws in a private window or with site data blocked, and the site should still work, so
     every read and write is wrapped. */
  function read() {
    try {
      return localStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }

  function write(signedIn) {
    try {
      if (signedIn) localStorage.setItem(SESSION_KEY, "1");
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* Nothing to do: the flag just won't persist. The pages still work for this page view. */
    }
  }

  function signIn() {
    write(true);
    location.href = AFTER_SIGN_IN;
  }

  function signOut() {
    write(false);
    location.href = HOME;
  }

  /* Pages behind the "login" send you to the landing page if you haven't pressed the button. Returns false when
     it has started a redirect, so the caller can stop setting up. */
  function requireSession() {
    if (read()) return true;
    location.replace(HOME);
    return false;
  }

  window.GitBountySession = { isSignedIn: read, signIn, signOut, requireSession };
})();
