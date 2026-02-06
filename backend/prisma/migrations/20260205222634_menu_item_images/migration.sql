-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "menuShowItemImages" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "posShowPaymentHistory" BOOLEAN NOT NULL DEFAULT true;
