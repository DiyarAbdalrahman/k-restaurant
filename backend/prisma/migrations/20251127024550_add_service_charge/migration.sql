/*
  Warnings:

  - Made the column `subtotal` on table `Order` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "serviceCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "subtotal" SET NOT NULL;
