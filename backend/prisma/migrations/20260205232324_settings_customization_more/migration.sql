-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "brandTagline" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "posMenuCardSize" TEXT NOT NULL DEFAULT 'md',
ADD COLUMN     "posShowCategoryShortcuts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "posShowFavorites" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "posShowHeaderImage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "posShowRecent" BOOLEAN NOT NULL DEFAULT true;
