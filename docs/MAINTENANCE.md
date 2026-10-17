# 维护、迁移与恢复

## 身份

- 显示名称：Purge Community
- npm 包：dsh-purge-plus
- 正式版本：1.3.0；本仓库 Releases 默认发行源，上游分支/tag 属显式可选（带不兼容警告）
- 保留内部 Cordis ID `dsh-purge`、HTTP `/dsh-purge/*` 和原用户数据路径
- 旧 dsh-purge / dsh-purge-panel 依赖保留为恢复材料，只有社区包留在启用 bundles 中

## 兼容检测

启动时同时读取 `dsh-agent-loop`、`dsh-system-prompt` 的包版本。两者必须均为 `0.2.1-rc.1` 才启用主插件运行时。缺失、未知或混合版本不会猜测兼容。维护接口仍可使用，以便备份及换回其他发行版。

1.3.0 恢复原版写入能力：应用/还原/卸载/启动自愈/自动应用与自动更新都按配置与界面操作执行，写入前先建 profile 快照。宿主版本或锚点不符合预期时不再整体停摆，改用 `purge-community diagnose`（或面板「状态 → 兼容与诊断」）逐条确认；组件版本不一致时仍会拒绝写入。更新或回滚不等于重新应用宿主补丁。

## 快照

使用 `backups/<时间-随机ID>/manifest.json` 标记完整备份，记录 SHA256、原 profile 和启用的 Purge bundles。未完成的备份不会出现在回滚列表。遇到符号链接、校验不一致或不属于当前 profile 的备份时停止，不继续写入。

快照包含：

- 已安装的三个 Purge 包（存在才备份），不含 node_modules / .git
- 当前 profile 的 package.json、cordis.patch.yml、pnpm-lock.yaml
- 原 prompt-inject.md、dsh-purge/、rules/（存在才备份）

不采集 credentials、sessions、skills、Qwen 图库/模型或其他插件数据。配置内容可能含私人信息，目录权限 0700、普通文件 0600；切勿公开整个备份。

## 回滚语义

先验证快照、备份当前状态，再将快照插件复制到新的恢复目录，通过 DSH 自带包管理器安装，并仅恢复 Purge 的 bundle 启用列表。当前提示词、规则、工作区配置和其他插件保持现值。需要旧用户内容时，人工从 `settings/` 选择对应文件恢复，不整体覆盖 profile。

不自动重启；操作成功后请手动完全退出并打开 DSH。安装器报错会保留恢复快照；包管理器中途失败时以错误信息和备份为准，不把失败显示成完成。维护锁遇到异常进程退出会保留，先确认没有维护进程再人工处理，不能盲目删锁后重复安装。

## CLI

使用发行包内 `bin/community.js`，与界面共用相同实现：

```sh
node package/bin/community.js status
node package/bin/community.js backup
PURGE_DSH_CLI=/absolute/path/to/dsh node package/bin/community.js migrate ./dsh-purge-plus-1.3.0.tgz
PURGE_DSH_CLI=/absolute/path/to/dsh node package/bin/community.js rollback <备份ID>
```

默认管理 `$DSH_HOME/profiles/desktop`；非默认位置可显式设置 `DSH_HOME` 与 `PURGE_PROFILE_DIR`。安装/回滚依赖真实 DSH CLI。新建安装也用 migrate；没有旧 Purge 的快照不能用于“回滚到不存在”，卸载需用 DSH 插件管理器单独完成。

## 发布

版本号、根 package.json 和 release-notes.md 同步更新；测试通过后创建 vX.Y.Z tag。CI 检查构建可复现、运行维护/界面回归、打包并发布 `.tgz` 和 SHA256SUMS.txt。只发布已测试的支持范围，不以一个模板修复推断全部宿主补丁兼容。
