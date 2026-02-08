-- Add posCategoryOrder to Settings
ALTER TABLE "Settings" ADD COLUMN "posCategoryOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
