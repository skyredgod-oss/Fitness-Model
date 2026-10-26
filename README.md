# WU Fitness — ระบบบริหารจัดการศูนย์ออกกำลังกาย

ระบบ Full Stack ภาษาไทยสำหรับมหาวิทยาลัยวลัยลักษณ์: React + Vite + TypeScript + Tailwind CSS, Express + TypeScript, SQLite + Prisma, Session Authentication, Recharts, Lucide, Multer, Zod และรายงาน HTML Print A4

## โครงสร้าง

```text
Fitness-Model/
├── backend/
│   ├── prisma/schema.prisma       # User, Member, Category, Attendance, Payment,
│   │                             # Slip, Revenue, AuditLog, Setting, Session
│   ├── prisma/migrations/         # SQL migrations ที่นำไปใช้ซ้ำได้
│   ├── prisma/seed.ts             # ประเภทและราคาตัวอย่าง ไม่มีรหัสผ่าน
│   ├── prisma.config.ts          # SQLite migration adapter
│   ├── src/app.ts                 # REST API, Validation, RBAC, uploads, reports
│   ├── src/core.ts                # Prisma, persistent session store, audit
│   ├── src/create-admin.ts        # สร้าง Admin โดยไม่แสดงรหัสผ่าน
│   ├── src/app.test.ts            # API integration tests ฐานข้อมูลแยก
│   ├── tests/server.ts            # isolated server สำหรับ browser tests
│   ├── .env.example
│   └── data/slips/                # ไฟล์ส่วนตัว ไม่เข้า Git ไม่ใช่ static assets
├── frontend/src/
│   ├── main.tsx                  # หน้าจอภาษาไทยและฟอร์มเชื่อม API
│   ├── api.ts                    # CSRF, API client, money และวันที่ไทย
│   └── style.css                 # responsive, desktop/mobile, A4 print
├── scripts/init-env.mjs           # สร้างค่าเซสชันสุ่มโดยไม่เขียนทับ config เดิม
├── tests/workflow.spec.ts         # desktop และ mobile browser tests
├── playwright.config.ts
├── package.json                  # npm workspaces และคำสั่งรวม
└── package-lock.json
```

## เปิดใช้งานบน Windows PC

ติดตั้ง Node.js 22.12 ขึ้นไป (แนะนำ Node.js 24 LTS), npm และ Git รองรับ Windows x64 ใช้ PowerShell หรือ Terminal ปกติ ไม่ต้องติดตั้งฐานข้อมูลแยก

จากโฟลเดอร์โปรเจกต์:

```powershell
npm ci
npm run setup
npm run admin:create
npm run dev
```

- `setup` สร้าง `backend/.env` เมื่อยังไม่มี พร้อม `SESSION_SECRET` ที่สุ่มอย่างปลอดภัย จากนั้น generate Prisma Client, migrate และ seed ประเภทบริการ หากมี `.env` อยู่แล้วจะคงเดิม สามารถคัดลอก `backend/.env.example` ไปเป็น `backend/.env` แล้วกำหนดค่าเองได้ (Session secret อย่างน้อย 32 ตัวอักษร)
- `admin:create` ถามชื่อผู้ใช้ ชื่อแสดง และรหัสผ่านอย่างน้อย 12 ตัวอักษรแบบซ่อน พร้อมยืนยันอีกครั้ง ไม่มีบัญชีหรือรหัสผ่านเริ่มต้นใน source code ต้องสร้าง Admin ก่อนเข้าสู่ระบบ
- สร้าง Staff/Customer เพิ่มผ่านหน้าตั้งค่าระบบของ Admin การแก้ไขบัญชีจะยกเลิกเซสชันเดิมของบัญชีนั้น
- ปิดเซิร์ฟเวอร์ด้วย Ctrl+C

URL **เฉพาะเครื่อง PC ที่รันโปรแกรม**:

| หน้า | URL |
|---|---|
| เข้าระบบเจ้าหน้าที่ | `http://localhost:5173/login` |
| ส่งหลักฐานการชำระเงิน | `http://localhost:5173/submit-payment` |
| ตรวจสถานะด้วยเลขอ้างอิง + รหัสตรวจสอบ | `http://localhost:5173/payment-status` |
| Backend health | `http://localhost:3001/api/health` |

ยังไม่มีการ Deploy ออนไลน์ URL localhost ไม่ใช่ลิงก์สาธารณะ หากทดสอบจากโทรศัพท์ในเครือข่ายเดียวกัน ให้ใช้ IP ของ PC แทน localhost ที่พอร์ต 5173 และตั้งค่า firewall ตามเครือข่ายของหน่วยงาน ทดสอบ responsive ด้วย browser tests ได้โดยไม่ต้องใช้โทรศัพท์จริง

### Build และรันไฟล์ที่ Build แล้ว

```powershell
npm run build
npm start
```

Express ให้บริการทั้งหน้าเว็บและ API ที่ `http://localhost:3001` โดยไม่ต้องเปิด Vite สำหรับทดสอบในเครื่อง

การให้บริการจริงผ่านอินเทอร์เน็ตต้องตั้ง `NODE_ENV=production` ใน `backend/.env`, ใช้ HTTPS reverse proxy และกำหนด `TRUST_PROXY=1` เฉพาะเมื่ออยู่หลัง proxy ที่เชื่อถือได้หนึ่งชั้น ตั้งค่า secret ใหม่สำหรับแต่ละการติดตั้ง Production cookies เป็น Secure จึงใช้ผ่าน HTTP ไม่ได้ คำสั่ง `npm ci` ต้องรวม development dependencies ระหว่าง build และ migration

## ฟีเจอร์ที่ทำแล้ว

- Login / Logout, bcrypt password hashing, session เก็บใน SQLite อายุ 8 ชั่วโมงและต่ออายุเมื่อใช้งาน, regenerate session หลัง Login, ปิดใช้งานบัญชีมีผลทันที, CSRF token, RBAC Admin / Staff / Customer
- Dashboard จากฐานข้อมูล: รายได้วันนี้/เดือนนี้ ผู้เข้าใช้ สมาชิก รายการรอตรวจสอบ กราฟรายได้ 7 วัน/รายเดือน และแถบจำนวนเข้าใช้แยกประเภทตามช่วงวันที่
- Admin เพิ่ม/แก้ไข/ปิดประเภทบริการและราคา ระยะเวลาสมาชิก ชื่อหน่วยงาน และบัญชีผู้ใช้งาน
- สมาชิก: เลขไม่ซ้ำ ค้นหาชื่อ/เลข แก้ไขข้อมูล วันเริ่ม/หมดอายุ ตรวจสิทธิ์ก่อนเข้าใช้ และดูประวัติรายคน
- การเข้าใช้: เพิ่ม แก้ไข ยกเลิกพร้อมเหตุผล กรองวันที่/ประเภท จำนวน × ราคาจากฐานข้อมูลที่ backend และ audit ทุกการเปลี่ยนแปลง
- สลิปทั้งบุคคลทั่วไป/Customer/Staff: JPG/JPEG PNG WEBP ไม่เกิน 5 MB ตรวจ format และ decode ภาพจริง จำกัดภาพ 25 ล้านพิกเซล เปลี่ยนชื่อสุ่ม แปลงเป็น WEBP เพื่อล้าง metadata เก็บนอก public ใช้ API ตรวจสิทธิ์ อ่านภาพได้เฉพาะ Admin/Staff
- ป้องกันไฟล์สลิปซ้ำด้วย SHA-256 + unique constraint, reference สุ่มไม่ซ้ำ, rate limit การส่ง/ค้นหา/เข้าสู่ระบบ
- Modal สลิป, อนุมัติ/ปฏิเสธบังคับเหตุผล, เจ้าหน้าที่และเวลาตรวจสอบ, ยกเลิกพร้อม audit โดยไม่ลบข้อมูล
- อนุมัติใน database transaction มี conditional status update และ unique RevenueRecord ป้องกันอนุมัติซ้ำรวมถึงพร้อมกัน
- ตรวจสถานะสาธารณะต้องใช้ทั้ง reference และรหัสสุ่มส่วนตัวที่แสดงเพียงครั้งเดียว เก็บเฉพาะ hash ใน DB ไม่เผยชื่อ สมาชิก หรือสลิปในผลค้นหา
- รายงานรายวัน รายเดือน การชำระเงิน รายได้เงินสด/โอน ผู้เข้าใช้/สมาชิก ช่องลายเซ็น และ Print/PDF A4 แนวตั้ง/แนวนอน ซ่อนส่วนควบคุมเมื่อพิมพ์ รองรับหลายหน้า
- UI responsive ม่วง/ขาว Sidebar บน PC เมนูเลื่อนบนมือถือ ตารางเลื่อนแนวนอน Toast, Loading, Empty และ Error states

## กติกาการเงินและสมาชิก

เงินทุกจำนวนเก็บเป็น **สตางค์จำนวนเต็ม** และแสดงเป็นบาท ไม่ใช้เลขทศนิยมคำนวณยอดใน backend ยอดต่อรายการไม่เกิน 1,000,000 บาท

1. การเข้าใช้แบบ `CASH`: นับรายได้ทันทีตามจำนวน × ราคาประเภทในเวลาบันทึก พร้อม snapshot ราคาต่อคน
2. การเข้าใช้แบบ `MEMBER`: ตรวจวันเริ่ม/หมดอายุ สถานะ ประเภทสมาชิก และจำนวนหนึ่งคน ไม่บวกค่าบริการซ้ำ
3. การชำระเงิน `PENDING` / `REJECTED`: ไม่นับรายได้
4. การชำระเงิน `APPROVED`: ลง RevenueRecord เพียงครั้งเดียว รายได้ตามวันที่ทำรายการและวิธีชำระ
5. การเข้าใช้แบบ `PAYMENT`: ต้องเลือก payment ที่อนุมัติ วันที่ ประเภท ยอด และสมาชิกตรงกัน หนึ่ง payment ผูกได้หนึ่ง attendance ไม่มีรายได้เพิ่มจาก attendance นั้น เหมาะกับการรับเงินโอนก่อนบันทึกเข้าใช้
6. ต้องยกเลิก attendance ที่ผูกอยู่ก่อนยกเลิก payment ระบบ void รายได้และเก็บประวัติทั้งหมด ไม่ลบธุรกรรม
7. แก้ไข attendance จะคำนวณด้วยราคา **ปัจจุบัน** ของประเภทนั้นและบันทึก audit ก่อน/หลัง ควรตรวจยอดก่อนบันทึก ไม่แก้ราคาประเภทเพื่อเปลี่ยนรายงานย้อนหลัง
8. จำนวนผู้เข้าใช้คือผลรวม count ส่วนสมาชิกแสดงทั้งจำนวนครั้งเข้าใช้และจำนวนคนไม่ซ้ำในช่วงวันที่ อนุญาตให้สมาชิกเข้าใช้หลายครั้งต่อวัน
9. วันที่ธุรกิจยึด `Asia/Bangkok` และเก็บเป็น YYYY-MM-DD; วันเวลาตรวจสอบเก็บ timestamp และแสดงตามเวลาประเทศไทย

ราคาที่ seed ให้เป็น **ตัวอย่างเท่านั้น** ต้องให้มหาวิทยาลัยยืนยันและแก้ไขในหน้า Admin ก่อนรับเงินจริง seed เพิ่มเฉพาะประเภทที่ยังไม่มี ไม่เขียนทับราคา/สถานะที่ Admin เปลี่ยนแล้ว ไม่มีข้อมูลธุรกรรมจำลองในฐานข้อมูลใช้งาน

การอนุมัติสลิปเป็นการตรวจโดยเจ้าหน้าที่ **ไม่มีการเชื่อมธนาคารหรือยืนยันการโอนอัตโนมัติ** และการอนุมัติชำระเงินไม่สร้าง/ต่ออายุสมาชิกอัตโนมัติ ให้เจ้าหน้าที่บันทึกสมาชิกตามระยะเวลาที่ซื้อ รายงานเป็นเอกสารจากระบบ ยังไม่ใช่แบบฟอร์มที่มหาวิทยาลัยรับรอง

## API

เรียก `GET /api/auth/me` ก่อนเพื่อรับ session cookie และ `csrfToken` จากนั้นทุกคำขอ POST/PUT ส่ง header `x-csrf-token` เมื่อ login สำเร็จให้เปลี่ยนไปใช้ token ใหม่จาก response Frontend จัดการให้แล้ว ไม่มี CORS ข้าม origin ใช้ Vite proxy หรือ Express origin เดียว

| กลุ่ม | Endpoints | สิทธิ์ |
|---|---|---|
| Authentication | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | สาธารณะ / session |
| ประเภท | `GET /api/categories` | สาธารณะเห็นเฉพาะเปิดใช้งาน |
| ประเภท | `POST /api/categories`, `PUT /api/categories/:id` | Admin |
| สมาชิก | `GET/POST /api/members`, `GET/PUT /api/members/:id` | Admin, Staff |
| เข้าใช้ | `GET/POST /api/attendance`, `PUT /api/attendance/:id`, `POST /api/attendance/:id/cancel` | Admin, Staff |
| ส่งสลิป | `POST /api/payments` multipart `slip` + ข้อมูลรายการ | สาธารณะ (โอน), Staff/Admin (โอน/เงินสด) |
| ตรวจสถานะ | `POST /api/payments/lookup` JSON reference + verificationCode | สาธารณะ, จำกัดความถี่ |
| ตรวจสลิป | `GET /api/payments`, `GET /api/payments/:id`, `GET /api/payments/:id/slip` | Admin, Staff |
| ตรวจรายการ | `POST /api/payments/:id/approve`, `/reject`, `/cancel` | Admin, Staff |
| Dashboard | `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` | Admin, Staff |
| รายงาน | `GET /api/reports/daily?date=YYYY-MM-DD`, `/monthly?month=YYYY-MM`, `/payments?from=…&to=…` | Admin, Staff |
| ตั้งค่า | `GET /api/settings`, `PUT /api/settings` | อ่านชื่อหน่วยงานสาธารณะ, แก้ไข Admin |
| บัญชี | `GET/POST /api/users`, `PUT /api/users/:id` | Admin |
| Audit | `GET /api/audit?entity=Attendance&entityId=…` | Admin |

รายการ attendance/payment ใช้ `from`, `to`; attendance รองรับ `categoryId`, payments รองรับ `status`; members รองรับ `q` หน้า list จำกัด 500 สมาชิก / 1,000 ธุรกรรมต่อช่วง และ audit 300 รายการล่าสุด รายงานรวม **ไม่ตัดจำนวนแถว** เลือกช่วงไม่เกิน 366 วันสำหรับ API ที่ใช้ from/to

## การทดสอบ

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

- API integration tests สร้าง SQLite และพื้นที่สลิปใน temporary directory ใช้ migration จริง สร้างบัญชีทดสอบรหัสสุ่มเฉพาะรอบ แล้วลบทิ้ง ไม่แก้ DB ใช้งาน
- Browser tests ทดสอบ Desktop Chrome และ mobile viewport (Pixel 7) บน Chromium: login, เพิ่มสมาชิก, บันทึกเข้าใช้, รายงาน, print PDF, ส่งสลิปจริง, ตรวจสถานะ, Staff อนุมัติ, สิทธิ์เมนู, ไฟล์ปลอม และตรวจว่าไม่มี horizontal overflow ของทั้งหน้า
- หากมี Chromium ในเครื่องอยู่แล้ว ให้กำหนด `CHROMIUM_PATH` เป็นพาธ executable แทนการติดตั้ง browser (PowerShell: `$env:CHROMIUM_PATH="C:\path\to\chrome.exe"`; Linux: `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`)
- ผลภาพ/PDF ของ browser test อยู่ใน `test-results/` และ trace เมื่อไม่ผ่าน ไม่มีข้อมูลผู้ใช้จริงในผลทดสอบ
- การทดสอบ mobile เป็น browser emulation ไม่ใช่การรับรองบนอุปกรณ์จริงทุกยี่ห้อ และยังไม่ได้ทดสอบบน Windows จริงใน cloud Linux นี้

## การเก็บข้อมูลและการดูแล

- SQLite อยู่ที่ `backend/prisma/fitness.db` ค่า relative `DATABASE_URL` อ้างอิงจาก `backend/prisma/` เสมอทั้ง runtime และ migration รองรับ absolute file URL
- เก็บ `backend/.env`, DB, journal/WAL ถ้ามี และ `backend/data/slips/` ให้ปลอดภัย ห้าม commit หรือวางใน public directory สำรองข้อมูลเมื่อหยุดเซิร์ฟเวอร์แล้ว เพื่อให้ DB และสลิปตรงกัน
- ค่า `UPLOAD_DIR` (absolute path) เปลี่ยนพื้นที่สลิปได้ ต้องสำรองพื้นที่นั้นแทน default
- ปิดใช้งานบัญชีและเปลี่ยนรหัสผ่านได้ผ่าน Admin; หากไม่เหลือข้อมูลบัญชี Admin ให้ใช้ `npm run admin:create` บนเครื่องเซิร์ฟเวอร์ที่ได้รับสิทธิ์
- SESSION_SECRET ใช้ค่าจริงใน process ของเครื่อง ไม่ใช่ proxy placeholder ห้ามใส่ใน frontend หรือ chat เปลี่ยนค่าแล้วให้ล้างเซสชันเก่าและ restart
- เครื่อง Windows ควรมีฟอนต์ไทย Tahoma/Noto Sans Thai และเลือก Save as PDF ผ่าน print dialog
- Prisma 6.19.0 ใช้ stable JavaScript query engine กับ official `@prisma/adapter-libsql` เพื่ออ่านไฟล์ SQLite ในเครื่อง ไม่ใช้ Turso/cloud database Migration ใช้ JavaScript schema engine ที่ Prisma 6 ยังระบุเป็น experimental จึง pin Prisma และ adapter เวอร์ชันเดียวกัน ควรสำรอง DB และทดสอบ migrations ก่อนอัปเกรด
- ไม่ต้องใช้ secret ธนาคารหรือ GitHub token เพิ่มสำหรับฟังก์ชันที่พัฒนา ไม่ต้องเปิดโดเมน `binaries.prisma.sh` สำหรับ engine แบบนี้

## ขอบเขตที่ยังไม่ได้ทำ / ยังไม่ยืนยัน

- ยังไม่ได้ Deploy ออนไลน์ ติดตั้งโดเมน/HTTPS หรือเชื่อมระบบยืนยันตัวตนมหาวิทยาลัย (SSO)
- ยังไม่ได้เชื่อมธนาคาร ตรวจสลิปอัตโนมัติ ส่งอีเมล/SMS หรือระบบบัญชีภายนอก
- ไม่ต่ออายุสมาชิกอัตโนมัติจากการอนุมัติ และยังไม่มีหน้าสมัครบัญชี Customer ด้วยตนเอง (Admin สร้างได้ หรือใช้หน้าส่งหลักฐานสาธารณะ)
- ยังไม่มี pagination/export Excel; ใช้ช่วงวันที่แคบลงสำหรับหน้า list ที่มีข้อมูลมาก รายงานรวมยังใช้ข้อมูลครบช่วง
- ต้องยืนยันอัตราค่าบริการจริง ข้อมูลบัญชีรับเงิน และรูปแบบเอกสารกับหน่วยงานก่อนใช้งานรับเงินจริง

## ผลตรวจบน cloud environment (26 ตุลาคม 2569)

- ติดตั้งซ้ำด้วย `npm ci` จาก lockfile, `npm run setup` ซ้ำโดยไม่เขียนทับค่าเดิม, migration และ seed: ผ่าน
- `npm run build`: Backend TypeScript + Frontend TypeScript/Vite ผ่าน
- `npm test`: 15 ผ่าน, 0 ไม่ผ่าน, 0 ข้าม รวมอนุมัติพร้อมกัน ป้องกันรายได้ซ้ำ RBAC การอัปโหลด และรายงาน
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: 6 ผ่าน ทั้ง Desktop และ Pixel 7 emulation
- PDF รายงานทดสอบเป็น A4 จริง 1 หน้า และอ่าน text ภาษาไทยออกจากไฟล์ได้
- CLI สร้าง Admin: ผ่านกับฐานข้อมูลทดสอบแยก (ไม่สร้างบัญชีรหัสผ่านทดสอบใน DB ใช้งาน)
- `npm audit --omit=dev`: ไม่พบช่องโหว่ ณ รอบตรวจนี้ ไม่ได้เป็นการรับรองว่าจะไม่มีประกาศช่องโหว่ใหม่ภายหลัง
- Root `overrides` อัปเดต transitive `effect` และ `deepmerge-ts` ของ Prisma config เพื่อแก้ประกาศช่องโหว่ โดยตรวจ generate, migrate, seed, build และ integration tests กับเวอร์ชันดังกล่าวแล้ว

สถานะนี้เป็นผลทดสอบบน Linux และ Chromium ไม่ใช่ผลทดสอบบน Windows จริง และยังไม่ได้เผยแพร่เว็บไซต์ออนไลน์
