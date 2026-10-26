import { createInterface } from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import { db } from './core.js';
import { z } from 'zod';
// Password supplied interactively (hidden) or through an existing environment variable.
async function hidden(question: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error('Use a terminal or supply ADMIN_PASSWORD securely via the environment.');
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelled'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdout.write('\n');
    };
    process.stdin.on('data', onData);
  });
}
try {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const username = process.env.ADMIN_USERNAME || (await rl.question('Admin username: '));
  const name = process.env.ADMIN_NAME || (await rl.question('Display name: '));
  rl.close();
  const password =
    process.env.ADMIN_PASSWORD || (await hidden('Password (12+ characters, hidden): '));
  if (!process.env.ADMIN_PASSWORD && password !== (await hidden('Confirm password: ')))
    throw new Error('Passwords do not match');
  z.string()
    .regex(/^[A-Za-z0-9_.-]{3,50}$/)
    .parse(username);
  z.string().trim().min(1).max(200).parse(name);
  z.string().min(12).max(128).parse(password);
  await db.user.create({
    data: { username, name, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' },
  });
  console.log('Admin created.');
} catch (e) {
  console.error(
    e instanceof z.ZodError
      ? 'Invalid username, name, or password length.'
      : (e as any).code === 'P2002'
        ? 'Username already exists.'
        : (e as Error).message,
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
