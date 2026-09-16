// SPDX-License-Identifier: Apache-2.0
// Execute the real demo with a controlled camera/worker host, without physical hardware.
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function host(frameCallbacks = true, hardware = true) {
  const elements = new Map(), callbacks = new Map(), timers = new Map(), workers = [];
  let serial = 0, prints = 0, pixel = 0, readError = false;
  const downloads = [], cameraRequests = [];
  function element() {
    const attributes = new Map(), styles = new Map();
    const e = { hidden: false, disabled: false, checked: true, value: '', textContent: '',
      style: { setProperty: (k, v) => styles.set(k, v), getPropertyValue: k => styles.get(k) },
      setAttribute: (k, v) => attributes.set(k, v), getAttribute: k => attributes.get(k),
      replaceChildren() {}, append() {}, click() {}, remove() {},
      toDataURL: () => 'data:image/png;base64,AA==',
      play: async () => {}, pause() {}, load() {}, removeAttribute: k => attributes.delete(k),
      getContext: () => ({ drawImage() {}, putImageData() {},
        getImageData: () => { if (readError) throw new Error('Camera pixels unavailable');
          return { width: e.width, height: e.height, data: new Uint8ClampedArray(e.width * e.height * 4).fill(pixel) }; } }) };
    return e;
  }
  const html = fs.readFileSync(path.join(__dirname, '../examples/index.html'), 'utf8');
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element());
  const $ = id => elements.get(id);
  $('payload-type').value = 'text'; $('message').value = 'Camera integration'; $('ecc').value = 'Q'; $('encrypt').checked = false;
  $('print-size').value = '60'; $('photo').hidden = true;
  Object.assign($('video'), { readyState: 2, videoWidth: 1920, videoHeight: 1080, currentTime: 0 });
  if (frameCallbacks) {
    $('video').requestVideoFrameCallback = fn => { const id = ++serial; callbacks.set(id, fn); return id; };
    $('video').cancelVideoFrameCallback = id => callbacks.delete(id);
  }
  const constraints = [];
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; },
    getCapabilities: () => hardware ? { torch: true, zoom: { min: 1, max: 10, step: .1 },
      focusMode: ['continuous'] } : {},
    getSettings: () => ({ zoom: 1 }),
    getConstraints: () => constraints.at(-1) || { width: { ideal: 1920 }, height: { ideal: 1080 } },
    applyConstraints: async c => { constraints.push(c); } };
  class Worker {
    constructor() { this.messages = []; this.terminated = false; workers.push(this); }
    postMessage(value) { this.messages.push(value); }
    terminate() { this.terminated = true; }
    reply(result) { const request = this.messages.filter(m => m.id).at(-1);
      this.onmessage({ data: { id: request.id, result } }); }
  }
  const context = vm.createContext({ Prism19: require('..'), Alphabet19: require('../src/alphabet19.js'),
    PrismScanLog: require('../examples/diagnostics.js'),
    TextEncoder, Uint8Array, Uint8ClampedArray, DataView, Blob,
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:local'; }, revokeObjectURL() {} }, Worker, isSecureContext: true,
    ImageData: class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } },
    navigator: { userAgent: 'Test camera', mediaDevices: { getUserMedia: async options => {
      cameraRequests.push(options); track.readyState = 'live'; return { getTracks: () => [track], getVideoTracks: () => [track] }; },
      enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'rear-wide', label: 'Wide camera' },
        { kind: 'videoinput', deviceId: 'rear-close', label: 'Close camera' }] } },
    document: { getElementById: $, createElement: element, body: { append() {} }, addEventListener() {} },
    window: { addEventListener() {}, print: () => prints++ },
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../examples/demo.js'), 'utf8'), context);
  function frame(time) {
    $('video').currentTime = time;
    const [id, timer] = [...timers].find(([, t]) => t.ms === 120);
    timers.delete(id); return timer.fn();
  }
  return { $, callbacks, timers, workers, frame, track, constraints, downloads, cameraRequests, setPixels: value => pixel = value, failRead: value => readError = value, prints: () => prints };
}

test('camera cycles three resolutions after completion without queuing or fusing stale frames', async () => {
  const h = host();
  await h.$('start').onclick();
  const worker = h.workers[0];
  for (let frame = 1; frame <= 6; frame++) {
    const pending = h.frame(frame);
    assert.equal(h.callbacks.size, 0, 'No queued frame while the worker is busy');
    const request = worker.messages.at(-1);
    assert.equal(request.options.frameId, frame);
    assert.equal(request.options.maxTimeMs, frame % 3 === 0 ? 1800 : 6000);
    assert.equal(request.image.width, [1120, 1800, 800][(frame - 1) % 3]);
    assert.equal(request.options.diagnostics, true);
    worker.reply({ kind: 'none' }); await pending;
    const count = worker.messages.length;
    await h.frame(frame);
    assert.equal(worker.messages.length, count, 'A repeated video frame is not fused again');
  }
  const pending = h.frame(7);
  h.$('stop').onclick(); await pending;
  assert.equal(worker.terminated, true);
  assert.equal(h.track.readyState, 'ended');
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.$('scan-status').textContent, 'Camera stopped.');
});

test('camera heartbeat survives stalled presentation callbacks and media clock without queuing frames', async () => {
  const h = host(); await h.$('start').onclick();
  const worker = h.workers[0], pending = h.frame(1);
  assert.equal(h.callbacks.size, 0, 'Capture never depends on compositor callbacks');
  const count = worker.messages.length;
  for (let i = 0; i < 22; i++) await h.frame(1);
  assert.equal(worker.messages.length, count, 'Heartbeat cannot queue captures while decoding');
  worker.reply({ kind: 'none' }); await pending;
  await h.frame(1);
  assert.equal(worker.messages.length, count, 'Identical pixels and media time are skipped');
  h.setPixels(20);
  const next = h.frame(1);
  assert.equal(worker.messages.at(-1).options.frameId, 2, 'Changed pixels work with a stalled media clock');
  worker.reply({ kind: 'prism19', text: 'Previously printed code', ms: 10, frames: 1 }); await next;
  assert.equal(h.$('result').textContent, 'Previously printed code');
  assert.equal(h.track.readyState, 'ended');
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.timers.size, 0);
  h.$('save-report').onclick();
  const report = JSON.parse(await h.downloads.at(-1).text());
  assert.ok(report.events.some(e => e.type === 'camera-heartbeat' && e.busy && e.attempts === 1));
  assert.ok(report.events.some(e => e.type === 'camera-scheduler' && e.mode === 'timer-pixels'));
});

test('failed pixel probes are reported, retried and eventually stop cleanly', async () => {
  const h = host(); await h.$('start').onclick(); h.failRead(true);
  await h.frame(1);
  assert.match(h.$('scan-status').textContent, /pixels unavailable/);
  assert.equal(h.track.readyState, 'live');
  await h.frame(2); await h.frame(3);
  assert.equal(h.track.readyState, 'ended');
  assert.equal(h.timers.size, 0);
  h.$('save-report').onclick();
  const report = JSON.parse(await h.downloads.at(-1).text());
  assert.equal(report.events.filter(e => e.type === 'capture-error').length, 3);
});

test('older partial Prism layers keep the camera running until their complete payload is recovered', async () => {
  const h = host(); await h.$('start').onclick();
  const worker = h.workers[0];
  let pending = h.frame(1);
  worker.reply({ kind: 'partial', recovered: 1, needed: 3, frames: [{}] }); await pending;
  assert.equal(h.track.readyState, 'live');
  assert.equal(h.$('result').hidden, true);
  assert.match(h.$('scan-status').textContent, /1\/3 layers/);
  pending = h.frame(2);
  worker.reply({ kind: 'prism', text: 'Legacy print', frames: [{}, {}, {}], ms: 10 }); await pending;
  assert.equal(h.$('result').textContent, 'Legacy print');
  assert.equal(h.track.readyState, 'ended');
});

test('camera hardware controls preserve capture constraints and print uses physical width', async () => {
  const h = host(); await h.$('start').onclick();
  assert.equal(h.$('camera-controls').hidden, false);
  await h.$('torch').onclick();
  h.$('zoom').value = '2.5'; await h.$('zoom').onchange();
  const constraints = h.constraints.at(-1);
  assert.equal(constraints.width.ideal, 1920);
  assert.equal(constraints.height.ideal, 1080);
  assert.equal(constraints.advanced[0].focusMode, 'continuous');
  assert.equal(constraints.advanced[0].torch, true);
  assert.equal(constraints.advanced[0].zoom, 2.5);
  h.$('print').onclick();
  assert.equal(h.prints(), 1);
  assert.equal(h.$('code').style.getPropertyValue('--print-size'), '60mm');
  h.$('print-size').value = '0'; h.$('print').onclick();
  assert.equal(h.prints(), 1);
  h.$('stop').onclick();
});

test('older camera API fallback skips stale frames and the watchdog releases a stuck worker', async () => {
  const h = host(false, false); await h.$('start').onclick();
  assert.equal(h.$('camera-controls').hidden, true);
  let pending = h.frame(1);
  const worker = h.workers[0]; worker.reply({ kind: 'partial19', frames: 1 }); await pending;
  const count = worker.messages.length; await h.frame(1);
  assert.equal(worker.messages.length, count);
  pending = h.frame(2);
  const [id, timeout] = [...h.timers].find(([, t]) => t.ms === 10000);
  h.timers.delete(id); timeout.fn(); await pending;
  assert.equal(worker.terminated, true);
  assert.equal(h.track.readyState, 'live');
  assert.match(h.$('scan-status').textContent, /too long/);
  pending = h.frame(3);
  const replacement = h.workers.at(-1);
  assert.notEqual(replacement, worker);
  replacement.reply({ kind: 'prism19', text: 'Recovered after timeout', ms: 30 }); await pending;
  assert.equal(h.$('result').textContent, 'Recovered after timeout');
  assert.equal(h.track.readyState, 'ended');
  assert.equal(h.timers.size, 0);
});

test('worker progress keeps the pending frame alive and reports contain replayable captures but no decoded text', async () => {
  const h = host(); await h.$('start').onclick();
  const pending = h.frame(1), worker = h.workers[0], id = worker.messages.at(-1).id;
  worker.onmessage({ data: { id, progress: 'decoding', version: require('..').version } });
  assert.equal(h.callbacks.size, 0);
  worker.reply({ kind: 'encrypted', envelope: [12, 45, 99], text: 'must never be logged', ms: 42 });
  await pending;
  h.$('decode-password').value = 'must never be logged either'; h.$('report-note').value = 'Bright room';
  h.$('save-report').onclick();
  const text = await h.downloads.at(-1).text(), report = JSON.parse(text);
  assert.equal(report.schema, 'prism-scan-report');
  assert.equal(report.note, 'Bright room');
  assert.equal(report.frames.length, 1);
  assert.equal(report.frames[0].metadata.source, 'camera');
  assert.ok(report.events.some(e => e.type === 'worker-progress'));
  assert.ok(report.events.some(e => e.type === 'result' && e.kind === 'encrypted'));
  assert.ok(!text.includes('must never') && !text.includes('envelope'));
  h.$('report-images').checked = false; h.$('report-images').onchange();
  h.$('save-report').onclick();
  assert.equal(JSON.parse(await h.downloads.at(-1).text()).frames.length, 0);
});

test('freeze captures before stopping the camera, cancels the busy attempt and uses a longer still budget', async () => {
  const h = host(); h.$('camera-select').value = 'rear-close'; await h.$('start').onclick();
  assert.equal(h.cameraRequests[0].video.deviceId.exact, 'rear-close');
  const pending = h.frame(1), old = h.workers[0];
  h.$('freeze').onclick(); await pending;
  const next = h.workers.at(-1), request = next.messages.at(-1);
  assert.notEqual(next, old); assert.equal(old.terminated, true);
  assert.equal(h.track.readyState, 'ended'); assert.equal(request.options.maxTimeMs, 10000);
  assert.equal(request.image.width, 1800); assert.equal(request.accumulate, false);
  next.reply({ kind: 'prism19', text: 'Frozen print', ms: 100 });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.$('result').textContent, 'Frozen print');
  assert.equal(h.$('photo').hidden, false);
});

test('the demo recovers a calculation and waits for the Calculate action', async () => {
  const h = host(); h.$('payload-type').value = 'calculation'; h.$('payload-type').onchange();
  h.$('decode-generated').onclick();
  const worker = h.workers.at(-1), P = require('..');
  worker.reply(P.scan(worker.messages.at(-1).image));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.$('calculate').hidden, false);
  assert.equal(h.$('calculation-result').hidden, true);
  h.$('calculate').onclick();
  assert.equal(h.$('calculation-result').textContent, 'Result: 73');
});

test('the demo decrypts typed content before displaying it', async () => {
  const h = host(); h.$('payload-type').value = 'json'; h.$('payload-type').onchange();
  h.$('encrypt').checked = true; h.$('password').value = 'demo typed secret';
  await h.$('encrypt').onchange(); h.$('decode-generated').onclick();
  const worker = h.workers.at(-1), P = require('..'); worker.reply(P.scan(worker.messages.at(-1).image));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.$('unlock').hidden, false); assert.equal(h.$('result').hidden, true);
  h.$('decode-password').value = 'demo typed secret'; await h.$('decrypt').onclick();
  assert.equal(JSON.parse(h.$('result').textContent).project, 'Prism 19');
  assert.equal(h.$('save-payload').hidden, false);
  assert.equal(h.$('unlock').hidden, true);
});
