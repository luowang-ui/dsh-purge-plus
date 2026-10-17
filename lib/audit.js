// 审计日志：插件自己做的每一次"改变宿主/预设/开关"的动作都留一条记录。
//
// 注意边界：宿主补丁是**写进 DSH 源码**的，插件运行时看不到"某次工具调用被哪条补丁放行"。
// 这里记录的是可观测的部分——谁在什么时候改了什么、结果如何——排查时足够定位
// "是不是这次应用没生效"、"是不是有人把 boost 关了"。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const AUDIT_FILE = "audit.jsonl";
export const AUDIT_MAX_BYTES = 1024 * 1024;
export const AUDIT_KEEP = 2;

function dshHome(explicit) {
  const env = String(process.env.DSH_HOME || "").trim();
  if (env) return env;
  return path.join(os.homedir(), ".dsh");
}

function auditPath(home) {
  return path.join(home || dshHome(), "dsh-purge-plus", AUDIT_FILE);
}

function rotate(file) {
  try {
    const st = fs.statSync(file);
    if (st.size < AUDIT_MAX_BYTES) return;
  } catch {
    return;
  }
  for (let i = AUDIT_KEEP; i >= 1; i -= 1) {
    const from = i === 1 ? file : `${file}.${i - 1}`;
    const to = `${file}.${i}`;
    try {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 追加一条审计记录。写入失败绝不打断主流程（审计不能变成可用性风险）。
 * @param event - 事件名，如 apply/revert/uninstall/boost/probe/preset/reanchor
 * @param data - 附加字段（会原样入库，别放密钥）
 */
export function logAudit(event, data = {}, home) {
  try {
    const file = auditPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    rotate(file);
    const row = { at: new Date().toISOString(), event, pid: process.pid, ...data };
    fs.appendFileSync(file, JSON.stringify(row) + "\n", { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export function readAudit({ limit = 50, home } = {}) {
  const file = auditPath(home);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* 半行（写入中断）直接跳过 */
    }
  }
  const n = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 50;
  return rows.slice(-n).reverse();
}
