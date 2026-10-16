import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const element = () => ({ value: '', validity: { badInput: false }, handlers: {},
  innerHTML: '', textContent: '', attributes: {}, firstChild: { textContent: '' },
  setAttribute(key, value) { this.attributes[key] = value; },
  removeAttribute(key) { delete this.attributes[key]; },
  checkValidity() { return true; },
  addEventListener(event, handler) { this.handlers[event] = handler; }
});
const ids = Object.fromEntries(['fit-form', 'unit', 'result', 'cat', 'length', 'width', 'example', 'script-status'].map(id => [id, element()]));
ids.unit.value = 'in';
const document = { querySelector: q => ids[q.slice(1)], getElementById: id => ids[id], querySelectorAll: () => [] };
const script = fs.readFileSync('src/components/litter-box/worksheet.js', 'utf8');
vm.runInNewContext(script, { document, Intl, setTimeout: fn => fn() });
const submit = (cat, length, width) => {
  for (const [id, value] of Object.entries({ cat, length, width })) ids[id].value = value === null ? '' : String(value);
  let prevented = false;
  ids['fit-form'].handlers.submit({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
  return ids.result.innerHTML;
};
assert.ok(ids['script-status'].textContent.startsWith('Worksheet ready'));
assert.ok(submit(18, 26, 18).includes('Below the length reference'));
assert.ok(ids.result.innerHTML.includes('27 in'));
assert.ok(ids.result.innerHTML.includes('1 in below'));
assert.ok(ids.result.innerHTML.includes('Bars share the same length scale'));
assert.ok(submit(18, 27, null).includes('Meets the length reference'));
assert.ok(submit(18, 26.999, null).includes('Below the length reference'));
assert.ok(submit(18, null, null).includes('Box length not compared'));
assert.ok(ids.result.innerHTML.includes('Inside width not supplied'));
assert.ok(submit(18, 30, 1).includes('Width is not scored'));
for (const [cat, length, width] of [[null, 26, 18], [0, 26, 18], [-1, 26, 18], [18, 0, 18], [18, 27, -1]]) {
  submit(cat, length, width);
  assert.ok(ids.result.innerHTML.includes('class="error"'));
}
submit(18, 27, 18);
ids.unit.value = 'cm'; ids.unit.handlers.change();
assert.equal(Number(ids.cat.value), 45.72);
assert.ok(ids.result.innerHTML.includes('68.58 cm'));
assert.ok(ids.result.innerHTML.includes('Meets the length reference'));
ids.unit.value = 'in'; ids.unit.handlers.change();
assert.equal(Number(ids.cat.value), 18);
ids.cat.handlers.input();
assert.ok(ids.result.innerHTML.includes('Measurements changed'));
ids.example.handlers.click();
assert.ok(ids.result.innerHTML.includes('Below the length reference'));
ids['fit-form'].handlers.reset();
assert.ok(ids.result.innerHTML.includes('Add your cat'));

const built = fs.readFileSync('dist/litter-box-size-checker.html', 'utf8');
assert.ok(built.includes(script.trim()), 'Built page must contain the tested script');
assert.ok(built.includes('box-diagram-title'));
assert.ok(built.includes('.fit-work .grid{grid-template-columns:1fr}'));
assert.ok(!built.includes('Preview for review'));
for (const path of ['dist/index.html', 'dist/2026/09/maine-coon-litter-box-guide.html', 'dist/maine-coon-litter-box-comparison.html']) {
  assert.ok(fs.readFileSync(path, 'utf8').includes('href="/litter-box-size-checker.html"'), `Missing discovery link: ${path}`);
}
const sitemap = fs.readFileSync('dist/sitemap.xml', 'utf8');
assert.ok(sitemap.includes('<loc>https://www.wisemainecoon.com/litter-box-size-checker.html</loc>'));
console.log(`Worksheet checks passed: calculations, simulated controls, unit switching, input errors, diagrams, build, discovery links and sitemap (${(sitemap.match(/<url>/g) || []).length} URLs).`);
console.log('Visual review of the integrated page remains a post-deployment check.');
