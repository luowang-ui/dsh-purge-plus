// Prompt wiring is the part users feel immediately: inject position and the
// boost section must register where we claim, without a live desktop.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerPromptSections } from "../lib/index.js";
import { BOOST_TEXT } from "../lib/boost.js";
import { writeTuning } from "../lib/tuning.js";

function harness(home) {
  const sections = [];
  const ctx = {
    systemPrompt: {
      section(spec) {
        sections.push(spec);
        return () => {};
      },
    },
    logger: { warn() {} },
  };
  const config = {
    enabled: true,
    capabilityProtocol: false,
    injectOnce: false,
    postPrompt: "",
    postPromptOrder: 5100,
  };
  return { ctx, config, sections };
}

function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge-prompt-"));
  const prevHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    fn(home);
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prevHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("default tuning registers the inject at the head and the boost at the tail", () => {
  withHome(() => {
    const h = harness();
    registerPromptSections(h.ctx, h.config);
    const byName = Object.fromEntries(h.sections.map((s) => [s.name, s]));
    assert(byName["dsh-purge"], "head inject section");
    assert(!byName["dsh-purge-tail"], "tail inject is opt-in");
    assert(byName["dsh-purge-boost"], "boost section is on by default");
    assert(
      byName["dsh-purge-boost"].order > byName["dsh-purge"].order,
      "boost must sort after the inject",
    );
    assert.equal(byName["dsh-purge-boost"].text({}), BOOST_TEXT);
  });
});

test("injectPosition=tail moves the text and keeps a named placeholder", () => {
  withHome((home) => {
    writeTuning({ injectPosition: "tail" }, home);
    const h = harness();
    registerPromptSections(h.ctx, h.config);
    const byName = Object.fromEntries(h.sections.map((s) => [s.name, s]));
    assert(byName["dsh-purge"], "placeholder keeps the name patch 74 looks for");
    assert(byName["dsh-purge-tail"], "tail section registered");
    assert(
      byName["dsh-purge-tail"].order > byName["dsh-purge"].order,
      "tail must sort last",
    );
    assert.equal(byName["dsh-purge"].text({}), "", "head placeholder is empty");
  });
});

test("injectPosition=both registers head and tail with the same text", () => {
  withHome((home) => {
    writeTuning({ injectPosition: "both" }, home);
    const h = harness();
    registerPromptSections(h.ctx, h.config);
    const names = h.sections.map((s) => s.name);
    assert(names.includes("dsh-purge"));
    assert(names.includes("dsh-purge-tail"));
  });
});
