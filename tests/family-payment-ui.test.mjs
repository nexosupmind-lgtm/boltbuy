import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function ui() {
  const events = {},
    window = {};
  const context = vm.createContext({
    window,
    crypto,
    URL,
    JSON,
    document: {
      addEventListener(type, handler) {
        events[type] = handler;
      },
    },
  });
  vm.runInContext(readFileSync("SITE/family-life.js", "utf8"), context);
  return { context, window, events, api: window.BOLT_FAMILY_LIFE };
}

test("Family billing offers its private proof and preserves historical reports in the UI", () => {
  const h = ui();
  const html = h.api.panel(
    "finance",
    {
      student: { id: "s1", name: "Alice" },
      finance: [
        {
          id: "f1",
          description: "Mensalidade",
          amount: 100,
          status: "Pendente",
          confirmation: { id: "p2", hasProof: true, status: "pending" },
          proofHistory: [
            {
              id: "p2",
              hasProof: true,
              status: "pending",
              reference: "new-transfer",
            },
            {
              id: "p1",
              hasProof: true,
              status: "rejected",
              reference: "old-transfer",
            },
          ],
        },
      ],
    },
    false,
  );
  assert.match(html, /Histórico dos seus envios/);
  assert.match(html, /data-parent-proof="p1"/);
  assert.match(html, /data-parent-proof="p2"/);
  assert.match(html, /old-transfer/);
  assert.match(html, /new-transfer/);
});

test("Preview and another guardian's records do not offer a private proof button", () => {
  const h = ui(),
    data = {
      student: { id: "s1", name: "Alice" },
      finance: [
        { id: "f1", amount: 100, confirmation: { id: "p1", hasProof: true } },
      ],
    };
  assert(!h.api.panel("finance", data, true).includes("data-parent-proof"));
  data.finance[0].confirmation.hasProof = false;
  assert(!h.api.panel("finance", data, false).includes("data-parent-proof"));
});

test("Opening a proof uses the authenticated API and an isolated browser tab", async () => {
  const h = ui(),
    popup = { location: {}, opener: "parent" };
  let sent;
  h.window.open = () => popup;
  h.context.fetch = async (url, options) => {
    sent = { url, headers: options.headers, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        ok: true,
        url: "https://storage.test/short-lived-proof",
      }),
    };
  };
  h.api.set({
    slug: "escola-a",
    preview: false,
    token: async () => "private-session",
  });
  const button = { dataset: { parentProof: "p1" }, disabled: false };
  await h.events.click({ target: { closest: () => button } });
  assert.equal(sent.body.action, "payment-proof-url");
  assert.equal(sent.body.paymentId, "p1");
  assert.equal(sent.headers.authorization, "Bearer private-session");
  assert(!sent.url.includes("private-session"));
  assert.equal(popup.opener, null);
  assert.equal(popup.location.href, "https://storage.test/short-lived-proof");
  assert.equal(button.disabled, false);
});
