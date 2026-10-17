import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import {
  bindSessionContext,
  clientCurrentCwd,
  useCurrentCwd,
} from "../src/state/session-context.js";
import { RulesSection } from "../src/components/rules.js";
function store(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(next) {
      value = next;
      listeners.forEach((fn) => fn());
    },
    get count() {
      return listeners.size;
    },
  };
}
const selection = store({ sessionId: "a" });
const list = store({
  byId: {
    a: { projectionValues: { cwd: "/fixture/a" } },
    b: { header: { cwd: "/fixture/b" } },
  },
});
const stop = bindSessionContext({
  uiWorkspace: { selection },
  sessions: { list },
});
let view;
function Probe() {
  return React.createElement("span", null, useCurrentCwd());
}
await act(async () => {
  view = create(React.createElement(Probe));
});
assert.equal(clientCurrentCwd(), "/fixture/a");
assert.equal(view.toJSON().children[0], "/fixture/a");
await act(async () => selection.set({ sessionId: "b" }));
assert.equal(view.toJSON().children[0], "/fixture/b");
const requests = [];
let resolveA;
globalThis.window = { location: { origin: "http://test" } };
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push(body);
  if (body.cwd === "/fixture/a")
    await new Promise((resolve) => (resolveA = resolve));
  return {
    ok: true,
    text: async () =>
      JSON.stringify({
        ok: true,
        rules: [],
        cwd: body.cwd,
        local: [],
        workspacePolicy: "fallback",
      }),
  };
};
let rules;
await act(async () => {
  selection.set({ sessionId: "a" });
  rules = create(React.createElement(RulesSection));
});
await act(async () => selection.set({ sessionId: "b" }));
assert.equal(
  requests.at(-1).cwd,
  "/fixture/b",
  "Rules must read the selected session, not the process cwd",
);
await act(async () => resolveA());
assert(JSON.stringify(rules.toJSON()).includes("/fixture/b"));
assert(
  !JSON.stringify(rules.toJSON()).includes("/fixture/a"),
  "Late old-workspace response must not win",
);
await act(async () => {
  stop();
  view.unmount();
  rules.unmount();
});
assert.equal(selection.count, 0);
assert.equal(list.count, 0);
assert.equal(clientCurrentCwd(), "");
console.log(
  "PASS: current workspace, live session switch, stale response rejection, subscription cleanup",
);
