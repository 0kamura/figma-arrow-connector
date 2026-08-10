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

test('keeps one page relaunch and clears legacy arrow registrations', () => {
  const start = codeSource.indexOf('function syncRefreshRelaunchData(');
  const end = codeSource.indexOf('\n// 選択状態をUIに送信', start);

  assert.notEqual(start, -1, 'syncRefreshRelaunchData must exist');
  assert.notEqual(end, -1, 'relaunch placement must be defined before selection state');

  const compiled = ts.transpileModule(codeSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const syncRefreshRelaunchData = new Function(
    `${compiled}\nreturn syncRefreshRelaunchData;`
  )();
  const pageCalls = [];
  const arrowCalls = [[], []];
  const page = {
    setRelaunchData(data) {
      pageCalls.push(data);
    },
  };
  const arrows = arrowCalls.map(calls => ({
    setRelaunchData(data) {
      calls.push(data);
    },
  }));

  syncRefreshRelaunchData(page, arrows);

  assert.deepEqual(pageCalls, [{ 'refresh-all': '全矢印の位置を更新' }]);
  assert.deepEqual(arrowCalls, [[{}], [{}]]);

  const drawArrow = codeSource.slice(
    codeSource.indexOf('async function drawArrow('),
    codeSource.indexOf('// 保存済みデータに後から追加されたオプションの既定値を補う')
  );
  assert.match(drawArrow, /groupNode\.setRelaunchData\(\{\}\);/);
  assert.doesNotMatch(drawArrow, /setRelaunchData\(\{\s*["']refresh-all["']/);
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
    applyRefreshLineStyle(original, { color: '#ff0000', lineType: 'curve' }),
    { ...original, color: '#ff0000', lineType: 'curve', curved: true }
  );
  assert.deepEqual(
    applyRefreshLineStyle(original, { strokeWeight: 4, dashed: true, bendPosition: 0.25 }),
    { ...original, strokeWeight: 4, dashed: true, bendPosition: 0.25 }
  );
  assert.deepEqual(original, { ...original, strokeWeight: 2, dashed: false });
  assert.deepEqual(
    applyRefreshLineStyle(original, { strokeWeight: Infinity, dashed: 'yes' }),
    original
  );
});

test('updates dashed stroke in place while preserving vector geometry', () => {
  const start = codeSource.indexOf('function applyRefreshStyleInPlace(');
  const end = codeSource.indexOf('\n// 選択されたノードから矢印グループのデータを取得', start);

  assert.notEqual(start, -1, 'applyRefreshStyleInPlace must exist');
  assert.notEqual(end, -1, 'applyRefreshStyleInPlace must be defined before arrow data reads');

  const compiled = ts.transpileModule(codeSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const applyRefreshStyleInPlace = new Function(
    'hexToRgb',
    `${compiled}\nreturn applyRefreshStyleInPlace;`
  )(() => ({ r: 1, g: 0, b: 0 }));
  const vector = {
    type: 'VECTOR',
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    strokeWeight: 2,
    dashPattern: [],
    vectorNetwork: { vertices: [{ x: 0, y: 0 }, { x: 40, y: 20 }] },
  };
  const group = {
    findAll(predicate) {
      return [vector].filter(predicate);
    },
  };
  const options = {
    color: '#333333',
    strokeWeight: 2,
    dashed: true,
  };
  const originalNetwork = vector.vectorNetwork;

  assert.equal(applyRefreshStyleInPlace(group, options, { dashed: true }), true);
  assert.deepEqual(vector.dashPattern, [8, 6]);
  assert.equal(vector.vectorNetwork, originalNetwork);

  options.dashed = false;
  assert.equal(applyRefreshStyleInPlace(group, options, { dashed: false }), true);
  assert.deepEqual(vector.dashPattern, []);
  assert.equal(vector.vectorNetwork, originalNetwork);

  assert.equal(applyRefreshStyleInPlace(group, options, { lineType: 'curve' }), false);
  assert.equal(vector.vectorNetwork, originalNetwork);
});

test('uses an in-place patch only when edit changes are limited to stroke appearance', () => {
  const start = codeSource.indexOf('function buildInPlaceStylePatch(');
  const end = codeSource.indexOf('\nfunction applyRefreshStyleInPlace(', start);

  assert.notEqual(start, -1, 'buildInPlaceStylePatch must exist');
  assert.notEqual(end, -1, 'buildInPlaceStylePatch must be defined before in-place application');

  const compiled = ts.transpileModule(codeSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const buildInPlaceStylePatch = new Function(
    `${compiled}\nreturn buildInPlaceStylePatch;`
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
    buildInPlaceStylePatch(original, { ...original, dashed: true }),
    { dashed: true }
  );
  assert.deepEqual(
    buildInPlaceStylePatch(original, { ...original, color: '#ff0000', strokeWeight: 4 }),
    { color: '#ff0000', strokeWeight: 4 }
  );
  assert.equal(
    buildInPlaceStylePatch(original, { ...original, lineType: 'curve', curved: true }),
    null
  );
  assert.equal(
    buildInPlaceStylePatch(original, { ...original, label: 'Next' }),
    null
  );
});

test('uses selected arrows as refresh targets without scanning every arrow', () => {
  const start = codeSource.indexOf('function selectRefreshSnapshot(');
  const end = codeSource.indexOf('\n// 全矢印または選択中の矢印を更新', start);

  assert.notEqual(start, -1, 'selectRefreshSnapshot must exist');
  assert.notEqual(end, -1, 'selectRefreshSnapshot must be defined before refresh execution');

  const compiled = ts.transpileModule(codeSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const selectRefreshSnapshot = new Function(
    `${compiled}\nreturn selectRefreshSnapshot;`
  )();
  const selected = [{ id: 'arrow-a' }, { id: 'arrow-b' }];
  let scanCount = 0;

  assert.deepEqual(selectRefreshSnapshot(selected, () => {
    scanCount++;
    return [...selected, { id: 'arrow-c' }];
  }), selected);
  assert.equal(scanCount, 0);

  assert.deepEqual(selectRefreshSnapshot([], () => {
    scanCount++;
    return [{ id: 'arrow-c' }];
  }), [{ id: 'arrow-c' }]);
  assert.equal(scanCount, 1);
});

test('captures the selected arrow id before redraw removes the old node', () => {
  const refreshFunction = codeSource.slice(
    codeSource.indexOf('async function refreshAllArrows('),
    codeSource.indexOf('// 通常起動時は全矢印の再描画はせず')
  );
  const captureIndex = refreshFunction.indexOf('const oldArrowId = node.id;');
  const redrawIndex = refreshFunction.indexOf('await drawArrow(');

  assert.notEqual(captureIndex, -1, 'old arrow id must be captured');
  assert.notEqual(redrawIndex, -1, 'refresh must redraw the arrow');
  assert.ok(captureIndex < redrawIndex, 'old arrow id must be read before redraw removes its node');
  assert.match(refreshFunction, /patchArrowIndex\(oldArrowId, newArrow\.id,/);
});

test('creates and selects a circular point frame at the visible canvas center', () => {
  const start = codeSource.indexOf('function createPointFrame(');
  const end = codeSource.indexOf('\n// 接続可能なノードか', start);

  assert.notEqual(start, -1, 'createPointFrame must exist');
  assert.notEqual(end, -1, 'createPointFrame must be defined before connectable-node checks');

  const compiled = ts.transpileModule(codeSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const frame = {
    name: '',
    x: 0,
    y: 0,
    cornerRadius: 0,
    fills: [],
    width: 100,
    height: 100,
    resize(width, height) {
      this.width = width;
      this.height = height;
    },
  };
  const figma = {
    createFrame: () => frame,
    viewport: { center: { x: 400, y: 300 } },
    currentPage: { selection: [] },
  };
  const createPointFrame = new Function(
    'figma',
    `${compiled}\nreturn createPointFrame;`
  )(figma);

  const result = createPointFrame();

  assert.equal(result, frame);
  assert.deepEqual(
    {
      name: frame.name,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      cornerRadius: frame.cornerRadius,
      fills: frame.fills,
    },
    {
      name: 'Point',
      x: 384,
      y: 284,
      width: 32,
      height: 32,
      cornerRadius: 16,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    }
  );
  assert.deepEqual(figma.currentPage.selection, [frame]);
});
