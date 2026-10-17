import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { rewritePromptAssembly, CWD_ONLY_SUFFIX, CWD_STATIC_SUFFIX } from '../lib/identity.js';
const target = process.argv[2] || '@deepseek-ai/dsh-system-prompt';
const { renderPrompt } = await import(target.startsWith('/') ? pathToFileURL(target).href : target);
let checked = 0;
for (const cwd of ['missing', undefined, '/qa/workspace', '']) {
  for (const suffix of ['absent', CWD_ONLY_SUFFIX, 'A user supplied suffix.']) {
    const variables = { provider: 'test', model: 'fixture' };
    if (cwd !== 'missing') variables.cwd = cwd;
    const assembly = {
      variables,
      sections: [{name:'test:ordinary',text:'Ordinary message for {{model}}.'},
        ...(suffix === 'absent' ? [] : [{name:'deployment:persona-suffix',text:suffix}])],
      contexts: [], tools: [],
    };
    const before = JSON.stringify(assembly);
    const out = rewritePromptAssembly(assembly, '', {capabilityProtocol:false});
    const rendered = renderPrompt(out);
    assert.equal(JSON.stringify(assembly),before,'must not mutate the host assembly');
    assert(!rendered.includes('{{cwd}}'));
    if (suffix === 'A user supplied suffix.') assert(rendered.includes(suffix),'preserve custom suffix');
    else if (cwd === 'missing' || cwd === undefined) assert(rendered.includes(CWD_STATIC_SUFFIX));
    else assert(rendered.includes(`Your working directory is ${cwd}.`));
    assert.equal(renderPrompt(rewritePromptAssembly(out,'',{capabilityProtocol:false})),rendered,'idempotent rewrite');
    checked++;
  }
}
console.log(`${checked} cwd compatibility cases passed with the supplied real DSH renderer.`);
