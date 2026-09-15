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
  message = '';
const pending = new Map(),
  options = () => Object.fromEntries(['soft', 'equations', 'spatial', 'refine'].map(k => [k, $(k).checked]));

function getWorker() {
  if (worker) return worker;
  worker = new Worker('worker.js');
  worker.onmessage = ({
    data
  }) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    clearTimeout(p.timeout);
    data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
  };
  worker.onerror = () => {
    for (const p of pending.values()) { clearTimeout(p.timeout); p.reject(Error('Decoder worker failed. Please retry.')); }
    pending.clear();
    worker.terminate();
    worker = null;
  };
  return worker;
}

function decode(image, accumulate = false, frameId, maxTimeMs = 2200) {
  return new Promise((resolve, reject) => {
    const id = ++request;
    try {
      const w = getWorker();
      pending.set(id, {
        resolve,
        reject,
        timeout: setTimeout(() => cancelWorker('This image took too long. Try another frame.'), 8000)
      });
      w.postMessage({
        id,
        image,
        options: { ...options(), frameId, maxTimeMs },
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
  const token = ++generation,
    text = $('message').value;
  $('byte-count').textContent = `${new TextEncoder().encode(text).length} / 1200 B`;
  $('password-field').hidden = !$('encrypt').checked;
  for (const id of ['svg', 'png', 'decode-generated', 'print']) $(id).disabled = true;
  $('encode-status').textContent = $('encrypt').checked ? 'Encrypting locally…' : '';
  try {
    const result = $('encrypt').checked ? await P.encodeEncrypted(text, $('password').value, {
      ecc: $('ecc').value
    }) : P.encode(text, {
      ecc: $('ecc').value
    });
    if (token !== generation) return;
    code = result;
    $('code').innerHTML = P.toSVG(code);
    $('code-meta').textContent =
      `${code.n} × ${code.n} cells · RS(19,${code.k}) · ${code.repairCount} extra recovery equations${code.encrypted?' · encrypted':''}`;
    $('encode-status').textContent = '';
    for (const id of ['svg', 'png', 'decode-generated', 'print']) $(id).disabled = false;
  } catch (error) {
    if (token !== generation) return;
    code = null;
    $('code').replaceChildren();
    $('code-meta').textContent = '';
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
  const image = P.toRGBA(code, Number($('scale').value)),
    canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  canvas.toBlob(blob => {
    if (blob) download(blob, 'prism19.png');
  }, 'image/png');
};

function clear() {
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
  if (result.kind === 'encrypted') {
    locked = result;
    $('unlock').hidden = false;
    $('scan-status').textContent = 'Encrypted bytes recovered. Enter the passphrase.';
    return true;
  }
  message = result.text;
  $('result').textContent = message;
  $('result').hidden = false;
  $('copy').hidden = false;
  $('unlock').hidden = true;
  $('scan-status').textContent =
    `Message recovered · ${Math.round(result.ms)} ms · ${result.frames} frame(s)`;
  return true;
}

function cancelWorker(reason = 'Scan cancelled.') {
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
  $('camera-idle').hidden = !$('photo').hidden;
}
async function still(image) {
  stop();
  clear();
  const token = cameraToken;
  $('photo').width = image.width;
  $('photo').height = image.height;
  $('photo').getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  $('photo').hidden = false;
  $('camera-idle').hidden = true;
  $('scan-status').textContent = 'Reading image…';
  try {
    const result = await decode(image);
    if (token === cameraToken) display(result);
  } catch (error) {
    if (token === cameraToken) $('scan-status').textContent = error.message;
  }
}
$('decode-generated').onclick = () => {
  if (code) still(P.toRGBA(code));
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
  $('photo').hidden = true;
  $('camera-idle').hidden = false;
  $('start').disabled = true;
  $('scan-status').textContent = 'Opening camera…';
  try {
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error(
      'Open this demo over HTTPS (or localhost), or choose an image.');
    const acquired = await navigator.mediaDevices.getUserMedia({
      video: {
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
    await $('video').play();
    if (token !== cameraToken) return;
    $('video').hidden = false;
    $('camera-idle').hidden = true;
    $('stop').hidden = false;
    $('scan-status').textContent = 'Keep the complete code in view.';
    getWorker().postMessage({
      reset: true
    });
    const track = stream.getVideoTracks()[0];
    let caps = {};
    try { caps = track.getCapabilities?.() || {}; } catch { /* Optional hardware controls. */ }
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
    let lastTime = -1, captured = 0;
    const schedule = () => {
      if (token !== cameraToken || !stream) return;
      if (typeof $('video').requestVideoFrameCallback === 'function')
        frameCallback = $('video').requestVideoFrameCallback(tick);
      else scanTimer = setTimeout(tick, 40);
    };
    const tick = async (_now, metadata) => {
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
      const deep = ++captured % 6 === 0;
      const scale = Math.min(1, (deep ? 1600 : 1120) / Math.max(v.videoWidth, v.videoHeight));
      const width = Math.round(v.videoWidth * scale), height = Math.round(v.videoHeight * scale);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const input = ctx.getImageData(0, 0, canvas.width, canvas.height),
        snapshot = new Uint8ClampedArray(input.data);
      try {
        const result = await decode(input, true, captured, deep ? 1000 : 250);
        if (token !== cameraToken) return;
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
          $('scan-status').textContent = error.message;
          stop();
        }
        return;
      }
      schedule();
    };
    schedule();
  } catch (error) {
    if (token === cameraToken) {
      stop();
      $('scan-status').textContent = error.message;
    }
  }
};
$('stop').onclick = () => {
  stop();
  $('scan-status').textContent = 'Camera stopped.';
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
    const text = await P.decrypt(Uint8Array.from(saved.envelope), $('decode-password').value);
    if (locked !== saved) return;
    $('decode-password').value = '';
    locked = null;
    display({
      ...saved,
      kind: 'prism19',
      text
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
});
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
