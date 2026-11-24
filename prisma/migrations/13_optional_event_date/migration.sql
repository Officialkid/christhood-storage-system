-- AlterTable: make Event.date optional (nullable) so events/camps can be created without a fixed date
ALTER TABLE "Event" ALTER COLUMN "date" DROP NOT NULL;
