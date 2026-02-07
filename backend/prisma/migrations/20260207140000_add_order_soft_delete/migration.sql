-- Add soft delete fields to Order
ALTER TABLE "Order" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "deletedByUserId" TEXT;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_deletedByUserId_fkey"
FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
