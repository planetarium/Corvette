-- CreateTable
CREATE TABLE "Event" (
    "observedTimestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockHash" BLOB NOT NULL,
    "txHash" BLOB NOT NULL,
    "topic1" BLOB,
    "topic2" BLOB,
    "topic3" BLOB,
    "data" BLOB NOT NULL,
    "emittedTimestamp" DATETIME,
    "lockedTimestamp" DATETIME,
    "abiHash" BLOB NOT NULL,
    "sourceAddress" BLOB NOT NULL,

    PRIMARY KEY ("blockNumber", "logIndex"),
    CONSTRAINT "Event_sourceAddress_abiHash_fkey" FOREIGN KEY ("sourceAddress", "abiHash") REFERENCES "EventSource" ("address", "abiHash") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_abiHash_fkey" FOREIGN KEY ("abiHash") REFERENCES "EventAbi" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ObservedLog" (
    "blockNumber" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
);

-- CreateTable
CREATE TABLE "BlockProcessError" (
    "blockNumber" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
);

-- CreateTable
CREATE TABLE "FailedUrl" (
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "url" TEXT NOT NULL,

    PRIMARY KEY ("blockNumber", "logIndex", "url"),
    CONSTRAINT "FailedUrl_blockNumber_logIndex_fkey" FOREIGN KEY ("blockNumber", "logIndex") REFERENCES "Event" ("blockNumber", "logIndex") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventAbi" (
    "hash" BLOB NOT NULL PRIMARY KEY,
    "json" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "EventSource" (
    "address" BLOB NOT NULL,
    "abiHash" BLOB NOT NULL,

    PRIMARY KEY ("address", "abiHash"),
    CONSTRAINT "EventSource_abiHash_fkey" FOREIGN KEY ("abiHash") REFERENCES "EventAbi" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmitDestination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceAddress" BLOB NOT NULL,
    "abiHash" BLOB NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "topic1" BLOB,
    "topic2" BLOB,
    "topic3" BLOB,
    CONSTRAINT "EmitDestination_sourceAddress_abiHash_fkey" FOREIGN KEY ("sourceAddress", "abiHash") REFERENCES "EventSource" ("address", "abiHash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "abiHash" BLOB,
    "sourceAddress" BLOB,
    "destinationId" INTEGER,
    CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Permission_abiHash_fkey" FOREIGN KEY ("abiHash") REFERENCES "EventAbi" ("hash") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Permission_abiHash_sourceAddress_fkey" FOREIGN KEY ("abiHash", "sourceAddress") REFERENCES "EventSource" ("abiHash", "address") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Permission_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "EmitDestination" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmitDestination_sourceAddress_abiHash_webhookUrl_topic1_topic2_topic3_key" ON "EmitDestination"("sourceAddress", "abiHash", "webhookUrl", "topic1", "topic2", "topic3");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
