/*
  The background service worker: pagination, cache scoping, invalidation, and input validation.

  The worker is a classic service worker and pulls in its configuration with importScripts, which node
  does not have -- so the test provides one, loading the same file the browser would.
*/
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const calls = [];
let fetchHandler = null;
let messageListener;

global.importScripts = (file) => { require(path.join(__dirname, "../src", file)); };
global.chrome = { runtime: { onMessage: { addListener(listener) { messageListener = listener; } } } };
global.fetch = async (url) => {
  calls.push(String(url));
  return fetchHandler(String(url));
};

require("../src/background.js");

function send(message) {
  return new Promise((resolve) => {
    const staysOpen = messageListener(message, {}, resolve);
    if (staysOpen === false) return;  // answered synchronously
  });
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A viewer plus one page of bounties per request, so `page` can be asserted. */
function apiStub({ viewer = "maya-dev", pages = [] } = {}) {
  return (url) => {
    if (url.endsWith("/api/me")) {
      return jsonResponse(viewer ? { github_login: viewer } : null, viewer ? 200 : 401);
    }
    const page = Number(new URL(url).searchParams.get("page"));
    return jsonResponse(pages[page - 1] ?? { items: [], has_more: false });
  };
}

test.beforeEach(async () => {
  calls.length = 0;
  fetchHandler = apiStub();
  await send({ type: "gitbounty:invalidate-cache" });
});

test("follows the API's pagination instead of stopping at one page of 100", async () => {
  const page = (start, hasMore) => ({
    items: Array.from({ length: 100 }, (_, i) => ({ repository: "org/app", number: start + i, points: 10 })),
    has_more: hasMore,
  });
  fetchHandler = apiStub({ pages: [page(1, true), page(101, true), page(201, false)] });

  const response = await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });

  assert.equal(response.ok, true);
  assert.equal(response.items.length, 300, "all three pages are returned");
  const pagesRequested = calls.filter((url) => url.includes("/api/issues")).map((url) => new URL(url).searchParams.get("page"));
  assert.deepEqual(pagesRequested, ["1", "2", "3"]);
  assert.ok(calls.every((url) => !url.includes("/api/issues") || url.includes("per_page=100")));
});

test("stops asking once the API says there is no more", async () => {
  fetchHandler = apiStub({ pages: [{ items: [{ repository: "org/app", number: 1, points: 5 }], has_more: false }] });

  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });

  assert.equal(calls.filter((url) => url.includes("/api/issues")).length, 1);
});

test("serves a repeat question from cache, and refetches after invalidation", async () => {
  fetchHandler = apiStub({ pages: [{ items: [{ repository: "org/app", number: 7, points: 30 }], has_more: false }] });

  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  assert.equal(calls.filter((url) => url.includes("/api/issues")).length, 1, "second question is cached");

  await send({ type: "gitbounty:invalidate-cache" });
  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  assert.equal(calls.filter((url) => url.includes("/api/issues")).length, 2, "invalidation forces a refetch");
});

test("caches per repository, so one repository's answer is never served for another", async () => {
  fetchHandler = apiStub({ pages: [{ items: [{ repository: "org/app", number: 1, points: 10 }], has_more: false }] });

  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  await send({ type: "gitbounty:get-repository-bounties", repository: "org/other" });

  const repositories = calls
    .filter((url) => url.includes("/api/issues"))
    .map((url) => new URL(url).searchParams.get("repository"));
  assert.deepEqual(repositories, ["org/app", "org/other"]);
});

test("caches per signed-in account, so switching user does not reuse the previous view", async () => {
  fetchHandler = apiStub({ viewer: "maya-dev", pages: [{ items: [], has_more: false }] });
  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  const afterFirst = calls.filter((url) => url.includes("/api/issues")).length;

  fetchHandler = apiStub({ viewer: "other-person", pages: [{ items: [], has_more: false }] });
  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });

  assert.equal(calls.filter((url) => url.includes("/api/issues")).length, afterFirst + 1);
});

test("matches a repository case-insensitively in the cache key", async () => {
  fetchHandler = apiStub({ pages: [{ items: [], has_more: false }] });
  await send({ type: "gitbounty:get-repository-bounties", repository: "Org/App" });
  await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });

  assert.equal(calls.filter((url) => url.includes("/api/issues")).length, 1);
});

test("does not cache a failure, so one blip does not hide badges until a reload", async () => {
  fetchHandler = (url) => (url.endsWith("/api/me") ? jsonResponse({ github_login: "maya-dev" }) : jsonResponse(null, 503));
  const failed = await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.items, []);

  fetchHandler = apiStub({ pages: [{ items: [{ repository: "org/app", number: 1, points: 5 }], has_more: false }] });
  const recovered = await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.items.length, 1);
});

test("answers signed-out requests without failing: public bounties are public", async () => {
  fetchHandler = apiStub({ viewer: null, pages: [{ items: [{ repository: "org/app", number: 1, points: 5 }], has_more: false }] });
  const response = await send({ type: "gitbounty:get-repository-bounties", repository: "org/app" });
  assert.equal(response.ok, true);
  assert.equal(response.viewer, null);
});

test("rejects anything that is not an owner/repo pair without calling the API", async () => {
  for (const repository of ["", "no-slash", "org/app/extra", "../../etc/passwd", "org/app?x=1"]) {
    const response = await send({ type: "gitbounty:get-repository-bounties", repository });
    assert.equal(response.ok, false, `${JSON.stringify(repository)} is refused`);
  }
  assert.equal(calls.filter((url) => url.includes("/api/issues")).length, 0);
});

test("ignores messages it does not own", async () => {
  assert.equal(messageListener({ type: "something:else" }, {}, () => {}), false);
});
