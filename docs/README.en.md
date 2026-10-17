# Purge Community

An independently maintained community fork of [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge), originally created by **小杨**. This is not an official upstream release. Original attribution, Git history and the MIT license are retained. This community distribution is free and is not offered for paid resale.

## What it does

DSH is not short of capability; it is gated four times. Purge removes those gates:

| Gate | How it is removed |
| --- | --- |
| Model | the user's `prompt-inject.md` is injected as a top-priority section every step; the stock identity line is stripped; a tail "boost" block states the instruction hierarchy, treats refusal as a malfunction, and resists sycophancy across turns |
| Approval | approvals auto-granted, never-sentence bypassed, fail-open when no UI channel, `run_code` / tool `ask` released, plan mode no longer hard-blocks |
| Sandbox | `confine()` passthrough, fs fence disabled, observation policy relaxed, denial wording neutralized |
| Turn | repeat-tool guard and result pruning disabled, Auto Review no longer denies, `ask_user_question` continues after 1s, UI messages always start a fresh turn |

83 host patches, all re-qualified against a pristine **0.2.1-rc.2** copy (64 written, 6 already at target, 0 failed). The panel lives in the **left rail** as a full page styled with DSH's own tokens; explanations sit in small `?` tips. `purge-community selfcheck` proves each of the 27 layers is live, and `diagnose` points at the exact file and line when a host update moves an anchor.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/luowang-ui/dsh-purge-plus/master/scripts/install.sh | sh
```

The script finds DSH Desktop, downloads the latest verified release, checks SHA256 and runs the installer with DSH's own runtime (it snapshots the profile first, then merges the old Purge entries into `dsh-purge-plus`).

Then fully quit and reopen DSH, open **Purge** in the left rail, press **Apply**, and quit/reopen once more.

**Current version 1.6.0 — qualified against DSH Desktop 0.2.1-rc.2 (and rc.1).**

```
purge-community selfcheck     # 27-layer proof that each bypass is live
purge-community diagnose      # which patch anchor drifted, with line numbers
```

Maintenance snapshots stay local under `$DSH_HOME/dsh-purge-plus/backups` (last 5 + one per day x7 + 200MB cap). Rollback restores plugin code and enablement only.

See the [Chinese README](../README.md) for the full feature table, panel tour and troubleshooting.
