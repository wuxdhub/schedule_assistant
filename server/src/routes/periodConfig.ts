import express from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/period-config/list
 * 获取所有节次配置
 */
router.get('/list', async (req, res, next) => {
  try {
    const configs = await prisma.periodConfig.findMany({
      orderBy: { sortOrder: 'asc' }
    });

    res.json({ success: true, data: configs });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/period-config/create
 * 新增节次配置（需要管理员权限）
 */
router.post('/create', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { label, startPeriod, endPeriod, sortOrder } = req.body;

    if (!label || startPeriod === undefined || endPeriod === undefined || sortOrder === undefined) {
      return res.status(400).json({ error: '标签、起始节次、结束节次和排序序号为必填项' });
    }

    if (startPeriod > endPeriod) {
      return res.status(400).json({ error: '起始节次不能大于结束节次' });
    }

    const config = await prisma.periodConfig.create({
      data: { label, startPeriod, endPeriod, sortOrder }
    });

    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/period-config/:id
 * 修��节次配置（需要管理员权限）
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, startPeriod, endPeriod, sortOrder } = req.body;

    const existing = await prisma.periodConfig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '节次配置不存在' });
    }

    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (startPeriod !== undefined) updateData.startPeriod = startPeriod;
    if (endPeriod !== undefined) updateData.endPeriod = endPeriod;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    if (updateData.startPeriod !== undefined && updateData.endPeriod !== undefined) {
      if (updateData.startPeriod > updateData.endPeriod) {
        return res.status(400).json({ error: '起始节次不能大于结束节次' });
      }
    }

    const updated = await prisma.periodConfig.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/period-config/:id
 * 删除节次配置（需要管理员权限）
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.periodConfig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '节次配置不存在' });
    }

    await prisma.periodConfig.delete({ where: { id } });

    res.json({ success: true, message: '节次配置已删除' });
  } catch (error) {
    next(error);
  }
});

export default router;
