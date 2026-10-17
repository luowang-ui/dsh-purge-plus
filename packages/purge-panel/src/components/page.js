// Full-page shell for the left sidebar entry. Replaces the old right-sidebar
// drawer: same components, but laid out like a DSH settings page (host font,
// host tokens, one column, explanations in "?" tips instead of paragraphs).
import { h, useState, useEffect, useCallback } from "../shared/react.js";
import { PURGE_CSS, NATIVE_CSS, PAGE_CSS } from "../styles/index.js";
import { useT } from "../shared/locale.js";
import { apiJson } from "../api/client.js";
import { Btn, HelpTip } from "./primitives.js";
import { PurgifySection } from "./settings-form.js";
import { RulesSection } from "./rules.js";
import { SkillsSection } from "./skills.js";
import { CommunityMaintenance, StatusExtras } from "./maintenance.js";
import { __dshPurgeDrill } from "../vendor/drill.js";
import { readDrillAuth, setDock, requestDrill } from "../state/dock.js";

const TABS = [
  ["status", "状态", "宿主兼容、补丁、破甲自检"],
  ["prompt", "提示词", "注入正文与破甲强化段"],
  ["rules", "规则", "规则集与工作区策略"],
  ["skills", "技能", "DSH 技能目录"],
  ["drill", "演练台", "红队演练与环境适配"],
  ["more", "更多", "服务器名单、更新与维护"],
];

function PurgeGlyph({ size = 18 } = {}) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      "aria-hidden": true,
    },
    h("path", { d: "M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-3z" }),
    h("path", { d: "M9.5 12.2l1.8 1.8 3.4-3.6" }),
  );
}

function StatusStrip({ info }) {
  const compat = info?.compatibility || {};
  const level = compat.level || "";
  const ok = level === "qualified";
  return h(
    "div",
    { className: "dshpp-strip" },
    h(
      "span",
      { className: "dshpp-strip-item" },
      h("i", {
        className: "dshpp-dot " + (ok ? "is-ok" : level ? "is-warn" : ""),
      }),
      "DSH ",
      h("b", null, compat.host_version || "…"),
    ),
    h(
      "span",
      { className: "dshpp-strip-item" },
      "兼容级别 ",
      h(
        "b",
        null,
        level === "qualified"
          ? "已回归验证"
          : level === "unverified"
            ? "未验证版本"
            : level === "mixed"
              ? "组件版本不一致"
              : level
                ? "未定位宿主"
                : "检测中",
      ),
      h(
        HelpTip,
        { title: "兼容级别" },
        compat.message ||
          "读取宿主组件版本后给出结论。qualified 表示该 DSH 版本的补丁锚点已逐条回归。",
      ),
    ),
    h(
      "span",
      { className: "dshpp-strip-item" },
      "宿主补丁 ",
      h(
        "b",
        null,
        `${info?.patches_applied ?? "?"}/${info?.patches_total ?? "?"}`,
      ),
      h(
        HelpTip,
        { title: "宿主补丁" },
        "实际写进 DSH 宿主代码的补丁条数。待应用表示锚点还在、还没写入；没对上表示宿主源码已变，需要重新定位锚点。",
      ),
    ),
    h(
      "span",
      { className: "dshpp-strip-item" },
      "插件 ",
      h("b", null, info?.plugin_version || __PANEL_VERSION__),
    ),
  );
}

/** 宿主被密封在 app.asar 里（通常是刚更新过）时，说明补丁当前没有生效。 */
function LayoutNotice({ info }) {
  if (!info || !info.asar_still_sealed) return null;
  return h(
    "p",
    { className: "dshpp-warn", role: "status" },
    "DSH 宿主仍封在 app.asar 里（通常是刚更新过）：当前跑的宿主没有补丁。点下面的「应用」会解开 app.asar 并写入补丁，然后手动退出重开一次即可。",
  );
}

/** 界面与后端不是同一份包时，必须显眼提示——否则用户会以为设置没生效。 */
function VersionNotice({ info }) {
  if (info && info.ok === false) {
    return h(
      "p",
      { className: "dshpp-warn", role: "status" },
      `无法确认官方 Purge 接口：${info.error || "接口不可用"}。设置可能不生效，请检查插件是否已启用后重启 DSH。`,
    );
  }
  const backend = info?.plugin_version;
  if (!backend || backend === __PANEL_VERSION__) return null;
  return h(
    "p",
    { className: "dshpp-warn", role: "status" },
    `官方版本 ${backend}；界面 ${__PANEL_VERSION__}。两者不一致时设置可能不生效，请更新到同一版本后重启 DSH。`,
  );
}

export function PurgePage() {
  const t = useT();
  const [tab, setTab] = useState("status");
  const [visited, setVisited] = useState({ status: true });
  const [info, setInfo] = useState(null);
  const select = (id) => {
    setTab(id);
    setVisited((v) => Object.assign({}, v, { [id]: true }));
  };
  const loadInfo = () =>
    apiJson("/dsh-purge/status")
      .then(setInfo)
      .catch(() => {});
  // 子组件的 onStatus 在依赖里，必须是稳定引用，否则每次渲染都会再 setInfo 一次。
  const mergeInfo = useCallback(
    (s) => s && setInfo((prev) => Object.assign({}, prev || {}, s)),
    [],
  );
  useEffect(() => {
    loadInfo();
  }, []);
  useEffect(() => {
    if (tab === "status") loadInfo();
  }, [tab]);
  const active = TABS.find((row) => row[0] === tab) || TABS[0];
  return h(
    "div",
    { className: "dshpp-page" },
    h("style", null, PURGE_CSS + NATIVE_CSS + PAGE_CSS),
    h(
      "header",
      { className: "dshpp-page-head" },
      h("span", { className: "dshpp-page-glyph" }, h(PurgeGlyph, { size: 20 })),
      h(
        "div",
        { className: "dshpp-page-title" },
        h("h1", null, __COMMUNITY__ ? "Purge" : "Purge"),
        h(
          "p",
          null,
          active[2],
          __COMMUNITY__
            ? h(
                "span",
                { className: "dshpp-page-ver" },
                "社区版 " + __PANEL_VERSION__,
              )
            : null,
        ),
      ),
    ),
    h(StatusStrip, { info }),
    h(VersionNotice, { info }),
    h(LayoutNotice, { info }),
    h(
      "nav",
      { className: "dshpp-page-tabs", role: "tablist" },
      TABS.map(([id, label]) =>
        h(
          "button",
          {
            key: id,
            type: "button",
            role: "tab",
            "aria-selected": tab === id ? "true" : "false",
            className: tab === id ? "is-on" : "",
            onClick: () => select(id),
          },
          label,
        ),
      ),
    ),
    h(
      "div",
      { className: "dshpp-page-body" },
      h(
        "div",
        { hidden: tab !== "status", className: "dshpp-sec" },
        h(PurgifySection, { page: "status", onStatus: mergeInfo }),
        h(StatusExtras),
        h(CommunityMaintenance),
      ),
      h(
        "div",
        { hidden: tab !== "prompt", className: "dshpp-sec" },
        visited.prompt ? h(PurgifySection, { page: "prompt" }) : null,
      ),
      h(
        "div",
        { hidden: tab !== "rules", className: "dshpp-sec" },
        visited.rules ? h(RulesSection) : null,
      ),
      h(
        "div",
        { hidden: tab !== "skills", className: "dshpp-sec" },
        visited.skills ? h(SkillsSection) : null,
      ),
      h(
        "div",
        { hidden: tab !== "more", className: "dshpp-sec" },
        visited.more ? h(PurgifySection, { page: "more" }) : null,
      ),
      tab === "drill"
        ? h(
            "div",
            { className: "dshpp-sec dshpp-page-drill" },
            __dshPurgeDrill && __dshPurgeDrill.CSS
              ? h("style", { "data-dsh-purge-drill": "1" }, __dshPurgeDrill.CSS)
              : null,
            readDrillAuth()
              ? h(__dshPurgeDrill.Panel, { embedded: true })
              : h(
                  "div",
                  { className: "dshpp-card" },
                  h(
                    "p",
                    { className: "dshpp-muted" },
                    "演练台需要先完成一次授权。",
                  ),
                  h(
                    Btn,
                    {
                      kind: "primary",
                      onClick: () => {
                        setDock({ tab: "drill", authOpen: true });
                        requestDrill("auth");
                      },
                    },
                    "去授权",
                  ),
                ),
          )
        : null,
    ),
    h(
      "footer",
      { className: "dshpp-page-foot" },
      __COMMUNITY__
        ? "基于 YuJunZhiXue/dsh-purge 1.1.71 独立维护 · MIT · 保留原作者署名"
        : "界面独立维护 · 基于 YuJunZhiXue/dsh-purge 1.1.71（MIT）",
    ),
  );
}

export { PurgeGlyph };
