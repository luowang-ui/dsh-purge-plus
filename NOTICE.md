# Attribution

**Purge Community Plus** is a continuation of **Purge Community**
(https://github.com/kingcharleslzy-ai/dsh-purge, author **kingcharleslzy-ai**),
which is itself an independently maintained fork of **dsh-purge**
(https://github.com/YuJunZhiXue/dsh-purge, original author **小杨 / YuJunZhiXue**).

## Lineage

| Layer | Project | Author |
| --- | --- | --- |
| Upstream | `YuJunZhiXue/dsh-purge` | 小杨 / YuJunZhiXue |
| Community fork | `kingcharleslzy-ai/dsh-purge` (Purge Community) | kingcharleslzy-ai |
| This repository | `luowang-ui/dsh-purge-plus` (Purge Community Plus) | luowang-ui |

## Changes in this repository

Relative to Purge Community `1.6.0`, this repository adds DSH 0.2.1 compatibility fixes:

1. `lib/core.js` — new `atomicCopyFileSync()`; `lib/desktop.js` uses it in
   `repairOfficialCliAfterUnpack()` (fixes issue #119: missing `await` on the async
   atomic copy, whose unhandled rejection kills the host at load).
2. `presets/redteam/agent.cordis.yml`, `presets/unrestricted/agent.cordis.yml` —
   dropped the `toolFilter` block, which DSH 0.2.1's `dsh-tool-subagent` rejects outright.
3. `package.json` — renamed to `dsh-purge-plus`, version `1.6.1`, and declared
   root-level `engines.dsh` so DSH's compatibility gate reads the supported range.

Both fixes were proposed upstream as
[kingcharleslzy-ai/dsh-purge#1](https://github.com/kingcharleslzy-ai/dsh-purge/pull/1) and
[#2](https://github.com/kingcharleslzy-ai/dsh-purge/pull/2).

Original copyright and MIT license remain in LICENSE. The repository preserves upstream
history and source attribution. Upstream README text is retained under docs/upstream.
This distribution is free and not offered for paid resale; it is not endorsed by, and is
not an official release of, any upstream author.

The native settings UI was derived from the original 1.1.71 client and subsequently
separated and integrated into this community distribution. Existing third-party notices
under docs/redteam-upstream-LICENSE and docs/redteam-upstream-DISCLOSURE remain applicable
to their respective material.
