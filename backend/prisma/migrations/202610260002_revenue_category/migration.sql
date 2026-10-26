-- Keep financial rows attached to a valid category and exactly one source.
CREATE TABLE "new_RevenueRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT,
    "attendanceId" TEXT,
    "date" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevenueRecord_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RevenueRecord_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RevenueRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RevenueRecord_one_source" CHECK (("paymentId" IS NULL) != ("attendanceId" IS NULL)),
    CONSTRAINT "RevenueRecord_nonnegative" CHECK ("amountSatang" >= 0)
);
INSERT INTO "new_RevenueRecord" SELECT * FROM "RevenueRecord";
DROP TABLE "RevenueRecord";
ALTER TABLE "new_RevenueRecord" RENAME TO "RevenueRecord";
CREATE UNIQUE INDEX "RevenueRecord_paymentId_key" ON "RevenueRecord"("paymentId");
CREATE UNIQUE INDEX "RevenueRecord_attendanceId_key" ON "RevenueRecord"("attendanceId");
CREATE INDEX "RevenueRecord_date_categoryId_idx" ON "RevenueRecord"("date", "categoryId");
