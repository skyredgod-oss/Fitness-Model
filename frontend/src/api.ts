let csrf = '';
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      'x-csrf-token': csrf,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({ error: 'ไม่สามารถเชื่อมต่อระบบได้' }));
  if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  if (data.csrfToken) csrf = data.csrfToken;
  return data;
}
export const send = (url: string, body: unknown, method = 'POST') =>
  api(url, { method, body: JSON.stringify(body) });
export const money = (value: number) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value / 100,
  );
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const dateLabel = (day: string) =>
  new Date(day + 'T00:00:00+07:00').toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  });
export const statusLabel: Record<string, string> = {
  PENDING: 'รอตรวจสอบ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ปฏิเสธ',
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  MEMBER: 'สิทธิ์สมาชิก',
  PAYMENT: 'รายการโอนที่อนุมัติ',
  ADMIN: 'ผู้ดูแลระบบ',
  STAFF: 'เจ้าหน้าที่',
  CUSTOMER: 'ผู้ใช้บริการ',
};
