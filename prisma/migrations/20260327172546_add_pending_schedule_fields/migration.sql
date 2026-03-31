-- AlterTable
ALTER TABLE "prospectos" ADD COLUMN "pendingScheduleEvent" TEXT;
ALTER TABLE "prospectos" ADD COLUMN "pendingScheduleLabel" TEXT;
ALTER TABLE "prospectos" ADD COLUMN "pendingScheduleStart" DATETIME;
