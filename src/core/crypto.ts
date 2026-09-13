const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const K = (() => {
  const table = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
  }
  return table;
})();

const rotl = (x: number, c: number): number => (x << c) | (x >>> (32 - c));

export function md5Hex(input: Uint8Array): string {
  const originalBitLength = input.length * 8;

  const paddedLength = (((input.length + 8) >>> 6) + 1) << 6;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;

  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, originalBitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(originalBitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const chunk = new Uint32Array(16);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) chunk[i] = view.getUint32(offset + i * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const tmp = d;
      d = c;
      c = b;
      const sum = (a + f + K[i]! + chunk[g]!) >>> 0;
      b = (b + rotl(sum, SHIFTS[i]!)) >>> 0;
      a = tmp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);

  let hex = '';
  for (const byte of out) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const triple = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      B64_ALPHABET[(triple >>> 18) & 63]! +
      B64_ALPHABET[(triple >>> 12) & 63]! +
      B64_ALPHABET[(triple >>> 6) & 63]! +
      B64_ALPHABET[triple & 63]!;
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i]! << 16;
    out += B64_ALPHABET[(chunk >>> 18) & 63]! + B64_ALPHABET[(chunk >>> 12) & 63]! + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out +=
      B64_ALPHABET[(chunk >>> 18) & 63]! +
      B64_ALPHABET[(chunk >>> 12) & 63]! +
      B64_ALPHABET[(chunk >>> 6) & 63]! +
      '=';
  }

  return out;
}

const encoder = new TextEncoder();

export const utf8Bytes = (value: string): Uint8Array => encoder.encode(value);

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
