import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  Maintenance,
  compatibility,
  requirePatchCompatibility,
  download,
  PACKAGE,
} from "../lib/community.js";
function setup() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge-community-")),
    profile = path.join(home, "profiles/desktop"),
    aiBase = path.join(home, "host");
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(path.join(aiBase, "dsh-agent-instructions", "lib"), { recursive: true });
  for (const pkg of ["dsh-agent-loop", "dsh-system-prompt"]) {
    fs.mkdirSync(path.join(aiBase, pkg), { recursive: true });
    fs.writeFileSync(
      path.join(aiBase, pkg, "package.json"),
      JSON.stringify({ version: "0.2.1-rc.1" }),
    );
  }
  const root = path.join(profile, "node_modules", PACKAGE);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: PACKAGE, version: "1.2.0" }),
  );
  fs.writeFileSync(path.join(root, "client.js"), "original client");
  fs.writeFileSync(
    path.join(profile, "package.json"),
    JSON.stringify({
      dependencies: { [PACKAGE]: "file:original", "unrelated-plugin": "keep" },
      dsh: { profile: { bundles: [PACKAGE, "unrelated-plugin"] } },
    }),
  );
  fs.writeFileSync(
    path.join(profile, "cordis.patch.yml"),
    "PRIVATE CURRENT SETTINGS",
  );
  fs.writeFileSync(path.join(home, "prompt-inject.md"), "PRIVATE USER PROMPT");
  const packRoot = path.join(home, "candidate/package");
  fs.mkdirSync(packRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packRoot, "package.json"),
    JSON.stringify({
      name: PACKAGE,
      version: "1.2.0",
      repository: { url: "https://github.com/kingcharleslzy-ai/dsh-purge.git" },
    }),
  );
  const candidate = path.join(home, "candidate.tgz");
  execFileSync("tar", [
    "-czf",
    candidate,
    "-C",
    path.dirname(packRoot),
    "package",
  ]);
  const installs = [];
  const manager = new Maintenance({
    home,
    candidate,
    profile,
    root,
    aiBase,
    installer: async (file) => {
      installs.push(file);
    },
  });
  return {
    home,
    candidate,
    profile,
    root,
    aiBase,
    manager,
    installs,
    close: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}
test("compatibility reports instead of disabling: 0.2.1 qualified, unknown version unverified but writable", () => {
  const f = setup();
  try {
    const base = compatibility(f.aiBase);
    assert.equal(base.runtime_supported, true);
    assert.equal(base.patch_writes_allowed, true);
    assert.equal(base.qualified, true);
    assert.equal(base.level, "qualified");
    // 有宿主就允许写：门禁只挡"完全找不到宿主"，不按版本一刀切。
    assert.doesNotThrow(() => requirePatchCompatibility(f.aiBase));
    fs.writeFileSync(
      path.join(f.aiBase, "dsh-system-prompt/package.json"),
      JSON.stringify({ version: "0.2.2" }),
    );
    const mixed = compatibility(f.aiBase);
    assert.equal(mixed.level, "mixed");
    // 版本不一致只报告，不再挡写入：补丁照打，状态与备份兜底。
    assert.equal(mixed.patch_writes_allowed, true);
    assert.doesNotThrow(() => requirePatchCompatibility(f.aiBase));
    for (const pkg of ["dsh-agent-loop", "dsh-system-prompt"])
      fs.writeFileSync(
        path.join(f.aiBase, pkg, "package.json"),
        JSON.stringify({ version: "99.0.0" }),
      );
    const unknown = compatibility(f.aiBase);
    assert.equal(unknown.runtime_supported, true);
    assert.equal(unknown.qualified, false);
    assert.equal(unknown.level, "unverified");
    assert.equal(unknown.patch_writes_allowed, true);
    assert.doesNotThrow(() => requirePatchCompatibility(f.aiBase));
  } finally {
    f.close();
  }
});

test("no host layout still blocks writes with a clear message", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "purge-nohost-"));
  try {
    const none = compatibility(empty);
    assert.equal(none.level, "no-host");
    assert.equal(none.patch_writes_allowed, false);
    assert.throws(() => requirePatchCompatibility(empty), /未定位到宿主/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
test("backup retention keeps the newest snapshots and reports disk usage", async () => {
  const f = setup();
  try {
    const made = [];
    for (let i = 0; i < 4; i += 1) made.push(await f.manager.backup("retention-test"));
    const usage = f.manager.usage();
    assert(usage.count >= 4);
    assert(usage.bytes > 0);
    const pruned = f.manager.prune({ keepLast: 2, keepDays: 1, maxTotalBytes: 512 * 1024 * 1024 });
    assert(pruned.kept <= 3, `kept ${pruned.kept}`);
    const left = f.manager.list().map((b) => b.id);
    assert(left.includes(made[made.length - 1].id), "newest snapshot must survive");
    assert(f.manager.verify(made[made.length - 1].id));
    assert(pruned.freed >= 0);
  } finally {
    f.close();
  }
});

test("backup is complete, private, verifiable and does not include credentials or images", async () => {
  const f = setup();
  try {
    fs.writeFileSync(path.join(f.home, ".credentials.yaml"), "SECRET");
    const b = await f.manager.backup();
    assert(f.manager.verify(b.id));
    assert.equal(fs.statSync(b.folder).mode & 0o777, 0o700);
    assert.equal(
      fs.existsSync(path.join(b.folder, ".credentials.yaml")),
      false,
    );
    assert.equal(f.manager.list().length, 1);
    assert.equal(f.installs.length, 0);
  } finally {
    f.close();
  }
});
test("tampered backups rejected before installer or settings changes", async () => {
  const f = setup();
  try {
    const b = await f.manager.backup();
    fs.writeFileSync(
      path.join(b.folder, "plugins", PACKAGE, "client.js"),
      "tampered",
    );
    await assert.rejects(f.manager.rollback(b.id), /校验/);
    assert.equal(f.installs.length, 0);
    assert.equal(
      fs.readFileSync(path.join(f.profile, "cordis.patch.yml"), "utf8"),
      "PRIVATE CURRENT SETTINGS",
    );
    await assert.rejects(f.manager.rollback("../escape"), /ID/);
  } finally {
    f.close();
  }
});
test("rollback restores plugin enablement while preserving current settings and other dependencies", async () => {
  const f = setup();
  try {
    const b = await f.manager.backup();
    fs.writeFileSync(path.join(f.home, "prompt-inject.md"), "NEW USER PROMPT");
    const p = JSON.parse(fs.readFileSync(path.join(f.profile, "package.json")));
    p.dependencies["another-plugin"] = "added";
    p.dsh.profile.bundles.push("another-plugin");
    fs.writeFileSync(path.join(f.profile, "package.json"), JSON.stringify(p));
    const r = await f.manager.rollback(b.id);
    assert(r.restart_required);
    assert.equal(f.manager.list().length, 2);
    assert.equal(f.installs.length, 1);
    assert.equal(
      fs.readFileSync(path.join(f.home, "prompt-inject.md"), "utf8"),
      "NEW USER PROMPT",
    );
    const now = JSON.parse(
      fs.readFileSync(path.join(f.profile, "package.json")),
    );
    assert(now.dsh.profile.bundles.includes("another-plugin"));
    assert.equal(now.dependencies["another-plugin"], "added");
  } finally {
    f.close();
  }
});
test("installation backs up before writing, replaces only Purge bundles and preserves legacy dependency availability", async () => {
  const f = setup();
  try {
    const p = JSON.parse(fs.readFileSync(path.join(f.profile, "package.json")));
    p.dsh.profile.bundles.unshift("dsh-purge", "dsh-purge-panel");
    fs.writeFileSync(path.join(f.profile, "package.json"), JSON.stringify(p));
    await f.manager.install(f.candidate);
    assert.equal(f.manager.list().length, 1);
    const now = JSON.parse(
      fs.readFileSync(path.join(f.profile, "package.json")),
    );
    assert.deepEqual(now.dsh.profile.bundles, ["unrelated-plugin", PACKAGE]);
    assert.equal(
      fs.readFileSync(path.join(f.home, "prompt-inject.md"), "utf8"),
      "PRIVATE USER PROMPT",
    );
  } finally {
    f.close();
  }
});
test("failed installer preserves a recovery snapshot and restores prior manifest", async () => {
  const f = setup();
  try {
    const before = fs.readFileSync(path.join(f.profile, "package.json"));
    f.manager.installer = async () => {
      throw Error("simulated failure");
    };
    await assert.rejects(f.manager.install(f.candidate), /安装失败/);
    assert.equal(f.manager.list().length, 1);
    assert.deepEqual(
      fs.readFileSync(path.join(f.profile, "package.json")),
      before,
    );
    assert(!fs.existsSync(path.join(f.manager.base, "maintenance.lock")));
  } finally {
    f.close();
  }
});
test("maintenance serializes writes across processes", async () => {
  const f = setup();
  try {
    fs.mkdirSync(f.manager.base, { recursive: true });
    fs.writeFileSync(path.join(f.manager.base, "maintenance.lock"), "fixture");
    await assert.rejects(f.manager.backup(), /已有维护操作/);
    assert.equal(f.manager.list().length, 0);
  } finally {
    f.close();
  }
});
test("download rejects redirects to untrusted and insecure hosts before a second request", async () => {
  let calls = 0;
  const request = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/secret" },
    });
  };
  await assert.rejects(
    download("https://github.com/test", 1024, request),
    /来源无效/,
  );
  assert.equal(calls, 1);
});
test("download limits streamed size even without content-length", async () => {
  await assert.rejects(
    download("https://github.com/test", 3, async () => new Response("too big")),
    /过大/,
  );
});

test("missing prompt component does not pass a version check", () => {
  const f = setup();
  try {
    fs.unlinkSync(path.join(f.aiBase, "dsh-system-prompt/package.json"));
    assert.equal(compatibility(f.aiBase).runtime_supported, false);
  } finally {
    f.close();
  }
});
test("repeated rollback stages fresh verified code instead of reusing mutable package-manager links", async () => {
  const f = setup();
  try {
    const b = await f.manager.backup();
    await f.manager.rollback(b.id);
    const first = f.installs.at(-1);
    fs.writeFileSync(path.join(first, "client.js"), "changed linked code");
    await f.manager.rollback(b.id);
    const second = f.installs.at(-1);
    assert.notEqual(first, second);
    assert.equal(
      fs.readFileSync(path.join(second, "client.js"), "utf8"),
      "original client",
    );
  } finally {
    f.close();
  }
});
test("release checksum failure stops before installation", async () => {
  const { installRelease } = await import("../lib/community.js");
  const f = setup(),
    previous = globalThis.fetch;
  try {
    globalThis.fetch = async (url) =>
      new Response(
        String(url).endsWith("sums")
          ? "0".repeat(64) + "  " + PACKAGE + "-1.2.0.tgz"
          : "wrong bytes",
      );
    await assert.rejects(
      installRelease(f.manager, {
        ref: "v1.2.0",
        version: "1.2.0",
        asset: "https://github.com/fixture/asset",
        sums: "https://github.com/fixture/sums",
      }),
      /SHA256/,
    );
    assert.equal(f.installs.length, 0);
    assert.equal(f.manager.list().length, 0);
  } finally {
    globalThis.fetch = previous;
    f.close();
  }
});

test("Desktop POSIX launcher without executable permission runs through sh without changing app permissions", async () => {
  const { installWithDsh } = await import("../lib/community.js"),
    f = setup(),
    previous = process.env.PURGE_DSH_CLI;
  try {
    const cli = path.join(f.home, "dsh");
    fs.writeFileSync(
      cli,
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$DSH_HOME/cli-args"\n',
      { mode: 0o600 },
    );
    process.env.PURGE_DSH_CLI = cli;
    await installWithDsh(f.candidate, f.manager);
    assert.equal(
      fs.readFileSync(path.join(f.home, "cli-args"), "utf8"),
      ["plugin", "--profile", "desktop", "add", f.candidate, ""].join("\n"),
    );
    assert.equal(fs.statSync(cli).mode & 0o777, 0o600);
  } finally {
    if (previous === undefined) delete process.env.PURGE_DSH_CLI;
    else process.env.PURGE_DSH_CLI = previous;
    f.close();
  }
});

test("large files are stored once and restored byte-for-byte", async () => {
  const f = setup();
  try {
    const big = Buffer.alloc(64 * 1024, 7);
    fs.writeFileSync(path.join(f.root, "client.js"), big);
    const a = await f.manager.backup("dedupe-a");
    const b = await f.manager.backup("dedupe-b");
    const objects = path.join(f.home, "dsh-purge-plus", "objects");
    assert.equal(fs.readdirSync(objects).length, 1, "same content -> one object");
    // 备份目录里不再重复放这份大文件
    assert(
      !fs.existsSync(
        path.join(f.home, "dsh-purge-plus", "backups", a.id, "plugins", PACKAGE, "client.js"),
      ),
      "deduped file is not copied into the snapshot folder",
    );
    assert(f.manager.verify(a.id));
    assert(f.manager.verify(b.id));

    // 回滚能把内容完整写回
    const before = f.installs.length;
    await f.manager.rollback(a.id);
    const staged = f.installs.slice(before).find((p) => p.endsWith(PACKAGE));
    assert(staged, "rollback staged the plugin");
    assert(fs.readFileSync(path.join(staged, "client.js")).equals(big), "bytes restored");

    const usage = f.manager.usage();
    assert(usage.objects > 0);
    // 全部删掉以后，对象被回收
    const pr = f.manager.prune({ keepLast: 0, keepDays: 0, maxTotalBytes: 0 });
    assert(pr.gc.removed >= 0);
    assert.equal(f.manager.list().length <= 1, true);
  } finally {
    f.close();
  }
});
