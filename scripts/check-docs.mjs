// 文档跟着版本走：版本号、发行说明首行、英文 README 的版本行必须一致。
// 放在 CI 里跑，避免"代码发版了、README 还停在上一个版本"。
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const version = pkg.version;
const notesFirst = read("release-notes.md").split("\n")[0].trim();
const readme = read("README.md");
const readmeEn = read("docs/README.en.md");
const agents = read("AGENTS.md");

const problems = [];
if (notesFirst !== `# ${version}`) {
  problems.push(`release-notes.md 首行应为 "# ${version}"，实际是 "${notesFirst}"`);
}
if (!readme.includes(`**${version}**`)) {
  problems.push(`README.md 首屏缺少版本号 **${version}**`);
}
if (!readme.includes("raw.githubusercontent.com/kingcharleslzy-ai/dsh-purge/master/scripts/install.sh")) {
  problems.push("README.md 缺少一行安装命令");
}
if (!readmeEn.includes(`Current version ${version}`)) {
  problems.push(`docs/README.en.md 缺少 "Current version ${version}"`);
}
if (!agents.includes(`当前版本：**${version}**`)) {
  problems.push(`AGENTS.md 缺少 "当前版本：**${version}**"`);
}
if (!agents.includes(`\`dsh-purge-plus\` ${version}`)) {
  problems.push(`AGENTS.md §9 版本表未同步到 ${version}`);
}
const hostLine = readme.match(/适配 \*\*DSH Desktop ([0-9a-z.\-]+)\*\*/i);
if (!hostLine) problems.push("README.md 缺少「适配 DSH Desktop …」的版本行");

if (problems.length) {
  console.error("✗ 文档与版本不一致：");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`✓ 文档版本一致：${version}（README / release-notes / README.en 均指向该版本）`);
