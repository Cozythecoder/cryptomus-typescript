import { createServer } from 'node:http';
import { CryptomusClient, CryptomusSignatureError, type CryptomusWebhookPayload } from '../src/index.js';

const cryptomus = CryptomusClient.fromEnv();
const PORT = Number(process.env.PORT ?? 3000);

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/cryptomus/webhook') {
    res.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));

  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');

    const sourceIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress;

    if (!cryptomus.webhooks.isTrustedIp(sourceIp)) {
      console.warn(`Rejected webhook from untrusted address ${sourceIp}`);
      res.writeHead(403).end();
      return;
    }

    let event: CryptomusWebhookPayload;

    try {
      event = cryptomus.webhooks.constructEvent(rawBody);
    } catch (error) {
      if (error instanceof CryptomusSignatureError) {
        res.writeHead(401).end();
        return;
      }
      throw error;
    }

    handleEvent(event)
      .then(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      })
      .catch((error: unknown) => {
        console.error('Failed to process webhook:', error);
        res.writeHead(500).end();
      });
  });
});

async function handleEvent(event: CryptomusWebhookPayload): Promise<void> {
  if (event.type === 'payout') {
    console.log(`Payout ${event.order_id}: ${event.status}`);
    return;
  }

  console.log(`Invoice ${event.order_id}: ${event.status} (final: ${event.is_final})`);

  if (!event.is_final) return;

  switch (event.status) {
    case 'paid':
    case 'paid_over':
      console.log(`  crediting ${event.merchant_amount} ${event.payer_currency}`);
      break;
    case 'wrong_amount':
      console.log(`  underpaid: received ${event.payment_amount} of ${event.amount}`);
      break;
    case 'locked':
      console.log('  funds locked by AML review, hold fulfilment');
      break;
    case 'cancel':
    case 'fail':
    case 'system_fail':
      console.log('  releasing reserved stock');
      break;
  }
}

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}/api/cryptomus/webhook`);
  console.log('Trigger a test delivery with the mock server, or webhooks.testPayment().');
});
