import { createHash, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

export function md5Hex(input: Uint8Array): string {
  return createHash('md5').update(input).digest('hex');
}

export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function utf8Bytes(value: string): Uint8Array {
  return Buffer.from(value, 'utf8');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) return false;

  return nodeTimingSafeEqual(left, right);
}
