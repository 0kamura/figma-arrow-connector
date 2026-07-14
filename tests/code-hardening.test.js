const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const codePath = path.join(__dirname, '..', 'code.ts');
const codeSource = fs.readFileSync(codePath, 'utf8');

test('normalizes legacy label options when reading arrow plugin data', () => {
  assert.match(codeSource, /function normalizeArrowOptions\(/);
  assert.match(codeSource, /labelFontSize: options\.labelFontSize \?\? 14/);
  assert.match(codeSource, /labelBold: options\.labelBold \?\? false/);

  const getArrowData = codeSource.slice(
    codeSource.indexOf('function getArrowData('),
    codeSource.indexOf('// 接続可能なノードか')
  );
  assert.match(getArrowData, /options: normalizeArrowOptions\(parsed\.options\)/);
});

test('keeps the existing arrow until the replacement group is created', () => {
  const existingBranch = codeSource.slice(
    codeSource.indexOf('if (existingGroup) {'),
    codeSource.indexOf('} else {', codeSource.indexOf('if (existingGroup) {'))
  );
  const groupIndex = existingBranch.indexOf('figma.group(children, parent');
  const removeIndex = existingBranch.indexOf('existingGroup.remove()');

  assert.notEqual(groupIndex, -1);
  assert.notEqual(removeIndex, -1);
  assert.ok(groupIndex < removeIndex, 'replacement group must be created before removing the old arrow');
});

test('drops stale asynchronous selection state responses', () => {
  assert.match(codeSource, /let selectionStateRequestId = 0;/);
  assert.match(codeSource, /const requestId = \+\+selectionStateRequestId;/);
  assert.match(codeSource, /if \(requestId !== selectionStateRequestId\) return;/);
});
