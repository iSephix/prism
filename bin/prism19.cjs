#!/usr/bin/env node
 // SPDX-License-Identifier: Apache-2.0
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  P = require('../index.cjs'),
  PNG = require('./png.cjs');
const help = `Prism 19 ${P.version} — optical format ${P.wireVersion}

  prism19 encode --text "Hello" --out code.svg
  prism19 encode --input message.txt --out code.png --ecc Q --scale 12
  prism19 encode --text "Secret" --encrypt --passphrase-file key.txt --out code.png
  prism19 decode --input code.png
  prism19 decode --input code.png --passphrase-file key.txt
  prism19 decode --input matrix.json --json

Input/output '-' means stdin/stdout. Encode formats: svg, png, json (matrix).
--format overrides the output extension; default is svg. --force allows overwrite.
PNG input supports 8-bit non-interlaced images; use the browser demo for JPEG/other PNGs.
Passphrase files contain UTF-8 text; one final LF or CRLF is removed. No password argv option.
Exit codes: 0 success, 1 invalid input/I/O/authentication, 2 no complete code, 3 encrypted code needs passphrase.
`;

function read(file, limit) {
  const fd = file === '-' ? 0 : fs.openSync(file, 'r'),
    chunks = [];
  let length = 0;
  try {
    while (true) {
      const buffer = Buffer.alloc(65536),
        n = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      length += n;
      if (length > limit) throw Error('Input exceeds its size limit.');
      chunks.push(buffer.subarray(0, n));
    }
  } finally {
    if (fd !== 0) fs.closeSync(fd);
  }
  return Buffer.concat(chunks, length);
}

function utf8(bytes) {
  return new TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: true
  }).decode(bytes);
}

function write(file, data, force) {
  if (file === '-') process.stdout.write(data);
  else fs.writeFileSync(file, data, {
    flag: force ? 'w' : 'wx'
  });
}
async function main() {
  const args = process.argv.slice(2),
    command = args.shift(),
    options = {};
  if (!command || ['--help', '-h', 'help'].includes(command)) {
    process.stdout.write(help);
    return;
  }
  if (command === '--version') {
    console.log(P.version);
    return;
  }
  const switches = new Set(['encrypt', 'json', 'force']),
    values = new Set(['text', 'input', 'out', 'ecc', 'scale', 'format', 'passphrase-file']);
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith('--')) throw Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (Object.hasOwn(options, key)) throw Error(`Repeated option: ${token}`);
    if (switches.has(key)) options[key] = true;
    else if (values.has(key)) {
      if (!args.length) throw Error(`Missing value: ${token}`);
      options[key] = args.shift();
    } else throw Error(`Unknown option: ${token}`);
  }
  if (!['encode', 'decode'].includes(command)) throw Error('Command must be encode or decode.');
  let passphrase;
  if (options['passphrase-file']) passphrase = utf8(read(options['passphrase-file'], 8192)).replace(
    /\r?\n$/, '');
  if (command === 'encode') {
    if (options.text !== undefined && options.input !== undefined) throw Error('Choose --text or --input.');
    if (options.text === undefined && options.input === undefined) throw Error(
      'Provide --text or --input (- for stdin).');
    if (options.encrypt && !options['passphrase-file']) throw Error(
    '--encrypt requires --passphrase-file.');
    if (options['passphrase-file'] && !options.encrypt) throw Error(
      '--passphrase-file requires --encrypt when encoding.');
    const text = options.text === undefined ? utf8(read(options.input, 4800)) : options.text,
      ecc = options.ecc || 'Q';
    const code = options.encrypt ? await P.encodeEncrypted(text, passphrase, {
      ecc
    }) : P.encode(text, {
      ecc
    });
    const out = options.out || '-',
      format = options.format || path.extname(out).slice(1).toLowerCase() || 'svg',
      scale = options.scale === undefined ? 12 : Number(options.scale);
    let encoded;
    if (format === 'svg') encoded = P.toSVG(code, scale) + '\n';
    else if (format === 'png') encoded = PNG.encode(P.toRGBA(code, scale));
    else if (format === 'json') encoded = JSON.stringify({
      format: 'prism19-matrix',
      wireVersion: 2,
      matrix: P.toMatrix(code)
    }, null, 2) + '\n';
    else throw Error('Output format must be svg, png or json.');
    write(out, encoded, options.force);
  } else {
    if (options.text !== undefined || options.encrypt || options.ecc !== undefined || options.scale !==
      undefined || options.format !== undefined) throw Error(
    'Encoding options are not accepted by decode.');
    if (!options.input) throw Error('Provide --input (- for stdin).');
    const input = read(options.input, 33554432);
    let result;
    if (input[0] === 137) result = P.scan(PNG.decode(input));
    else {
      if (input.length > 1048576) throw Error('Matrix JSON exceeds 1 MiB.');
      const data = JSON.parse(utf8(input));
      if (data.format !== 'prism19-matrix' || data.wireVersion !== 2) throw Error(
        'Unsupported matrix document.');
      result = P.decodeMatrix(data.matrix);
    }
    if (result.kind === 'none' || result.kind === 'partial19') {
      if (options.json) write(options.out || '-', JSON.stringify(result) + '\n', options.force);
      else process.stderr.write('No complete Prism 19 message found.\n');
      process.exitCode = 2;
      return;
    }
    if (result.kind === 'encrypted' && passphrase !== undefined) result = {
      ...result,
      kind: 'prism19',
      text: await P.decrypt(Uint8Array.from(result.envelope), passphrase),
      authenticated: true
    };
    if (result.kind === 'encrypted' && !options.json) {
      process.stderr.write('Encrypted message recovered; provide --passphrase-file to decrypt.\n');
      process.exitCode = 3;
      return;
    }
    write(options.out || '-', options.json ? JSON.stringify(result) + '\n' : result.text + '\n', options
      .force);
  }
}
main().catch(error => {
  process.stderr.write(`prism19: ${error.message}\n`);
  process.exitCode = 1;
});
