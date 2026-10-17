# cwd 模板兼容修复

本修复已纳入 Purge Community `1.2.0`；最初本地兼容包为 `1.1.71-compat.cwd.1`。此版本只修复提示词渲染的缺失变量错误，不扩展或重新应用宿主补丁。

关联上游 [issue #114](https://github.com/YuJunZhiXue/dsh-purge/issues/114) 与 [PR #115](https://github.com/YuJunZhiXue/dsh-purge/pull/115)。本机 DSH 0.2.1-rc.1 也只注册 provider/model，注入 `Your working directory is {{cwd}}.` 会在请求发送前报错。

- 配置模板 personaSuffix 为空，避免配置层要求不存在的变量。
- 运行时依据 assembled.variables 中 cwd 是否存在且非 undefined 选择动态后缀或静态回退。
- 不修改用户提示词文件，不覆盖非默认的自定义后缀，不原地改变宿主 assembly；重复处理幂等。
- 不改模型接口、身份/规则处理的其他逻辑、已有设置和独立界面插件。

使用目标 DSH 的真实 system-prompt 模块执行回归测试：

```sh
node test/cwd-compat.mjs /absolute/path/to/dsh-system-prompt/lib/index.js
```

测试覆盖缺失、undefined、有效路径和空字符串；各自再测试缺少后缀、旧 cwd 后缀和自定义后缀，共12个场景。通过渲染测试不等于已验证全部 Purge 补丁对新版 DSH 的兼容性；原生对话验收需重新加载插件后单独检查。
