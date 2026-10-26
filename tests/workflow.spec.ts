import { test, expect } from '@playwright/test';
import path from 'node:path';
async function login(page: any, role = 'admin') {
  await page.goto('/login');
  await page.getByLabel('ชื่อผู้ใช้', { exact: true }).fill(role);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ภาพรวมศูนย์ออกกำลังกาย' })).toBeVisible();
}
async function navigate(page: any, name: string, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  await page.getByRole('link', { name, exact: true }).click();
}
test('Thai login, member creation, attendance, reports and responsive navigation', async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await navigate(page, 'จัดการสมาชิก', isMobile);
  await page.getByRole('button', { name: 'เพิ่มสมาชิก', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('เลขสมาชิก', { exact: true }).fill('UI-' + info.project.name);
  await dialog
    .getByLabel('ชื่อ-นามสกุล', { exact: true })
    .fill('สมาชิกหน้าจอ ' + info.project.name);
  await dialog
    .getByLabel('ประเภทสมาชิก', { exact: true })
    .selectOption({ label: 'สมาชิกรายเดือน · ฿500.00' });
  await dialog.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('UI-' + info.project.name, { exact: true })).toBeVisible();
  await navigate(page, 'บันทึกการเข้าใช้', isMobile);
  await page.getByRole('button', { name: 'เพิ่มการเข้าใช้' }).click();
  const attendance = page.getByRole('dialog');
  await attendance
    .getByLabel('ประเภทบริการ', { exact: true })
    .selectOption({ label: 'บุคคลทั่วไป · ฿50.00' });
  await attendance.getByLabel('จำนวนผู้เข้าใช้').fill('2');
  await attendance.getByRole('button', { name: 'บันทึกข้อมูล' }).click();
  await expect(attendance).toBeHidden();
  await expect(page.getByRole('cell', { name: '฿ 100.00', exact: true }).first()).toBeVisible();
  await navigate(page, 'รายงานและพิมพ์', isMobile);
  await expect(
    page.getByRole('heading', { name: 'มหาวิทยาลัยวลัยลักษณ์', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('ผู้จัดทำรายงาน', { exact: false })).toBeVisible();
  if (!isMobile) {
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'พิมพ์รายงาน' })).toBeHidden();
    await page.pdf({
      path: info.outputPath('daily-report.pdf'),
      format: 'A4',
      printBackground: true,
    });
    await page.emulateMedia({ media: 'screen' });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('report.png'), fullPage: true });
  expect(errors).toEqual([]);
});
test('public submits slip, tracks status, staff reviews and approves', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/submit-payment');
  await page.getByLabel('ชื่อ-นามสกุล', { exact: true }).fill('ผู้ชำระ ' + info.project.name);
  await page
    .getByLabel('ประเภทผู้ใช้บริการ', { exact: true })
    .selectOption({ label: 'บุคคลทั่วไป · ฿50.00' });
  // Different actual images for each project; never reuse another payment's slip.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 120;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#eee8f8';
    ctx.fillRect(0, 0, 160, 120);
    ctx.fillStyle = '#63329b';
    ctx.fillText('UI ' + Date.now(), 8, 50);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page
    .getByLabel('แนบรูปสลิป')
    .setInputFiles({ name: 'slip.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByAltText('ตัวอย่างสลิปก่อนส่ง')).toBeVisible();
  await page.getByRole('button', { name: 'ส่งหลักฐานการชำระเงิน', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ส่งหลักฐานเรียบร้อยแล้ว' })).toBeVisible();
  const reference = await page.getByLabel('เลขอ้างอิง', { exact: true }).inputValue();
  const code = await page.getByLabel('รหัสตรวจสอบส่วนตัว', { exact: true }).inputValue();
  await page.getByRole('link', { name: 'ตรวจสอบสถานะ', exact: true }).last().click();
  await page.getByLabel('เลขอ้างอิงรายการ').fill(reference);
  await page.getByLabel('รหัสตรวจสอบส่วนตัว').fill(code);
  await page.getByRole('button', { name: 'ตรวจสอบสถานะ', exact: true }).click();
  await expect(page.getByText('รอตรวจสอบ', { exact: true })).toBeVisible();
  await login(page, 'staff');
  await navigate(page, 'ตรวจสอบการชำระเงิน', isMobile);
  const row = page.getByRole('row').filter({ hasText: reference });
  await row.getByRole('button', { name: 'ดูสลิป' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('img')).toBeVisible();
  expect(
    await modal
      .getByRole('img')
      .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0),
  ).toBe(true);
  await modal.getByRole('button', { name: 'ปิด', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(row.getByText('อนุมัติแล้ว', { exact: true })).toBeVisible();
  if (isMobile) {
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    await expect(page.getByRole('link', { name: 'ตั้งค่าระบบ', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'ปิดเมนู', exact: true }).click();
  } else await expect(page.getByRole('link', { name: 'ตั้งค่าระบบ', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('payments.png'), fullPage: true });
});
test('invalid upload shows error and keeps form usable', async ({ page }) => {
  await page.goto('/submit-payment');
  await page.getByLabel('ชื่อ-นามสกุล', { exact: true }).fill('ทดสอบไฟล์');
  await page
    .getByLabel('ประเภทผู้ใช้บริการ', { exact: true })
    .selectOption({ label: 'บุคคลทั่วไป · ฿50.00' });
  await page
    .getByLabel('แนบรูปสลิป')
    .setInputFiles({
      name: 'fake.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not a real image'),
    });
  await page.getByRole('button', { name: 'ส่งหลักฐานการชำระเงิน', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ไฟล์รูปภาพไม่ถูกต้อง');
  await expect(
    page.getByRole('button', { name: 'ส่งหลักฐานการชำระเงิน', exact: true }),
  ).toBeEnabled();
});
