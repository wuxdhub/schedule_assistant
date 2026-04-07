import prisma from '../lib/prisma';
import { WeChatFileSender } from '../utils/wechat';
import { generateDailyScheduleImage, mergeSchedulesByWeek } from '../utils/scheduleImage';
import fs from 'fs';
import path from 'path';

// 已触发记录：key = `${reminderId}_${YYYY-MM-DD_HH:mm}`，防止30秒轮询重复触发
const firedSet = new Set<string>();

/**
 * 将 Date（Time 字段）格式化为本地 HH:mm
 */
function toLocalHHmm(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, '0');
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * 格式化时间戳为 YYYYMMDD_HHMMSS，用于临时文件名
 */
function formatTs(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * 核心执行：查询课表数据，生成图片，推送 webhook
 */
export async function fireReminder(reminderId: string, webhookUrl: string, intervalDays: number): Promise<void> {
  // 1. 找到当前启用的版本
  const activeVersion = await prisma.scheduleVersion.findFirst({
    where: { isActive: true }
  });

  if (!activeVersion) {
    console.warn(`[reminder] ${reminderId}: 没有启用的课表版本，跳过`);
    return;
  }

  // 2. 通过版本的 semester 字段找到学期
  const semester = activeVersion.semester
    ? await prisma.semester.findFirst({ where: { semester: activeVersion.semester } })
    : null;

  // 3. 计算目标日期（用本地时间，避免 toISOString() 返回 UTC 导致跨午夜时日期偏移）
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + intervalDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  const targetDateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`;

  // 4. 如果有学期信息，检查目标日期是否在学期范围内
  if (semester) {
    const start = new Date(semester.startDate);
    const end = new Date(semester.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const target = new Date(targetDateStr);
    if (target < start || target > end) {
      console.log(`[reminder] ${reminderId}: 目标日期 ${targetDateStr} 不在学期范围内，静默跳过`);
      return;
    }
  }

  // 5. 计算周次和星期几
  let week: number;
  let dayOfWeek: number;

  if (semester) {
    // 用本地午夜对齐，避免 new Date("YYYY-MM-DD") 被解析为 UTC 0 点导致时区偏差
    const start = new Date(semester.startDate);
    start.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    week = Math.floor(diffDays / 7) + 1;
  } else {
    // 没有学期信息时无法计算周次
    console.warn(`[reminder] ${reminderId}: 版本 ${activeVersion.semester} 未找到对应学期，无法计算周次，跳过`);
    return;
  }

  // dayOfWeek：1=周一...7=周日，JS getDay() 0=周日（直接用 targetDate 本地时间）
  const jsDay = targetDate.getDay();
  dayOfWeek = jsDay === 0 ? 7 : jsDay;

  const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  console.log(`[reminder] ${reminderId}: 触发，目标日期 ${targetDateStr}，第${week}周${dayNames[dayOfWeek]}`);

  // 6. 查询该星期几的课程数据
  const versionFilter = {
    OR: [
      { versionId: activeVersion.id },
      { versionId: null as any }
    ]
  };

  const allRooms = await prisma.computerRoom.findMany({ orderBy: { roomNumber: 'asc' } });
  const schedules = await prisma.schedule.findMany({
    where: { status: 'active', dayOfWeek, ...versionFilter },
    include: { computerRoom: true },
    orderBy: [{ periodStart: 'asc' }]
  });

  const roomScheduleMap = new Map<string, any[]>();
  schedules.forEach((s) => {
    const list = roomScheduleMap.get(s.computerRoomId) || [];
    list.push(s);
    roomScheduleMap.set(s.computerRoomId, list);
  });

  const roomsRaw = allRooms.map((room) => ({
    ...room,
    schedules: roomScheduleMap.get(room.id) || []
  }));

  // 合并相同课程的多周次记录（与课程查询页面逻辑一致）
  const mergedRooms = mergeSchedulesByWeek(roomsRaw);
  const roomsWithSchedules = mergedRooms;

  // 7. 生成图片
  const imageBuffer = await generateDailyScheduleImage(roomsWithSchedules, week, dayOfWeek);

  // 8. 保存临时文件
  const tempDir = path.join('uploads', 'shared');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const ts = formatTs(new Date());
  const tempPath = path.join(tempDir, `第${week}周${dayNames[dayOfWeek]}课表_${ts}.png`);
  fs.writeFileSync(tempPath, imageBuffer);

  // 9. 推送到 reminder.webhookUrl（每条 reminder 独立）
  const sender = new WeChatFileSender({ webhookUrl, maxRetries: 3, timeout: 30000 });
  await sender.waitReady(); // 等待 axios/form-data 初始化完成
  const result = await sender.sendExcelFile(tempPath, { week });
  console.log(`[reminder] ${reminderId}: 推送结果 ->`, result.message);
}

/**
 * 每30秒执行一次的轮询函数
 * 匹配逻辑：当前时间的 HH:mm 与 reminder.reminderTime 的 HH:mm 一致即触发
 * firedSet 防止同一分钟内重复触发（30秒轮询会命中同一分钟两次）
 */
async function tick(): Promise<void> {
  try {
    const now = new Date();
    const padT = (n: number) => String(n).padStart(2, '0');
    const currentHHmm = `${padT(now.getHours())}:${padT(now.getMinutes())}`;
    // 用本地日期，避免 toISOString() 返回 UTC 导致凌晨时日期偏移
    const todayStr = `${now.getFullYear()}-${padT(now.getMonth() + 1)}-${padT(now.getDate())}`;

    const reminders = await prisma.reminder.findMany({ where: { isEnabled: true } });

    for (const reminder of reminders) {
      if (!reminder.webhookUrl) continue;

      const reminderHHmm = toLocalHHmm(reminder.reminderTime);
      if (reminderHHmm !== currentHHmm) continue;

      // 防重复：同一条 reminder 在同一分钟内只触发一次
      const fireKey = `${reminder.id}_${todayStr}_${currentHHmm}`;
      if (firedSet.has(fireKey)) continue;
      firedSet.add(fireKey);

      // 异步执行，不阻塞轮询
      fireReminder(reminder.id, reminder.webhookUrl, reminder.intervalDays).catch((err) => {
        console.error(`[reminder] ${reminder.id}: 执行异常`, err);
      });
    }

    // 清理过期的 firedSet 条目（保留今天的，删除昨天的，均用本地日期）
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${padT(yesterday.getMonth() + 1)}-${padT(yesterday.getDate())}`;
    for (const key of firedSet) {
      if (key.includes(yesterdayStr)) firedSet.delete(key);
    }
  } catch (err) {
    console.error('[reminder] tick 异常:', err);
  }
}

/**
 * 启动定时调度，30秒轮询
 */
export function startReminderScheduler(): void {
  console.log('[reminder] 定时调度已启动（30秒轮询）');
  setInterval(tick, 30 * 1000);
  // 立即执行一次，确保服务启动时已过的整点不会遗漏当分钟
  tick();
}
