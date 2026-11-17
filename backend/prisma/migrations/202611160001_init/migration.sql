CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'COMPLETED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMP(3),
  "verificationToken" TEXT,
  "verificationTokenExpires" TIMESTAMP(3),
  "resetToken" TEXT,
  "resetTokenExpires" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HouseholdGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HouseholdGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usesLimit" INTEGER NOT NULL DEFAULT 1,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CleaningTask" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "assigneeId" TEXT,
  "creatorId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CleaningTask_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaskCompletion" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");
CREATE UNIQUE INDEX "Invitation_codeHash_key" ON "Invitation"("codeHash");
CREATE INDEX "CleaningTask_groupId_scheduledAt_idx" ON "CleaningTask"("groupId", "scheduledAt");
CREATE INDEX "CleaningTask_assigneeId_status_idx" ON "CleaningTask"("assigneeId", "status");
CREATE UNIQUE INDEX "TaskCompletion_taskId_userId_key" ON "TaskCompletion"("taskId", "userId");
CREATE INDEX "TaskCompletion_userId_completedAt_idx" ON "TaskCompletion"("userId", "completedAt");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HouseholdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HouseholdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CleaningTask" ADD CONSTRAINT "CleaningTask_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HouseholdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CleaningTask" ADD CONSTRAINT "CleaningTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CleaningTask" ADD CONSTRAINT "CleaningTask_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CleaningTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
