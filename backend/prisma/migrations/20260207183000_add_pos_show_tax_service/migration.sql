-- Add POS setting to hide service/tax controls
ALTER TABLE "Settings"
ADD COLUMN "posShowServiceCharge" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Settings"
ADD COLUMN "posShowTax" BOOLEAN NOT NULL DEFAULT true;
