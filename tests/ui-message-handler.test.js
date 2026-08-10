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

function loadSelectWeightOnFocus() {
  const start = uiSource.indexOf('function selectWeightOnFocus(');
  const end = uiSource.indexOf("\n    strokeWeight.addEventListener('focus'", start);

  assert.notEqual(start, -1, 'selectWeightOnFocus must exist');
  assert.notEqual(end, -1, 'selectWeightOnFocus must be registered after its definition');

  return new Function(`${uiSource.slice(start, end)}\nreturn selectWeightOnFocus;`)();
}

function loadRequestPointCreation() {
  const start = uiSource.indexOf('function requestPointCreation(');
  const end = uiSource.indexOf("\n    document.getElementById('addPointBtn')", start);

  assert.notEqual(start, -1, 'requestPointCreation must exist');
  assert.notEqual(end, -1, 'requestPointCreation must be registered with the add-point button');

  return new Function(`${uiSource.slice(start, end)}\nreturn requestPointCreation;`)();
}

function loadRequestSelectedArrowRefresh() {
  const start = uiSource.indexOf('function requestSelectedArrowRefresh(');
  const end = uiSource.indexOf("\n    document.getElementById('editRefreshBtn')", start);

  assert.notEqual(start, -1, 'requestSelectedArrowRefresh must exist');
  assert.notEqual(end, -1, 'requestSelectedArrowRefresh must be registered with the edit refresh button');

  return new Function(`${uiSource.slice(start, end)}\nreturn requestSelectedArrowRefresh;`)();
}

function loadBuildRefreshStylePatch() {
  const start = uiSource.indexOf('function buildRefreshStylePatch(');
  const end = uiSource.indexOf('\n    function updateRefreshButton(', start);

  assert.notEqual(start, -1, 'buildRefreshStylePatch must exist');
  assert.notEqual(end, -1, 'buildRefreshStylePatch must be defined before refresh button updates');

  return new Function(`${uiSource.slice(start, end)}\nreturn buildRefreshStylePatch;`)();
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

test('focusing a stroke weight field selects its existing value for replacement', () => {
  const selectWeightOnFocus = loadSelectWeightOnFocus();
  let selected = false;

  selectWeightOnFocus({ currentTarget: { select: () => { selected = true; } } });

  assert.equal(selected, true);
  assert.match(uiSource, /strokeWeight\.addEventListener\('focus', selectWeightOnFocus\)/);
  assert.match(uiSource, /editStrokeWeight\.addEventListener\('focus', selectWeightOnFocus\)/);
});

test('refresh sends only the style fields marked as changed', () => {
  const refreshHandler = uiSource.slice(
    uiSource.indexOf("document.getElementById('relaunchBtn').addEventListener"),
    uiSource.indexOf('// ---- Persist create-mode changes immediately ----')
  );

  assert.match(refreshHandler, /buildRefreshStylePatch\(refreshDirtyFields,/);
  assert.match(refreshHandler, /type: 'refresh-all', \.\.\.stylePatch/);
});

test('refresh style patch includes only fields changed by the user', () => {
  const buildRefreshStylePatch = loadBuildRefreshStylePatch();
  const values = {
    color: '#ff0000',
    strokeWeight: 4,
    lineType: 'elbow-z',
    dashed: true,
    bendPosition: 0.25,
  };

  assert.deepEqual(
    buildRefreshStylePatch(new Set(['color', 'dashed']), values),
    { color: '#ff0000', dashed: true }
  );
  assert.deepEqual(
    buildRefreshStylePatch(new Set(['bendPosition']), values),
    { bendPosition: 0.25 }
  );
  assert.deepEqual(buildRefreshStylePatch(new Set(), values), {});
});

test('point creation requests the add-point action from the plugin host', () => {
  const requestPointCreation = loadRequestPointCreation();
  const sent = [];
  const host = {
    postMessage(payload, origin) {
      sent.push({ payload, origin });
    },
  };

  requestPointCreation(host);

  assert.deepEqual(sent, [{
    payload: { pluginMessage: { type: 'add-point' } },
    origin: '*',
  }]);
});

test('selected arrow actions keep create disabled and refresh only that arrow', () => {
  const editMode = uiSource.slice(
    uiSource.indexOf('<!-- Edit Mode -->'),
    uiSource.indexOf('<script>')
  );
  assert.match(editMode, /id="editCreateBtn"\s+disabled/);
  assert.match(editMode, /id="editRefreshBtn"/);

  const requestSelectedArrowRefresh = loadRequestSelectedArrowRefresh();
  const sent = [];
  const host = {
    postMessage(payload, origin) {
      sent.push({ payload, origin });
    },
  };

  requestSelectedArrowRefresh('arrow-42', host);
  requestSelectedArrowRefresh(null, host);

  assert.deepEqual(sent, [{
    payload: { pluginMessage: { type: 'refresh-position', arrowId: 'arrow-42' } },
    origin: '*',
  }]);
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

test('quick connect help exposes only the custom tooltip', () => {
  const classIndex = uiSource.indexOf('class="quick-connect-help"');
  const tagStart = uiSource.lastIndexOf('<button', classIndex);
  const tagEnd = uiSource.indexOf('>', classIndex);

  assert.notEqual(classIndex, -1, 'quick connect help button must exist');
  assert.notEqual(tagStart, -1, 'quick connect help must be a button');
  assert.notEqual(tagEnd, -1, 'quick connect help button tag must close');

  const openingTag = uiSource.slice(tagStart, tagEnd + 1);
  assert.match(openingTag, /\sdata-tooltip="[^"]+"/);
  assert.match(openingTag, /\saria-label="[^"]+"/);
  assert.doesNotMatch(openingTag, /\stitle="/);
});
