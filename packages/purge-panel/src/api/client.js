// UI derived from YuJunZhiXue/dsh-purge 1.1.71 (MIT). See LICENSE.

export function clientGuessSurface() {
  try {
    if (
      typeof navigator !== "undefined" &&
      /electron/i.test(navigator.userAgent || "")
    )
      return "desktop";
    if (typeof location !== "undefined") {
      const port = String(location.port || "");
      if (port === "43120") return "desktop";
      const host = String(location.hostname || "");
      if (
        host &&
        host !== "127.0.0.1" &&
        host !== "localhost" &&
        /dsh desktop/i.test(String(location.href || ""))
      )
        return "desktop";
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function hostSurfaceOf(s) {
  return (s && s.surface) || clientGuessSurface() || "web";
}

export function hostText(t, key, surface) {
  if (surface && surface !== "web") {
    const specific = key + "." + surface;
    const hit = t(specific);
    if (hit && hit !== specific) return hit;
  }
  return t(key);
}

export function apiUrl(p) {
  try {
    return new URL(p, window.location.origin).toString();
  } catch {
    return p;
  }
}

export function apiTimeoutMs(p, init) {
  const path = String(p || "");
  const method = String((init && init.method) || "GET").toUpperCase();
  if (path.indexOf("/dsh-purge/community") !== -1)
    return method === "POST" ? 600000 : 20000;
  if (path.indexOf("/dsh-purge/update") !== -1)
    return method === "POST" ? 180000 : 45000;
  if (path.indexOf("/dsh-purge/uninstall") !== -1) return 90000;
  if (path.indexOf("/dsh-purge/skill") !== -1)
    return method === "POST" ? 120000 : 20000;
  // status 会在"应用"期间被后端的同步落盘阻塞，默认 20s 必然被 abort，界面只会显示"读取失败: timeout"。
  if (path.indexOf("/dsh-purge/status") !== -1) return 60000;
  if (path.indexOf("/dsh-purge/apply") !== -1) return 240000;
  if (path.indexOf("/dsh-purge/revert") !== -1) return 120000;
  if (path.indexOf("/dsh-purge/restart") !== -1) return 60000;
  return 20000;
}

export function isAbortError(e) {
  const msg = String((e && e.message) || e || "");
  return (e && e.name === "AbortError") || /aborted|abort/i.test(msg);
}

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function apiJson(p, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), apiTimeoutMs(p, init));
  try {
    const r = await fetch(
      apiUrl(p),
      Object.assign(
        { cache: "no-store", credentials: "same-origin", signal: ctrl.signal },
        init || {},
      ),
    );
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw apiError(r.status + " non-json: " + text.slice(0, 120), r.status);
    }
    if (!r.ok)
      throw apiError(
        (data && (data.error || data.message)) || r.status + " " + r.statusText,
        r.status,
      );
    return data;
  } catch (e) {
    if (isAbortError(e)) throw new Error("timeout");
    const msg = String((e && e.message) || e || "");
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      throw new Error("连不上接口，请确认 dsh 还在跑后 Ctrl+F5");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function promptBoxEmpty(text) {
  return !String(text || "").trim();
}

export function responseNeedsPrompt(d) {
  return Boolean(d && (d.needPrompt || d.injectSource === "none"));
}

export function warnNeedPrompt(d, tr) {
  if (!responseNeedsPrompt(d)) return false;
  window.alert(tr("need.prompt"));
  return true;
}

export async function bothInjectEmpty(overrideText, defaultText) {
  if (!promptBoxEmpty(overrideText)) return false;
  if (!promptBoxEmpty(defaultText)) return false;
  return true;
}

export function rulesApi(op, extra) {
  return apiJson("/dsh-purge/rules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ op: op }, extra || {})),
  });
}

export function skillsRouteMissing(e) {
  // Retry the legacy route only for a missing endpoint. A server error or
  // malformed success response may follow a completed write: never replay it.
  return e?.status === 404 || e?.status === 405;
}

export function skillsApi(op, extra) {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ op: op }, extra || {})),
  };
  return apiJson("/dsh-purge/skills", init).catch((e) => {
    if (!skillsRouteMissing(e)) throw e;
    return apiJson("/dsh-purge/skill", init);
  });
}
