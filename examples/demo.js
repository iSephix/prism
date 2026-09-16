// SPDX-License-Identifier: Apache-2.0
'use strict';
const $ = id => document.getElementById(id),
  P = Prism19;
let code = null,
  generation = 0,
  timer, worker = null,
  request = 0,
  stream = null,
  cameraToken = 0,
  scanTimer, frameCallback = null, locked = null,
  message = '', selectedPayload = null, recoveredPayload = null, payloadURL = null, fileRequest = 0;
const pending = new Map(),
  options = () => Object.fromEntries(['soft', 'equations', 'spatial', 'refine'].map(k => [k, $(k).checked]));
const scanLog = PrismScanLog.create(P.version, {
  userAgent: navigator.userAgent, language: navigator.language,
  secureContext: isSecureContext, frameCallbacks: typeof $('video').requestVideoFrameCallback === 'function'
});
let scanSource = 'image';
function reportCount() {
  const n = scanLog.counts();
  $('report-count').textContent = `${n.attempts} attempts · ${n.frames} saved frames`;
}
function cameraInfo(track = stream?.getVideoTracks()[0]) {
  let settings = {}; const out = {};
  try { settings = track?.getSettings?.() || {}; } catch { /* Reporting must not interrupt capture. */ }
  for (const key of ['width', 'height', 'frameRate', 'facingMode', 'zoom', 'focusMode', 'focusDistance', 'exposureMode', 'torch'])
    if (settings[key] !== undefined) out[key] = settings[key];
  const video = $('video');
  return { ...out, label: track?.label, readyState: track?.readyState, muted: track?.muted,
    videoWidth: video.videoWidth, videoHeight: video.videoHeight,
    videoReadyState: video.readyState, mediaTime: video.currentTime };
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker('worker.js');
  worker.onmessage = ({
    data
  }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.progress) {
      scanLog.event('worker-progress', { id: data.id, stage: data.progress, version: data.version });
      return;
    }
    pending.delete(data.id);
    clearTimeout(p.timeout);
    if (data.error) scanLog.event('worker-error', { id: data.id, message: data.error });
    else scanLog.result(data.id, data.result, data.diagnostics);
    data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
  };
  worker.onerror = () => {
    scanLog.event('worker-crash');
    for (const p of pending.values()) { clearTimeout(p.timeout); p.reject(Error('Decoder worker failed. Please retry.')); }
    pending.clear();
    worker.terminate();
    worker = null;
  };
  return worker;
}

function decode(image, accumulate = false, frameId, maxTimeMs = 8000) {
  return new Promise((resolve, reject) => {
    const id = ++request;
    try {
      const settings = { ...options(), frameId, maxTimeMs, diagnostics: true };
      scanLog.capture(id, image, { source: scanSource, options: settings, burst: $('burst').checked,
        camera: accumulate ? cameraInfo() : undefined }, $('report-images').checked);
      reportCount();
      const w = getWorker();
      pending.set(id, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          scanLog.event('worker-timeout', { id, budgetMs: maxTimeMs });
          cancelWorker('This frame took too long. Retrying with a fresh frame.');
        }, Math.max(10000, maxTimeMs + 4000))
      });
      w.postMessage({
        id,
        image,
        options: settings,
        accumulate,
        burst: $('burst').checked
      }, [image.data.buffer]);
    } catch (error) {
      clearTimeout(pending.get(id)?.timeout);
      pending.delete(id);
      reject(error);
    }
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function generate() {
  const token = ++generation, type = $('payload-type').value || 'text', text = $('message').value;
  const ecc = $('ecc').value, encrypted = $('encrypt').checked;
  $('password-field').hidden = !encrypted;
  for (const id of ['svg', 'png', 'decode-generated', 'print']) $(id).disabled = true;
  $('encode-status').textContent = encrypted ? 'Encrypting locally…' : '';
  $('byte-count').textContent = `Code capacity: ${P.capacity({ ecc })} bytes · ${ecc} correction`;
  try {
    let result;
    if (type === 'text') result = encrypted ? await P.encodeEncrypted(text, $('password').value, { ecc }) : P.encode(text, { ecc });
    else {
      const isFile = ['image', 'audio', 'binary'].includes(type);
      if (isFile && !selectedPayload) throw Error('Choose a file or use a sample.');
      const data = isFile ? selectedPayload.data : text;
      const options = { ecc, ...(isFile ? { mimeType: selectedPayload.mimeType, name: selectedPayload.name } : {}) };
      result = encrypted ? await P.encodePayloadEncrypted(type, data, $('password').value, options) : P.encodePayload(type, data, options);
    }
    if (token !== generation) return;
    code = result;
    $('code').innerHTML = P.toSVG(code);
    $('byte-count').textContent = `${code.bodyBytes} / ${P.capacity({ ecc })} bytes used, including metadata${encrypted ? ' and encryption' : ''}`;
    $('code-meta').textContent = `${code.n} × ${code.n} cells · format ${code.version} · ${code.bytes} content bytes${code.typed ? ' · ' + type : ''}${code.encrypted ? ' · encrypted' : ''}`;
    $('encode-status').textContent = code.n > 85 ? 'Dense code: use the full-size export or a larger print, and keep the camera close.' : '';
    for (const id of ['svg', 'png', 'decode-generated', 'print']) $(id).disabled = false;
  } catch (error) {
    if (token !== generation) return;
    code = null; $('code').replaceChildren(); $('code-meta').textContent = '';
    $('encode-status').textContent = error.message;
  }
}
for (const id of ['message', 'password']) $(id).oninput = () => {
  generation++;
  clearTimeout(timer);
  for (const b of ['svg', 'png', 'decode-generated', 'print']) $(b).disabled = true;
  timer = setTimeout(generate, 300);
};
for (const id of ['ecc', 'encrypt']) $(id).onchange = generate;
$('svg').onclick = () => {
  if (code) download(new Blob([P.toSVG(code, Number($('scale').value))], {
    type: 'image/svg+xml'
  }), 'prism19.svg');
};
$('png').onclick = () => {
  if (!code) return;
  let image;
  try { image = P.toRGBA(code, Number($('scale').value)); }
  catch (error) { $('encode-status').textContent = error.message + ' Choose a smaller PNG scale or export SVG.'; return; }
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  canvas.toBlob(blob => {
    if (blob) download(blob, 'prism19.png');
  }, 'image/png');
};

function clear() {
  clearPayload();
  locked = null;
  message = '';
  $('unlock').hidden = true;
  $('result').hidden = true;
  $('copy').hidden = true;
  $('decode-password').value = '';
}

function display(result) {
  if (result.kind === 'none') {
    $('scan-status').textContent = 'No complete code found. Move closer and keep it sharp.';
    return false;
  }
  if (result.kind === 'partial19') {
    $('scan-status').textContent = `Code identified · ${result.frames} frame(s) of evidence. Hold steady.`;
    return false;
  }
  if (result.kind === 'partial') {
    $('scan-status').textContent = `Older Prism code identified · ${result.recovered}/${result.needed} layers. Hold steady.`;
    return false;
  }
  if (result.kind === 'encrypted') {
    locked = result;
    $('unlock').hidden = false;
    $('scan-status').textContent = 'Encrypted bytes recovered. Enter the passphrase.';
    return true;
  }
  if (result.kind === 'payload') { displayPayload(result.payload); return true; }
  message = result.text;
  $('result').textContent = message;
  $('result').hidden = false;
  $('copy').hidden = false;
  $('unlock').hidden = true;
  $('scan-status').textContent =
    `Message recovered · ${Math.round(result.ms)} ms · ${Number.isInteger(result.frames) ? result.frames : 1} frame(s)`;
  return true;
}

function cancelWorker(reason = 'Scan cancelled.') {
  if (pending.size) scanLog.event('worker-cancelled', { ids: [...pending.keys()], reason });
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) { clearTimeout(p.timeout); p.reject(Error(reason)); }
  pending.clear();
}

function stop() {
  cameraToken++;
  clearTimeout(scanTimer);
  if (frameCallback !== null) $('video').cancelVideoFrameCallback?.(frameCallback);
  frameCallback = null;
  cancelWorker();
  $('camera-controls').hidden = true;
  $('torch').setAttribute('aria-pressed', 'false');
  $('torch').textContent = 'Light on';
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  $('video').srcObject = null;
  $('video').hidden = true;
  $('start').disabled = false;
  $('stop').hidden = true;
  $('freeze').hidden = true;
  $('camera-idle').hidden = !$('photo').hidden;
}
async function still(image, source = 'image') {
  stop();
  clear();
  scanSource = source;
  const token = cameraToken;
  $('photo').width = image.width;
  $('photo').height = image.height;
  $('photo').getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  $('photo').hidden = false;
  $('camera-idle').hidden = true;
  $('scan-status').textContent = 'Reading image…';
  try {
    const result = await decode(image, false, undefined, 10000);
    if (token === cameraToken) display(result);
  } catch (error) {
    if (token === cameraToken) $('scan-status').textContent = error.message;
  }
}
$('decode-generated').onclick = () => {
  if (code) still(P.toRGBA(code), 'generated');
};
$('upload').onclick = () => $('file').click();
$('file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 33554432) {
    $('scan-status').textContent = 'Choose an image smaller than 32 MiB.';
    return;
  }
  stop();
  const token = cameraToken,
    url = URL.createObjectURL(file),
    image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('Could not open this image.'));
      image.src = url;
    });
    if (token !== cameraToken) return;
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    await still(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } catch (error) {
    $('scan-status').textContent = error.message;
  } finally {
    URL.revokeObjectURL(url);
  }
};
$('start').onclick = async () => {
  stop();
  clear();
  const token = cameraToken;
  scanSource = 'camera';
  $('photo').hidden = true;
  $('camera-idle').hidden = false;
  $('start').disabled = true;
  $('scan-status').textContent = 'Opening camera…';
  try {
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error(
      'Open this demo over HTTPS (or localhost), or choose an image.');
    const acquired = await navigator.mediaDevices.getUserMedia({
      video: {
        ...($('camera-select').value ? { deviceId: { exact: $('camera-select').value } } : {}),
        facingMode: {
          ideal: 'environment'
        },
        width: {
          ideal: 1920
        },
        height: {
          ideal: 1080
        }
      },
      audio: false
    });
    if (token !== cameraToken) {
      acquired.getTracks().forEach(t => t.stop());
      return;
    }
    stream = acquired;
    $('video').srcObject = stream;
    $('video').hidden = false;
    await $('video').play();
    if (token !== cameraToken) return;
    $('video').hidden = false;
    $('camera-idle').hidden = true;
    $('stop').hidden = false;
    $('freeze').hidden = false;
    $('scan-status').textContent = 'Keep the complete code in view.';
    getWorker().postMessage({
      reset: true
    });
    const track = stream.getVideoTracks()[0];
    scanLog.event('camera-open', cameraInfo(track));
    // Labels become available after permission. Expose each lens without guessing
    // from translated device names which lens will focus best on this print.
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices?.() || []).filter(d => d.kind === 'videoinput');
      if (token !== cameraToken) return;
      const selected = $('camera-select').value;
      $('camera-select').replaceChildren();
      const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Automatic rear camera';
      $('camera-select').append(automatic);
      devices.forEach((device, i) => { const option = document.createElement('option');
        option.value = device.deviceId; option.textContent = device.label || `Camera ${i + 1}`; $('camera-select').append(option); });
      $('camera-select').value = selected;
      $('camera-choice').hidden = devices.length < 2;
    } catch { /* Camera selection is optional. */ }
    let caps = {};
    try { caps = track.getCapabilities?.() || {}; } catch { /* Optional hardware controls. */ }
    scanLog.event('camera-capabilities', { focusMode: caps.focusMode, zoom: caps.zoom, torch: caps.torch });
    $('torch').hidden = !(caps.torch === true || Array.isArray(caps.torch) && caps.torch.includes(true));
    const zoom = caps.zoom;
    $('zoom-control').hidden = !(zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min);
    if (!$('zoom-control').hidden) {
      $('zoom').min = zoom.min; $('zoom').max = Math.min(zoom.max, Math.max(zoom.min, 8));
      $('zoom').step = zoom.step || .1;
      $('zoom').value = track.getSettings().zoom || zoom.min;
      $('zoom-value').textContent = `${Number($('zoom').value).toFixed(1)}×`;
    }
    $('camera-controls').hidden = $('torch').hidden && $('zoom-control').hidden;
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      try { await cameraConstraint({ focusMode: 'continuous' }, track); } catch { /* Keep the usable stream. */ }
    }
    if (token !== cameraToken) return;
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    let lastTime = -1, captured = 0, failures = 0;
    const schedule = () => {
      if (token !== cameraToken || !stream) return;
      if (typeof $('video').requestVideoFrameCallback === 'function') {
        frameCallback = $('video').requestVideoFrameCallback(tick);
        // Some mobile browsers suspend presentation callbacks when the preview
        // is off-screen. Keep capture alive, still checking for a fresh frame.
        scanTimer = setTimeout(tick, 250);
      } else scanTimer = setTimeout(tick, 40);
    };
    const tick = async (_now, metadata) => {
      clearTimeout(scanTimer);
      if (frameCallback !== null) $('video').cancelVideoFrameCallback?.(frameCallback);
      frameCallback = null;
      if (token !== cameraToken || !stream) return;
      const v = $('video');
      if (v.readyState < 2 || !v.videoWidth) {
        schedule();
        return;
      }
      const frameTime = metadata?.mediaTime ?? v.currentTime;
      if (frameTime === lastTime) { schedule(); return; }
      lastTime = frameTime;
      const pass = captured++ % 3;
      const budget = pass === 0 ? 1800 : 6000;
      const scale = Math.min(1, [800, 1120, 1800][pass] / Math.max(v.videoWidth, v.videoHeight));
      const width = Math.round(v.videoWidth * scale), height = Math.round(v.videoHeight * scale);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      try {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const input = ctx.getImageData(0, 0, canvas.width, canvas.height),
          snapshot = new Uint8ClampedArray(input.data);
        $('scan-status').textContent = `Reading frame ${captured}…`;
        const result = await decode(input, true, captured, budget);
        if (token !== cameraToken) return;
        failures = 0;
        if (display(result)) {
          $('photo').width = canvas.width;
          $('photo').height = canvas.height;
          $('photo').getContext('2d').putImageData(new ImageData(snapshot, canvas.width, canvas
            .height), 0, 0);
          $('photo').hidden = false;
          stop();
          return;
        }
      } catch (error) {
        if (token === cameraToken) {
          scanLog.event('capture-error', { message: error.message });
          $('scan-status').textContent = error.message;
          if (++failures >= 3) { stop(); $('scan-status').textContent = 'Decoder keeps failing. Save a scan report, or try Freeze & read on a new session.'; }
          else schedule();
        }
        return;
      }
      schedule();
    };
    schedule();
  } catch (error) {
    scanLog.event('camera-error', { name: error.name, message: error.message });
    if (token === cameraToken) {
      stop();
      $('scan-status').textContent = error.message;
    }
  }
};
$('stop').onclick = () => {
  scanLog.event('camera-stop');
  stop();
  $('scan-status').textContent = 'Camera stopped.';
};
$('camera-select').onchange = () => { if (stream) $('start').onclick(); };
$('freeze').onclick = () => {
  const v = $('video');
  if (!stream || v.readyState < 2 || !v.videoWidth) return;
  const scale = Math.min(1, 1800 / Math.max(v.videoWidth, v.videoHeight)), canvas = document.createElement('canvas');
  canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  scanLog.event('freeze', cameraInfo());
  still(ctx.getImageData(0, 0, canvas.width, canvas.height), 'freeze');
};
$('report-images').onchange = () => { if (!$('report-images').checked) scanLog.clearFrames(); reportCount(); };
$('save-report').onclick = () => {
  try {
    const report = scanLog.report(frame => {
      const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
      canvas.getContext('2d').putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }, $('report-images').checked, $('report-note').value);
    download(new Blob([JSON.stringify(report)], { type: 'application/json' }), `prism-scan-report-${Date.now()}.json`);
    $('report-count').textContent = 'Report saved. Attach the JSON file when reporting the issue.';
  } catch (error) { $('report-count').textContent = `Could not save report: ${error.message}`; }
};
for (const id of ['soft', 'equations', 'spatial', 'refine', 'burst']) $(id).onchange = () => worker
  ?.postMessage({
    reset: true
  });
$('decrypt').onclick = async () => {
  if (!locked) return;
  const saved = locked;
  $('decrypt').disabled = true;
  try {
    const data = Uint8Array.from(saved.envelope), passphrase = $('decode-password').value;
    const decoded = saved.typed ? { kind: 'payload', payload: await P.decryptPayload(data, passphrase) } :
      { kind: 'prism19', text: await P.decrypt(data, passphrase) };
    if (locked !== saved) return;
    $('decode-password').value = '';
    locked = null;
    display({
      ...saved,
      ...decoded
    });
    $('scan-status').textContent = 'Decrypted locally · AES-GCM tag verified.';
  } catch (error) {
    if (locked === saved) $('scan-status').textContent = error.message;
  } finally {
    $('decrypt').disabled = false;
  }
};
$('decode-password').onkeydown = e => {
  if (e.key === 'Enter') $('decrypt').click();
};
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(message);
    $('scan-status').textContent = 'Message copied.';
  } catch {
    $('scan-status').textContent = 'Select the message text to copy it.';
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', () => {
  stop();
  cancelWorker('Page closed.');
  clearPayload();
});
window.addEventListener('error', event => scanLog.event('page-error', { message: String(event.message || 'Script error').slice(0, 500) }));
window.addEventListener('unhandledrejection', event => scanLog.event('page-rejection', { message: String(event.reason?.message || 'Unhandled promise rejection').slice(0, 500) }));
$('alphabet').innerHTML = P.alphabet.map(s =>
  `<div><svg viewBox="0 0 1 1" aria-hidden="true"><rect width="1" height="1" fill="white"/>${Alphabet19.svgSymbol(s,0,0)}</svg><span>${s.id} · ${s.name}</span></div>`
  ).join('');
generate();

async function cameraConstraint(change, track = stream?.getVideoTracks()[0]) {
  if (!track || track.readyState === 'ended') throw Error('Camera is not running.');
  const current = track.getConstraints?.() || {};
  const advanced = Object.assign({}, ...(current.advanced || []), change);
  await track.applyConstraints({ ...current, advanced: [advanced] });
}
$('torch').onclick = async () => {
  const token = cameraToken, button = $('torch');
  const enabled = button.getAttribute('aria-pressed') !== 'true';
  button.disabled = true;
  try {
    await cameraConstraint({ torch: enabled });
    if (token !== cameraToken) return;
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Light off' : 'Light on';
  } catch { if (token === cameraToken) $('scan-status').textContent = 'Light control is unavailable on this camera.'; }
  finally { button.disabled = false; }
};
$('zoom').oninput = () => $('zoom-value').textContent = `${Number($('zoom').value).toFixed(1)}×`;
$('zoom').onchange = async () => {
  const token = cameraToken;
  try { await cameraConstraint({ zoom: Number($('zoom').value) }); }
  catch { if (token === cameraToken) $('scan-status').textContent = 'Zoom control is unavailable on this camera.'; }
};
$('print').onclick = () => {
  if (!code) return;
  const width = Number($('print-size').value);
  if (!Number.isFinite(width) || width < 20 || width > 200) {
    $('encode-status').textContent = 'Choose a printed width from 20 to 200 mm.';
    return;
  }
  $('code').style.setProperty('--print-size', `${width}mm`);
  window.print();
};

const payloadExamples = {
  text: 'A message carried by nineteen symbols.',
  json: '{"project":"Prism 19","reading":23.5,"unit":"°C"}',
  calculation: 'sqrt(81) + 2^8 / 4',
  url: 'https://github.com/iSephix/prism',
  contact: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Prism Example\r\nEMAIL:hello@example.com\r\nEND:VCARD\r\n'
};
$('payload-type').onchange = () => {
  fileRequest++; selectedPayload = null; $('payload-file').value = '';
  const type = $('payload-type').value, isFile = ['image', 'audio', 'binary'].includes(type);
  $('text-fields').hidden = isFile; $('payload-file-fields').hidden = !isFile;
  $('image-fit-field').hidden = type !== 'image';
  $('payload-file').accept = type === 'image' ? 'image/*' : type === 'audio' ? 'audio/*' : '';
  $('payload-file-info').textContent = 'Choose a small file, or try a sample.';
  $('payload-hint').textContent = type === 'calculation' ? 'Arithmetic, powers, pi/e and functions such as sqrt, sin, log, min and max. Angles are in radians; calculate after scanning.' :
    type === 'audio' ? 'The audio bytes live inside the code. Use a very short clip; try the sample tone.' :
    type === 'image' ? 'The image lives inside the code. Large images can be resized locally to fit.' :
    type === 'binary' ? 'Stores exact bytes, without Base64. Download the original bytes after scanning.' : '';
  if (!isFile) $('message').value = payloadExamples[type];
  generate();
};
function safeName(name) {
  const chars = Array.from(name.replace(/[\x00-\x1f\x7f/\\]/g, '_'));
  while (new TextEncoder().encode(chars.join('')).length > 120) chars.pop();
  const value = chars.join(''); return !value || value === '.' || value === '..' ? 'payload.bin' : value;
}
async function fitImage(file, limit) {
  const url = URL.createObjectURL(file), image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Could not open this image.')); image.src = url; });
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    let edge = Math.min(256, Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 10; attempt++) {
      const ratio = edge / Math.max(image.naturalWidth, image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .72));
      if (blob && blob.size <= limit) return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg', name: 'image.jpg',
        detail: `Resized to ${canvas.width} × ${canvas.height} pixels` };
      edge *= .78;
    }
    throw Error('This image still does not fit. Try a smaller image or L correction.');
  } finally { URL.revokeObjectURL(url); }
}
$('payload-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  const token = ++fileRequest, type = $('payload-type').value;
  selectedPayload = null; generation++; clearTimeout(timer);
  for (const id of ['svg', 'png', 'decode-generated', 'print']) $(id).disabled = true;
  $('encode-status').textContent = 'Preparing file…';
  try {
    if (file.size > 33554432) throw Error('Choose a file smaller than 32 MiB.');
    const limit = P.capacity({ ecc: $('ecc').value, encrypted: $('encrypt').checked }) - 220;
    let selected;
    if (type === 'image' && $('image-fit').checked && (file.size > limit || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)))
      selected = await fitImage(file, limit);
    else {
      if (file.size > P.capacity({ ecc: $('ecc').value, encrypted: $('encrypt').checked })) throw Error('This file exceeds one code. Use a smaller file or enable image fitting.');
      const extensions = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm' };
      const mimeType = type === 'binary' ? 'application/octet-stream' : type === 'audio' ? extensions[file.name.split('.').pop().toLowerCase()] || file.type : file.type;
      selected = { data: new Uint8Array(await file.arrayBuffer()), name: safeName(file.name), mimeType };
    }
    if (token !== fileRequest) return;
    selectedPayload = selected;
    $('payload-file-info').textContent = `${selected.name} · ${selected.data.length} bytes${selected.detail ? ' · ' + selected.detail : ''}`;
    generate();
  } catch (error) { if (token === fileRequest) { code = null; $('code').replaceChildren(); $('encode-status').textContent = error.message; } }
};
$('sample-payload').onclick = async () => {
  const token = ++fileRequest, type = $('payload-type').value;
  if (type === 'image') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 48, 48);
    const colors = ['#1430e1', '#e02330', '#00bcda', '#ca14a9', '#ee9a0a'];
    for (let i = 0; i < 5; i++) { ctx.fillStyle = colors[i]; ctx.fillRect(4 + i * 8, 4 + i * 6, 7, 40 - i * 6); }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const data = new Uint8Array(await blob.arrayBuffer()); if (token !== fileRequest) return;
    selectedPayload = { data, mimeType: 'image/png', name: 'prism-sample.png' };
  } else if (type === 'audio') {
    const samples = 1200, rate = 8000, data = new Uint8Array(44 + samples), view = new DataView(data.buffer);
    const ascii = (at, text) => Array.from(text).forEach((c, i) => data[at + i] = c.charCodeAt(0));
    ascii(0, 'RIFF'); view.setUint32(4, data.length - 8, true); ascii(8, 'WAVEfmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate, true);
    view.setUint16(32, 1, true); view.setUint16(34, 8, true); ascii(36, 'data'); view.setUint32(40, samples, true);
    for (let i = 0; i < samples; i++) data[44 + i] = Math.round(128 + 36 * Math.sin(i * 2 * Math.PI * 660 / rate) * Math.sin(Math.PI * i / samples));
    selectedPayload = { data, mimeType: 'audio/wav', name: 'prism-tone.wav' };
  } else selectedPayload = { data: Uint8Array.from({ length: 256 }, (_, i) => i), mimeType: 'application/octet-stream', name: 'all-bytes.bin' };
  $('payload-file-info').textContent = `${selectedPayload.name} · ${selectedPayload.data.length} bytes`;
  generate();
};
function clearPayload() {
  recoveredPayload = null;
  if (payloadURL) URL.revokeObjectURL(payloadURL); payloadURL = null;
  $('payload-audio').pause(); $('payload-audio').removeAttribute('src'); $('payload-audio').load();
  $('payload-image').removeAttribute('src');
  for (const id of ['payload-image', 'payload-audio', 'save-payload', 'calculate', 'calculation-result', 'open-link']) $(id).hidden = true;
  $('open-link').removeAttribute('href');
}
function displayPayload(content) {
  clearPayload(); recoveredPayload = content; message = content.text || '';
  $('result').hidden = false; $('result').textContent = content.text ?? `${content.name || content.type} · ${content.data.length} bytes · ${content.mimeType}`;
  $('copy').hidden = content.text === undefined; $('save-payload').hidden = false; $('unlock').hidden = true;
  if (content.type === 'image' || content.type === 'audio') {
    payloadURL = URL.createObjectURL(new Blob([content.data], { type: content.mimeType }));
    const target = $(content.type === 'image' ? 'payload-image' : 'payload-audio'); target.src = payloadURL; target.hidden = false;
  }
  if (content.type === 'calculation') $('calculate').hidden = false;
  if (content.type === 'url') { $('open-link').href = content.text; $('open-link').hidden = false; }
  $('scan-status').textContent = `Recovered ${content.type} · ${content.data.length} content bytes`;
}
$('save-payload').onclick = () => {
  if (!recoveredPayload) return;
  const p = recoveredPayload, ext = { json: 'json', calculation: 'txt', url: 'txt', contact: 'vcf' }[p.type] || 'bin';
  download(new Blob([p.data], { type: p.mimeType }), p.name || `prism-payload.${ext}`);
};
$('calculate').onclick = () => {
  if (recoveredPayload?.type !== 'calculation') return;
  $('calculation-result').hidden = false;
  try { $('calculation-result').textContent = `Result: ${P.evaluateCalculation(recoveredPayload.text)}`; }
  catch (error) { $('calculation-result').textContent = error.message; }
};

for (const id of ['payload-image', 'payload-audio']) $(id).onerror = () => { if (recoveredPayload) $('scan-status').textContent = 'File bytes recovered; this browser could not preview the media. You can still save the file.'; };
