-- Add POS setting to hide discount controls
ALTER TABLE "Settings"
ADD COLUMN "posShowDiscounts" BOOLEAN NOT NULL DEFAULT true;
