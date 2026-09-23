const SESSION_KEY = "gitbounty-dev-session";
const SESSION_EVENT = "gitbounty-session-change";

export function isSignedIn() {
  try {
    return window.localStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSignedIn(signedIn: boolean) {
  try {
    if (signedIn) window.localStorage.setItem(SESSION_KEY, "1");
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // The flag simply does not persist when storage is blocked.
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function subscribeToSession(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SESSION_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SESSION_EVENT, callback);
  };
}
