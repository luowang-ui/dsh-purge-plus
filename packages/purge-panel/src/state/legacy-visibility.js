// Owned by the plugin lifecycle, not by a route or an overlay render seat.
export const ENTRY_CSS =
  ".dshp-launch,.dshp-hero-chip,.dshp-tab-chip,.dshp-dock{display:none!important}";

export function installLegacyVisibility(doc = globalThis.document) {
  if (!doc?.head) return () => {};
  const style = doc.createElement("style");
  style.setAttribute("data-dsh-purge-panel-visibility", "1");
  style.textContent = ENTRY_CSS;
  doc.head.append(style);
  // Remove only this instance's stylesheet when the plugin is disabled/reloaded.
  return () => style.remove();
}
