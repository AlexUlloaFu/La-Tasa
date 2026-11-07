import { config } from 'dotenv';
import { resolve } from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';

config({ path: resolve(__dirname, '../../.env') });

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();

  if (!apiId || !apiHash) {
    console.error(
      'Faltan TELEGRAM_API_ID y TELEGRAM_API_HASH.\n' +
        'Créalos en https://my.telegram.org → API development tools\n' +
        'y ponlos en api/.env',
    );
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });
  const ask = (q: string) => rl.question(q);

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: () => ask('Teléfono (con código país, ej +53...): '),
    phoneCode: () => ask('Código SMS/Telegram: '),
    password: () => ask('Contraseña 2FA (si aplica): '),
    onError: (err) => console.error(err),
  });

  const session = client.session.save() as unknown as string;
  console.log('\nListo. Pega esto en api/.env:\n');
  console.log(`TELEGRAM_SESSION=${session}\n`);

  await client.disconnect();
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
