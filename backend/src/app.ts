import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import path from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  db,
  backendDir,
  SQLiteSessionStore,
  hash,
  token,
  today,
  uploadDir,
  audit,
  Tx,
} from './core.js';
const app = express();
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32)
  throw new Error('SESSION_SECRET must contain at least 32 characters. Configure backend/.env.');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'blob:', 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(
  session({
    name: 'wu.sid',
    secret,
    store: new SQLiteSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 3600000,
    },
  }),
);
const wrap =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
app.use(
  '/api',
  (req, res, next) => {
    req.session.csrf ??= token();
    res.locals.csrf = req.session.csrf;
    Promise.resolve(
      req.session.userId
        ? db.user.findUnique({
            where: { id: req.session.userId },
            select: { id: true, username: true, name: true, role: true, active: true },
          })
        : null,
    )
      .then((user) => {
        res.locals.user = user;
        next();
      })
      .catch(next);
  },
  (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-csrf-token'] !== req.session.csrf
    )
      return res.status(403).json({ error: 'เซสชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่' });
    next();
  },
);
const roles =
  (...allowed: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const u = res.locals.user;
    if (!u?.active) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    if (!allowed.includes(u.role)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการ' });
    next();
  };
const staff = roles('ADMIN', 'STAFF');
const admin = roles('ADMIN');
const loginLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const publicLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
app.get('/api/auth/me', (req, res) =>
  res.json({ user: res.locals.user?.active ? res.locals.user : null, csrfToken: req.session.csrf }),
);
app.post(
  '/api/auth/login',
  loginLimit,
  wrap(async (req, res) => {
    const input = z
      .object({ username: z.string().min(1).max(80), password: z.string().min(1).max(200) })
      .parse(req.body);
    const user = await db.user.findUnique({ where: { username: input.username } });
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash || '$2b$12$JpQkXV6ThfXY24j6gdoRbOXc2fd8Hmu09nC9xDe3kWQmEUF1Lc2nW',
    );
    if (!user?.active || !valid) fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = user!.id;
    req.session.csrf = token();
    await new Promise<void>((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    res.json({
      user: { id: user!.id, name: user!.name, username: user!.username, role: user!.role },
      csrfToken: req.session.csrf,
    });
  }),
);
app.post(
  '/api/auth/logout',
  wrap(async (req, res) => {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res.clearCookie('wu.sid');
    res.json({ ok: true });
  }),
);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, 'วันที่ไม่ถูกต้อง');
const text = z.string().trim().min(1).max(200);
const money = z.number().int().min(0).max(100000000);
const note = z.string().trim().max(1000).default('');
const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,30}$/),
  name: text,
  priceSatang: money,
  durationDays: z.number().int().min(0).max(3650),
  active: z.boolean().default(true),
});
app.get(
  '/api/categories',
  wrap(async (req, res) =>
    res.json(
      await db.serviceCategory.findMany({
        where: res.locals.user?.active && res.locals.user.role === 'ADMIN' ? {} : { active: true },
        orderBy: { code: 'asc' },
      }),
    ),
  ),
);
app.post(
  '/api/categories',
  admin,
  wrap(async (req, res) => {
    const data = categorySchema.parse(req.body);
    res.status(201).json(
      await db.$transaction(async (tx) => {
        const row = await tx.serviceCategory.create({ data });
        await audit(tx, res.locals.user.id, 'CREATE', 'Category', row.id, null, row);
        return row;
      }),
    );
  }),
);
app.put(
  '/api/categories/:id',
  admin,
  wrap(async (req, res) => {
    const data = categorySchema.parse(req.body);
    res.json(
      await db.$transaction(async (tx) => {
        const before = await tx.serviceCategory.findUniqueOrThrow({
          where: { id: String(req.params.id) },
        });
        const row = await tx.serviceCategory.update({ where: { id: before.id }, data });
        await audit(tx, res.locals.user.id, 'UPDATE', 'Category', row.id, before, row);
        return row;
      }),
    );
  }),
);
const memberSchema = z
  .object({
    number: z.string().trim().min(1).max(50),
    name: text,
    categoryId: text,
    startDate: date,
    endDate: date,
    active: z.boolean().default(true),
  })
  .refine((v) => v.endDate >= v.startDate, 'วันหมดอายุต้องไม่น้อยกว่าวันเริ่ม');
app.get(
  '/api/members',
  staff,
  wrap(async (req, res) => {
    const q = String(req.query.q || '').slice(0, 100);
    res.json(
      await db.member.findMany({
        where: { OR: [{ number: { contains: q } }, { name: { contains: q } }] },
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );
  }),
);
app.get(
  '/api/members/:id',
  staff,
  wrap(async (req, res) =>
    res.json(
      await db.member.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: {
          category: true,
          attendances: {
            where: { cancelled: false },
            orderBy: { date: 'desc' },
            include: { category: true, recorder: { select: { name: true } } },
          },
        },
      }),
    ),
  ),
);
async function saveMember(req: Request, res: Response, update: boolean) {
  const data = memberSchema.parse(req.body);
  res.status(update ? 200 : 201).json(
    await db.$transaction(async (tx) => {
      const cat = await tx.serviceCategory.findUnique({ where: { id: data.categoryId } });
      if (!cat?.active) fail(400, 'ประเภทบริการไม่เปิดใช้งาน');
      const before = update
        ? await tx.member.findUniqueOrThrow({ where: { id: String(req.params.id) } })
        : null;
      const row = before
        ? await tx.member.update({ where: { id: before.id }, data })
        : await tx.member.create({ data });
      await audit(
        tx,
        res.locals.user.id,
        update ? 'UPDATE' : 'CREATE',
        'Member',
        row.id,
        before,
        row,
      );
      return row;
    }),
  );
}
app.post(
  '/api/members',
  staff,
  wrap((req, res) => saveMember(req, res, false)),
);
app.put(
  '/api/members/:id',
  staff,
  wrap((req, res) => saveMember(req, res, true)),
);
function range(req: Request) {
  const from = date.parse(req.query.from || today());
  const to = date.parse(req.query.to || from);
  if (to < from || (+new Date(to) - +new Date(from)) / 86400000 > 366)
    fail(400, 'เลือกช่วงเวลาไม่เกิน 366 วัน');
  return { gte: from, lte: to };
}
const attendanceSchema = z.object({
  date,
  categoryId: text,
  count: z.number().int().min(1).max(10000),
  memberNumber: z.string().trim().max(50).optional(),
  paymentId: z.string().optional(),
  method: z.enum(['CASH', 'MEMBER', 'PAYMENT']),
  note,
});
async function saveAttendance(req: Request, res: Response, update: boolean) {
  const input = attendanceSchema.parse(req.body);
  res.status(update ? 200 : 201).json(
    await db.$transaction(async (tx) => {
      const before = update
        ? await tx.attendance.findUniqueOrThrow({ where: { id: String(req.params.id) } })
        : null;
      if (before?.cancelled) fail(409, 'รายการถูกยกเลิกแล้ว');
      const cat = await tx.serviceCategory.findUnique({ where: { id: input.categoryId } });
      if (!cat?.active) fail(400, 'ประเภทบริการไม่เปิดใช้งาน');
      const member = input.memberNumber
        ? await tx.member.findUnique({ where: { number: input.memberNumber } })
        : null;
      if (input.memberNumber && !member) fail(400, 'ไม่พบเลขสมาชิก');
      if (
        member &&
        (!member.active || member.startDate > input.date || member.endDate < input.date)
      )
        fail(400, 'สมาชิกยังไม่เริ่มใช้งาน หมดอายุ หรือปิดใช้งาน');
      if (member && (input.count !== 1 || member.categoryId !== cat!.id))
        fail(400, 'บันทึกสมาชิกครั้งละหนึ่งคนและเลือกประเภทสมาชิกให้ตรงกัน');
      if (input.method === 'MEMBER' && !member) fail(400, 'กรุณาระบุเลขสมาชิก');
      if (input.method === 'PAYMENT') {
        if (!input.paymentId) fail(400, 'กรุณาระบุรหัสรายการชำระเงิน');
        const p = await tx.payment.findUnique({
          where: { id: input.paymentId },
          include: { attendance: true },
        });
        if (
          !p ||
          p.status !== 'APPROVED' ||
          p.cancelled ||
          p.categoryId !== cat!.id ||
          p.amountSatang !== cat!.priceSatang * input.count ||
          p.date !== input.date ||
          (member && p.memberNumber !== member.number) ||
          (p.attendance && p.attendance.id !== before?.id)
        )
          fail(
            400,
            'รายการโอนต้องอนุมัติ วันที่ ประเภท ยอดเงิน และสมาชิกตรงกัน และยังไม่ใช้บันทึก',
          );
      }
      const unitPriceSatang = input.method === 'MEMBER' ? 0 : cat!.priceSatang;
      if (unitPriceSatang * input.count > 100000000)
        fail(400, 'ยอดรวมต้องไม่เกิน 1,000,000 บาทต่อรายการ');
      const data = {
        date: input.date,
        categoryId: cat!.id,
        count: input.count,
        unitPriceSatang,
        totalSatang: unitPriceSatang * input.count,
        memberId: member?.id || null,
        paymentId: input.method === 'PAYMENT' ? input.paymentId : null,
        method: input.method,
        note: input.note,
      };
      const row = before
        ? await tx.attendance.update({ where: { id: before.id }, data })
        : await tx.attendance.create({ data: { ...data, recorderId: res.locals.user.id } });
      const revenue = {
        date: row.date,
        categoryId: row.categoryId,
        amountSatang: input.method === 'CASH' ? row.totalSatang : 0,
        method: 'CASH',
        voided: input.method !== 'CASH',
      };
      await tx.revenueRecord.upsert({
        where: { attendanceId: row.id },
        create: { attendanceId: row.id, ...revenue },
        update: revenue,
      });
      await audit(
        tx,
        res.locals.user.id,
        update ? 'UPDATE' : 'CREATE',
        'Attendance',
        row.id,
        before,
        row,
      );
      return row;
    }),
  );
}
app.get(
  '/api/attendance',
  staff,
  wrap(async (req, res) => {
    const d = range(req);
    res.json(
      await db.attendance.findMany({
        where: {
          date: d,
          ...(req.query.categoryId ? { categoryId: String(req.query.categoryId) } : {}),
        },
        include: { category: true, member: true, recorder: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    );
  }),
);
app.post(
  '/api/attendance',
  staff,
  wrap((req, res) => saveAttendance(req, res, false)),
);
app.put(
  '/api/attendance/:id',
  staff,
  wrap((req, res) => saveAttendance(req, res, true)),
);
app.post(
  '/api/attendance/:id/cancel',
  staff,
  wrap(async (req, res) => {
    const reason = text.parse(req.body.reason);
    res.json(
      await db.$transaction(async (tx) => {
        const before = await tx.attendance.findUniqueOrThrow({
          where: { id: String(req.params.id) },
        });
        if (before.cancelled) fail(409, 'รายการถูกยกเลิกแล้ว');
        const row = await tx.attendance.update({
          where: { id: before.id },
          data: { cancelled: true, paymentId: null },
        });
        await tx.revenueRecord.updateMany({
          where: { attendanceId: row.id },
          data: { voided: true },
        });
        await audit(tx, res.locals.user.id, 'CANCEL', 'Attendance', row.id, before, {
          ...row,
          reason,
        });
        return row;
      }),
    );
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, fieldSize: 5000 },
});
const paymentSchema = z.object({
  payerName: text,
  memberNumber: z.string().trim().max(50).optional(),
  categoryId: text,
  date,
  amountSatang: z.coerce.number().int().positive().max(100000000),
  method: z.enum(['TRANSFER', 'CASH']),
  note,
});
app.post(
  '/api/payments',
  publicLimit,
  upload.single('slip'),
  wrap(async (req, res) => {
    const input = paymentSchema.parse(req.body);
    if (input.method === 'CASH' && !['ADMIN', 'STAFF'].includes(res.locals.user?.role))
      fail(403, 'ผู้ใช้บริการส่งหลักฐานการโอนได้เท่านั้น');
    if (!req.file) fail(400, 'กรุณาแนบสลิป');
    let image: Buffer;
    try {
      const meta = await sharp(req.file!.buffer, { limitInputPixels: 25000000 }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format || ''))
        fail(400, 'รองรับเฉพาะ JPG PNG WEBP');
      image = await sharp(req.file!.buffer, { limitInputPixels: 25000000 })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .webp()
        .toBuffer();
    } catch {
      fail(400, 'ไฟล์รูปภาพไม่ถูกต้อง รองรับ JPG PNG WEBP สูงสุด 25 ล้านพิกเซล');
    }
    const sha256 = hash(req.file!.buffer);
    const storageName = token() + '.webp';
    const verificationCode = token();
    const reference = 'WU-' + new Date().getFullYear() + '-' + token().slice(0, 14).toUpperCase();
    await writeFile(path.join(uploadDir, storageName), image!, { flag: 'wx', mode: 0o600 });
    try {
      const row = await db.$transaction(async (tx) => {
        const cat = await tx.serviceCategory.findUnique({ where: { id: input.categoryId } });
        if (!cat?.active) fail(400, 'ประเภทบริการไม่เปิดใช้งาน');
        const p = await tx.payment.create({
          data: {
            ...input,
            reference,
            verificationHash: hash(verificationCode),
            submittedById: res.locals.user?.active ? res.locals.user.id : null,
            slip: { create: { storageName, sha256, mime: 'image/webp', size: image!.length } },
          },
        });
        await audit(tx, res.locals.user?.id || null, 'SUBMIT', 'Payment', p.id, null, {
          reference,
          status: p.status,
        });
        return p;
      });
      res.status(201).json({ id: row.id, reference, verificationCode, status: row.status });
    } catch (e) {
      await unlink(path.join(uploadDir, storageName)).catch(() => {});
      throw e;
    }
  }),
);
app.post(
  '/api/payments/lookup',
  publicLimit,
  wrap(async (req, res) => {
    const input = z
      .object({ reference: text, verificationCode: z.string().min(1).max(100) })
      .parse(req.body);
    const p = await db.payment.findUnique({ where: { reference: input.reference } });
    if (!p || hash(input.verificationCode) !== p.verificationHash)
      fail(404, 'ไม่พบรายการหรือรหัสตรวจสอบไม่ถูกต้อง');
    res.json({
      reference: p!.reference,
      status: p!.status,
      cancelled: p!.cancelled,
      date: p!.date,
      amountSatang: p!.amountSatang,
      rejectionReason: p!.rejectionReason,
    });
  }),
);
const paymentInclude = {
  category: true,
  submittedBy: { select: { name: true } },
  reviewer: { select: { name: true } },
};
app.get(
  '/api/payments',
  staff,
  wrap(async (req, res) => {
    const d = range(req);
    const status = req.query.status
      ? z.enum(['PENDING', 'APPROVED', 'REJECTED']).parse(req.query.status)
      : undefined;
    res.json(
      await db.payment.findMany({
        where: { date: d, status },
        select: {
          id: true,
          reference: true,
          payerName: true,
          memberNumber: true,
          date: true,
          amountSatang: true,
          method: true,
          status: true,
          cancelled: true,
          reviewedAt: true,
          rejectionReason: true,
          note: true,
          category: { select: { name: true } },
          submittedBy: { select: { name: true } },
          reviewer: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    );
  }),
);
app.get(
  '/api/payments/:id/slip',
  staff,
  wrap(async (req, res) => {
    const slip = await db.paymentSlip.findUniqueOrThrow({
      where: { paymentId: String(req.params.id) },
    });
    if (!/^[a-f0-9]{48}\.webp$/.test(slip.storageName)) fail(400, 'ชื่อไฟล์ไม่ถูกต้อง');
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="payment.webp"',
    });
    res.send(await readFile(path.join(uploadDir, slip.storageName)));
  }),
);
app.get(
  '/api/payments/:id',
  staff,
  wrap(async (req, res) => {
    const p = await db.payment.findUniqueOrThrow({
      where: { id: String(req.params.id) },
      include: paymentInclude,
    });
    const { verificationHash, ...safe } = p;
    res.json(safe);
  }),
);
app.post(
  '/api/payments/:id/approve',
  staff,
  wrap(async (req, res) =>
    res.json(
      await db.$transaction(async (tx) => {
        const id = String(req.params.id);
        const before = await tx.payment.findUniqueOrThrow({ where: { id } });
        const changed = await tx.payment.updateMany({
          where: { id, status: 'PENDING', cancelled: false },
          data: { status: 'APPROVED', reviewerId: res.locals.user.id, reviewedAt: new Date() },
        });
        if (changed.count !== 1) fail(409, 'รายการนี้ตรวจสอบหรือยกเลิกแล้ว');
        await tx.revenueRecord.create({
          data: {
            paymentId: id,
            date: before.date,
            categoryId: before.categoryId,
            amountSatang: before.amountSatang,
            method: before.method,
          },
        });
        await audit(
          tx,
          res.locals.user.id,
          'APPROVE',
          'Payment',
          id,
          { status: before.status },
          { status: 'APPROVED' },
        );
        return { ok: true };
      }),
    ),
  ),
);
app.post(
  '/api/payments/:id/reject',
  staff,
  wrap(async (req, res) => {
    const reason = text.parse(req.body.reason);
    res.json(
      await db.$transaction(async (tx) => {
        const id = String(req.params.id);
        const changed = await tx.payment.updateMany({
          where: { id, status: 'PENDING', cancelled: false },
          data: {
            status: 'REJECTED',
            rejectionReason: reason,
            reviewerId: res.locals.user.id,
            reviewedAt: new Date(),
          },
        });
        if (changed.count !== 1) fail(409, 'รายการนี้ตรวจสอบหรือยกเลิกแล้ว');
        await audit(
          tx,
          res.locals.user.id,
          'REJECT',
          'Payment',
          id,
          { status: 'PENDING' },
          { status: 'REJECTED', reason },
        );
        return { ok: true };
      }),
    );
  }),
);
app.post(
  '/api/payments/:id/cancel',
  staff,
  wrap(async (req, res) => {
    const reason = text.parse(req.body.reason);
    res.json(
      await db.$transaction(async (tx) => {
        const id = String(req.params.id);
        const before = await tx.payment.findUniqueOrThrow({
          where: { id },
          include: { attendance: true },
        });
        if (before.cancelled) fail(409, 'ยกเลิกแล้ว');
        if (before.attendance && !before.attendance.cancelled)
          fail(409, 'กรุณายกเลิกการเข้าใช้ที่ผูกกับรายการนี้ก่อน');
        await tx.payment.update({ where: { id }, data: { cancelled: true } });
        await tx.revenueRecord.updateMany({ where: { paymentId: id }, data: { voided: true } });
        await audit(
          tx,
          res.locals.user.id,
          'CANCEL',
          'Payment',
          id,
          { status: before.status },
          { cancelled: true, reason },
        );
        return { ok: true };
      }),
    );
  }),
);
async function report(from: string, to: string) {
  const [attendance, revenue, categories, settings, payments] = await db.$transaction([
    db.attendance.findMany({ where: { date: { gte: from, lte: to }, cancelled: false } }),
    db.revenueRecord.findMany({ where: { date: { gte: from, lte: to }, voided: false } }),
    db.serviceCategory.findMany(),
    db.systemSetting.findMany(),
    db.payment.findMany({
      where: { date: { gte: from, lte: to } },
      select: {
        id: true,
        reference: true,
        date: true,
        amountSatang: true,
        method: true,
        status: true,
        cancelled: true,
        reviewer: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
  ]);
  const sum = (rows: { amountSatang: number }[]) => rows.reduce((s, r) => s + r.amountSatang, 0);
  const days = [];
  for (
    let d = new Date(from + 'T00:00:00Z');
    d.toISOString().slice(0, 10) <= to;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = d.toISOString().slice(0, 10);
    days.push({
      date: day,
      revenue: sum(revenue.filter((r) => r.date === day)),
      count: attendance.filter((a) => a.date === day).reduce((s, a) => s + a.count, 0),
    });
  }
  return {
    from,
    to,
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    revenueSatang: sum(revenue),
    cashSatang: sum(revenue.filter((r) => r.method === 'CASH')),
    transferSatang: sum(revenue.filter((r) => r.method === 'TRANSFER')),
    attendanceCount: attendance.reduce((s, a) => s + a.count, 0),
    memberVisits: attendance.filter((a) => a.memberId).length,
    uniqueMembers: new Set(attendance.filter((a) => a.memberId).map((a) => a.memberId)).size,
    days,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      priceSatang: c.priceSatang,
      count: attendance.filter((a) => a.categoryId === c.id).reduce((s, a) => s + a.count, 0),
      revenueSatang: sum(revenue.filter((r) => r.categoryId === c.id)),
      rates: [
        ...new Set(attendance.filter((a) => a.categoryId === c.id).map((a) => a.unitPriceSatang)),
      ],
    })),
    payments,
  };
}
app.get(
  '/api/dashboard',
  staff,
  wrap(async (req, res) => {
    const d = range(req);
    const now = today();
    const month = now.slice(0, 7) + '-01';
    const week = new Date(now + 'T00:00:00Z');
    week.setUTCDate(week.getUTCDate() - 6);
    const year = now.slice(0, 4) + '-01-01';
    const [selected, daily, monthly, last7, yearly, pending] = await Promise.all([
      report(d.gte, d.lte),
      report(now, now),
      report(month, now),
      report(week.toISOString().slice(0, 10), now),
      report(year, now),
      db.payment.count({ where: { status: 'PENDING', cancelled: false } }),
    ]);
    res.json({
      selected,
      daily,
      monthly,
      last7,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: String(i + 1).padStart(2, '0'),
        revenue: yearly.days
          .filter((d) => Number(d.date.slice(5, 7)) === i + 1)
          .reduce((s, d) => s + d.revenue, 0),
      })),
      pending,
    });
  }),
);
app.get(
  '/api/reports/daily',
  staff,
  wrap(async (req, res) => {
    const day = date.parse(req.query.date || today());
    res.json(await report(day, day));
  }),
);
app.get(
  '/api/reports/monthly',
  staff,
  wrap(async (req, res) => {
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(req.query.month || today().slice(0, 7));
    const start = date.parse(month + '-01');
    const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    res.json(await report(start, month + '-' + String(end).padStart(2, '0')));
  }),
);
app.get(
  '/api/reports/payments',
  staff,
  wrap(async (req, res) => {
    const d = range(req);
    res.json(await report(d.gte, d.lte));
  }),
);
app.get(
  '/api/settings',
  wrap(async (req, res) =>
    res.json(Object.fromEntries((await db.systemSetting.findMany()).map((s) => [s.key, s.value]))),
  ),
);
app.put(
  '/api/settings',
  admin,
  wrap(async (req, res) => {
    const data = z.object({ department: text }).parse(req.body);
    await db.$transaction(async (tx) => {
      const before = await tx.systemSetting.findUnique({ where: { key: 'department' } });
      await tx.systemSetting.upsert({
        where: { key: 'department' },
        create: { key: 'department', value: data.department },
        update: { value: data.department },
      });
      await audit(tx, res.locals.user.id, 'UPDATE', 'Setting', 'department', before, data);
    });
    res.json({ ok: true });
  }),
);
app.get(
  '/api/users',
  admin,
  wrap(async (req, res) =>
    res.json(
      await db.user.findMany({
        select: { id: true, username: true, name: true, role: true, active: true },
        orderBy: { createdAt: 'asc' },
      }),
    ),
  ),
);
const userSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{3,50}$/),
  name: text,
  role: z.enum(['ADMIN', 'STAFF', 'CUSTOMER']),
  active: z.boolean(),
  password: z.string().min(12).max(128).optional(),
});
async function saveUser(req: Request, res: Response, update: boolean) {
  const data = userSchema.parse(req.body);
  if (!update && !data.password) fail(400, 'กรุณากำหนดรหัสผ่านอย่างน้อย 12 ตัวอักษร');
  const { password, ...safe } = data;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  res.status(update ? 200 : 201).json(
    await db.$transaction(async (tx) => {
      const before = update
        ? await tx.user.findUniqueOrThrow({ where: { id: String(req.params.id) } })
        : null;
      if (before?.id === res.locals.user.id && (!safe.active || safe.role !== 'ADMIN'))
        fail(400, 'ไม่สามารถปิดใช้งานหรือลดสิทธิ์บัญชี Admin ที่กำลังใช้งาน');
      if (
        before?.role === 'ADMIN' &&
        before.active &&
        (!safe.active || safe.role !== 'ADMIN') &&
        (await tx.user.count({ where: { role: 'ADMIN', active: true } })) <= 1
      )
        fail(400, 'ต้องเหลือ Admin อย่างน้อยหนึ่งบัญชี');
      const row = before
        ? await tx.user.update({ where: { id: before.id }, data: { ...safe, passwordHash } })
        : await tx.user.create({ data: { ...safe, passwordHash: passwordHash! } });
      if (before) await tx.session.deleteMany({ where: { userId: row.id } });
      const out = {
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        active: row.active,
      };
      await audit(
        tx,
        res.locals.user.id,
        update ? 'UPDATE' : 'CREATE',
        'User',
        row.id,
        before ? { username: before.username, role: before.role, active: before.active } : null,
        out,
      );
      return out;
    }),
  );
}
app.post(
  '/api/users',
  admin,
  wrap((req, res) => saveUser(req, res, false)),
);
app.put(
  '/api/users/:id',
  admin,
  wrap((req, res) => saveUser(req, res, true)),
);
app.get(
  '/api/audit',
  admin,
  wrap(async (req, res) =>
    res.json(
      await db.auditLog.findMany({
        where: {
          ...(req.query.entity ? { entity: String(req.query.entity) } : {}),
          ...(req.query.entityId ? { entityId: String(req.query.entityId) } : {}),
        },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ),
  ),
);
app.get(
  '/api/health',
  wrap(async (req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  }),
);
app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ API' }));
const dist = path.resolve(backendDir, '../frontend/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: err.issues.map((i) => i.message).join(', ') });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError)
    return res.status(400).json({ error: 'ไฟล์เกิน 5 MB หรือจำนวนฟิลด์ไม่ถูกต้อง' });
  if (err.code === 'P2002')
    return res
      .status(409)
      .json({ error: 'ข้อมูลซ้ำ (เลขสมาชิก รหัส ชื่อบัญชี หรือไฟล์สลิปถูกใช้แล้ว)' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'ไม่พบข้อมูล' });
  if (err.code === 'P2003') return res.status(400).json({ error: 'ข้อมูลอ้างอิงไม่ถูกต้อง' });
  if (err.status === 400) return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  console.error('Request failed:', err.code || err.name);
  res.status(500).json({ error: 'ระบบขัดข้อง กรุณาลองใหม่' });
});
export default app;
