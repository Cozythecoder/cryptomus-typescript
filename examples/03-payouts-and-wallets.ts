import { CryptomusClient, CryptomusError, isFinalPayoutStatus } from '../src/index.js';

const cryptomus = CryptomusClient.fromEnv();

async function main(): Promise<void> {
  const [paymentServices, payoutServices] = await Promise.all([
    cryptomus.payments.services(),
    cryptomus.payouts.services(),
  ]);

  console.log('Accepting:', paymentServices.filter((s) => s.is_available).length, 'methods');
  console.log('Paying out:', payoutServices.filter((s) => s.is_available).length, 'methods');

  const usdtTron = paymentServices.find((s) => s.currency === 'USDT' && s.network === 'tron');
  if (usdtTron) {
    console.log(
      `  USDT/tron: ${usdtTron.limit.min_amount}–${usdtTron.limit.max_amount}, ` +
        `fee ${usdtTron.commission.percent}% + ${usdtTron.commission.fee_amount}`,
    );
  }

  const wallet = await cryptomus.wallets.create({
    currency: 'USDT',
    network: 'tron',
    order_id: 'customer-42',
    url_callback: 'https://example.com/api/cryptomus/webhook',
  });

  console.log(`\nStatic wallet for customer-42: ${wallet.address}`);

  const qr = await cryptomus.wallets.qrCode({ wallet_address_uuid: wallet.uuid });
  console.log(`QR code: ${qr.image.length} bytes of base64 PNG`);

  const balance = await cryptomus.misc.balance();
  console.log('\nBusiness wallet:');
  for (const entry of balance.merchant) {
    if (Number(entry.balance) > 0) console.log(`  ${entry.balance} ${entry.currency_code}`);
  }

  if (process.env['SEND_PAYOUT'] !== '1') {
    console.log('\nSkipping payout. Set SEND_PAYOUT=1 to send one for real.');
    return;
  }

  const address = process.env['PAYOUT_ADDRESS'];
  if (!address) throw new Error('Set PAYOUT_ADDRESS to the destination wallet.');

  const payout = await cryptomus.payouts.create({
    amount: '1.00',
    currency: 'USDT',
    network: 'tron',
    order_id: `withdrawal-${new Date().toISOString().slice(0, 10)}-001`,
    address,
    is_subtract: true,
    url_callback: 'https://example.com/api/cryptomus/webhook',
  });

  console.log(`\nPayout ${payout.uuid}: ${payout.status}`);

  if (!isFinalPayoutStatus(payout.status)) {
    console.log('Still processing — the webhook will tell you when it settles.');
  }

  console.log('\nRecent payouts:');
  let shown = 0;
  for await (const entry of cryptomus.payouts.listAll()) {
    console.log(`  ${entry.uuid} ${entry.amount} ${entry.currency} ${entry.status}`);
    if (++shown >= 5) break;
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
