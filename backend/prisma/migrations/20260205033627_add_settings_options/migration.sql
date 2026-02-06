-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT 'Kurda Restaurant',
    "brandColor" TEXT NOT NULL DEFAULT '#e11d48',
    "accentColor" TEXT NOT NULL DEFAULT '#f43f5e',
    "backgroundColor" TEXT NOT NULL DEFAULT '#000000',
    "cardColor" TEXT NOT NULL DEFAULT '#0b0b0b',
    "logoUrl" TEXT,
    "headerImageUrl" TEXT,
    "receiptFooterText" TEXT NOT NULL DEFAULT 'Thank you!',
    "defaultTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultServiceChargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posCompactDefault" BOOLEAN NOT NULL DEFAULT false,
    "posHideReadyMinutes" INTEGER NOT NULL DEFAULT 10,
    "kitchenSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "kitchenLoudSound" BOOLEAN NOT NULL DEFAULT false,
    "kitchenAutoHideReadyMinutes" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
