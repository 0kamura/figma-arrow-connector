const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const uiPath = path.join(__dirname, '..', 'ui.html');
const uiSource = fs.readFileSync(uiPath, 'utf8');

function loadMessageHandlerPrefix() {
  const startMarker = 'window.onmessage = (event) => {';
  const firstBranchMarker = "if (msg.type === 'color-swatches') {";
  const start = uiSource.indexOf(startMarker);
  const firstBranch = uiSource.indexOf(firstBranchMarker, start);

  assert.notEqual(start, -1, 'window.onmessage handler must exist');
  assert.notEqual(firstBranch, -1, 'first plugin message branch must exist');

  const prefix = uiSource.slice(start + startMarker.length, firstBranch);
  return new Function(
    'event',
    `${prefix}\nif (msg.type === 'color-swatches') return;`
  );
}

function loadQuickConnectPolicy() {
  const startMarker = 'function shouldQuickConnect(';
  const endMarker = '\n    // ---- State ----';
  const start = uiSource.indexOf(startMarker);
  const end = uiSource.indexOf(endMarker, start);

  assert.notEqual(start, -1, 'shouldQuickConnect must exist');
  assert.notEqual(end, -1, 'shouldQuickConnect section must terminate before state setup');

  return new Function(`${uiSource.slice(start, end)}\nreturn shouldQuickConnect;`)();
}

test('ignores message events without a Figma pluginMessage payload', () => {
  const handler = loadMessageHandlerPrefix();

  assert.doesNotThrow(() => handler({ data: {} }));
  assert.doesNotThrow(() => handler({ data: undefined }));
});

test('does not interpolate Figma-provided names into innerHTML', () => {
  for (const expression of ['it.name', 'item.n', 'f.name']) {
    const unsafeInterpolation = new RegExp(
      String.raw`innerHTML\s*=\s*\x60[^\x60]*\$\{${expression.replace('.', '\\.')}\}`
    );
    assert.doesNotMatch(uiSource, unsafeInterpolation);
  }
});

test('validates payloads before handling known plugin message types', () => {
  assert.match(uiSource, /if \(!Array\.isArray\(msg\.swatches\)\) return;/);
  assert.match(uiSource, /if \(!Array\.isArray\(msg\.frames\)\) return;/);
  assert.match(
    uiSource,
    /if \(typeof msg\.arrowId !== 'string' \|\| !msg\.options \|\| typeof msg\.options !== 'object'\) return;/
  );
});

test('debounced edits keep their original arrow id and are cancelled on selection changes', () => {
  assert.match(uiSource, /function cancelPendingEditUpdates\(\)/);
  assert.match(uiSource, /const arrowId = currentArrowId;/);
  assert.match(uiSource, /if \(currentArrowId !== arrowId\) return;/);
  assert.match(uiSource, /type: 'update-arrow', arrowId, \.\.\.o/);
  assert.match(uiSource, /type: 'update-arrow-label', arrowId, label/);

  const selectionBranch = uiSource.slice(
    uiSource.indexOf("if (msg.type === 'selection-update')"),
    uiSource.indexOf("if (msg.type === 'edit-arrow')")
  );
  assert.match(selectionBranch, /cancelPendingEditUpdates\(\);/);
});

test('create and edit options use a finite validated stroke weight', () => {
  assert.match(uiSource, /function readStrokeWeight\(input, fallback = 2\)/);
  assert.match(uiSource, /strokeWeight: readStrokeWeight\(strokeWeight\)/);
  assert.match(uiSource, /strokeWeight: readStrokeWeight\(editStrokeWeight\)/);
});

test('quick connect only fires after startup for a new pair of exactly two frames', () => {
  const shouldQuickConnect = loadQuickConnectPolicy();
  const pair = ['frame-a', 'frame-b'];

  assert.equal(shouldQuickConnect({ enabled: true, armed: false, frameIds: pair, lastPairKey: '' }), false);
  assert.equal(shouldQuickConnect({ enabled: false, armed: true, frameIds: pair, lastPairKey: '' }), false);
  assert.equal(shouldQuickConnect({ enabled: true, armed: true, frameIds: ['frame-a'], lastPairKey: '' }), false);
  assert.equal(shouldQuickConnect({ enabled: true, armed: true, frameIds: [...pair, 'frame-c'], lastPairKey: '' }), false);
  assert.equal(shouldQuickConnect({ enabled: true, armed: true, frameIds: pair, lastPairKey: '' }), true);
  assert.equal(shouldQuickConnect({ enabled: true, armed: true, frameIds: pair, lastPairKey: pair.join('::') }), false);
});

test('quick connect toggle is persisted and reuses the normal create action', () => {
  assert.match(uiSource, /id="quickConnect"/);
  assert.match(uiSource, /Quick Connect/);
  assert.match(uiSource, /quickConnect: document\.getElementById\('quickConnect'\)\.checked/);
  assert.match(uiSource, /typeof p\.quickConnect === 'boolean'/);
  assert.match(uiSource, /function createArrowFromSelection\(\)/);
  assert.match(uiSource, /function maybeQuickConnect\(\)/);

  const selectionBranch = uiSource.slice(
    uiSource.indexOf("if (msg.type === 'selection-update')"),
    uiSource.indexOf("if (msg.type === 'edit-arrow')")
  );
  assert.match(selectionBranch, /maybeQuickConnect\(\);/);

  const editBranch = uiSource.slice(
    uiSource.indexOf("if (msg.type === 'edit-arrow')"),
    uiSource.indexOf('function updateCreateUI()')
  );
  assert.match(editBranch, /lastQuickConnectPairKey = '';/);
});
