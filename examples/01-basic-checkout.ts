import { CryptomusClient, CryptomusError, isPaidPaymentStatus } from '../src/index.js';

const cryptomus = CryptomusClient.fromEnv();

async function main(): Promise<void> {
  const orderId = `demo-${new Date().toISOString().slice(0, 10)}-001`;

  const invoice = await cryptomus.payments.create({
    amount: '19.99',
    currency: 'USD',
    order_id: orderId,
    lifetime: 3600,
    url_callback: 'https://example.com/api/cryptomus/webhook',
    url_success: 'https://example.com/checkout/thanks',
    url_return: 'https://example.com/cart',
    additional_data: 'Pro plan, annual',
  });

  console.log('Invoice created');
  console.log('  uuid   :', invoice.uuid);
  console.log('  status :', invoice.payment_status);
  console.log('  expires:', new Date(invoice.expired_at * 1000).toISOString());
  console.log('  pay at :', invoice.url);

  console.log('\nWaiting for payment (Ctrl-C to stop)…');

  const final = await cryptomus.payments.waitForFinalStatus(
    { order_id: orderId },
    {
      intervalMs: 10_000,
      timeoutMs: 15 * 60_000,
      onPoll: (payment) => console.log('  …', payment.payment_status),
    },
  );

  if (isPaidPaymentStatus(final.payment_status)) {
    console.log(`\nPaid: ${final.payment_amount} ${final.payer_currency} — fulfil the order.`);
  } else {
    console.log(`\nNot paid. Final status: ${final.payment_status}`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof CryptomusError) {
    console.error(`Cryptomus error on ${error.endpoint}: ${error.message}`);
    for (const line of error.validationMessages) console.error('  -', line);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
