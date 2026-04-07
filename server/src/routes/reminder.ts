import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { fireReminder } from '../services/reminderScheduler';

const router = express.Router();

/**
 * GET /api/reminder/list
 * 获取所有定时提醒列表
 */
router.get('/list', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const reminders = await prisma.reminder.findMany({
      orderBy: { createdAt: 'asc' }
    });

    // reminderTime 是 Time 类型，转为 HH:mm:ss 字符串
    const data = reminders.map((r) => ({
      ...r,
      reminderTime: formatTime(r.reminderTime)
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reminder/create
 * 新增定时提醒（需要管理员权限）
 */
router.post('/create', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { reminderTime, intervalDays, webhookUrl, isEnabled, description, createdBy } = req.body;

    if (!reminderTime) {
      return res.status(400).json({ error: '提醒时间为必填项' });
    }

    const timeDate = parseTime(reminderTime);
    if (!timeDate) {
      return res.status(400).json({ error: '提醒时间格式无效，请使用 HH:mm 或 HH:mm:ss 格式' });
    }

    const reminder = await prisma.reminder.create({
      data: {
        id: uuidv4(),
        reminderTime: timeDate,
        intervalDays: intervalDays ?? 0,
        webhookUrl: webhookUrl || null,
        isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
        description: description || null,
        createdBy: createdBy || null
      }
    });

    res.json({ success: true, data: { ...reminder, reminderTime: formatTime(reminder.reminderTime) } });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/reminder/:id
 * 修改定时提醒（需要管理员权限）
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reminderTime, intervalDays, webhookUrl, isEnabled, description, updatedBy } = req.body;

    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '定时提醒不存在' });
    }

    const updateData: any = { updatedBy: updatedBy || null };

    if (reminderTime !== undefined) {
      const timeDate = parseTime(reminderTime);
      if (!timeDate) {
        return res.status(400).json({ error: '提醒时间格式无效，请使用 HH:mm 或 HH:mm:ss 格式' });
      }
      updateData.reminderTime = timeDate;
    }
    if (intervalDays !== undefined) updateData.intervalDays = intervalDays;
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl || null;
    if (isEnabled !== undefined) updateData.isEnabled = Boolean(isEnabled);
    if (description !== undefined) updateData.description = description || null;

    const updated = await prisma.reminder.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true, data: { ...updated, reminderTime: formatTime(updated.reminderTime) } });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/reminder/:id
 * 删除定时提醒（需要管理员权限）
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.reminder.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '定时提醒不存在' });
    }

    await prisma.reminder.delete({ where: { id } });

    res.json({ success: true, message: '定时提醒已删除' });
  } catch (error) {
    next(error);
  }
});

/** 将 Date（time 类型）格式化为 HH:mm:ss */
function formatTime(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, '0');
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * POST /api/reminder/:id/send-now
 * 立即发送定时提醒（不等到提醒时间）
 */
router.post('/:id/send-now', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) {
      return res.status(404).json({ error: '定时提醒不存在' });
    }

    if (!reminder.webhookUrl) {
      return res.status(400).json({ error: '该提醒未配置 Webhook URL' });
    }

    // 等待发送完成再返回，避免前端重复点击
    await fireReminder(id, reminder.webhookUrl, reminder.intervalDays);

    res.json({ success: true, message: '已发送，请稍后查看企业微信' });
  } catch (error) {
    next(error);
  }
});

/** 将 "HH:mm" 或 "HH:mm:ss" 解析为 Date（1970-01-01 UTC） */
function parseTime(value: string): Date | null {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3] ?? '0', 10);
  if (h > 23 || m > 59 || s > 59) return null;
  return new Date(Date.UTC(1970, 0, 1, h, m, s));
}

export default router;
