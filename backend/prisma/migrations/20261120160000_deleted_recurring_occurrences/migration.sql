
CREATE TABLE "DeletedRecurringOccurrence" (
    "recurringTaskId" TEXT NOT NULL,
    "occurrenceNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedRecurringOccurrence_pkey"
        PRIMARY KEY ("recurringTaskId", "occurrenceNumber"),

    CONSTRAINT "DeletedRecurringOccurrence_recurringTaskId_fkey"
        FOREIGN KEY ("recurringTaskId")
        REFERENCES "RecurringTask"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
