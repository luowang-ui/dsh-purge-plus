// 本地重锚覆盖：宿主升级把锚点改坏时，允许把某条补丁的某个 pattern
// 换成"从当前宿主里取出来的真实片段"，而不去改插件源码。
//
// 覆盖存在 $DSH_HOME/dsh-purge/anchor-overrides.json：
//   { "24": { "0": { "pattern": "...", "at": "...", "host": "0.2.1-rc.2" } } }
// apply 时会叠加到补丁表上；清掉文件即恢复出厂锚点。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 故意不 import core：core 会 import 本模块，形成循环依赖。
// 这里只需要"数据目录"，用同样的解析顺序即可。
function dshHome() {
  const env = String(process.env.DSH_HOME || "").trim();
  if (env) return env;
  return path.join(os.homedir(), ".dsh");
}

export const OVERRIDES_FILE = "anchor-overrides.json";

function file(explicit) {
  const home = explicit || dshHome();
  if (!home) return "";
  return path.join(home, "dsh-purge", OVERRIDES_FILE);
}

export function readOverrides(dshHome) {
  const fp = file(dshHome);
  if (!fp) return {};
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function writeOverride(dshHome, patchId, index, pattern, extra = {}) {
  const fp = file(dshHome);
  if (!fp) throw new Error("未定位 DSH 数据目录，无法写重锚覆盖");
  const all = readOverrides(dshHome);
  const key = String(patchId);
  all[key] = all[key] || {};
  all[key][String(index)] = {
    pattern,
    at: new Date().toISOString(),
    ...extra,
  };
  fs.mkdirSync(path.dirname(fp), { recursive: true, mode: 0o700 });
  fs.writeFileSync(fp, JSON.stringify(all, null, 2), { mode: 0o600 });
  return all;
}

export function clearOverride(dshHome, patchId, index) {
  const all = readOverrides(dshHome);
  const key = String(patchId);
  if (!all[key]) return all;
  if (index === undefined) delete all[key];
  else delete all[key][String(index)];
  if (all[key] && Object.keys(all[key]).length === 0) delete all[key];
  const fp = file(dshHome);
  if (fp) fs.writeFileSync(fp, JSON.stringify(all, null, 2), { mode: 0o600 });
  return all;
}

/** 把覆盖叠到一条补丁的 replacements 上（不改原对象）。 */
export function applyOverrides(patch, overrides) {
  const all = overrides || {};
  const mine = all[String(patch && patch.id)];
  if (!mine) return patch;
  const list = Array.isArray(patch.replacements)
    ? patch.replacements.slice()
    : (patch.patterns ?? []).map((pat) => ({ pattern: pat, replace: patch.replace }));
  let changed = false;
  for (const [index, entry] of Object.entries(mine)) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) continue;
    if (!entry || typeof entry.pattern !== "string" || !entry.pattern) continue;
    list[i] = { ...list[i], pattern: entry.pattern };
    changed = true;
  }
  if (!changed) return patch;
  return { ...patch, replacements: list, overridden: true };
}
