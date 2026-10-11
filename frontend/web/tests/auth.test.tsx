/*
  Signed-out, loading, failure and sign-in. The states a visitor hits before anything else works.
*/
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthProvider, useAuth } from "../app/components/AuthProvider";
import { API, captureNavigation, stubApi, stubPendingApi } from "./helpers";

function Probe() {
  const { status, user, error, signIn, signOut } = useAuth();
  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="user">{user?.github_login ?? "none"}</output>
      <output data-testid="error">{error}</output>
      <button type="button" onClick={() => signIn()}>Connect GitHub</button>
      <button type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}

const renderProbe = () => render(<AuthProvider><Probe /></AuthProvider>);

describe("the signed-out state", () => {
  it("reports signed-out when the API says 401, and names no user", async () => {
    stubApi({ "/api/me": { status: 401, body: { detail: "Not signed in." } } });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("shows loading until the first answer arrives", () => {
    stubPendingApi();
    renderProbe();

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });
});

describe("starting GitHub sign-in", () => {
  it("navigates to the backend's real OAuth route, not to a client-side session", async () => {
    stubApi({ "/api/me": { status: 401, body: {} } });
    const navigation = captureNavigation();
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));

    await userEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));

    expect(navigation.assigned).toEqual([`${API}/auth/github`]);
  });

  it("writes nothing to localStorage: there is no client-side session to forge", async () => {
    stubApi({ "/api/me": { status: 401, body: {} } });
    captureNavigation();
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));

    await userEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));

    expect(window.localStorage.length).toBe(0);
  });
});

describe("the signed-in state", () => {
  it("reports the account the API returned", async () => {
    stubApi({
      "/api/me": { body: { id: 1, github_id: 42, github_login: "octocat", name: null, avatar_url: null } },
    });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));
    expect(screen.getByTestId("user")).toHaveTextContent("octocat");
  });

  it("signs out through the API and returns to the landing page", async () => {
    const { calls } = stubApi({
      "/api/me": { body: { id: 1, github_id: 42, github_login: "octocat", name: null, avatar_url: null } },
      "/auth/logout": { body: { status: "logged out" } },
    });
    const navigation = captureNavigation();
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(navigation.assigned).toEqual(["/"]));
    expect(calls).toContain(`POST ${API}/auth/logout`);
  });
});

describe("when the API cannot be reached", () => {
  it("says so, rather than claiming nobody is signed in", async () => {
    stubApi({ "/api/me": { status: 503, body: { detail: "No database connection." } } });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unavailable"));
    expect(screen.getByTestId("error")).toHaveTextContent("No database connection.");
  });

  it("reports a network failure with the API's address", async () => {
    const { vi } = await import("vitest");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unavailable"));
    expect(screen.getByTestId("error")).toHaveTextContent(API);
  });
});
