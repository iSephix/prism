// SPDX-License-Identifier: Apache-2.0
importScripts('../dist/prism19.js');
const session = Prism19.createSession();
self.onmessage = ({
  data
}) => {
  if (data.reset) {
    session.clear();
    return;
  }
  try {
    const options = {
      ...data.options
    };
    if (data.accumulate && data.burst) options.session = session;
    const result = Prism19.scan(data.image, options);
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
