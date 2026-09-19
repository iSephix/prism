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
  const html = fs.readFileSync(path.join(__dirname, '../experiments/higher-base/index.html'), 'utf8');
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element());
  const $ = id => elements.get(id);
  $('base').value='32';$('ecc').value='Q';$('message').value='Experimental camera message';
  $('print-mm').value='60';$('grid').value='0';$('payload-size').value='512';$('channel').value='print';$('pixels').value='420';$('photo').hidden=true;
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
  const context = vm.createContext({ PrismX: require('../experiments/higher-base/codec.js'),
    PrismXAlphabet: require('../experiments/higher-base/alphabet.js'), PrismXBenchmark: require('../experiments/higher-base/benchmark.js'),
    Prism19Core: require('../src/codec.js'), Prism19: require('..'), Alphabet19: require('../src/alphabet19.js'),
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../experiments/higher-base/app.js'), 'utf8'), context);
  function frame(time) {
    $('video').currentTime = time;
    const [id, timer] = [...timers].find(([, t]) => t.ms === 120);
    timers.delete(id); return timer.fn();
  }
  return { $, callbacks, timers, workers, frame, track, constraints, downloads, cameraRequests, setPixels: value => pixel = value, failRead: value => readError = value, prints: () => prints };
}

test('experimental camera keeps polling a stalled clock without duplicating in-flight work',async()=>{
 const h=host();await h.$('start').onclick();const pending=h.frame(1),w=h.workers[0],first=w.messages.at(-1);
 assert.equal(first.base,32);assert.equal(first.maxTimeMs,6000);assert.equal(first.image.width,1120);
 await h.frame(1);assert.equal(w.messages.length,1);w.reply({kind:'none',verified:false});await pending;
 await h.frame(1);assert.equal(w.messages.length,1);h.setPixels(7);const next=h.frame(1);
 w.reply({kind:'experimental',verified:true,base:32,bytes:[104,105],text:'hi',ms:25});await next;
 assert.equal(h.$('result').textContent,'hi');assert.equal(h.track.readyState,'ended');assert.equal(h.timers.size,0);
 h.$('save-report').onclick();const report=JSON.parse(await h.downloads.at(-1).text());assert.equal(report.experiment.format,'PX-1');assert.equal(report.frames[0].metadata.base,32);
 assert.ok(!report.events.some(e=>'text' in e||'bytes' in e));
});
test('experimental freeze cancels active work and profile changes invalidate pending results',async()=>{
 const h=host();await h.$('start').onclick();const pending=h.frame(1),old=h.workers[0];h.$('freeze').onclick();await pending;
 assert.equal(old.terminated,true);const frozen=h.workers.at(-1);assert.equal(frozen.messages.at(-1).maxTimeMs,10000);assert.equal(h.track.readyState,'ended');
 h.$('base').value='64';h.$('base').onchange();await Promise.resolve();await Promise.resolve();assert.equal(frozen.terminated,true);
 assert.equal(h.$('result').hidden,true);assert.equal(h.timers.size,0);
});
test('experimental benchmark cancellation restores camera controls and leaves no worker running',()=>{
 const h=host();h.$('benchmark').onclick();const w=h.workers.at(-1);assert.equal(w.messages.at(-1).action,'benchmark');assert.equal(h.$('start').disabled,true);
 h.$('cancel-benchmark').onclick();assert.equal(w.terminated,true);assert.equal(h.$('start').disabled,false);assert.equal(h.$('save-benchmark').disabled,true);
});
