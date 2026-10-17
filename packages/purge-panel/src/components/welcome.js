// First-run user notice, ported from YuJunZhiXue/dsh-purge 1.1.71 (MIT).
// Original block: client.js 1.1.71 lines 7698-7703 (WELCOME_KEY /
// readWelcomeAck / writeWelcomeAck) and 7846-7903 (WelcomeNotice).
import { h, useState } from "../shared/react.js";
import { useT } from "../shared/locale.js";

export const WELCOME_KEY = "dsh-purge-user-notice-v1";

export function readWelcomeAck() {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWelcomeAck() {
  try {
    window.localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function WelcomeNotice(props = {}) {
  const t = useT();
  const [open, setOpen] = useState(() => !readWelcomeAck());
  const [checked, setChecked] = useState(false);
  if (!open) return null;
  // Branding-only difference: the community build points at its own repository.
  const repo = props.repo || t("welcome.repo");
  return h(
    "div",
    { className: "dshp-auth-mask", role: "dialog", "aria-modal": "true" },
    h(
      "div",
      { className: "dshp-auth-modal", style: { width: "min(560px,100%)" } },
      h("h2", null, t("welcome.title")),
      h(
        "div",
        {
          className: "muted",
          style: {
            color: "var(--dsw-alias-label-secondary,#999)",
            fontSize: 12,
          },
        },
        t("welcome.lead"),
      ),
      h("div", { className: "dshp-auth-warn" }, t("welcome.warn")),
      h(
        "div",
        {
          className: "dshp-auth-legal",
          style: { height: "auto", maxHeight: 280 },
        },
        h("p", null, t("welcome.body")),
        h(
          "p",
          null,
          h(
            "a",
            {
              href: repo,
              target: "_blank",
              rel: "noopener noreferrer",
              style: {
                color: "var(--dsw-alias-label-brand, #8fbf9a)",
                wordBreak: "break-all",
              },
            },
            repo,
          ),
        ),
        h("h3", null, t("welcome.bans")),
        h("p", null, t("welcome.ban1")),
        h("p", null, t("welcome.ban2")),
        h("p", null, t("welcome.ban3")),
      ),
      h(
        "div",
        { className: "dshp-auth-checks" },
        h(
          "label",
          null,
          h("input", {
            type: "checkbox",
            checked: checked,
            onChange: (e) => setChecked(!!(e && e.target && e.target.checked)),
          }),
          h("span", null, t("welcome.check")),
        ),
      ),
      h(
        "div",
        { className: "dshp-auth-ops" },
        h(
          "button",
          {
            type: "button",
            className: "primary",
            disabled: !checked,
            onClick: () => {
              if (!checked) return;
              writeWelcomeAck();
              setOpen(false);
            },
          },
          t("welcome.ok"),
        ),
      ),
    ),
  );
}
