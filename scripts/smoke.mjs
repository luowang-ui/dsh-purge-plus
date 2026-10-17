// 发行包 smoke test：不依赖 DSH 真机，验证"打出来的 tgz 至少能导入、能解析"。
// CI 在 npm pack 之后跑它；本地 `npm run smoke` 同理。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const ok = (label) => console.log("  ✓ " + label);

const tarballs = fs
  .readdirSync(root)
  .filter((f) => f.startsWith("dsh-purge-plus-") && f.endsWith(".tgz"))
  .sort();
const tgz = process.env.SMOKE_TGZ || (tarballs.length ? path.join(root, tarballs[tarballs.length - 1]) : "");
if (!tgz || !fs.existsSync(tgz)) {
  console.error("✗ 找不到 tgz；先跑 npm pack");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "purge-smoke-"));
try {
  execFileSync("tar", ["-xzf", tgz, "-C", tmp]);
  const pkgDir = path.join(tmp, "package");
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));

  // 1) 导出映射指向的文件都存在
  for (const [key, target] of Object.entries(pkg.exports || {})) {
    const rel = typeof target === "string" ? target : target && target.default;
    if (!rel) continue;
    if (!fs.existsSync(path.join(pkgDir, rel))) problems.push(`exports["${key}"] -> ${rel} 不存在`);
  }
  if (!problems.length) ok(`${Object.keys(pkg.exports || {}).length} 个导出目标都存在`);

  // 2) 每个入口都能 import
  for (const spec of ["./lib/index.js", "./lib/presets-plugin.js", "./lib/selfcheck.js", "./lib/probe.js", "./lib/audit.js"]) {
    const mod = await import(pathToFileURL(path.join(pkgDir, spec)).href);
    if (!mod || typeof mod !== "object") problems.push(`${spec} 导入失败`);
  }
  ok("核心模块可从发行包导入");

  // 3) 自带预设能被 registry 的解析器读成合法定义
  const composition = await import(pathToFileURL(path.join(pkgDir, "lib/redteam/preset-composition.js")).href);
  const def = composition.readPresetDefinition("unrestricted", path.join(pkgDir, "presets/unrestricted"));
  if (def.id !== "unrestricted" || !Array.isArray(def.plugins) || def.plugins.length < 15)
    problems.push(`预设解析异常：${def.id} / ${def.plugins?.length} 行`);
  else ok(`预设解析：${def.plugins.length} 行`);

  // 4) bundle patch 里的条目名与包名一致
  const yml = fs.readFileSync(path.join(pkgDir, "cordis.patch.yml"), "utf8");
  for (const needle of ["dsh-purge-plus", "dsh-purge-plus/presets-plugin", "dsh-purge-plus/redteam"])
    if (!yml.includes(needle)) problems.push(`cordis.patch.yml 缺少 ${needle}`);
  if (!problems.length) ok("bundle patch 条目完整");

  // 5) CLI 在空目录里也能给出 status（不崩）
  const home = path.join(tmp, "home");
  fs.mkdirSync(home, { recursive: true });
  const out = execFileSync(process.execPath, [path.join(pkgDir, "bin/community.js"), "status"], {
    env: { ...process.env, DSH_HOME: home },
    encoding: "utf8",
  });
  if (!out.includes("Purge")) problems.push("status 输出异常");
  else ok("CLI status 可用");

  // 6) 自检在无宿主时给出 broken 而不是抛异常
  const selfcheck = await import(pathToFileURL(path.join(pkgDir, "lib/selfcheck.js")).href);
  const report = await selfcheck.selfCheck("", home);
  if (report.state !== "broken") problems.push(`无宿主时 selfcheck 应为 broken，实际 ${report.state}`);
  else ok("selfcheck 无宿主时安全降级");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (problems.length) {
  console.error("✗ smoke 失败：");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("✓ 发行包 smoke 通过");
