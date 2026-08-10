const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

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

test('refresh line style overrides only valid stroke settings', () => {
  const start = codeSource.indexOf('function applyRefreshLineStyle(');
  const end = codeSource.indexOf('\nfunction getArrowData(', start);

  assert.notEqual(start, -1, 'applyRefreshLineStyle must exist');
  assert.notEqual(end, -1, 'applyRefreshLineStyle must be defined before getArrowData');

  const compiled = ts.transpileModule(codeSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const applyRefreshLineStyle = new Function(
    `${compiled}\nreturn applyRefreshLineStyle;`
  )();
  const original = {
    color: '#333333',
    strokeWeight: 2,
    lineType: 'elbow-l',
    curved: false,
    dashed: false,
    startSide: 'auto',
    endSide: 'auto',
    label: '',
    labelFontSize: 14,
    labelBold: false,
    startArrow: 'none',
    endArrow: 'arrow',
    bendPosition: 0.5,
  };

  assert.deepEqual(
    applyRefreshLineStyle(original, { strokeWeight: 4, dashed: true }),
    { ...original, strokeWeight: 4, dashed: true }
  );
  assert.deepEqual(original, { ...original, strokeWeight: 2, dashed: false });
  assert.deepEqual(
    applyRefreshLineStyle(original, { strokeWeight: Infinity, dashed: 'yes' }),
    original
  );
});
