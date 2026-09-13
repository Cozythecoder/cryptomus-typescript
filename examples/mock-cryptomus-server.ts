import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env['PORT'] ?? 4242);
const AUTO_PAY = process.env['AUTO_PAY'] !== '0';
const AUTO_PAY_MS = Number(process.env['AUTO_PAY_MS'] ?? 2000);

export const MOCK_MERCHANT_ID = '8b03432e-385b-4670-8d06-064591096795';
export const MOCK_PAYMENT_KEY = 'mock-payment-key';
export const MOCK_PAYOUT_KEY = 'mock-payout-key';

function phpJsonEncode(value: unknown): string {
  return JSON.stringify(value).replace(/[-￿/]/g, (char) =>
    char === '/' ? '\\/' : '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

function sign(rawBody: string, key: string): string {
  return createHash('md5')
    .update(Buffer.from(rawBody, 'utf8').toString('base64') + key, 'utf8')
    .digest('hex');
}

interface MockInvoice {
  uuid: string;
  order_id: string;
  amount: string;
  currency: string;
  payer_currency: string;
  network: string;
  address: string;
  url: string;
  url_callback: string | null;
  payment_status: string;
  is_final: boolean;
  created_at: string;
  additional_data: string | null;
}

const invoices = new Map<string, MockInvoice>();
const byOrderId = new Map<string, string>();

const FINAL = new Set([
  'paid',
  'paid_over',
  'fail',
  'cancel',
  'system_fail',
  'refund_fail',
  'refund_paid',
  'locked',
]);

function findInvoice(body: { uuid?: string; order_id?: string }): MockInvoice | undefined {
  if (body.order_id) {
    const uuid = byOrderId.get(body.order_id);
    if (uuid) return invoices.get(uuid);
  }
  return body.uuid ? invoices.get(body.uuid) : undefined;
}

async function deliverWebhook(
  invoice: MockInvoice,
  type: 'payment' | 'wallet' = 'payment',
): Promise<void> {
  if (!invoice.url_callback) return;

  const payload = {
    type,
    uuid: invoice.uuid,
    order_id: invoice.order_id,
    amount: invoice.amount,
    payment_amount: invoice.payment_status.startsWith('paid') ? invoice.amount : '0.00',
    payment_amount_usd: invoice.amount,
    merchant_amount: (Number(invoice.amount) * 0.99).toFixed(2),
    commission: (Number(invoice.amount) * 0.01).toFixed(2),
    is_final: invoice.is_final,
    status: invoice.payment_status,
    from: 'TMockPayerAddress000000000000000000',
    wallet_address_uuid: null,
    network: invoice.network,
    currency: invoice.currency,
    payer_currency: invoice.payer_currency,
    payer_amount: invoice.amount,
    additional_data: invoice.additional_data,
    txid: invoice.payment_status.startsWith('paid') ? `0x${randomUUID().replace(/-/g, '')}` : null,
  };

  const body = phpJsonEncode(payload);
  const signed = `{${body.slice(1, -1)},"sign":"${sign(body, MOCK_PAYMENT_KEY)}"}`;

  try {
    const response = await fetch(invoice.url_callback, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: signed,
    });

    const verdict = response.ok ? 'accepted' : `rejected (HTTP ${response.status})`;
    console.log(`  webhook ${invoice.order_id} [${invoice.payment_status}] ${verdict}`);

    if (!response.ok) {
      console.log('    Your endpoint refused it. Are you verifying the RAW body?');
    }
  } catch (error) {
    console.log(`  webhook ${invoice.order_id} failed: ${(error as Error).message}`);
  }
}

function setStatus(invoice: MockInvoice, status: string): void {
  invoice.payment_status = status;
  invoice.is_final = FINAL.has(status);
  void deliverWebhook(invoice);
}

function scheduleLifecycle(invoice: MockInvoice): void {
  if (!AUTO_PAY) return;

  for (const [index, status] of ['confirm_check', 'paid'].entries()) {
    setTimeout(
      () => {
        const current = invoices.get(invoice.uuid);
        if (current && !current.is_final) setStatus(current, status);
      },
      AUTO_PAY_MS * (index + 1),
    ).unref();
  }
}

function service(currency: string, network: string) {
  return {
    network,
    currency,
    is_available: true,
    limit: { min_amount: '1', max_amount: '100000' },
    commission: { fee_amount: '0', percent: '1' },
  };
}

function toPaymentObject(invoice: MockInvoice) {
  return {
    uuid: invoice.uuid,
    order_id: invoice.order_id,
    amount: invoice.amount,
    payment_amount: invoice.payment_status.startsWith('paid') ? invoice.amount : null,
    payer_amount: invoice.amount,
    discount_percent: null,
    discount: null,
    payer_currency: invoice.payer_currency,
    currency: invoice.currency,
    merchant_amount: (Number(invoice.amount) * 0.99).toFixed(2),
    network: invoice.network,
    address: invoice.address,
    from: null,
    txid: null,
    payment_status: invoice.payment_status,
    url: invoice.url,
    expired_at: Math.floor(Date.now() / 1000) + 3600,
    is_final: invoice.is_final,
    additional_data: invoice.additional_data,
    created_at: invoice.created_at,
  };
}

const envelope = (invoice: MockInvoice | undefined) => ({
  state: 0,
  result: invoice ? toPaymentObject(invoice) : null,
});

type Handler = (body: Record<string, unknown>) => { status?: number; payload: unknown };

const routes: Record<string, Handler> = {
  'POST /v1/payment': (body) => {
    const orderId = String(body['order_id'] ?? '');

    const existing = byOrderId.get(orderId);
    if (existing) return { payload: envelope(invoices.get(existing)) };

    const uuid = randomUUID();
    const invoice: MockInvoice = {
      uuid,
      order_id: orderId,
      amount: String(body['amount'] ?? '0'),
      currency: String(body['currency'] ?? 'USD'),
      payer_currency: String(body['to_currency'] ?? 'USDT'),
      network: String(body['network'] ?? 'tron'),
      address: 'TMockDepositAddress0000000000000000',
      url: `http://127.0.0.1:${PORT}/_pay/${uuid}`,
      url_callback: (body['url_callback'] as string) ?? null,
      payment_status: 'check',
      is_final: false,
      created_at: new Date().toISOString(),
      additional_data: (body['additional_data'] as string) ?? null,
    };

    invoices.set(uuid, invoice);
    byOrderId.set(orderId, uuid);
    console.log(`+ invoice ${orderId} (${invoice.amount} ${invoice.currency})`);
    scheduleLifecycle(invoice);

    return { payload: envelope(invoice) };
  },

  'POST /v1/payment/info': (body) => {
    const invoice = findInvoice(body);
    if (!invoice) return { payload: { state: 1, message: 'Payment not found' } };
    return { payload: envelope(invoice) };
  },

  'POST /v1/payment/list': () => ({
    payload: {
      state: 0,
      result: {
        items: [...invoices.values()].map(toPaymentObject),
        paginate: {
          count: invoices.size,
          hasPages: false,
          nextCursor: null,
          previousCursor: null,
          perPage: 15,
        },
      },
    },
  }),

  'POST /v1/payment/services': () => ({
    payload: {
      state: 0,
      result: [
        service('USDT', 'tron'),
        service('USDT', 'bsc'),
        service('BTC', 'btc'),
        service('ETH', 'eth'),
      ],
    },
  }),

  'POST /v1/payment/refund': () => ({ payload: { state: 0, result: [] } }),

  'POST /v1/wallet': (body) => ({
    payload: {
      state: 0,
      result: {
        wallet_uuid: randomUUID(),
        uuid: randomUUID(),
        address: 'TMockStaticWallet00000000000000000',
        network: String(body['network'] ?? 'tron'),
        currency: String(body['currency'] ?? 'USDT'),
        url: `http://127.0.0.1:${PORT}/_wallet/${String(body['order_id'] ?? '')}`,
      },
    },
  }),

  'POST /v1/payout': (body) => ({
    payload: {
      state: 0,
      result: {
        uuid: randomUUID(),
        order_id: body['order_id'],
        amount: body['amount'],
        currency: body['currency'],
        network: body['network'] ?? 'tron',
        address: body['address'],
        txid: null,
        status: 'process',
        is_final: false,
        balance: 1000,
        payer_currency: body['currency'],
        payer_amount: body['amount'],
      },
    },
  }),

  'POST /v1/balance': () => ({
    payload: {
      state: 0,
      result: [
        {
          balance: {
            merchant: [
              { uuid: randomUUID(), balance: '1000.00', currency_code: 'USDT' },
              { uuid: randomUUID(), balance: '0.05000000', currency_code: 'BTC' },
            ],
            user: [{ uuid: randomUUID(), balance: '25.00', currency_code: 'USDT' }],
          },
        },
      ],
    },
  }),

  'POST /v1/recurrence/create': (body) => ({
    payload: {
      state: 0,
      result: {
        uuid: randomUUID(),
        name: body['name'],
        order_id: body['order_id'] ?? null,
        amount: body['amount'],
        currency: body['currency'],
        payer_currency: 'USDT',
        payer_amount: body['amount'],
        url_callback: body['url_callback'] ?? null,
        period: body['period'],
        status: 'wait_accept',
        url: `http://127.0.0.1:${PORT}/_subscribe/${randomUUID()}`,
        last_pay_off: null,
        additional_data: null,
        discount_days: body['discount_days'] ?? null,
        discount_amount: body['discount_amount'] ?? null,
        end_of_discount: null,
      },
    },
  }),

  'POST /v1/test-webhook/payment': (body) => {
    const status = String(body['status'] ?? 'paid');

    const invoice: MockInvoice = {
      uuid: (body['uuid'] as string) ?? randomUUID(),
      order_id: (body['order_id'] as string) ?? `test-${Date.now()}`,
      amount: '10.00',
      currency: String(body['currency'] ?? 'USDT'),
      payer_currency: String(body['currency'] ?? 'USDT'),
      network: String(body['network'] ?? 'tron'),
      address: 'TMockDepositAddress0000000000000000',
      url: '',
      url_callback: String(body['url_callback'] ?? ''),
      payment_status: status,
      is_final: FINAL.has(status),
      created_at: new Date().toISOString(),
      additional_data: null,
    };

    void deliverWebhook(invoice);
    return { payload: { state: 0, result: [] } };
  },
};

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    void handle(req, res, Buffer.concat(chunks).toString('utf8'));
  });
});

async function handle(req: IncomingMessage, res: ServerResponse, rawBody: string): Promise<void> {
  const path = (req.url ?? '').split('?')[0] ?? '';
  const method = req.method ?? 'GET';

  const send = (status: number, payload: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  if (method === 'POST' && path === '/_control/advance') {
    const body = JSON.parse(rawBody || '{}') as { order_id?: string; status?: string };
    const invoice = findInvoice(body);

    if (!invoice) return send(404, { error: 'No such invoice' });

    setStatus(invoice, body.status ?? 'paid');
    console.log(`! forced ${invoice.order_id} to ${invoice.payment_status}`);
    return send(200, { ok: true, order_id: invoice.order_id, status: invoice.payment_status });
  }

  if (method === 'GET' && path.startsWith('/v1/exchange-rate/')) {
    const currency = decodeURIComponent(path.split('/')[3] ?? 'BTC');
    return send(200, {
      state: 0,
      result: [
        { from: currency, to: 'USD', course: '3500.00' },
        { from: currency, to: 'EUR', course: '3200.00' },
      ],
    });
  }

  if (method === 'GET' && (path.startsWith('/_pay/') || path.startsWith('/_subscribe/'))) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>Mock Cryptomus payment page</h1><p>Use /_control/advance to settle it.</p>');
    return;
  }

  const merchant = req.headers['merchant'];
  const provided = req.headers['sign'];

  if (merchant !== MOCK_MERCHANT_ID) {
    console.log(`x ${path} wrong merchant id: ${String(merchant)}`);
    return send(401, { state: 1, message: 'Wrong merchant' });
  }

  const matchesPayment = provided === sign(rawBody, MOCK_PAYMENT_KEY);
  const matchesPayout = provided === sign(rawBody, MOCK_PAYOUT_KEY);

  if (!matchesPayment && !matchesPayout) {
    console.log(`x ${path} bad signature`);
    console.log(`    body sent : ${rawBody}`);
    console.log(`    expected  : ${sign(rawBody, MOCK_PAYMENT_KEY)} (payment key)`);
    console.log(`    received  : ${String(provided)}`);
    return send(403, { state: 1, message: 'Wrong api key' });
  }

  const isPayoutRoute = path.startsWith('/v1/payout') || path.startsWith('/v1/transfer');

  if (isPayoutRoute && !matchesPayout) {
    console.log(`x ${path} signed with the payment key, needs the payout key`);
    return send(403, { state: 1, message: 'Wrong api key' });
  }

  const route = routes[`${method} ${path}`];

  if (!route) {
    console.log(`? ${method} ${path} not implemented by the mock`);
    return send(404, { state: 1, message: `Mock has no route for ${path}` });
  }

  const parsed = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  const { status = 200, payload } = route(parsed);
  send(status, payload);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Cryptomus listening on http://127.0.0.1:${PORT}\n`);
  console.log('Point your client at it:');
  console.log(`  merchantId: '${MOCK_MERCHANT_ID}'`);
  console.log(`  paymentKey: '${MOCK_PAYMENT_KEY}'`);
  console.log(`  payoutKey : '${MOCK_PAYOUT_KEY}'`);
  console.log(`  baseUrl   : 'http://127.0.0.1:${PORT}'\n`);
  console.log(
    AUTO_PAY
      ? `Invoices settle on their own every ${AUTO_PAY_MS}ms. AUTO_PAY=0 to drive them by hand.`
      : 'Auto-settlement off. Drive invoices with POST /_control/advance.',
  );
  console.log('Signatures are verified independently, so signing bugs surface here.\n');
});
