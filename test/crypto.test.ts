import { describe, expect, it } from 'vitest';
import { base64Encode, md5Hex, timingSafeEqual, utf8Bytes } from '../src/core/crypto.js';

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

  it.each([
    ['héllo', '49c748442d6ed40a4de5d9a6e7ba51ce'],
    ['日本語', 'b1fa8b7f5f4f4a34e4a0f5e79a0c14a4'],
  ])('hashes %j as UTF-8 bytes, not latin-1', (input) => {
    expect(md5Hex(utf8Bytes(input))).toBe(md5Hex(Buffer.from(input, 'utf8')));
    expect(md5Hex(utf8Bytes(input))).not.toBe(md5Hex(Buffer.from(input, 'latin1')));
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
  ])('encodes %j per RFC 4648', (input, expected) => {
    expect(base64Encode(utf8Bytes(input))).toBe(expected);
  });

  it('encodes the bodies Cryptomus actually signs', () => {
    expect(base64Encode(utf8Bytes('{}'))).toBe('e30=');
    expect(base64Encode(utf8Bytes('{"amount":"15.00"}'))).toBe('eyJhbW91bnQiOiIxNS4wMCJ9');
  });

  it('handles every byte value', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('utf8Bytes', () => {
  it('produces UTF-8, not UTF-16', () => {
    expect([...utf8Bytes('é')]).toEqual([0xc3, 0xa9]);
    expect([...utf8Bytes('🚀')]).toEqual([0xf0, 0x9f, 0x9a, 0x80]);
    expect([...utf8Bytes('ក')]).toEqual([0xe1, 0x9e, 0x80]);
  });
});

describe('timingSafeEqual', () => {
  it('matches identical strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects differing strings of equal length', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
  });

  it('rejects differing lengths without throwing', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });

  it('rejects equal-length strings whose byte lengths differ', () => {
    expect(timingSafeEqual('é', 'a')).toBe(false);
  });
});
