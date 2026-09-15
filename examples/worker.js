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
    const options = {
      ...data.options
    };
    if (data.accumulate && data.burst) options.session = session;
    const start = performance.now();
    let result = Prism19.scan(data.image, options);
    if (result.kind === 'none' && legacyCodec) {
      result = legacyCodec.scan(data.image, { mode: 'auto' });
      if (data.accumulate && data.burst) result = legacySession.accept(result);
      result.ms = performance.now() - start;
    }
    self.postMessage({
      id: data.id,
      result
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error.message
    });
  }
};
