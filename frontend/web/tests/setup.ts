import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/*
  Every test starts with no network and no navigation. A component that reaches for either has to be
  given one explicitly, so a test can never accidentally depend on a real request or silently navigate.
*/
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("fetch was not stubbed for this test"))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
