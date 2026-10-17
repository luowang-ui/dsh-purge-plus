# Purge 原生侧栏版本

此 fork 的 `native-panel` 分支维护独立的 `dsh-purge-panel` 界面插件。`master` 保留上游状态；原作者为 YuJunZhiXue/dsh-purge，版权和许可证保留在根目录及界面包的 LICENSE。

## 安装和更新

官方 `dsh-purge` 与 `dsh-purge-panel` 是两个包。前者保留原有功能，后者注册右侧 Purge 标签、设置布局及隐藏旧入口的样式。更新官方包不会覆盖独立界面文件。请勿与早期将界面直接嵌入 `dsh-purge@1.1.71-local.*` 的版本同时使用。

```sh
cd packages/purge-panel
npm ci --ignore-scripts --legacy-peer-deps
npm run build
npm test
npm pack --ignore-scripts
# 使用当前 DSH 安装的 CLI：
dsh plugin --profile desktop add ./dsh-purge-panel-1.1.0.tgz
```

先安装并启用官方 Purge，再装界面包。打开右侧栏「＋ → Purge」。禁用界面包恢复官方入口，不删除原设置。

## 跟进上游

```sh
git fetch upstream
git switch native-panel
git merge upstream/master
cd packages/purge-panel
npm ci --ignore-scripts --legacy-peer-deps
npm run build
npm test
```

合并后检查官方 `/dsh-purge/*` API 和 `.dshp-launch`、`.dshp-hero-chip`、`.dshp-tab-chip` 入口选择器是否变化。实测新版后更新兼容版本提示和测试，再打包界面。官方新增设置不会自动出现在独立界面中，需要显式适配。

目前兼容验证基线为官方 Purge 1.1.71。其他版本显示兼容提示；接口不可用也会显示提示。界面使用 `dshpp-` 样式前缀和独立 locale，避免与上游样式混用。没有修改官方安装文件的定时任务或加载器补丁。

## 验证

`npm test` 验证原生标签注册、分类切换时保留草稿、刷新不覆盖输入、查看页面不自动保存、旧入口隐藏规则、版本变化及服务异常提示。迁移在 DSH 桌面上验证：官方包恢复原版后，右侧独立界面仍加载，原提示词文件未变化。

CI 只测试和打包，不发布 npm、GitHub Release 或插件市场。任何正式分发需单独决定。

源码结构及本轮重构说明见 [界面包文档](packages/purge-panel/README.md#110-模块化)。`client.js` 由 `npm run build` 生成；修改源码后必须重建。
