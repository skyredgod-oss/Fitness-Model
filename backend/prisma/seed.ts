import { db } from '../src/core.js';
// Example rates only. Insert missing categories; preserve administrator changes.
const rows = [
  ['STUDENT', 'นักศึกษา', 2000, 0],
  ['COLLEGE', 'นักศึกษาวิทยาลัย', 2000, 0],
  ['PERSONNEL', 'บุคลากร', 3000, 0],
  ['PUPIL', 'นักเรียน', 2000, 0],
  ['PUBLIC', 'บุคคลทั่วไป', 5000, 0],
  ['MONTH', 'สมาชิกรายเดือน', 50000, 30],
  ['QUARTER', 'สมาชิกราย 3 เดือน', 140000, 90],
  ['YEAR', 'สมาชิกรายปี', 500000, 365],
] as const;
try {
  for (const [code, name, priceSatang, durationDays] of rows)
    await db.serviceCategory.upsert({
      where: { code },
      update: {},
      create: { code, name, priceSatang, durationDays },
    });
  await db.systemSetting.upsert({
    where: { key: 'department' },
    update: {},
    create: { key: 'department', value: 'ศูนย์ออกกำลังกาย มหาวิทยาลัยวลัยลักษณ์' },
  });
  console.log(
    'Seed complete. Example rates must be confirmed by the university. No accounts or transactions created.',
  );
} finally {
  await db.$disconnect();
}
