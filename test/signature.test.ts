import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  phpJsonEncode,
  signPayload,
  signValue,
  verifyWebhookObject,
  verifyWebhookSignature,
} from '../src/core/signature.js';

const API_KEY = 'test-payment-api-key';

const referenceSign = (body: string, key: string) =>
  createHash('md5')
    .update(Buffer.from(body, 'utf8').toString('base64') + key, 'utf8')
    .digest('hex');

describe('phpJsonEncode', () => {
  it('escapes forward slashes the way PHP does', () => {
    expect(phpJsonEncode({ url: 'https://a.test/x' })).toBe('{"url":"https:\\/\\/a.test\\/x"}');
  });

  it('escapes non-ASCII as lowercase \\uXXXX', () => {
    expect(phpJsonEncode({ note: 'héllo' })).toBe('{"note":"h\\u00e9llo"}');
    expect(phpJsonEncode({ note: '日本' })).toBe('{"note":"\\u65e5\\u672c"}');
  });

  it('emits surrogate pairs as two escapes, like PHP', () => {
    expect(phpJsonEncode({ e: '🚀' })).toBe('{"e":"\\ud83d\\ude80"}');
  });

  it('handles Khmer script', () => {
    expect(phpJsonEncode({ t: 'ខ្មែរ' })).toBe('{"t":"\\u1781\\u17d2\\u1798\\u17c2\\u179a"}');
  });

  it('leaves plain ASCII untouched', () => {
    expect(phpJsonEncode({ amount: '15.00', currency: 'USD' })).toBe(
      '{"amount":"15.00","currency":"USD"}',
    );
  });

  it('preserves structure for nested values and arrays', () => {
    expect(phpJsonEncode({ currencies: [{ currency: 'USDT', network: 'tron' }] })).toBe(
      '{"currencies":[{"currency":"USDT","network":"tron"}]}',
    );
  });

  it('throws on values JSON cannot represent', () => {
    expect(() => phpJsonEncode(undefined)).toThrow(TypeError);
  });
});

describe('signPayload', () => {
  it('implements md5(base64(body) + apiKey)', () => {
    const body = '{"amount":"15.00","currency":"USD","order_id":"order-1"}';
    expect(signPayload(body, API_KEY)).toBe(referenceSign(body, API_KEY));
  });

  it('signs an empty body as md5(base64("") + apiKey)', () => {
    expect(signPayload('', API_KEY)).toBe(createHash('md5').update(API_KEY, 'utf8').digest('hex'));
  });

  it('changes when the key changes', () => {
    expect(signPayload('{}', 'key-a')).not.toBe(signPayload('{}', 'key-b'));
  });

  it('changes when a single byte of the body changes', () => {
    expect(signPayload('{"a":"1"}', API_KEY)).not.toBe(signPayload('{"a":"2"}', API_KEY));
  });
});

describe('signValue', () => {
  it('returns the exact body that was signed', () => {
    const { body, signature } = signValue({ url_callback: 'https://a.test/hook' }, API_KEY);

    expect(body).toBe('{"url_callback":"https:\\/\\/a.test\\/hook"}');
    expect(signature).toBe(referenceSign(body, API_KEY));
  });

  it('treats null and undefined as an empty body', () => {
    expect(signValue(undefined, API_KEY).body).toBe('');
    expect(signValue(null, API_KEY).body).toBe('');
  });

  it('signs an empty object as {}', () => {
    expect(signValue({}, API_KEY).body).toBe('{}');
  });
});

describe('verifyWebhookSignature', () => {
  function buildWebhook(fields: Record<string, unknown>, key = API_KEY, signAt: 'end' | 'start' | 'middle' = 'end') {
    const body = phpJsonEncode(fields);
    const sign = signPayload(body, key);
    const inner = body.slice(1, -1);

    if (signAt === 'start') return `{"sign":"${sign}",${inner}}`;
    if (signAt === 'middle') {
      const parts = inner.split(',');
      const at = Math.floor(parts.length / 2);
      return `{${parts.slice(0, at).join(',')},"sign":"${sign}",${parts.slice(at).join(',')}}`;
    }
    return `{${inner},"sign":"${sign}"}`;
  }

  const payload = {
    type: 'payment',
    uuid: '8b03432e-385b-4670-8d06-064591096795',
    order_id: 'order-1024',
    amount: '19.99',
    status: 'paid',
    url: 'https://pay.cryptomus.com/pay/8b03432e',
    is_final: true,
  };

  it('accepts a genuine webhook with sign at the end', () => {
    expect(verifyWebhookSignature(buildWebhook(payload), API_KEY)).toBe(true);
  });

  it('accepts a genuine webhook with sign at the start', () => {
    expect(verifyWebhookSignature(buildWebhook(payload, API_KEY, 'start'), API_KEY)).toBe(true);
  });

  it('accepts a genuine webhook with sign in the middle', () => {
    expect(verifyWebhookSignature(buildWebhook(payload, API_KEY, 'middle'), API_KEY)).toBe(true);
  });

  it('rejects a tampered amount', () => {
    const body = buildWebhook(payload).replace('"19.99"', '"1999.00"');
    expect(verifyWebhookSignature(body, API_KEY)).toBe(false);
  });

  it('rejects a webhook signed with a different key', () => {
    expect(verifyWebhookSignature(buildWebhook(payload, 'someone-elses-key'), API_KEY)).toBe(false);
  });

  it('rejects a body with no sign field', () => {
    expect(verifyWebhookSignature(phpJsonEncode(payload), API_KEY)).toBe(false);
  });

  it('verifies payloads containing escaped URLs, which is the common failure', () => {
    const withUrls = {
      ...payload,
      url_callback: 'https://merchant.test/api/cryptomus/webhook',
      url_success: 'https://merchant.test/checkout/success',
    };
    expect(verifyWebhookSignature(buildWebhook(withUrls), API_KEY)).toBe(true);
  });

  it('verifies payloads containing non-ASCII text', () => {
    const withUnicode = { ...payload, additional_data: 'ការទូទាត់ · héllo · 🚀' };
    expect(verifyWebhookSignature(buildWebhook(withUnicode), API_KEY)).toBe(true);
  });

  it('accepts an explicitly supplied signature over a body with none', () => {
    const body = phpJsonEncode(payload);
    expect(verifyWebhookSignature(body, API_KEY, signPayload(body, API_KEY))).toBe(true);
  });

  it('accepts an uppercase signature', () => {
    const body = phpJsonEncode(payload);
    const upper = signPayload(body, API_KEY).toUpperCase();
    expect(verifyWebhookSignature(body, API_KEY, upper)).toBe(true);
  });
});

describe('verifyWebhookObject', () => {
  it('verifies a parsed payload by re-encoding it PHP-style', () => {
    const fields = {
      type: 'payment',
      order_id: 'order-1024',
      url: 'https://pay.cryptomus.com/pay/abc',
      status: 'paid',
    };
    const sign = signPayload(phpJsonEncode(fields), API_KEY);

    expect(verifyWebhookObject({ ...fields, sign }, API_KEY)).toBe(true);
  });

  it('rejects a parsed payload that was tampered with', () => {
    const fields = { order_id: 'order-1024', amount: '19.99' };
    const sign = signPayload(phpJsonEncode(fields), API_KEY);

    expect(verifyWebhookObject({ order_id: 'order-1024', amount: '1.00', sign }, API_KEY)).toBe(
      false,
    );
  });

  it('rejects when no signature is present at all', () => {
    expect(verifyWebhookObject({ order_id: 'x' }, API_KEY)).toBe(false);
  });

  it('demonstrates why JSON.stringify cannot be used for verification', () => {
    const fields = { url: 'https://a.test/x' };
    expect(JSON.stringify(fields)).not.toBe(phpJsonEncode(fields));
  });
});
