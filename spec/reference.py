#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Independent, standard-library-only format encoder and pristine-matrix reader.
# This does not implement optical detection or error-correcting decoding.
import argparse
import json
import sys
import zlib

Q, MASK = 19, 0xFFFFFFFF
LEVELS = {'L': 15, 'M': 13, 'Q': 11, 'H': 9}


def random32(seed):
    state = seed & MASK
    while True:
        state ^= (state << 13) & MASK
        state ^= state >> 17
        state ^= (state << 5) & MASK
        state &= MASK
        yield state


def radix_length(byte_count):
    capacity, digits = 1, 0
    while capacity < 256 ** byte_count:
        capacity *= Q
        digits += 1
    return digits


def radix(data, count=None):
    count = radix_length(len(data)) if count is None else count
    value = int.from_bytes(data, 'little')
    out = []
    for _ in range(count):
        value, digit = divmod(value, Q)
        out.append(digit)
    if value:
        raise ValueError('Radix overflow')
    return out


def unradix(digits, byte_count):
    value = 0
    for digit in reversed(digits):
        if type(digit) is not int or not 0 <= digit < Q:
            raise ValueError('Invalid digit')
        value = value * Q + digit
    return value.to_bytes(byte_count, 'little')


def solve(matrix, values):
    n = len(values)
    rows = [[v % Q for v in row] + [rhs % Q] for row, rhs in zip(matrix, values)]
    for column in range(n):
        pivot = next(i for i in range(column, n) if rows[i][column])
        rows[column], rows[pivot] = rows[pivot], rows[column]
        factor = pow(rows[column][column], Q - 2, Q)
        rows[column] = [(v * factor) % Q for v in rows[column]]
        for i in range(n):
            if i != column:
                factor = rows[i][column]
                rows[i] = [(a - factor * b) % Q for a, b in zip(rows[i], rows[column])]
    return [row[-1] for row in rows]


def rs(data):
    # Derive polynomial coefficients by solving a Vandermonde system, independent
    # of the JS encoder's cached Lagrange generator matrices.
    k = len(data)
    coefficients = solve([[pow(x, j, Q) for j in range(k)] for x in range(k)], data)
    return [sum(c * pow(x, j, Q) for j, c in enumerate(coefficients)) % Q for x in range(Q)]


def layout(n):
    if type(n) is not int or n < 25 or n > 145 or (n - 25) % 4:
        raise ValueError('Invalid grid side')
    grid = [[None] * n for _ in range(n)]

    def rect(x, y, w, h, value):
        for yy in range(max(0, y), min(n, y + h)):
            for xx in range(max(0, x), min(n, x + w)):
                grid[yy][xx] = value

    for x, y in [(0, 0), (n - 7, 0), (0, n - 7)]:
        rect(x - 1, y - 1, 9, 9, -2)
        for dy in range(7):
            for dx in range(7):
                grid[y + dy][x + dx] = -1 if dx in (0, 6) or dy in (0, 6) or 2 <= dx <= 4 and 2 <= dy <= 4 else -2
    for i in range(8, n - 8):
        grid[6][i] = grid[i][6] = -1 if i % 2 == 0 else -2
    rect(n - 10, n - 10, 7, 7, -2)
    for y in range(5):
        for x in range(5):
            grid[n - 9 + y][n - 9 + x] = -1 if x in (0, 4) or y in (0, 4) or x == y == 2 else -2
    free = [y * n + x for y in range(n) for x in range(n) if grid[y][x] is None]
    rng = random32(0x1951A7 ^ n)
    for i in range(len(free) - 1, 0, -1):
        j = (next(rng) * (i + 1)) >> 32
        free[i], free[j] = free[j], free[i]
    return grid, free[:38], free[38:]


def equation(e, blocks, k):
    column = e % k
    rng = random32(0x51ED19 ^ (((e + 1) * 0x9E3779B1) & MASK) ^ blocks)
    selected = [(e // k) % blocks]
    while len(selected) < min(blocks, 7):
        block = (next(rng) * blocks) >> 32
        if block not in selected:
            selected.append(block)
    return [(block * k + column, 1 + ((next(rng) * 18) >> 32)) for block in selected]


def header(payload, k, flags, wire_version=2):
    prefix = b'PN' + bytes([wire_version, k, flags, 1]) + len(payload).to_bytes(2, 'big') + zlib.crc32(payload).to_bytes(4, 'big')
    return prefix + zlib.crc32(prefix).to_bytes(4, 'big')


def capacity(k, n=145):
    slots = layout(n)[2]
    field_digits = ((len(slots) - 76) // 19) * k
    return (pow(19, field_digits).bit_length() - 1) // 8


def encode(text, ecc='Q', envelope=None, *, raw_payload=None, flags=None, wire_version=None):
    payload = bytes(raw_payload) if raw_payload is not None else text.encode('utf-8') if envelope is None else bytes(envelope)
    flags = (int(envelope is not None) if flags is None else flags)
    encrypted, typed = bool(flags & 1), bool(flags & 2)
    legacy_limit = 1244 if encrypted else 1200
    wire_version = wire_version or (3 if typed or len(payload) > legacy_limit else 2)
    if ecc not in LEVELS or wire_version not in (2, 3) or flags not in range(2 if wire_version == 2 else 4):
        raise ValueError('Unsupported format, flags or correction level')
    k = LEVELS[ecc]
    minimum = (44 if encrypted else 0) + (4 if typed else 1)
    if not minimum <= len(payload) <= (legacy_limit if wire_version == 2 else capacity(k)):
        raise ValueError('Unsupported payload length')
    digits = radix(payload)
    blocks = (len(digits) + k - 1) // k
    padded = digits + [0] * (blocks * k - len(digits))
    n = 25
    while True:
        grid, pilots, slots = layout(n)
        if len(slots) >= 76 + blocks * 19:
            break
        n += 4

    def set_cell(cell, symbol):
        grid[cell // n][cell % n] = symbol

    for i, cell in enumerate(pilots):
        set_cell(cell, i % 19)
    raw_header = header(payload, k, flags, wire_version)
    header_digits = radix(raw_header, 36)
    header_words = [rs(header_digits[i:i + 9]) for i in range(0, 36, 9)]
    for j in range(19):
        for b in range(4):
            set_cell(slots[j * 4 + b], header_words[b][j])
    words = [rs(padded[i:i + k]) for i in range(0, len(padded), k)]
    for j in range(19):
        for b in range(blocks):
            set_cell(slots[76 + j * blocks + b], words[b][j])
    start = 76 + blocks * 19
    for e, cell in enumerate(slots[start:]):
        set_cell(cell, sum(padded[i] * coefficient for i, coefficient in equation(e, blocks, k)) % Q)
    return {'matrix': grid, 'headerHex': raw_header.hex(), 'payloadHex': payload.hex(), 'n': n, 'k': k, 'blocks': blocks, 'repairCount': len(slots) - start}


def decode_pristine(matrix):
    n = len(matrix)
    fixed, pilots, slots = layout(n)
    if any(len(row) != n for row in matrix):
        raise ValueError('Not square')
    for y in range(n):
        for x in range(n):
            v = matrix[y][x]
            if type(v) is not int or (fixed[y][x] is not None and v != fixed[y][x]) or (fixed[y][x] is None and not 0 <= v < 19):
                raise ValueError('Invalid matrix symbol')
    get = lambda i: matrix[i // n][i % n]
    if any(get(cell) != i % 19 for i, cell in enumerate(pilots)):
        raise ValueError('Pilot mismatch')
    header_digits = []
    for b in range(4):
        word = [get(slots[j * 4 + b]) for j in range(19)]
        if rs(word[:9]) != word:
            raise ValueError('Header parity mismatch')
        header_digits.extend(word[:9])
    raw = unradix(header_digits, 16)
    if raw[:2] != b'PN' or raw[2] not in (2, 3) or raw[3] not in LEVELS.values() or raw[4] not in range(2 if raw[2] == 2 else 4) or raw[5] != 1 or zlib.crc32(raw[:12]) != int.from_bytes(raw[12:], 'big'):
        raise ValueError('Header invalid')
    k, encrypted, typed, length = raw[3], bool(raw[4] & 1), bool(raw[4] & 2), int.from_bytes(raw[6:8], 'big')
    minimum = (44 if encrypted else 0) + (4 if typed else 1)
    maximum = (1244 if encrypted else 1200) if raw[2] == 2 else capacity(k, n)
    if not minimum <= length <= maximum:
        raise ValueError('Length invalid')
    count, digits = radix_length(length), []
    blocks = (count + k - 1) // k
    if 76 + blocks * 19 > len(slots):
        raise ValueError('Body exceeds grid')
    for b in range(blocks):
        word = [get(slots[76 + j * blocks + b]) for j in range(19)]
        if rs(word[:k]) != word:
            raise ValueError('Body parity mismatch')
        digits.extend(word[:k])
    if any(digits[count:]):
        raise ValueError('Nonzero padding')
    payload = unradix(digits[:count], length)
    if zlib.crc32(payload) != int.from_bytes(raw[8:12], 'big'):
        raise ValueError('Payload checksum mismatch')
    for e, cell in enumerate(slots[76 + blocks * 19:]):
        if get(cell) != sum(digits[i] * coefficient for i, coefficient in equation(e, blocks, k)) % 19:
            raise ValueError('Repair equation mismatch')
    return payload if encrypted or typed else payload.decode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', metavar='VECTORS_JSON')
    parser.add_argument('--text')
    parser.add_argument('--ecc', choices=LEVELS, default='Q')
    args = parser.parse_args()
    if args.verify:
        with open(args.verify, encoding='utf-8') as file:
            vectors = json.load(file)['vectors']
        for vector in vectors:
            envelope = bytes.fromhex(vector['envelopeHex']) if vector.get('encrypted') else None
            actual = encode(vector['text'], vector['ecc'], envelope,
                            raw_payload=bytes.fromhex(vector['payloadHex']) if vector.get('typed') else None,
                            flags=vector.get('flags'), wire_version=vector.get('wireVersion'))
            for key in ['matrix', 'headerHex', 'payloadHex', 'n', 'k', 'blocks', 'repairCount']:
                if actual[key] != vector[key]:
                    raise AssertionError(f"{vector['name']}: mismatch in {key}")
            if decode_pristine(vector['matrix']) != (bytes.fromhex(vector['payloadHex']) if vector.get('typed') else envelope if envelope is not None else vector['text']):
                raise AssertionError('Independent matrix decoding failed')
        print(f'PASS: {len(vectors)} independent Python encoder/matrix-reader vectors.')
    elif args.text is not None:
        print(json.dumps({'format': 'prism19-matrix', 'wireVersion': 3 if len(args.text.encode('utf-8')) > 1200 else 2, 'matrix': encode(args.text, args.ecc)['matrix']}))
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
