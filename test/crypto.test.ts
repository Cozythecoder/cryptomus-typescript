import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base64Encode, md5Hex, timingSafeEqual, utf8Bytes } from '../src/core/crypto.js';

const nodeMd5 = (value: string) => createHash('md5').update(value, 'utf8').digest('hex');

describe('md5Hex', () => {
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      'd174ab98d277d9f5a5611c2c9f419d9f',
    ],
    [
      '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '57edf4a22be3c955ac49da2e2107b67a',
    ],
  ])('matches the RFC 1321 vector for %j', (input, expected) => {
    expect(md5Hex(utf8Bytes(input))).toBe(expected);
  });

  it('agrees with node:crypto across block boundaries', () => {
    for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const input = 'x'.repeat(length);
      expect(md5Hex(utf8Bytes(input)), `length ${length}`).toBe(nodeMd5(input));
    }
  });

  it('agrees with node:crypto on multi-byte UTF-8', () => {
    for (const input of ['héllo', '日本語のテキスト', '🚀🌕', 'ភាសាខ្មែរ', 'Ω≈ç√∫˜µ']) {
      expect(md5Hex(utf8Bytes(input)), input).toBe(nodeMd5(input));
    }
  });

  it('agrees with node:crypto on random payloads', () => {
    for (let i = 0; i < 200; i++) {
      const length = Math.floor(Math.random() * 512);
      let input = '';
      for (let j = 0; j < length; j++) {
        input += String.fromCharCode(32 + Math.floor(Math.random() * 95));
      }
      expect(md5Hex(utf8Bytes(input))).toBe(nodeMd5(input));
    }
  });
});

describe('base64Encode', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes %j', (input, expected) => {
    expect(base64Encode(utf8Bytes(input))).toBe(expected);
  });

  it('agrees with Buffer on JSON payloads and multi-byte text', () => {
    const samples = [
      '{}',
      '{"amount":"15.00","currency":"USD"}',
      '{"note":"ការទូទាត់"}',
      '{"emoji":"🚀"}',
      JSON.stringify({ nested: { deep: [1, 2, 3], flag: true, nothing: null } }),
    ];

    for (const sample of samples) {
      expect(base64Encode(utf8Bytes(sample)), sample).toBe(
        Buffer.from(sample, 'utf8').toString('base64'),
      );
    }
  });

  it('handles every byte value', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('timingSafeEqual', () => {
  it('matches identical strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects differing strings of equal length', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
  });

  it('rejects differing lengths', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
