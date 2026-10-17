import assert from "node:assert/strict";
import { skillsApi } from "../src/api/client.js";
globalThis.window = { location: { origin: "http://fixture" } };
let calls = [],
  responses = [];
globalThis.fetch = async (url) => {
  calls.push(new URL(url).pathname);
  return responses.shift();
};
const reply = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  statusText: "Error",
  text: async () => body,
});
for (const first of [
  reply(500, "<h1>server error</h1>"),
  reply(200, "broken response"),
  reply(500, JSON.stringify({ error: "404 while reading file" })),
]) {
  calls = [];
  responses = [first];
  await assert.rejects(() =>
    skillsApi("save", { id: "fixture", content: "test" }),
  );
  assert.equal(calls.length, 1, "Ambiguous write failure must not be replayed");
}
for (const status of [404, 405]) {
  calls = [];
  responses = [
    reply(status, JSON.stringify({ error: "route missing" })),
    reply(200, JSON.stringify({ ok: true })),
  ];
  assert.deepEqual(await skillsApi("status"), { ok: true });
  assert.deepEqual(calls, ["/dsh-purge/skills", "/dsh-purge/skill"]);
}
console.log(
  "PASS: only missing routes fall back; ambiguous writes are never retried",
);
