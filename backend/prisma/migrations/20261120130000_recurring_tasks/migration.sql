
ALTER TABLE "CleaningTask"
ADD COLUMN "recurringTaskId" TEXT,
ADD COLUMN "occurrenceNumber" INTEGER;

CREATE TABLE "RecurringTask" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "alternateTitle" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "assigneeIds" TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CleaningTask_recurringTaskId_occurrenceNumber_key"
ON "CleaningTask"("recurringTaskId", "occurrenceNumber");

CREATE INDEX "RecurringTask_groupId_active_idx"
ON "RecurringTask"("groupId", "active");

ALTER TABLE "RecurringTask"
ADD CONSTRAINT "RecurringTask_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "HouseholdGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringTask"
ADD CONSTRAINT "RecurringTask_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CleaningTask"
ADD CONSTRAINT "CleaningTask_recurringTaskId_fkey"
FOREIGN KEY ("recurringTaskId") REFERENCES "RecurringTask"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
