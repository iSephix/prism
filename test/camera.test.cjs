// SPDX-License-Identifier: Apache-2.0
// Execute the real demo with a controlled camera/worker host, without physical hardware.
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function host(frameCallbacks = true, hardware = true) {
  const elements = new Map(), callbacks = new Map(), timers = new Map(), workers = [];
  let serial = 0, prints = 0;
  function element() {
    const attributes = new Map(), styles = new Map();
    const e = { hidden: false, disabled: false, checked: true, value: '', textContent: '',
      style: { setProperty: (k, v) => styles.set(k, v), getPropertyValue: k => styles.get(k) },
      setAttribute: (k, v) => attributes.set(k, v), getAttribute: k => attributes.get(k),
      replaceChildren() {}, play: async () => {}, pause() {}, load() {}, removeAttribute: k => attributes.delete(k),
      getContext: () => ({ drawImage() {}, putImageData() {},
        getImageData: () => ({ width: e.width, height: e.height,
          data: new Uint8ClampedArray(e.width * e.height * 4) }) }) };
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
    TextEncoder, Uint8Array, Uint8ClampedArray, DataView, Blob, URL, Worker, isSecureContext: true,
    ImageData: class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track],
      getVideoTracks: () => [track] }) } },
    document: { getElementById: $, createElement: element, addEventListener() {} },
    window: { addEventListener() {}, print: () => prints++ },
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../examples/demo.js'), 'utf8'), context);
  function frame(time) {
    $('video').currentTime = time;
    if (frameCallbacks) {
      assert.equal(callbacks.size, 1);
      const [id, fn] = callbacks.entries().next().value; callbacks.delete(id);
      return fn(0, { mediaTime: time });
    }
    const [id, timer] = [...timers].find(([, t]) => t.ms === 40);
    timers.delete(id); return timer.fn();
  }
  return { $, callbacks, timers, workers, frame, track, constraints, prints: () => prints };
}

test('camera schedules fresh frames after completion, skips duplicates, and alternates bounded searches', async () => {
  const h = host();
  await h.$('start').onclick();
  const worker = h.workers[0];
  for (let frame = 1; frame <= 6; frame++) {
    const pending = h.frame(frame);
    assert.equal(h.callbacks.size, 0, 'No queued frame while the worker is busy');
    const request = worker.messages.at(-1);
    assert.equal(request.options.frameId, frame);
    assert.equal(request.options.maxTimeMs, frame === 6 ? 2200 : 250);
    assert.equal(request.image.width, frame === 6 ? 1800 : 1120);
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
  const [id, timeout] = [...h.timers].find(([, t]) => t.ms === 8000);
  h.timers.delete(id); timeout.fn(); await pending;
  assert.equal(worker.terminated, true);
  assert.equal(h.track.readyState, 'ended');
  assert.match(h.$('scan-status').textContent, /too long/);
  assert.equal(h.timers.size, 0);
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
