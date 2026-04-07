import express from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/schedule-version/list
 * 获取所有课表版本列表
 */
router.get('/list', async (req, res, next) => {
  try {
    const versions = await prisma.scheduleVersion.findMany({
      orderBy: [
        { semester: 'asc' },
        { version: 'asc' }
      ]
    });
    res.json({ success: true, data: versions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/schedule-version/:id
 * 获取单个版本详情
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const version = await prisma.scheduleVersion.findUnique({ where: { id } });
    if (!version) {
      return res.status(404).json({ error: '版本不存在' });
    }
    res.json({ success: true, data: version });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/schedule-version/create
 * 新增课表版本（需要管理员权限）
 */
router.post('/create', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { version, semester, isActive, fileName, description } = req.body;

    if (!version || !fileName) {
      return res.status(400).json({ error: '版本号和文件名为必填项' });
    }

    // 检查版本号唯一性
    const existing = await prisma.scheduleVersion.findUnique({ where: { version: Number(version) } });
    if (existing) {
      return res.status(400).json({ error: `版本号 ${version} 已存在` });
    }

    // 若设为启用，先关闭其他版本
    if (isActive) {
      await prisma.scheduleVersion.updateMany({ data: { isActive: false } });
    }

    const newVersion = await prisma.scheduleVersion.create({
      data: {
        version: Number(version),
        semester: semester || null,
        isActive: isActive ?? false,
        fileName,
        description: description || null,
        recordCount: 0
      }
    });

    res.json({ success: true, data: newVersion });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/schedule-version/:id
 * 修改课表版本（需要管理员权限）
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { version, semester, isActive, fileName, description } = req.body;

    const existing = await prisma.scheduleVersion.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '版本不存在' });
    }

    // 检查版本号唯一性（排除自身）
    if (version !== undefined && Number(version) !== existing.version) {
      const conflict = await prisma.scheduleVersion.findUnique({ where: { version: Number(version) } });
      if (conflict) {
        return res.status(400).json({ error: `版本号 ${version} 已存在` });
      }
    }

    // 若设为启用，先关闭其他版本
    if (isActive === true) {
      await prisma.scheduleVersion.updateMany({
        where: { id: { not: id } },
        data: { isActive: false }
      });
    }

    const updateData: any = {};
    if (version !== undefined) updateData.version = Number(version);
    if (semester !== undefined) updateData.semester = semester || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (fileName !== undefined) updateData.fileName = fileName;
    if (description !== undefined) updateData.description = description || null;

    const updated = await prisma.scheduleVersion.update({ where: { id }, data: updateData });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/schedule-version/:id/activate
 * 启用指定版本（同时禁用其他版本）
 */
router.patch('/:id/activate', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.scheduleVersion.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '版本不存在' });
    }

    await prisma.scheduleVersion.updateMany({ data: { isActive: false } });
    const updated = await prisma.scheduleVersion.update({ where: { id }, data: { isActive: true } });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/schedule-version/:id
 * 删除课表版本（需要管理员权限）
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.scheduleVersion.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '版本不存在' });
    }

    await prisma.scheduleVersion.delete({ where: { id } });

    res.json({ success: true, message: '版本已删除' });
  } catch (error) {
    next(error);
  }
});

export default router;
