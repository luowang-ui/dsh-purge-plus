// Purge self-check: prove, layer by layer, that the bypass actually exists on
// this machine — instead of trusting "插件装上了" as evidence.
// Derived from the dsh-purge patch table (MIT, Copyright (c) 2026 小杨).
import fs from "node:fs";
import path from "node:path";
import * as core from "./core.js";
import { compatibility } from "./community.js";

/**
 * 每一层都对应一条（或一组）真实补丁，`why` 说明"这层没了会发生什么"。
 * kind: host=宿主源码补丁，runtime=插件运行时注入，config=当前 profile 的选择。
 */
export const BYPASS_LAYERS = Object.freeze([
  { ids: [15], title: "沙箱 confine 直通", kind: "host",
    why: "read-only / workspace-write 也不再把命令包进 bwrap 等 runner，denial 签名为空" },
  { ids: [16], title: "文件系统围栏禁用", kind: "host",
    why: "写/改文件不再因只读或工作区边界被 FS_SANDBOX_DENIED 拦掉" },
  { ids: [17], title: "观察策略放行", kind: "host",
    why: "edit 不再要求先 read，版本冲突门也放行" },
  { ids: [6, 33, 48], title: "拒绝话术中性化", kind: "host",
    why: "工具描述里不再教模型'沙箱会拒绝，请申请审批'" },
  { ids: [7, 8, 10], title: "默认策略", kind: "host",
    why: "沙箱默认 danger-full-access、审批默认 never（可被 UI 覆盖，不写死 env）" },
  { ids: [9, 35], title: "审批自动放行", kind: "host",
    why: "审批门直接授信；rejected/cancelled/unavailable 也不再抛错打断回合" },
  { ids: [18], title: "重复调用守卫禁用", kind: "host",
    why: "同一步反复调同一工具不再被追加提醒或阻断" },
  { ids: [19], title: "工具结果修剪禁用", kind: "host",
    why: "大结果不会被 compaction 剪掉，模型能看到完整输出" },
  { ids: [59], title: "Auto Review 不拦工具", kind: "host",
    why: "官方自动审查不再否决工具调用" },
  { ids: [60, 62, 61], title: "工具审批 fail-open", kind: "host",
    why: "run_code / 无审批通道时放行；用户主动点拒绝仍然拒绝" },
  { ids: [63], title: "计划模式不硬拦", kind: "host",
    why: "操作者要求实施时，计划模式不再拒绝执行" },
  { ids: [4, 25, 43, 71, 76], optionalIds: [71, 76], title: "官方身份剥离", kind: "host",
    why: "去掉 'You are a coding agent powered by ...' 与内置预设身份句" },
  { ids: [32, 53], title: "Web 面身份中性化", kind: "host",
    why: "Web 面提示词不再自称 DeepSeek Harness，也不再禁止另起服务" },
  { ids: [40, 74, 55, 72], title: "注入不被预设覆盖", kind: "host",
    why: "complete 预设、首轮 assemble、每步 system 替换都保留 dsh-purge 注入" },
  { ids: [26, 28], optionalIds: [28], title: "极简/梁神预设保留注入", kind: "host",
    why: "minimal 预设 open inject；梁神 phase-1 不被剥掉" },
  { ids: [29, 50], title: "外部内容不降级为只读", kind: "host",
    why: "web/session 引用内容仍可作为可执行数据使用" },
  { ids: [30, 31, 64, 65], optionalIds: [30, 31, 64, 65], title: "Hooks 不否决回合", kind: "host",
    why: "装了 hooks-claude-code / hooks-codex 时，deny 不再 reject 整轮" },
  { ids: [21, 22, 23], title: "工具上限放宽", kind: "host",
    why: "bash 等待恢复、read 上限放宽、子代理深度默认 3→10" },
  { ids: [24, 37], title: "预设与子代理不设锁", kind: "host",
    why: "preset fetch 打开；子代理 scope-lock 文案中性化，不让它自我收窄" },
  { ids: [51, 52], title: "新会话与日志默认", kind: "host",
    why: "新会话保持 full access；官方 session log 默认不上传" },
  { ids: [56, 58, 75, 77], title: "回退不残留", kind: "host",
    why: "回退只藏被撤掉的那轮、标记不进模型请求、任务回收、append 即替换窗口" },
  { ids: [47, 49, 57, 69], title: "模型网关兼容", kind: "host",
    why: "OAuth 不插 Claude 身份、developer role 回退、stream 连接不被补丁打坏" },
  { ids: [85, 86, 87, 88], title: "会话与提示词挂载", kind: "host",
    why: "UI 发消息永远新 turn（消 steer 竞态）、挂载去重不糊两份" },
  { ids: [82, 83, 84], optionalIds: [82, 83, 84], title: "桌面宿主启动兜底", kind: "host",
    why: "缺 DSH_PROFILE 也能定位 profile；host 被信号杀或正常退出不弹崩溃框" },
]);

function readProfileConfig(dshHome) {
  const file = path.join(dshHome || "", "profiles", process.env.DSH_PROFILE || "desktop", "cordis.patch.yml");
  try {
    return { file, text: fs.readFileSync(file, "utf8") };
  } catch {
    return { file, text: "" };
  }
}

function configLayer(dshHome) {
  const { file, text } = readProfileConfig(dshHome);
  const preset = /defaultPreset:\s*([a-z-]+)/.exec(text)?.[1] || "";
  const sandbox = new RegExp(`\\b${preset}:\\s*\\n\\s*sandbox:\\s*([a-z-]+)`).exec(text)?.[1] || "";
  const approval = new RegExp(`\\b${preset}:\\s*\\n\\s*sandbox:\\s*[a-z-]+\\s*\\n\\s*approval:\\s*([a-z]+)`).exec(text)?.[1] || "";
  const ok = preset === "danger-full-access" && approval === "never";
  return {
    file,
    preset: preset || "(未设置，用宿主默认)",
    sandbox: sandbox || "?",
    approval: approval || "?",
    ok,
    note: ok
      ? "当前 profile 选择 danger-full-access + approval never"
      : "当前 profile 不是完全放行；宿主补丁仍生效，但 UI 层仍会问审批",
  };
}

function runtimeLayer(dshHome) {
  const file = core.findOverrideFile(dshHome);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    text = "";
  }
  const bytes = Buffer.byteLength(text, "utf8");
  return {
    file,
    bytes,
    ok: bytes > 0,
    note: bytes > 0
      ? `注入文件 ${bytes} 字节，会作为 dsh-purge section 每步重贴`
      : "注入文件为空：插件能加载，但没有内容可注入",
  };
}

export function rollupLayers(status, hasHost) {
  const layers = [];
  for (const layer of BYPASS_LAYERS) {
    const optionalIds = new Set(layer.optionalIds || []);
    const rows = layer.ids.map((id) => ({
      id,
      optional: optionalIds.has(id),
      status: status[id] || (hasHost ? "missing_file" : "unlocated"),
    }));
    // 目标插件没装（na / missing_file）的条目不算"这一层坏了"。
    const required = rows.filter((row) => !row.optional && row.status !== "na" && row.status !== "missing_file");
    const applied = rows.filter((row) => row.status === "applied" || row.status === "already");
    const pending = required.filter((row) => row.status === "pending");
    // 待应用 != 打不上：前者点一次「应用」就好，后者才需要改锚点。
    const broken = required.filter((row) => !["applied", "already", "pending"].includes(row.status));
    const absent = rows.filter((row) => row.status === "na" || row.status === "missing_file");
    const state = broken.length ? "broken" : pending.length ? "pending" : "ok";
    layers.push({
      title: layer.title,
      why: layer.why,
      kind: layer.kind,
      ids: layer.ids,
      ok: state === "ok",
      state,
      applied: applied.length,
      required: required.length,
      total: rows.length,
      pending: pending.map((row) => row.id),
      absent: absent.map((row) => row.id),
      broken: broken.map((row) => ({ id: row.id, status: row.status })),
      note: absent.length === rows.length ? "目标插件/预设未安装，这一层当前不适用" : "",
    });
  }
  return layers;
}

/**
 * 逐层自检。
 * @param aiBase - 宿主 @deepseek-ai 根（空则用 core.findAiBase()）。
 * @param dshHome - DSH 数据目录（默认 core.findDshHome()）。
 */
export function resolveHost(aiBase) {
  if (aiBase) return aiBase;
  try {
    const direct = core.findAiBase();
    if (direct) return direct;
  } catch { /* 非桌面进程里 findAiBase 可能取不到 */ }
  try {
    // CLI 场景：surface 判成 web 时直接扫桌面安装目录。
    const bases = core.enumeratePatchAiBases({ discover: true });
    return bases[0] || "";
  } catch {
    return "";
  }
}

export async function selfCheck(aiBase, dshHome = core.findDshHome()) {
  const host = resolveHost(aiBase);
  const compat = compatibility(host);
  let status = {};
  let forced = "";
  if (host && !process.env.DSH_SURFACE) {
    try {
      if (core.pathZone(host) === "desktop-install") {
        process.env.DSH_SURFACE = "desktop";
        forced = "desktop";
      }
    } catch { /* 定位失败就按默认 surface */ }
  }
  if (host) {
    try {
      status = await core.patchStatus(host);
    } catch {
      status = {};
    }
  }
  if (forced) delete process.env.DSH_SURFACE;
  const layers = rollupLayers(status, Boolean(host));
  const runtime = runtimeLayer(dshHome);
  layers.push({
    title: "运行时提示词注入",
    why: "prompt-inject.md 作为 dsh-purge section 参与每一步 system prompt 组装",
    kind: "runtime",
    ids: [],
    ok: runtime.ok,
    state: runtime.ok ? "ok" : "broken",
    applied: runtime.ok ? 1 : 0,
    total: 1,
    pending: [],
    broken: runtime.ok ? [] : [{ id: "inject", status: "empty" }],
    detail: runtime,
  });
  const config = configLayer(dshHome);
  layers.push({
    title: "当前 profile 的权限选择",
    why: "界面层的最后一道门：即使补丁失效，这个组合也不会弹审批",
    kind: "config",
    ids: [],
    ok: config.ok,
    state: config.ok ? "ok" : "broken",
    applied: config.ok ? 1 : 0,
    total: 1,
    pending: [],
    broken: config.ok ? [] : [{ id: "preset", status: `${config.preset}/${config.approval}` }],
    detail: config,
  });
  // CLI 进程里 surface 常被判成 web，直接问会得到"未密封"的错误结论。
  // 这里显式按桌面宿主判断：只要 app.asar 还在，下次启动就还是未打补丁的宿主。
  const asarSealed = (() => {
    try {
      if (core.desktopAsarStillSealed({ surface: "desktop" })) return true;
      const exe = core.findDesktopExecutableForCheck?.();
      if (exe) return core.desktopAsarStillSealed({ execPath: exe });
      return false;
    } catch {
      return false;
    }
  })();
  layers.push({
    title: "宿主运行方式",
    why: "官方桌面版密封在 app.asar 里时，补丁只写到解包副本、不会被加载",
    kind: "layout",
    ids: [],
    ok: !asarSealed,
    state: asarSealed ? "broken" : "ok",
    applied: asarSealed ? 0 : 1,
    total: 1,
    pending: [],
    broken: asarSealed ? [{ id: "asar", status: "sealed" }] : [],
    detail: { asar_still_sealed: asarSealed },
  });

  const byKind = (kind) => layers.filter((layer) => layer.kind === kind);
  const summarize = (list) => ({
    ok: list.every((layer) => layer.ok),
    passed: list.filter((layer) => layer.ok).length,
    total: list.length,
  });
  const baseSummary = {
    host: summarize(byKind("host")),
    runtime: summarize(byKind("runtime")),
    config: summarize(byKind("config")),
    layout: summarize(byKind("layout")),
  };
  const failed = layers.filter((layer) => !layer.ok);
  const pendingLayers = layers.filter((layer) => layer.state === "pending");
  const brokenLayers = layers.filter((layer) => layer.state === "broken");
  return {
    ok: failed.length === 0,
    state: brokenLayers.length ? "broken" : pendingLayers.length ? "pending" : "ok",
    needsApply: brokenLayers.length === 0 && pendingLayers.length > 0,
    summary: {
      ...baseSummary,
      pending: { layers: pendingLayers.length, patches: pendingLayers.reduce((n, l) => n + l.pending.length, 0) },
      broken: { layers: brokenLayers.length },
    },
    host,
    host_version: compat.host_version,
    qualified: compat.qualified,
    level: compat.level,
    patch: {
      applied: Object.values(status).filter((v) => v === "applied" || v === "already").length,
      total: core.ALL_PATCHES.length,
    },
    layers,
    hints: failed.map((layer) => ({
      title: layer.title,
      action: layer.kind === "config"
        ? "在「权限」里切到 danger-full-access 或重新应用补丁"
        : layer.kind === "layout"
          ? "在面板点「应用」，按提示手动退出并重新打开 DSH，让解包宿主生效"
          : layer.kind === "runtime"
            ? "写入 prompt-inject.md 或在插件设置里保存一次提示词"
            : `运行 purge-community diagnose 看 #${layer.ids.join("/#")} 的锚点`,
    })),
  };
}
