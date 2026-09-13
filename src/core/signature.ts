import { base64Encode, md5Hex, timingSafeEqual, utf8Bytes } from './crypto.js';

export function phpJsonEncode(value: unknown): string {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new TypeError('Value is not JSON-serialisable and cannot be signed.');
  }

  let out = '';

  for (let i = 0; i < json.length; i++) {
    const char = json[i]!;
    const code = json.charCodeAt(i);

    if (char === '/') {
      out += '\\/';
    } else if (code > 0x7f) {
      out += '\\u' + code.toString(16).padStart(4, '0');
    } else {
      out += char;
    }
  }

  return out;
}

export function signPayload(body: string, apiKey: string): string {
  const base64 = base64Encode(utf8Bytes(body));
  return md5Hex(utf8Bytes(base64 + apiKey));
}

export function signValue(value: unknown, apiKey: string): { body: string; signature: string } {
  const body = value === undefined || value === null ? '' : phpJsonEncode(value);
  return { body, signature: signPayload(body, apiKey) };
}

const SIGN_MEMBER = /,?\s*"sign"\s*:\s*"([^"\\]*)"\s*,?/;

export function verifyWebhookSignature(
  rawBody: string,
  apiKey: string,
  providedSignature?: string,
): boolean {
  let signature = providedSignature;
  let payload = rawBody;

  const match = SIGN_MEMBER.exec(rawBody);

  if (match) {
    if (!signature) signature = match[1];
    payload = stripSignMember(rawBody, match);
  }

  if (!signature) return false;

  return timingSafeEqual(signPayload(payload, apiKey), signature.toLowerCase());
}

function stripSignMember(rawBody: string, match: RegExpExecArray): string {
  const start = match.index;
  const end = start + match[0].length;
  const before = rawBody.slice(0, start);
  const after = rawBody.slice(end);

  const hadLeadingComma = match[0].startsWith(',');
  const hadTrailingComma = match[0].trimEnd().endsWith(',');

  if (hadLeadingComma && hadTrailingComma) return `${before},${after}`;

  return before + after;
}

export function verifyWebhookObject(
  payload: Record<string, unknown>,
  apiKey: string,
  providedSignature?: string,
): boolean {
  const { sign, ...rest } = payload as { sign?: unknown } & Record<string, unknown>;
  const signature = providedSignature ?? (typeof sign === 'string' ? sign : undefined);

  if (!signature) return false;

  return timingSafeEqual(signPayload(phpJsonEncode(rest), apiKey), signature.toLowerCase());
}
