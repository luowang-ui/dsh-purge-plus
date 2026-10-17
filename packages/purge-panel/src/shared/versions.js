// UI derived from YuJunZhiXue/dsh-purge 1.1.71 (MIT). See LICENSE.

export function splitListedVersion(raw) {
  const text = String(raw || "")
    .trim()
    .replace(/^v/i, "");
  const cut = text.split("-");
  const core = String(cut[0] || "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  return {
    core: [core[0] || 0, core[1] || 0, core[2] || 0],
    pre: cut.slice(1).join("-"),
  };
}

export function listedVersionNewer(remote, local) {
  if (!remote || !local || String(remote) === String(local)) return false;
  const a = splitListedVersion(remote);
  const b = splitListedVersion(local);
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  }
  if (a.pre && !b.pre) return false;
  if (!a.pre && b.pre) return true;
  return a.pre > b.pre;
}

export function listedCeiling(versions, localVer) {
  let best = "";
  const rows = (versions || []).slice();
  const local = String(localVer || "").replace(/^v/i, "");
  if (
    local &&
    !/(?:^|[-._])(beta|rc|pre|preview|test)(?:\d|$|[-._])/i.test(local)
  ) {
    rows.push({ channel: "stable", version: local });
  }
  for (const item of rows) {
    if (!item || item.channel === "beta") continue;
    const ver = String(item.version || "").replace(/^v/i, "");
    if (
      !/^\d+\.\d+\.\d+/.test(ver) ||
      /(?:^|[-._])(beta|rc|pre|preview|test)(?:\d|$|[-._])/i.test(ver)
    )
      continue;
    if (!best || listedVersionNewer(ver, best)) best = ver;
  }
  return best;
}

export function keepListedVersion(item, _ceiling) {
  const ver = String((item && (item.version || item.ref || item.id)) || "");
  if (!item) return false;
  if (item.ref === "beta" || item.id === "beta") return true;
  if (item.channel === "beta") return false;
  if (/(?:^|[-._])(beta|rc|pre|preview|test)(?:\d|$|[-._])/i.test(ver))
    return false;
  return true;
}

export function preferListed(list, localVer, pin) {
  const pinned = pin ? (list || []).find((item) => item.ref === pin) : null;
  if (pinned) return pinned;
  const ver = String(localVer || "").replace(/^v/i, "");
  const same = (list || []).filter(
    (item) => ver && String(item.version || "").replace(/^v/i, "") === ver,
  );
  if (same.length) {
    return (
      same.find((item) => item.current) ||
      same.find((item) => item.latest) ||
      same[0]
    );
  }
  return (
    (list || []).find((item) => item.current) ||
    (list || []).find((item) => item.latest) ||
    (list || [])[0] ||
    null
  );
}

export function versionChoiceLabel(item, tr) {
  const ver = String((item && item.version) || "").replace(/^v/i, "");
  const base = ver ? "v" + ver : (item && (item.label || item.ref)) || "—";
  if (item && item.current) return base + " · " + tr("update.current");
  if (item && item.latest) return base + " · " + tr("update.tip");
  return base;
}
