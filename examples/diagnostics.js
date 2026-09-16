// SPDX-License-Identifier: Apache-2.0
// Bounded, device-local scan evidence. No network calls or decoded content.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrismScanLog = factory();
})(globalThis, function() {
  'use strict';
  function create(version, environment = {}) {
    let events = [], frames = [], attempts = 0, startedAt = new Date().toISOString();
    const start = Date.now();
    function event(type, fields = {}) {
      const entry = { at: Date.now() - start, type, ...fields };
      events.push(entry);
      if (events.length > 160) events.shift();
      return entry;
    }
    function capture(id, image, metadata, includeImage) {
      attempts++;
      event('capture', { id, width: image.width, height: image.height, ...metadata });
      if (!includeImage) return;
      const pixels = image.width * image.height;
      if (pixels > 4194304) return;
      frames.push({ id, width: image.width, height: image.height, metadata,
        data: new Uint8ClampedArray(image.data) });
      while (frames.length > 3 || frames.reduce((sum, f) => sum + f.width * f.height, 0) > 4194304) frames.shift();
    }
    function result(id, value, extra) {
      // Deliberately allowlist metadata: never include text, envelope or payload.
      const fields = { id };
      for (const key of ['kind', 'mode', 'ms', 'timedOut', 'grid', 'decoder', 'corrected', 'repaired', 'equations'])
        if (['string', 'number', 'boolean'].includes(typeof value?.[key])) fields[key] = value[key];
      if (Number.isInteger(value?.frames)) fields.frames = value.frames;
      if (value?.diagnostics) fields.stages = value.diagnostics;
      if (extra) fields.worker = extra;
      event('result', fields);
    }
    return { event, capture, result,
      clearFrames() { frames = []; },
      counts: () => ({ attempts, frames: frames.length, events: events.length }),
      report(encode, includeImages = true, note = '') {
        return { schema: 'prism-scan-report', schemaVersion: 1, decoderVersion: version,
          startedAt, exportedAt: new Date().toISOString(), environment, attempts,
          note: String(note).slice(0, 2000), events: events.slice(),
          frames: includeImages ? frames.map(f => ({ id: f.id, width: f.width, height: f.height,
            metadata: f.metadata, encoding: 'png', data: encode(f) })) : [] };
      }
    };
  }
  return { create };
});
