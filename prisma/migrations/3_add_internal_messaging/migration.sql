-- CreateEnum
CREATE TYPE "MessagePriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateTable
CREATE TABLE "Message" (
    "id"                   TEXT NOT NULL,
    "senderId"             TEXT NOT NULL,
    "subject"              TEXT NOT NULL,
    "body"                 TEXT NOT NULL,
    "priority"             "MessagePriority" NOT NULL DEFAULT 'NORMAL',
    "broadcastRole"        TEXT,
    "attachmentTransferId" TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id"          TEXT NOT NULL,
    "messageId"   TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "read"        BOOLEAN NOT NULL DEFAULT false,
    "readAt"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Message_broadcastRole_idx" ON "Message"("broadcastRole");

-- CreateIndex
CREATE UNIQUE INDEX "MessageRecipient_messageId_recipientId_key" ON "MessageRecipient"("messageId", "recipientId");

-- CreateIndex
CREATE INDEX "MessageRecipient_recipientId_read_idx" ON "MessageRecipient"("recipientId", "read");

-- CreateIndex
CREATE INDEX "MessageRecipient_messageId_idx" ON "MessageRecipient"("messageId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_attachmentTransferId_fkey"
    FOREIGN KEY ("attachmentTransferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
