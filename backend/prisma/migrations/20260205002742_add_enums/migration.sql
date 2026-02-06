-- Create enums
CREATE TYPE "UserRole" AS ENUM ('pos', 'kitchen', 'manager', 'admin', 'waiter');
CREATE TYPE "OrderType" AS ENUM ('dine_in', 'takeaway');
CREATE TYPE "OrderStatus" AS ENUM ('open', 'sent_to_kitchen', 'in_progress', 'ready', 'served', 'paid', 'cancelled');
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'split');
CREATE TYPE "PaymentKind" AS ENUM ('payment', 'refund');

-- Cast existing columns to enums
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole" USING ("role"::"UserRole");

ALTER TABLE "Order"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "OrderType" USING ("type"::"OrderType"),
  ALTER COLUMN "status" TYPE "OrderStatus" USING ("status"::"OrderStatus"),
  ALTER COLUMN "status" SET DEFAULT 'open';

ALTER TABLE "Payment"
  ALTER COLUMN "kind" DROP DEFAULT,
  ALTER COLUMN "method" TYPE "PaymentMethod" USING ("method"::"PaymentMethod"),
  ALTER COLUMN "kind" TYPE "PaymentKind" USING ("kind"::"PaymentKind"),
  ALTER COLUMN "kind" SET DEFAULT 'payment';
