-- Convert existing split payments to cash
UPDATE "Payment" SET "method" = 'cash' WHERE "method" = 'split';

-- Create new enum without split
CREATE TYPE "PaymentMethod_new" AS ENUM ('cash', 'card');

-- Drop default before altering
ALTER TABLE "Payment" ALTER COLUMN "method" DROP DEFAULT;

-- Cast to new enum
ALTER TABLE "Payment"
  ALTER COLUMN "method" TYPE "PaymentMethod_new"
  USING ("method"::text::"PaymentMethod_new");

-- Replace old enum
DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";

-- Re-apply default if needed (optional)
-- ALTER TABLE "Payment" ALTER COLUMN "method" SET DEFAULT 'cash';
