// Updater filesystem layer: backups, rollback, zip overlay, git checkout helpers.
// Derived from YuJunZhiXue/dsh-purge lib/update.js (MIT, Copyright (c) 2026 小杨).
// Community fork rule: every write into an install directory is preceded by a
// snapshot (Maintenance backup when a manager exists, otherwise this directory
// backup) and restored when the write throws.
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { atomicWriteSync, findDshHome } from "./core.js";
import { extractZipArchive } from "./zip-extract.js";
import { fetchRes, archiveZipUrl, MAX_UPDATE_BYTES } from "./update-net.js";

export const COPY_NAMES = [
  "lib",
  "bin",
  "docs",
  "presets",
  "skills",
  "client.js",
  "cordis.patch.yml",
  "screenshots.json",
  "package.json",
  "README.md",
  "README.zh-CN.md",
  "LICENSE",
  "NOTICE.md",
];

const HIDDEN = {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  windowsHide: true,
  timeout: 20000,
};

export function realPath(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

export function isLinkSpec(spec) {
  const s = String(spec || "");
  return /^(link|file):/i.test(s) || s === "." || /^\.\.?(?:[/\\]|$)/.test(s);
}

export function resolveLinkDir(profileDir, spec) {
  const raw = String(spec).replace(/^(link|file):/i, "");
  return path.resolve(profileDir, raw);
}

export function isGitCheckout(dir) {
  return Boolean(dir) && fs.existsSync(path.join(dir, ".git"));
}

export function canGit(dir) {
  if (!isGitCheckout(dir)) return false;
  try {
    execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], HIDDEN);
    return true;
  } catch {
    return false;
  }
}

export function gitHead(dir) {
  if (!dir) return "";
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], HIDDEN).trim();
  } catch {
    return "";
  }
}

export function gitTrackedDirty(dir) {
  try {
    const out = execFileSync(
      "git",
      ["-C", dir, "status", "--porcelain", "--untracked-files=no", "--", ...COPY_NAMES],
      HIDDEN,
    ).trim();
    return Boolean(out);
  } catch {
    return true;
  }
}

export function runGit(dir, args, timeout = 20000) {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout,
    });
  } catch (e) {
    const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join("\n").trim();
    throw new Error(detail || `git ${args.join(" ")}`);
  }
}

export function gitResetTo(dir, ref, { force = false, fallbackRef = "master" } = {}) {
  if (!force && gitTrackedDirty(dir)) {
    throw new Error("本地插件文件有未提交改动，未覆盖");
  }
  const target = String(ref || fallbackRef);
  try {
    runGit(dir, ["fetch", "origin", "--tags"], 60000);
  } catch {
    runGit(dir, ["fetch", "origin", "--tags", target], 60000);
  }
  if (target === "master" || target === "beta") {
    try {
      runGit(dir, ["checkout", "-B", target, `origin/${target}`]);
      return;
    } catch {
      runGit(dir, ["reset", "--hard", `origin/${target}`]);
      return;
    }
  }
  try {
    runGit(dir, ["fetch", "origin", "--tags", target], 60000);
  } catch {
    // 上面已经 fetch 过全部分支。
  }
  runGit(dir, ["reset", "--hard", target]);
}

/* ------------------------------------------------------------------ */
/* 目录快照：Maintenance 不可用时的原版 zip/目录备份逻辑               */
/* ------------------------------------------------------------------ */

function backupRoot(home) {
  return path.join(home || findDshHome(), "dsh-purge", "backups");
}

export function copyTree(source, dest, { skip = new Set() } = {}) {
  const st = fs.lstatSync(source);
  if (st.isSymbolicLink()) throw new Error("备份内容含符号链接，未继续");
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(source)) {
      if (skip.has(name)) continue;
      copyTree(path.join(source, name), path.join(dest, name), { skip });
    }
    return dest;
  }
  if (!st.isFile()) throw new Error("仅备份普通文件与目录");
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, dest);
  fs.chmodSync(dest, 0o600);
  return dest;
}

/** 给安装目录拍快照，返回 {id, folder, dir}；目录不存在时返回 null。 */
export function dirBackup(dir, { home, reason = "before-update", label = "" } = {}) {
  if (!dir || !fs.existsSync(dir)) return null;
  const resolved = realPath(dir);
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const folder = path.join(backupRoot(home), `dir-${id}`);
  copyTree(resolved, folder, { skip: new Set(["node_modules", ".git", "manifest.json"]) });
  atomicWriteSync(
    path.join(folder, "manifest.json"),
    `${JSON.stringify({ schema: 1, id, kind: "dir", dir: resolved, reason, label, at: new Date().toISOString() }, null, 2)}\n`,
  );
  return { id, folder, dir: resolved };
}

/** 用快照回滚目录。失败会抛出，由调用方汇总。 */
export function dirRestore(backup, targetDir = "") {
  if (!backup || !backup.folder || !fs.existsSync(backup.folder)) {
    throw new Error("备份不存在，无法回滚");
  }
  const dest = realPath(targetDir || backup.dir);
  const staged = `${dest}.restore-${randomBytes(4).toString("hex")}`;
  copyTree(backup.folder, staged, { skip: new Set(["manifest.json"]) });
  const retired = `${dest}.retired-${randomBytes(4).toString("hex")}`;
  if (fs.existsSync(dest)) fs.renameSync(dest, retired);
  try {
    fs.renameSync(staged, dest);
  } catch (e) {
    if (fs.existsSync(retired) && !fs.existsSync(dest)) fs.renameSync(retired, dest);
    throw e;
  }
  try {
    fs.rmSync(retired, { recursive: true, force: true });
  } catch {
    // 旧目录清不掉不影响回滚结果。
  }
  return dest;
}

/* ------------------------------------------------------------------ */
/* 归档下载 / 解压 / 覆盖                                              */
/* ------------------------------------------------------------------ */

export function extractZip(zip, dest) {
  // win32：tar(bsdtar) → powershell。darwin/linux：tar → unzip → python3 → bsdtar。
  // 外部工具都不可用时用 Node 解 zip，Linux 不会再去调用 powershell。
  return extractZipArchive(zip, dest);
}

/** 下载 zip 并解出插件根目录（含 package.json 的那一层）。 */
export async function downloadPluginArchive(ref, { tmpDir, ms = 45000, zipUrl = "" } = {}) {
  const root = tmpDir || (await fsp.mkdtemp(path.join(os.tmpdir(), "dsh-purge-upd-")));
  const zip = path.join(root, "plugin.zip");
  const res = await fetchRes(zipUrl || archiveZipUrl(ref), ms);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_UPDATE_BYTES) throw new Error("更新包超出大小上限");
  await fsp.writeFile(zip, buffer);
  extractZip(zip, root);
  const names = await fsp.readdir(root);
  const unpacked = names
    .map((n) => path.join(root, n))
    .find((p) => fs.existsSync(path.join(p, "package.json")));
  if (!unpacked) throw new Error("zip 里没有 package.json");
  return { root, zip, unpacked };
}

/** 覆盖前先备份；任一目录写失败就把所有目录回滚到快照。 */
export async function overlayFromZip(dests, ref, { home, reason = "before-update", zipUrl = "" } = {}) {
  const unique = [...new Set((dests || []).filter(Boolean).map((d) => realPath(d)))];
  if (!unique.length) return { dests: [], backups: [] };
  const backups = unique.map((dest) => ({ dest, backup: dirBackup(dest, { home, reason, label: ref }) }));
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "dsh-purge-upd-"));
  try {
    const { unpacked } = await downloadPluginArchive(ref, { tmpDir: tmp, zipUrl });
    for (const dest of unique) {
      for (const name of COPY_NAMES) {
        const from = path.join(unpacked, name);
        const to = path.join(dest, name);
        if (!fs.existsSync(from)) continue;
        if (name === "lib" || name === "docs" || name === "bin" || name === "presets" || name === "skills") {
          try {
            await fsp.rm(to, { recursive: true, force: true });
          } catch (e) {
            // 删不掉说明文件被进程占用。继续 cp 会写出一半新文件一半旧文件的半升级,
            // 让宿主和插件的版本不一致。宁可回滚让用户彻底退出宿主再重试。
            throw new Error(`覆盖 ${to} 失败(${e.message || e})。可能被进程占用,请完全退出宿主后重试。`);
          }
        }
        await fsp.cp(from, to, { recursive: true, force: true });
      }
    }
    return { dests: unique, backups };
  } catch (e) {
    const rollbackErrors = [];
    for (const { dest, backup } of backups) {
      if (!backup) continue;
      try {
        dirRestore(backup, dest);
      } catch (err) {
        rollbackErrors.push(`${dest}: ${err.message || err}`);
      }
    }
    const suffix = rollbackErrors.length ? `；回滚失败：${rollbackErrors.join("；")}` : "；已回滚到更新前快照";
    throw new Error(`${e.message || e}${suffix}`);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** 把解出的插件目录整体换到目标位置，失败自动回滚。 */
export function swapDir(staged, target) {
  const backup = dirBackup(target, { reason: "before-upstream-update", label: "upstream" });
  const retired = fs.existsSync(target) ? `${target}.old-${randomBytes(4).toString("hex")}` : "";
  try {
    if (retired) fs.renameSync(target, retired);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(staged, target);
  } catch (e) {
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      if (retired && fs.existsSync(retired)) fs.renameSync(retired, target);
      else if (backup) dirRestore(backup, target);
    } catch (err) {
      throw new Error(`${e.message || e}；回滚失败：${err.message || err}`);
    }
    throw new Error(`${e.message || e}；已回滚`);
  }
  if (retired) {
    try {
      fs.rmSync(retired, { recursive: true, force: true });
    } catch {
      // 旧目录清不掉不影响结果。
    }
  }
  return backup;
}
