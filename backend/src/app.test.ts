import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
const temporary = await mkdtemp(path.join(tmpdir(), 'wu-fitness-test-'));
process.env.DATABASE_URL = 'file:' + path.join(temporary, 'test.db');
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.UPLOAD_DIR = path.join(temporary, 'slips');
process.env.NODE_ENV = 'test';
const password = randomBytes(18).toString('hex');
let db: any,
  app: any,
  admin: any,
  staff: any,
  customer: any,
  publicAgent: any,
  adminCsrf = '',
  staffCsrf = '',
  customerCsrf = '',
  publicCsrf = '',
  category: any,
  member: any,
  payment: any,
  attendance: any,
  slip: Buffer;
const day = '2026-10-26';
async function login(role: string) {
  const a = request.agent(app);
  const me = await a.get('/api/auth/me');
  const response = await a
    .post('/api/auth/login')
    .set('x-csrf-token', me.body.csrfToken)
    .send({ username: role, password });
  assert.equal(response.status, 200);
  return [a, response.body.csrfToken];
}
async function upload(agent: any, csrf: string, buffer: Buffer, name = 'slip.png') {
  return agent
    .post('/api/payments')
    .set('x-csrf-token', csrf)
    .field('payerName', 'ผู้ทดสอบ')
    .field('categoryId', category.id)
    .field('date', day)
    .field('amountSatang', '5000')
    .field('method', 'TRANSFER')
    .attach('slip', buffer, name);
}
before(async () => {
  execFileSync(process.execPath, ['../node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
  ({ db } = await import('./core.js'));
  ({ default: app } = await import('./app.js'));
  for (const role of ['ADMIN', 'STAFF', 'CUSTOMER'])
    await db.user.create({
      data: { username: role, name: role, role, passwordHash: await bcrypt.hash(password, 4) },
    });
  category = await db.serviceCategory.create({
    data: { code: 'TEST', name: 'ทดสอบ', priceSatang: 5000, durationDays: 30 },
  });
  [admin, adminCsrf] = await login('ADMIN');
  [staff, staffCsrf] = await login('STAFF');
  [customer, customerCsrf] = await login('CUSTOMER');
  publicAgent = request.agent(app);
  publicCsrf = (await publicAgent.get('/api/auth/me')).body.csrfToken;
  slip = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#aabbcc' } })
    .png()
    .toBuffer();
});
after(async () => {
  await db?.$disconnect();
  await rm(temporary, { recursive: true, force: true });
});
test('login rejects wrong password and accepts valid login; cookie is HttpOnly', async () => {
  const a = request.agent(app);
  const me = await a.get('/api/auth/me');
  const bad = await a
    .post('/api/auth/login')
    .set('x-csrf-token', me.body.csrfToken)
    .send({ username: 'ADMIN', password: 'incorrect' });
  assert.equal(bad.status, 401);
  const good = await a
    .post('/api/auth/login')
    .set('x-csrf-token', me.body.csrfToken)
    .send({ username: 'ADMIN', password });
  assert.equal(good.status, 200);
  assert.match(String(good.headers['set-cookie']), /HttpOnly/);
  assert.notEqual(good.body.csrfToken, me.body.csrfToken);
});
test('CSRF and Admin/Staff/Customer permissions enforced', async () => {
  assert.equal((await admin.post('/api/members').send({})).status, 403);
  assert.equal((await staff.get('/api/users')).status, 403);
  assert.equal(
    (await staff.post('/api/categories').set('x-csrf-token', staffCsrf).send({})).status,
    403,
  );
  assert.equal((await customer.get('/api/members')).status, 403);
  assert.equal((await publicAgent.get('/api/payments')).status, 401);
  assert.equal((await publicAgent.get('/api/dashboard')).status, 401);
});
test('create member, reject duplicate number and inverted dates', async () => {
  const body = {
    number: 'WU001',
    name: 'สมาชิกทดสอบ',
    categoryId: category.id,
    startDate: day,
    endDate: '2027-10-26',
    active: true,
  };
  const r = await staff.post('/api/members').set('x-csrf-token', staffCsrf).send(body);
  assert.equal(r.status, 201);
  member = r.body;
  assert.equal(
    (await staff.post('/api/members').set('x-csrf-token', staffCsrf).send(body)).status,
    409,
  );
  assert.equal(
    (
      await staff
        .post('/api/members')
        .set('x-csrf-token', staffCsrf)
        .send({ ...body, number: 'WU002', endDate: '2020-01-01' })
    ).status,
    400,
  );
});
test('attendance calculates server-side cash revenue; edits keep one ledger row', async () => {
  const body = { date: day, categoryId: category.id, count: 2, method: 'CASH', note: 'ทดสอบ' };
  const r = await staff
    .post('/api/attendance')
    .set('x-csrf-token', staffCsrf)
    .send({ ...body, totalSatang: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.body.totalSatang, 10000);
  attendance = r.body;
  const edit = await staff
    .put('/api/attendance/' + attendance.id)
    .set('x-csrf-token', staffCsrf)
    .send({ ...body, count: 3 });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.totalSatang, 15000);
  assert.equal(await db.revenueRecord.count({ where: { attendanceId: attendance.id } }), 1);
});
test('member check-in records history, zero extra revenue and rejects expired member', async () => {
  const body = {
    date: day,
    categoryId: category.id,
    count: 1,
    method: 'MEMBER',
    memberNumber: 'WU001',
  };
  assert.equal(
    (await staff.post('/api/attendance').set('x-csrf-token', staffCsrf).send(body)).status,
    201,
  );
  const hist = await staff.get('/api/members/' + member.id);
  assert.equal(hist.body.attendances.length, 1);
  assert.equal(hist.body.attendances[0].totalSatang, 0);
  assert.equal(
    (
      await staff
        .post('/api/attendance')
        .set('x-csrf-token', staffCsrf)
        .send({ ...body, date: '2028-01-01' })
    ).status,
    400,
  );
  assert.equal(
    (
      await staff
        .post('/api/attendance')
        .set('x-csrf-token', staffCsrf)
        .send({ ...body, count: 2 })
    ).status,
    400,
  );
});
test('slip upload stores private image and returns reference with verification code', async () => {
  const r = await upload(publicAgent, publicCsrf, slip);
  assert.equal(r.status, 201);
  payment = r.body;
  assert.equal(payment.status, 'PENDING');
  assert.ok(payment.verificationCode);
  const image = await admin.get(`/api/payments/${payment.id}/slip`);
  assert.equal(image.status, 200);
  assert.match(image.headers['content-type'], /image\/webp/);
  assert.equal((await publicAgent.get(`/api/payments/${payment.id}/slip`)).status, 401);
  assert.equal((await customer.get(`/api/payments/${payment.id}/slip`)).status, 403);
  const list = await admin.get('/api/payments?from=' + day + '&to=' + day);
  assert.equal(list.status, 200);
  assert.equal(list.body[0].verificationHash, undefined);
  const lookup = await publicAgent
    .post('/api/payments/lookup')
    .set('x-csrf-token', publicCsrf)
    .send({ reference: payment.reference, verificationCode: payment.verificationCode });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.payerName, undefined);
  assert.equal(
    (
      await publicAgent
        .post('/api/payments/lookup')
        .set('x-csrf-token', publicCsrf)
        .send({ reference: payment.reference, verificationCode: 'wrong' })
    ).status,
    404,
  );
});
test('reject disguised, unsupported, oversized, duplicate and missing files', async () => {
  assert.equal(
    (
      await publicAgent
        .post('/api/payments')
        .set('x-csrf-token', publicCsrf)
        .field('payerName', 'ทดสอบ')
        .field('categoryId', category.id)
        .field('date', day)
        .field('amountSatang', '5000')
        .field('method', 'TRANSFER')
    ).status,
    400,
  );

  assert.equal(
    (await upload(publicAgent, publicCsrf, Buffer.from('<script>bad</script>'), 'fake.png')).status,
    400,
  );
  assert.equal((await upload(publicAgent, publicCsrf, slip)).status, 409);
  assert.equal(
    (await upload(publicAgent, publicCsrf, Buffer.alloc(5 * 1024 * 1024 + 1), 'big.png')).status,
    400,
  );
  assert.equal(
    (await upload(publicAgent, publicCsrf, await sharp(slip).gif().toBuffer(), 'fake.webp')).status,
    400,
  );
});
test('approval transaction creates ledger once, including concurrent attempts', async () => {
  const [a, b] = await Promise.all([
    staff.post(`/api/payments/${payment.id}/approve`).set('x-csrf-token', staffCsrf).send({}),
    admin.post(`/api/payments/${payment.id}/approve`).set('x-csrf-token', adminCsrf).send({}),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(await db.revenueRecord.count({ where: { paymentId: payment.id } }), 1);
  assert.equal(
    (
      await staff
        .post(`/api/payments/${payment.id}/approve`)
        .set('x-csrf-token', staffCsrf)
        .send({})
    ).status,
    409,
  );
});
test('approved transfer can link attendance once without adding revenue', async () => {
  const body = {
    date: day,
    categoryId: category.id,
    count: 1,
    method: 'PAYMENT',
    paymentId: payment.id,
  };
  assert.equal(
    (await staff.post('/api/attendance').set('x-csrf-token', staffCsrf).send(body)).status,
    201,
  );
  assert.equal(
    (await staff.post('/api/attendance').set('x-csrf-token', staffCsrf).send(body)).status,
    400,
  );
  const total = await db.revenueRecord.aggregate({
    where: { voided: false },
    _sum: { amountSatang: true },
  });
  assert.equal(total._sum.amountSatang, 20000);
  assert.equal(
    (
      await staff
        .post(`/api/payments/${payment.id}/cancel`)
        .set('x-csrf-token', staffCsrf)
        .send({ reason: 'test' })
    ).status,
    409,
  );
});
test('rejection requires reason and records audit history', async () => {
  const other = await upload(
    staff,
    staffCsrf,
    await sharp({ create: { width: 50, height: 50, channels: 3, background: '#222222' } })
      .png()
      .toBuffer(),
  );
  assert.equal(other.status, 201);
  const url = `/api/payments/${other.body.id}/reject`;
  assert.equal((await staff.post(url).set('x-csrf-token', staffCsrf).send({})).status, 400);
  assert.equal(
    (await staff.post(url).set('x-csrf-token', staffCsrf).send({ reason: 'ยอดไม่ตรง' })).status,
    200,
  );
  assert.equal(await db.revenueRecord.count({ where: { paymentId: other.body.id } }), 0);
  const audits = await admin.get('/api/audit?entity=Payment&entityId=' + other.body.id);
  assert.ok(audits.body.some((a: any) => a.action === 'REJECT' && a.after.includes('ยอดไม่ตรง')));
});
test('daily/monthly reports and dashboard derive correct approved + cash income', async () => {
  const daily = await staff.get('/api/reports/daily?date=' + day);
  assert.equal(daily.status, 200);
  assert.equal(daily.body.revenueSatang, 20000);
  assert.equal(daily.body.cashSatang, 15000);
  assert.equal(daily.body.transferSatang, 5000);
  assert.equal(daily.body.attendanceCount, 5);
  assert.equal(daily.body.memberVisits, 1);
  const monthly = await staff.get('/api/reports/monthly?month=2026-10');
  assert.equal(monthly.status, 200);
  assert.equal(monthly.body.revenueSatang, 20000);
  assert.equal(monthly.body.days.length, 31);
  const dash = await admin.get('/api/dashboard?from=' + day + '&to=' + day);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.selected.revenueSatang, 20000);
  assert.equal((await staff.get('/api/reports/daily?date=2026-02-30')).status, 400);
  assert.equal((await staff.get('/api/attendance?from=2027-01-01&to=2020-01-01')).status, 400);
});
test('cancellation voids income and preserves transaction and audit', async () => {
  const r = await staff
    .post('/api/attendance/' + attendance.id + '/cancel')
    .set('x-csrf-token', staffCsrf)
    .send({ reason: 'บันทึกผิด' });
  assert.equal(r.status, 200);
  const report = await staff.get('/api/reports/daily?date=' + day);
  assert.equal(report.body.revenueSatang, 5000);
  assert.equal(report.body.attendanceCount, 2);
  assert.equal(await db.attendance.count({ where: { id: attendance.id } }), 1);
  assert.equal(
    (
      await staff
        .post('/api/attendance/' + attendance.id + '/cancel')
        .set('x-csrf-token', staffCsrf)
        .send({ reason: 'again' })
    ).status,
    409,
  );
});
test('disabling staff revokes existing sessions and last admin is protected', async () => {
  const u = await db.user.findUnique({ where: { username: 'STAFF' } });
  const disable = await admin
    .put('/api/users/' + u.id)
    .set('x-csrf-token', adminCsrf)
    .send({ username: u.username, name: u.name, role: 'STAFF', active: false });
  assert.equal(disable.status, 200);
  assert.equal((await staff.get('/api/members')).status, 401);
  const a = await db.user.findUnique({ where: { username: 'ADMIN' } });
  assert.equal(
    (
      await admin
        .put('/api/users/' + a.id)
        .set('x-csrf-token', adminCsrf)
        .send({ username: a.username, name: a.name, role: 'STAFF', active: false })
    ).status,
    400,
  );
});
test('changing own password revokes the active session without touch recreating it', async () => {
  const a = await db.user.findUnique({ where: { username: 'ADMIN' } });
  const changed = await admin
    .put('/api/users/' + a.id)
    .set('x-csrf-token', adminCsrf)
    .send({
      username: a.username,
      name: a.name,
      role: 'ADMIN',
      active: true,
      password: randomBytes(24).toString('hex'),
    });
  assert.equal(changed.status, 200);
  assert.equal((await admin.get('/api/auth/me')).body.user, null);
});
test('logout destroys session', async () => {
  assert.equal(
    (await customer.post('/api/auth/logout').set('x-csrf-token', customerCsrf).send({})).status,
    200,
  );
  assert.equal((await customer.get('/api/auth/me')).body.user, null);
});
