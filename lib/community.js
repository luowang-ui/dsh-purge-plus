import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
export const REPOSITORY = "kingcharleslzy-ai/dsh-purge";
export const PACKAGE = "dsh-purge-plus";
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const PURGE_PACKAGES = ["dsh-purge", "dsh-purge-panel", PACKAGE];
export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
export function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + randomBytes(6).toString("hex") + ".tmp";
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, value);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}
const hash = (data) => createHash("sha256").update(data).digest("hex");
function treeBytes(root) {
  let total = 0;
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fp = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) walk(fp);
        else if (entry.isFile()) total += fs.statSync(fp).size;
      } catch { /* 并发删除时忽略 */ }
    }
  };
  walk(root);
  return total;
}

/**
 * 逐条补丁锚点验证过的宿主版本。
 * 新增条目必须同时提供"原始宿主源码回归"证据（test/patch-anchors 用例），
 * 不能只因为在这台机器上跑通就加进来。
 */
export const QUALIFIED_HOST_VERSIONS = Object.freeze(["0.2.1-rc.1", "0.2.1-rc.2"]);

function readVersion(reader, aiBase, pkg) {
  try {
    return JSON.parse(
      reader.readFileSync(path.join(aiBase, pkg, "package.json"), "utf8"),
    ).version;
  } catch {
    return "";
  }
}

/**
 * 兼容性报告。**只做诊断，不做禁用**：
 * 宿主找得到就允许写入补丁（写入前一定先备份），锚点漂移由逐条诊断上报，
 * 不再用一个全局开关把所有版本的补丁一起停掉。
 */
export function compatibility(aiBase, reader = fs) {
  const version = readVersion(reader, aiBase, "dsh-agent-loop");
  const promptVersion = readVersion(reader, aiBase, "dsh-system-prompt");
  const mixed = !!version && !!promptVersion && version !== promptVersion;
  let layout = false;
  try {
    layout = !!aiBase
      && reader.statSync(
        path.join(aiBase, "dsh-agent-instructions", "lib"),
      ).isDirectory();
  } catch {
    layout = false;
  }
  const qualified = !mixed
    && !!version
    && version === promptVersion
    && QUALIFIED_HOST_VERSIONS.includes(version);
  // 只有"根本没找到宿主"才算写不了。组件版本不一致也只是报告：
  // 补丁该打的一条不少，写坏的风险由逐条状态 + 备份兜底，不用一个全局开关陪葬。
  const patchWritesAllowed = layout;
  const runtimeSupported = !mixed && !!version && !!promptVersion && version === promptVersion;
  return {
    host_version: version || "unknown",
    prompt_version: promptVersion || "unknown",
    runtime_supported: runtimeSupported,
    patch_writes_allowed: patchWritesAllowed,
    layout_found: layout,
    qualified,
    level: mixed
      ? "mixed"
      : !layout
        ? "no-host"
        : qualified
          ? "qualified"
          : "unverified",
    message: mixed
      ? "宿主组件版本不一致（agent-loop 与 system-prompt 不同版）：仍按补丁表写入，逐条状态为准；建议修好安装。"
      : !layout
        ? "未定位到宿主 @deepseek-ai 目录。官方桌面版点「应用」会解开 app.asar 后重启并自动继续。"
        : qualified
          ? `DSH ${version}：逐条补丁锚点已回归验证，可直接应用；写入前自动备份。`
          : `DSH ${version} 未在已验证清单内：仍可应用，写入前备份，应用后请看逐条诊断确认锚点是否漂移。`,
  };
}

/**
 * 兼容旧调用点。现在只在"完全找不到宿主"时抛错，
 * 版本未知/锚点漂移都不再阻断——那属于状态展示，不是写入门禁。
 */
export function requirePatchCompatibility(aiBase, reader = fs) {
  const value = compatibility(aiBase, reader);
  if (!value.layout_found)
    throw Error(`Purge：未定位到宿主目录，无法写入。${value.message}`);
  // mixed 不再拒绝：只报告。调用方若想提示，读 value.message。
  if (value.level === "mixed") console.warn(`[dsh-purge] ${value.message}`);
  return value;
}

/** 逐条锚点诊断：宿主升级后用它确认哪几条补丁的定位字符串变了。 */
export async function diagnosePatches(aiBase, coreModule) {
  const core = coreModule || (await import("./core.js"));
  const status = await core.patchStatus(aiBase);
  return core.ALL_PATCHES.map((p) => ({
    id: p.id,
    name: p.name,
    layer: p.layer,
    optional: !!p.optional,
    status: status[p.id],
    keys: Array.isArray(p.file) ? p.file.slice() : [p.file],
  })).filter((row) => row.status !== "applied" && row.status !== "na");
}
/**
 * 当前 profile 目录。按优先级：argv 里的 profiles/<name> 路径 → `--profile <name>`
 * → `DSH_PROFILE` → 唯一存在的 profile → desktop。
 * 以前只看 argv 路径、否则一律拼 desktop；在 web / headless / 自定义 profile 下
 * 会指向不存在的目录，让整个插件在 activate 阶段抛错。
 */
export function defaultProfile(home) {
  const arg = process.argv.find((p) =>
    /[\\/]profiles[\\/][^\\/]+$/.test(p || ""),
  );
  if (arg) return arg;
  const flag = process.argv.indexOf("--profile");
  const named = (flag >= 0 && process.argv[flag + 1])
    || process.env.DSH_PROFILE
    || "desktop";
  const profiles = path.join(home, "profiles");
  const candidate = path.join(profiles, named);
  try {
    if (!fs.existsSync(candidate)) {
      const dirs = fs.readdirSync(profiles, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name);
      if (dirs.length === 1) return path.join(profiles, dirs[0]);
    }
  } catch { /* home 还没建好就按名字返回 */ }
  return candidate;
}
function copyTree(source, dest) {
  const st = fs.lstatSync(source);
  if (st.isSymbolicLink()) throw Error("备份内容含符号链接，未继续");
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(source))
      if (!["node_modules", ".git"].includes(name))
        copyTree(path.join(source, name), path.join(dest, name));
  } else if (st.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, dest);
    fs.chmodSync(dest, 0o600);
  } else throw Error("仅备份普通文件与目录");
}
/**
 * 内容寻址去重：大于 DEDUPE_MIN 的文件只存一份到 base/objects/<sha256>，
 * 备份目录里不重复放；小文件照旧复制（省得为几百字节建一堆对象）。
 * 同一份 client.js 在 8 个快照里只占一份空间。
 */
export const DEDUPE_MIN = 32 * 1024;

function copyTreeDedup(source, dest, objects, blobs, rel = "") {
  const st = fs.lstatSync(source);
  if (st.isSymbolicLink()) throw Error("备份内容含符号链接，未继续");
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(source))
      if (!["node_modules", ".git"].includes(name))
        copyTreeDedup(
          path.join(source, name),
          path.join(dest, name),
          objects,
          blobs,
          rel ? path.posix.join(rel, name) : name,
        );
    return;
  }
  if (!st.isFile()) throw Error("仅备份普通文件与目录");
  const key = rel;
  if (st.size >= DEDUPE_MIN) {
    const data = fs.readFileSync(source);
    const sum = hash(data);
    const blob = path.join(objects, sum);
    if (!fs.existsSync(blob)) {
      fs.mkdirSync(objects, { recursive: true, mode: 0o700 });
      const tmp = blob + "." + randomBytes(4).toString("hex") + ".tmp";
      fs.writeFileSync(tmp, data, { mode: 0o600 });
      fs.renameSync(tmp, blob);
    }
    blobs[key] = sum;
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, dest);
  fs.chmodSync(dest, 0o600);
}

/** 把备份里某棵子树写出来，去重对象按 rel 前缀取回。 */
function materializeTree(folder, relDir, dest, blobs, objects) {
  const abs = path.join(folder, relDir);
  if (fs.existsSync(abs)) copyTree(abs, dest);
  const prefix = relDir.split(path.sep).join(path.posix.sep) + "/";
  for (const [rel, sum] of Object.entries(blobs || {})) {
    if (!rel.startsWith(prefix)) continue;
    const target = path.join(dest, rel.slice(prefix.length));
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.copyFileSync(path.join(objects, sum), target);
    fs.chmodSync(target, 0o600);
  }
}

function blobsIn(manifest) {
  return manifest && manifest.blobs ? manifest.blobs : {};
}

function treeHashes(root, rel = "", out = {}) {
  for (const name of fs.readdirSync(path.join(root, rel))) {
    const key = path.posix.join(rel, name),
      p = path.join(root, key),
      st = fs.lstatSync(p);
    if (st.isSymbolicLink()) throw Error("备份中出现符号链接");
    if (st.isDirectory()) treeHashes(root, key, out);
    else if (st.isFile()) out[key] = hash(fs.readFileSync(p));
  }
  return out;
}
function validId(id) {
  if (!/^[0-9TZa-f-]{15,80}$/.test(id || "")) throw Error("备份 ID 无效");
  return id;
}
export class Maintenance {
  constructor({
    home,
    profile = defaultProfile(home),
    root = ROOT,
    aiBase = "",
    installer = installWithDsh,
  } = {}) {
    if (!home) throw Error("未确定 DSH 数据目录");
    try {
      this.home = fs.realpathSync(home);
    } catch {
      throw Error(`未找到 DSH 数据目录：${home}`);
    }
    try {
      this.profile = fs.realpathSync(profile);
    } catch {
      throw Error(`未找到 profile 目录：${profile}（可用 PURGE_PROFILE_DIR 指定）`);
    }
    this.root = path.resolve(root);
    this.aiBase = aiBase;
    this.installer = installer;
    this.base = path.join(this.home, "dsh-purge-plus");
    this.backups = path.join(this.base, "backups");
    this.objects = path.join(this.base, "objects");
  }
  async locked(fn) {
    fs.mkdirSync(this.base, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.base, 0o700);
    const lock = path.join(this.base, "maintenance.lock");
    let fd;
    try {
      fd = fs.openSync(lock, "wx", 0o600);
      fs.writeFileSync(fd, String(process.pid));
    } catch {
      throw Error(
        "已有维护操作或遗留锁，请先检查 maintenance.lock，未并发修改",
      );
    }
    try {
      return await fn();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
  list() {
    if (!fs.existsSync(this.backups)) return [];
    return fs
      .readdirSync(this.backups)
      .flatMap((id) => {
        if (!/^[0-9TZa-f-]{15,80}$/.test(id)) return [];
        const m = readJSON(path.join(this.backups, id, "manifest.json"));
        return m?.complete
          ? [
              {
                id,
                created_at: m.created_at,
                reason: m.reason,
                host_version: m.host_version,
                plugins: m.plugins.map((p) => ({
                  name: p.name,
                  version: p.version,
                })),
              },
            ]
          : [];
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  backup(reason = "manual") {
    return this.locked(async () => {
      const saved = this.snapshot(reason);
      this.prune();
      return saved;
    });
  }
  /** 当前备份占用（面板/CLI 展示用）。 */
  usage() {
    const list = this.list();
    let bytes = 0;
    for (const item of list) bytes += treeBytes(path.join(this.backups, item.id));
    const objects = treeBytes(this.objects);
    return { count: list.length, bytes: bytes + objects, snapshots: bytes, objects };
  }
  /** 删掉没有任何备份引用的去重对象。 */
  gcObjects() {
    if (!fs.existsSync(this.objects)) return { removed: 0, freed: 0 };
    const referenced = new Set();
    for (const item of this.list()) {
      const m = readJSON(path.join(this.backups, item.id, "manifest.json"));
      for (const sum of Object.values((m && m.blobs) || {})) referenced.add(sum);
    }
    let removed = 0;
    let freed = 0;
    for (const name of fs.readdirSync(this.objects)) {
      if (referenced.has(name)) continue;
      const fp = path.join(this.objects, name);
      try {
        const size = fs.statSync(fp).size;
        fs.rmSync(fp, { force: true });
        removed += 1;
        freed += size;
      } catch {
        /* ignore */
      }
    }
    return { removed, freed };
  }
  /**
   * 保留策略：最近 keepLast 份必留，其余每天最多留 1 份、最多 keepDays 天；
   * 最后再按总大小上限淘汰最旧的。任何一份都不在"正在使用"的状态下被删——
   * 回滚目标由 verify() 先校验，调用方负责传 protect。
   */
  prune({ keepLast = 5, keepDays = 7, maxTotalBytes = 200 * 1024 * 1024, protect = "" } = {}) {
    const list = this.list(); // 新 → 旧
    if (!list.length) return { removed: [], freed: 0, kept: 0 };
    const keep = new Set(list.slice(0, Math.max(1, keepLast)).map((b) => b.id));
    if (protect) keep.add(protect);
    const days = new Set();
    for (const item of list) {
      if (keep.has(item.id)) {
        days.add(String(item.created_at).slice(0, 10));
        continue;
      }
      const day = String(item.created_at).slice(0, 10);
      if (days.size >= keepDays || days.has(day)) continue;
      days.add(day);
      keep.add(item.id);
    }
    const removed = [];
    let freed = 0;
    for (const item of list.slice().reverse()) {
      // 从最旧的开始删。
      if (keep.has(item.id)) continue;
      const folder = path.join(this.backups, item.id);
      try {
        const size = treeBytes(folder);
        fs.rmSync(folder, { recursive: true, force: true });
        removed.push(item.id);
        freed += size;
      } catch { /* 删不掉就留着，下次再试 */ }
    }
    let total = 0;
    const survivors = this.list();
    for (const item of survivors) total += treeBytes(path.join(this.backups, item.id));
    for (const item of survivors.slice().reverse()) {
      if (total <= maxTotalBytes) break;
      if (item.id === protect || item.id === survivors[0].id) continue;
      const folder = path.join(this.backups, item.id);
      try {
        const size = treeBytes(folder);
        fs.rmSync(folder, { recursive: true, force: true });
        removed.push(item.id);
        freed += size;
        total -= size;
      } catch { /* ignore */ }
    }
    const gc = this.gcObjects();
    return { removed, freed, kept: Math.max(0, this.list().length), gc };
  }
  snapshot(reason) {
    const id =
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomBytes(4).toString("hex");
    const folder = path.join(this.backups, id);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const pkg = readJSON(path.join(this.profile, "package.json"), {}),
      plugins = [],
      blobs = {};
    try {
      for (const name of PURGE_PACKAGES) {
        const logical = path.join(this.profile, "node_modules", name);
        if (!fs.existsSync(logical)) continue;
        const source = fs.realpathSync(logical),
          meta = readJSON(path.join(source, "package.json"));
        if (meta?.name !== name) throw Error("插件包标识不一致");
        const rel = path.join("plugins", name);
        copyTreeDedup(source, path.join(folder, rel), this.objects, blobs, path.posix.join("plugins", name));
        plugins.push({ name, version: meta.version, folder: rel });
      }
      for (const [label, p] of [
        ["profile-package", path.join(this.profile, "package.json")],
        ["profile-config", path.join(this.profile, "cordis.patch.yml")],
        ["profile-lock", path.join(this.profile, "pnpm-lock.yaml")],
        ["prompt", path.join(this.home, "prompt-inject.md")],
        ["purge-state", path.join(this.home, "dsh-purge")],
        ["rules", path.join(this.home, "rules")],
      ]) {
        if (fs.existsSync(p))
          copyTreeDedup(p, path.join(folder, "settings", label), this.objects, blobs, path.posix.join("settings", label));
      }
      const sums = treeHashes(folder);
      const m = {
        schema: 2,
        id,
        created_at: new Date().toISOString(),
        reason,
        host_version: compatibility(this.aiBase).host_version,
        profile: this.profile,
        home: this.home,
        plugins,
        sums,
        blobs,
        bundles: (pkg.dsh?.profile?.bundles || []).filter((n) =>
          PURGE_PACKAGES.includes(n),
        ),
        complete: true,
      };
      atomic(path.join(folder, "manifest.json"), JSON.stringify(m, null, 2));
      return {
        id,
        folder,
        plugins: plugins.map((p) => ({ name: p.name, version: p.version })),
      };
    } catch (e) {
      atomic(
        path.join(folder, "failed.json"),
        JSON.stringify({ error: e.message }),
      );
      throw e;
    }
  }
  verify(id) {
    const folder = path.join(this.backups, validId(id));
    if (fs.realpathSync(folder) !== folder)
      throw Error("备份路径不能为符号链接");
    const m = readJSON(path.join(folder, "manifest.json"));
    if (
      !m?.complete ||
      ![1, 2].includes(m.schema) ||
      m.id !== id ||
      m.home !== this.home ||
      m.profile !== this.profile
    )
      throw Error("备份不属于当前数据目录或 profile");
    const actual = treeHashes(folder);
    delete actual["manifest.json"];
    const blobs = m.blobs || {};
    if (
      JSON.stringify(Object.keys(actual).sort()) !==
      JSON.stringify(Object.keys(m.sums).sort())
    )
      throw Error("备份文件集合不一致");
    for (const [rel, sum] of Object.entries(m.sums))
      if (actual[rel] !== sum) throw Error("备份校验失败：" + rel);
    for (const [rel, sum] of Object.entries(blobs)) {
      const blob = path.join(this.objects, sum);
      if (!fs.existsSync(blob)) throw Error("去重对象缺失：" + rel);
      if (hash(fs.readFileSync(blob)) !== sum) throw Error("去重对象校验失败：" + rel);
    }
    for (const p of m.plugins)
      if (
        !PURGE_PACKAGES.includes(p.name) ||
        p.folder !== path.join("plugins", p.name)
      )
        throw Error("备份插件路径无效");
    return { m, folder };
  }
  rollback(id) {
    return this.locked(async () => {
      const { m, folder } = this.verify(id);
      if (!m.plugins.length) throw Error("该备份没有插件可回滚");
      const safety = this.snapshot("before-rollback");
      // Stage immutable restored copies, install through DSH; never restore a whole profile/config file.
      const stage = path.join(
        this.base,
        "restored",
        id + "-" + randomBytes(6).toString("hex"),
      );
      fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
      for (const p of m.plugins) {
        const to = path.join(stage, p.name);
        materializeTree(folder, p.folder, to, blobsIn(m), this.objects);
        await this.installer(to, this);
      }
      const file = path.join(this.profile, "package.json"),
        pkg = readJSON(file);
      if (!pkg) throw Error("profile package.json 无效");
      pkg.dsh ??= {};
      pkg.dsh.profile ??= {};
      pkg.dsh.profile.bundles = [
        ...(pkg.dsh.profile.bundles || []).filter(
          (n) => !PURGE_PACKAGES.includes(n),
        ),
        ...m.bundles,
      ];
      atomic(file, JSON.stringify(pkg, null, 2) + "\n");
      this.prune({ protect: id });
      return {
        ok: true,
        backup_id: safety.id,
        restored_id: id,
        restart_required: true,
        preserved_settings: true,
        note: "已回滚插件并恢复其启用入口；当前提示词、规则、连接设置及其他插件未覆盖。请手动退出并重新打开 DSH。",
      };
    });
  }
  async install(file, { reason = "before-update" } = {}) {
    return this.locked(async () => {
      await validateArchive(file);
      const before = this.snapshot(reason),
        manifestFile = path.join(this.profile, "package.json"),
        old = fs.readFileSync(manifestFile);
      try {
        await this.installer(file, this);
        const pkg = readJSON(manifestFile);
        if (!pkg) throw Error("安装后 profile package.json 无效");
        pkg.dsh ??= {};
        pkg.dsh.profile ??= {};
        pkg.dsh.profile.bundles = [
          ...(pkg.dsh.profile.bundles || []).filter(
            (n) => !PURGE_PACKAGES.includes(n),
          ),
          PACKAGE,
        ];
        atomic(manifestFile, JSON.stringify(pkg, null, 2) + "\n");
        this.prune({ protect: before.id });
        return {
          ok: true,
          backup_id: before.id,
          restart_required: true,
          preserved_settings: true,
          note: "安装完成。请手动退出并重新打开 DSH，然后在右侧面板「Purge Community → 状态」点『应用』写入宿主补丁（写入前自动备份）。",
        };
      } catch (e) {
        // CLI errors may have written manifests. Restore only when no unrelated dependency changed.
        const previous = JSON.parse(old),
          now = readJSON(manifestFile, {});
        const unrelated = (p) =>
          Object.fromEntries(
            Object.entries(p.dependencies || {}).filter(
              ([k]) => !PURGE_PACKAGES.includes(k),
            ),
          );
        if (
          JSON.stringify(unrelated(previous)) === JSON.stringify(unrelated(now))
        )
          atomic(manifestFile, old);
        throw Error(`安装失败，原插件备份 ${before.id} 保留：${e.message}`);
      }
    });
  }
}
export async function installWithDsh(file, manager) {
  if (process.env.PURGE_DSH_CLI) {
    const cli = path.resolve(process.env.PURGE_DSH_CLI);
    if (!fs.existsSync(cli))
      throw Error("PURGE_DSH_CLI 不是有效的 DSH 可执行文件");
    let command = cli,
      prefix = [];
    if (process.platform !== "win32") {
      try {
        fs.accessSync(cli, fs.constants.X_OK);
      } catch {
        if (
          !/^#!\/bin\/(?:ba)?sh(?:\r?\n|$)/.test(
            fs.readFileSync(cli, "utf8").slice(0, 64),
          )
        )
          throw Error("DSH CLI 不可执行；请指定桌面版 CLI 启动器");
        command = "/bin/sh";
        prefix = [cli];
      }
    }
    await exec(
      command,
      [
        ...prefix,
        "plugin",
        "--profile",
        path.basename(manager.profile),
        "add",
        file,
      ],
      {
        timeout: 180000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, DSH_HOME: manager.home },
      },
    );
    return;
  }

  const resources =
    process.resourcesPath ||
    (process.platform === "darwin" &&
    process.execPath.includes(".app/Contents/MacOS/")
      ? path.resolve(path.dirname(process.execPath), "../Resources")
      : null);
  const candidates = resources
    ? ["app.asar", "app.asar.unpacked", "app"].map((n) =>
        path.join(
          resources,
          n,
          "dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js",
        ),
      )
    : [];
  const cli = candidates.find((p) => fs.existsSync(p));
  if (!cli)
    throw Error(
      "请在 DSH 桌面端使用此操作，或使用 dsh plugin add 手动安装；备份已保留",
    );
  await exec(
    process.execPath,
    [
      "--expose-internals",
      cli,
      "plugin",
      "--profile",
      path.basename(manager.profile),
      "add",
      file,
    ],
    {
      timeout: 180000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        DSH_HOME: manager.home,
      },
    },
  );
}
const allowedDownloadHosts = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);
export async function download(url, max = 50 * 1024 * 1024, request = fetch) {
  for (let n = 0; n < 6; n++) {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      !allowedDownloadHosts.has(u.hostname) ||
      u.username ||
      u.password
    )
      throw Error("更新下载来源无效");
    const r = await request(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: {
        "user-agent": "dsh-purge-plus",
        accept: "application/vnd.github+json",
      },
    });
    if (r.status >= 300 && r.status < 400) {
      const next = r.headers.get("location");
      if (!next) throw Error("更新跳转无效");
      url = new URL(next, u).href;
      continue;
    }
    if (!r.ok) throw Error(`更新请求失败：HTTP ${r.status}`);
    if (Number(r.headers.get("content-length")) > max)
      throw Error("更新文件过大");
    const chunks = [];
    let size = 0;
    for await (const chunk of r.body) {
      size += chunk.length;
      if (size > max) {
        await r.body.cancel().catch(() => {});
        throw Error("更新文件过大");
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw Error("更新跳转过多");
}
export async function releasedVersions() {
  const data = JSON.parse(
    (
      await download(
        `https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`,
        2 * 1024 * 1024,
      )
    ).toString(),
  );
  if (!Array.isArray(data)) throw Error("发行列表无效");
  return data
    .filter(
      (r) => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name),
    )
    .flatMap((r) => {
      const version = r.tag_name.slice(1),
        name = `${PACKAGE}-${version}.tgz`;
      const asset = r.assets?.find((a) => a.name === name),
        sums = r.assets?.find((a) => a.name === "SHA256SUMS.txt");
      return asset && sums
        ? [
            {
              id: r.tag_name,
              ref: r.tag_name,
              version,
              channel: "stable",
              label: `Purge Community ${version}`,
              url: r.html_url,
              asset: asset.browser_download_url,
              sums: sums.browser_download_url,
            },
          ]
        : [];
    });
}
export async function installRelease(manager, release) {
  if (!/^v\d+\.\d+\.\d+$/.test(release.ref)) throw Error("只安装正式发布版本");
  const name = `${PACKAGE}-${release.version}.tgz`,
    sums = (await download(release.sums, 65536)).toString();
  const expected = sums
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .find((parts) => parts[1]?.replace(/^\*/, "") === name)?.[0];
  if (!/^[a-f0-9]{64}$/.test(expected || ""))
    throw Error("发行包缺少有效 SHA256");
  const bytes = await download(release.asset);
  if (hash(bytes) !== expected) throw Error("安装包 SHA256 校验失败");
  const cache = path.join(manager.base, "downloads", release.ref);
  fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
  const file = path.join(cache, name);
  atomic(file, bytes);
  await validateArchive(file, release.version);
  return manager.install(file);
}

export async function validateArchive(file, version) {
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 50 * 1024 * 1024)
    throw Error("安装包文件无效或过大");
  const { stdout: list } = await exec("tar", ["-tzf", file], {
    maxBuffer: 1024 * 1024,
  });
  if (
    list
      .split("\n")
      .some(
        (p) =>
          p &&
          (!p.startsWith("package/") || p.includes("..") || p.includes("\\")),
      )
  )
    throw Error("安装包路径无效");
  const { stdout: details } = await exec("tar", ["-tvzf", file], {
    maxBuffer: 1024 * 1024,
  });
  if (details.split("\n").some((l) => l && !["-", "d"].includes(l[0])))
    throw Error("安装包不允许链接或特殊文件");
  const { stdout: meta } = await exec(
    "tar",
    ["-xOzf", file, "package/package.json"],
    { maxBuffer: 65536 },
  );
  const pkg = JSON.parse(meta);
  if (
    pkg.name !== PACKAGE ||
    (version !== undefined && pkg.version !== version) ||
    ![
      "git+https://github.com/" + REPOSITORY + ".git",
      "https://github.com/" + REPOSITORY + ".git",
    ].includes(pkg.repository?.url)
  )
    throw Error("安装包身份与发行版本不一致");
  return pkg;
}
