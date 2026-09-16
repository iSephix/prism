// SPDX-License-Identifier: Apache-2.0
importScripts('../dist/prism19.js');
const session = Prism19.createSession();
// A host may preload the original Prism 4/8 + QR decoder for its older prints.
// It is separate from the Prism 19 package and never changes its wire formats.
const legacyCodec = globalThis.Prism;
const legacySession = legacyCodec?.accumulator();
self.onmessage = ({
  data
}) => {
  if (data.reset) {
    session.clear();
    legacySession?.clear();
    return;
  }
  try {
    if (data.options?.diagnostics) self.postMessage({ id: data.id, progress: 'decoding', version: Prism19.version });
    const options = {
      ...data.options
    };
    if (data.accumulate && data.burst) options.session = session;
    const start = performance.now();
    let result = Prism19.scan(data.image, options);
    const diagnostics = { version: Prism19.version, prismKind: result.kind,
      prismMs: performance.now() - start, prism: result.diagnostics, timedOut: !!result.timedOut };
    if (result.kind === 'none' && legacyCodec) {
      if (options.diagnostics) self.postMessage({ id: data.id, progress: 'legacy', version: Prism19.version });
      const legacyStart = performance.now();
      result = legacyCodec.scan(data.image, { mode: 'auto' });
      if (data.accumulate && data.burst) result = legacySession.accept(result);
      result.ms = performance.now() - start;
      diagnostics.legacyMs = performance.now() - legacyStart;
      diagnostics.legacyKind = result.kind;
    }
    self.postMessage({
      id: data.id,
      result, diagnostics
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error.message
    });
  }
};
