import { PrismaClient, Prisma } from '@prisma/client';
import session from 'express-session';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });
const rawUrl = process.env.DATABASE_URL || 'file:./fitness.db';
if (!rawUrl.startsWith('file:'))
  throw new Error('This application requires a local SQLite file URL.');
const databaseUrl = 'file:' + path.resolve(backendDir, 'prisma', rawUrl.slice(5));
export const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: databaseUrl }) });
export const uploadDir = process.env.UPLOAD_DIR || path.join(backendDir, 'data', 'slips');
mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(24).toString('hex');
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export type Tx = Prisma.TransactionClient;
export async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      before: before == null ? null : JSON.stringify(before),
      after: after == null ? null : JSON.stringify(after),
    },
  });
}
export class SQLiteSessionStore extends session.Store {
  get(sid: string, cb: (err: any, sess?: any) => void) {
    db.session
      .findUnique({ where: { id: sid } })
      .then((s) => cb(null, s && s.expiresAt > new Date() ? JSON.parse(s.data) : null))
      .catch(cb);
  }
  set(sid: string, sess: session.SessionData, cb?: (err?: any) => void) {
    const expiresAt = new Date(sess.cookie.expires || Date.now() + 8 * 3600000);
    const data = { data: JSON.stringify(sess), expiresAt, userId: (sess as any).userId || null };
    db.session
      .upsert({ where: { id: sid }, create: { id: sid, ...data }, update: data })
      .then(() => cb?.())
      .catch((e) => cb?.(e));
  }
  destroy(sid: string, cb?: (err?: any) => void) {
    db.session
      .deleteMany({ where: { id: sid } })
      .then(() => cb?.())
      .catch((e) => cb?.(e));
  }
  touch(sid: string, sess: session.SessionData, cb?: (err?: any) => void) {
    // Refresh only an existing session: never resurrect one revoked by an account change.
    const expiresAt = new Date(sess.cookie.expires || Date.now() + 8 * 3600000);
    db.session
      .updateMany({ where: { id: sid }, data: { expiresAt } })
      .then(() => cb?.())
      .catch((e) => cb?.(e));
  }
}
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrf?: string;
  }
}
