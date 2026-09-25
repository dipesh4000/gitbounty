const test = require("node:test");
const assert = require("node:assert/strict");

let messageListener;
let requestedUrl = "";

global.chrome = {
  runtime: {
    onMessage: {
      addListener(listener) {
        messageListener = listener;
      },
    },
  },
};
global.fetch = async (url) => {
  requestedUrl = String(url);
  return {
    ok: true,
    json: async () => ({ items: [{ repository: "aasha-malik/gitbounty", number: 42, points: 40 }] }),
  };
};

require("../src/background.js");

test("background worker loads published bounties for the active repository", async () => {
  const response = await new Promise((resolve) => {
    const staysOpen = messageListener(
      { type: "gitbounty:get-repository-bounties", repository: "aasha-malik/gitbounty" },
      {},
      resolve,
    );
    assert.equal(staysOpen, true);
  });

  assert.match(requestedUrl, /^http:\/\/localhost:8001\/api\/issues\?/);
  assert.match(requestedUrl, /repository=aasha-malik%2Fgitbounty/);
  assert.equal(response.ok, true);
  assert.equal(response.items[0].points, 40);
});
