-- CreateTable
CREATE TABLE "computer_rooms" (
    "id" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "roomName" TEXT,
    "capacity" INTEGER NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "computer_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_versions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "semester" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "fileName" TEXT NOT NULL,
    "originalFilePath" TEXT,
    "fileHash" TEXT,
    "description" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "computerRoomId" TEXT NOT NULL,
    "versionId" TEXT,
    "courseName" TEXT NOT NULL,
    "teacher" TEXT NOT NULL,
    "classes" TEXT NOT NULL,
    "weekStart" INTEGER NOT NULL,
    "weekEnd" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodStart" INTEGER NOT NULL,
    "periodEnd" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "computer_rooms_roomNumber_key" ON "computer_rooms"("roomNumber");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_versions_version_key" ON "schedule_versions"("version");

-- CreateIndex
CREATE INDEX "schedules_computerRoomId_weekStart_weekEnd_dayOfWeek_period_idx" ON "schedules"("computerRoomId", "weekStart", "weekEnd", "dayOfWeek", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "schedules_versionId_idx" ON "schedules"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_computerRoomId_courseName_teacher_classes_weekStart_weekEnd_dayOfWeek_periodStart_periodEnd_source_versionId_key" ON "schedules"("computerRoomId", "courseName", "teacher", "classes", "weekStart", "weekEnd", "dayOfWeek", "periodStart", "periodEnd", "source", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_computerRoomId_fkey" FOREIGN KEY ("computerRoomId") REFERENCES "computer_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "schedule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 机房初始数据
INSERT INTO "computer_rooms" ("id", "roomNumber", "roomName", "capacity", "location", "description", "createdAt", "updatedAt") VALUES
    ('f4acb88b-0e19-448c-b429-08ba699f62c2', 'A401', '第一微机室',   31,  '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('3a80c843-091d-4063-b234-73f027440689', 'A404', '第二微机室',   27,  '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('ce65e1a1-2aa3-4e92-bc86-2477d812e791', 'A403', '第三微机室',   104, '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('1d210a4e-e734-4e7e-b985-5a92286c98b9', 'A406', '第四微机室',   64,  '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('65036a28-5a7c-47f4-a633-7a77136d1369', 'A405', '第五微机室',   103, '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('94cb4b5a-fa15-45a4-bbde-19eba6af097d', 'A408', '第六微机室',   105, '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('20d76dce-5bac-4a3e-bf7a-7bc56b99c9bf', 'A407', '第七微机室',   106, '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('85b39459-2aee-4ed3-8709-5c0539bc92bb', 'A410', '第八微机室',   63,  '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('def62cf2-338b-4a39-aee4-ac3a9e3ccadc', 'A309', '第九微机室',   105, '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('d41f97a5-7b95-4d33-89b6-496cb5d80042', 'A306', '第十微机室',   100, '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('35358215-f888-40c0-bdb4-9882090d707f', 'A315', '第十一微机室', 63,  '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('7c1f75d7-ec40-4c9a-a671-fc113fb7e7d1', 'A308', '第十二微机室', 63,  '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003'),
    ('f20b66de-4be3-45d9-9044-70c96a65ee0e', '东区图书馆机房', NULL, 50,  '', '', '2026-03-08 02:13:01.003', '2026-03-08 02:13:01.003');

-- 管理员用户（密码：admin123）
INSERT INTO "users" ("id", "username", "password", "role", "createdAt", "updatedAt") VALUES
    ('4ae3eb0a-c55e-42de-91b2-6c695a136b60', 'admin', '$2a$10$rcx.udaqX1i8ZvMj1EgpTO7SvbDpFTHKLaIXnW8ullTSVSxYzekAm', 'admin', '2025-12-28 09:21:54.253', '2025-12-28 09:21:54.253');

-- 学期初始数据
INSERT INTO "semesters" ("id", "semester", "startDate", "endDate", "sortOrder", "createdAt", "updatedAt") VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2025-2026学年第2学期', '2026-03-02', '2026-07-05', 0, NOW(), NOW());

-- CreateTable
CREATE TABLE "reminder" (
    "id" CHAR(36) NOT NULL,
    "reminderTime" TIME NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "webhookUrl" VARCHAR(500),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(50),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" VARCHAR(50),

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- 定时提醒表初始化数据
INSERT INTO "reminder" ("id", "reminderTime", "intervalDays", "webhookUrl", "isEnabled", "description", "createdAt", "createdBy", "updatedAt")
VALUES (
    gen_random_uuid()::CHAR(36),
    '18:00:00',
    1,
    'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=1966fb35-1795-446d-a875-235d16791f76',
    true,
    '第二日提醒',
    NOW(),
    'system',
    NOW()
);
