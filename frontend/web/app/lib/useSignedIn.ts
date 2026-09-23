"use client";

import { useSyncExternalStore } from "react";
import { isSignedIn, subscribeToSession } from "./session";

export function useSignedIn() {
  return useSyncExternalStore(subscribeToSession, isSignedIn, () => false);
}
