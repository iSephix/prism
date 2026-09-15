// SPDX-License-Identifier: Apache-2.0
// Bounded PNG I/O using Node's zlib. Supports non-interlaced, 8-bit PNG only.
'use strict';
const zlib = require('node:zlib'),
  {
    crc32
  } = require('../src/crc32.js');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  MAX_PIXELS = 4194304,
  MAX_FILE = 33554432;

function chunk(type, data) {
  const kind = Buffer.from(type, 'ascii'),
    out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length);
  kind.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 ||
    height > 4096 || width * height > MAX_PIXELS) throw Error(
    'PNG exceeds supported dimensions (4096 per side, 4 megapixels).');
}

function encode(image) {
  const {
    width,
    height,
    data
  } = image;
  dimensions(width, height);
  if (!data || data.length !== width * height * 4) throw Error('Malformed RGBA data.');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (1 + 4 * width));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(
    raw, y * (1 + width * 4) + 1);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, {
    level: 9
  })), chunk('IEND', Buffer.alloc(0))]);
}

function paeth(a, b, c) {
  const p = a + b - c,
    pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decode(input) {
  const file = Buffer.from(input);
  if (file.length > MAX_FILE || file.length < 45 || !file.subarray(0, 8).equals(signature)) throw Error(
    'Expected a PNG file no larger than 32 MiB.');
  let pos = 8,
    width, height, type, channels, palette = null,
    transparency = null,
    ended = false,
    sawData = false,
    dataEnded = false;
  const parts = [];
  while (pos < file.length) {
    if (pos + 12 > file.length) throw Error('Truncated PNG chunk.');
    const length = file.readUInt32BE(pos);
    if (length > MAX_FILE || pos + 12 + length > file.length) throw Error('Invalid PNG chunk length.');
    const name = file.toString('ascii', pos + 4, pos + 8),
      data = file.subarray(pos + 8, pos + 8 + length);
    if (!/^[A-Za-z]{4}$/.test(name) || (file[pos + 6] & 32)) throw Error('Invalid PNG chunk type.');
    if (crc32(file.subarray(pos + 4, pos + 8 + length)) !== file.readUInt32BE(pos + 8 + length)) throw Error(
      'PNG chunk checksum failed.');
    if (pos === 8 && name !== 'IHDR') throw Error('PNG must begin with IHDR.');
    if (sawData && name !== 'IDAT') dataEnded = true;
    if (name === 'IHDR') {
      if (width !== undefined || length !== 13) throw Error('Invalid or repeated PNG header.');
      width = data.readUInt32BE();
      height = data.readUInt32BE(4);
      dimensions(width, height);
      type = data[9];
      channels = {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
      } [type];
      if (data[8] !== 8 || !channels || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw Error(
        'Supported PNG: 8-bit, non-interlaced grayscale, RGB, indexed or RGBA. Use the browser scanner for other image formats.'
        );
    } else if (name === 'PLTE') {
      if (sawData || palette || !length || length % 3 || length > 768 || type === 0 || type === 4)
      throw Error('Invalid PNG palette.');
      palette = Buffer.from(data);
    } else if (name === 'tRNS') {
      if (sawData || transparency) throw Error('Invalid PNG transparency chunk.');
      transparency = Buffer.from(data);
    } else if (name === 'IDAT') {
      if (dataEnded) throw Error('PNG data chunks must be consecutive.');
      parts.push(data);
      sawData = true;
    } else if (name === 'IEND') {
      if (length || !sawData || pos + 12 !== file.length) throw Error('Invalid PNG end.');
      ended = true;
      break;
    } else if (!(file[pos + 4] & 32)) throw Error(`Unsupported critical PNG chunk: ${name}`);
    pos += 12 + length;
  }
  if (!ended || !sawData || (type === 3 && !palette)) throw Error('Incomplete PNG.');
  if (transparency && ((type === 0 && transparency.length !== 2) || (type === 2 && transparency.length !==
      6) || (type === 3 && transparency.length > palette.length / 3) || type === 4 || type === 6))
  throw Error('Invalid PNG transparency data.');
  const stride = width * channels,
    expected = height * (stride + 1),
    raw = zlib.inflateSync(Buffer.concat(parts), {
      maxOutputLength: expected
    });
  if (raw.length !== expected) throw Error('Unexpected PNG decompressed length.');
  const rows = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('Invalid PNG filter.');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0,
        b = y ? rows[(y - 1) * stride + x] : 0,
        c = y && x >= channels ? rows[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      rows[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * channels,
      q = i * 4;
    if (type === 0 || type === 4) {
      rgba[q] = rgba[q + 1] = rgba[q + 2] = rows[p];
      rgba[q + 3] = type === 4 ? rows[p + 1] : transparency && rows[p] === transparency.readUInt16BE() ? 0 :
        255;
    } else if (type === 3) {
      const index = rows[p];
      if (index >= palette.length / 3) throw Error('PNG palette index is out of range.');
      rgba.set(palette.subarray(index * 3, index * 3 + 3), q);
      rgba[q + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    } else {
      rgba[q] = rows[p];
      rgba[q + 1] = rows[p + 1];
      rgba[q + 2] = rows[p + 2];
      rgba[q + 3] = type === 6 ? rows[p + 3] : transparency && rows[p] === transparency.readUInt16BE() &&
        rows[p + 1] === transparency.readUInt16BE(2) && rows[p + 2] === transparency.readUInt16BE(4) ? 0 :
        255;
    }
  }
  return {
    width,
    height,
    data: rgba
  };
}
module.exports = {
  encode,
  decode
};
