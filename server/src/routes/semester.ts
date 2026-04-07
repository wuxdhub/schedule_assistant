import express from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/semester/list
 * 获取所有学期列表
 */
router.get('/list', async (req, res, next) => {
  try {
    const semesters = await prisma.semester.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { startDate: 'desc' }
      ]
    });

    res.json({ success: true, data: semesters });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/semester/create
 * 新增学期（需要管理员权限）
 */
router.post('/create', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { semester, startDate, endDate, sortOrder, createdBy } = req.body;

    if (!semester || !startDate || !endDate) {
      return res.status(400).json({ error: '学期名称、开始时间和结束时间为必填项' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ error: '开始时间必须早于结束时间' });
    }

    const newSemester = await prisma.semester.create({
      data: {
        semester,
        startDate: start,
        endDate: end,
        sortOrder: sortOrder ?? 0,
        createdBy: createdBy || null
      }
    });

    res.json({ success: true, data: newSemester });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/semester/:id
 * 修改学期（需要管理员权限）
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { semester, startDate, endDate, sortOrder, updatedBy } = req.body;

    const existing = await prisma.semester.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '学期不存在' });
    }

    const updateData: any = { updatedBy: updatedBy || null };

    if (semester !== undefined) updateData.semester = semester;

    const start = startDate ? new Date(startDate) : existing.startDate;
    const end = endDate ? new Date(endDate) : existing.endDate;

    if (start >= end) {
      return res.status(400).json({ error: '开始时间必须早于结束时间' });
    }

    if (startDate) updateData.startDate = start;
    if (endDate) updateData.endDate = end;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const updated = await prisma.semester.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/semester/:id
 * 删除学期（需要管理员权限）
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.semester.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '学期不存在' });
    }

    await prisma.semester.delete({ where: { id } });

    res.json({ success: true, message: '学期已删除' });
  } catch (error) {
    next(error);
  }
});

export default router;
