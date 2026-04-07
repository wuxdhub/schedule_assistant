import express from 'express';
import prisma from '../lib/prisma';
import { checkScheduleConflict } from '../services/queryService';
import { formatScheduleText } from '../utils/scheduleFormatter';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/schedule/create
 * 创建预约/课程登记（需要管理员权限）
 */
router.post('/create', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const {
      roomId,
      courseName,
      teacher,
      classes, // 字符串，多个班级用分号分隔
      weekStart,
      weekEnd,
      dayOfWeek,
      periodStart,
      periodEnd
    } = req.body;
    
    // 验证必填字段
    if (!roomId || !courseName || !teacher) {
      return res.status(400).json({ error: '请填写完整的课程名称和授课教师信息' });
    }
    
    if (!weekStart || !weekEnd || !dayOfWeek || !periodStart || !periodEnd) {
      return res.status(400).json({ error: '请填写完整的时间信息' });
    }
    
    // 检查冲突
    const conflictCheck = await checkScheduleConflict(
      roomId,
      parseInt(weekStart),
      parseInt(weekEnd),
      parseInt(dayOfWeek),
      parseInt(periodStart),
      parseInt(periodEnd)
    );
    
    if (conflictCheck.hasConflict) {
      return res.status(409).json({
        error: '时间段冲突',
        conflict: true,
        conflictingSchedule: conflictCheck.conflictingSchedule
      });
    }
    
    // 创建预约记录
    const schedule = await prisma.schedule.create({
      data: {
        computerRoomId: roomId,
        courseName,
        teacher,
        classes: classes
          ? (typeof classes === 'string' ? classes : classes.join(';'))
          : '',
        weekStart: parseInt(weekStart),
        weekEnd: parseInt(weekEnd),
        dayOfWeek: parseInt(dayOfWeek),
        periodStart: parseInt(periodStart),
        periodEnd: parseInt(periodEnd),
        source: 'manual',
        status: 'active'
      },
      include: {
        computerRoom: true
      }
    });
    
    // 生成标准格式文本
    const formattedText = formatScheduleText(
      courseName,
      parseInt(periodStart),
      parseInt(periodEnd),
      parseInt(weekStart),
      parseInt(weekEnd),
      teacher,
      classes
        ? (typeof classes === 'string' ? classes.split(';') : classes)
        : []
    );
    
    res.json({
      success: true,
      data: schedule,
      formattedText
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/schedule/list
 * 获取所有课程安排列表（默认只显示最新版本的导入课程）
 */
router.get('/list', async (req, res, next) => {
  try {
    const { weekStart, weekEnd, roomId, status, allVersions } = req.query;
    
    const where: any = {};
    
    if (weekStart && weekEnd) {
      where.weekStart = { lte: parseInt(weekEnd as string) };
      where.weekEnd = { gte: parseInt(weekStart as string) };
    }
    
    if (roomId) {
      where.computerRoomId = roomId as string;
    }
    
    if (status) {
      where.status = status as string;
    }
    
    // 默认只显示已启用版本的导入课程，手动预约的课程不受版本限制
    // 如果 allVersions=true，则显示所有版本的课程
    if (allVersions !== 'true') {
      // 获取当前启用的版本
      const activeVersion = await prisma.scheduleVersion.findFirst({
        where: { isActive: true }
      });

      if (activeVersion) {
        // 只显示启用版本的导入课程，或者手动预约的课程（versionId为null）
        where.OR = [
          { versionId: activeVersion.id },
          { versionId: null }
        ];
      } else {
        // 没有启用版本，只显示手动预约的课程
        where.versionId = null;
      }
    }
    
    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        computerRoom: true,
        version: {
          select: {
            id: true,
            version: true,
            fileName: true
          }
        }
      },
      orderBy: [
        { weekStart: 'asc' },
        { dayOfWeek: 'asc' },
        { periodStart: 'asc' }
      ]
    });
    
    res.json({
      success: true,
      data: schedules
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/schedule/:id
 * 修改课程信息（需要管理员权限）
 */
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      courseName,
      teacher,
      classes,
      roomId,
      weekStart,
      weekEnd,
      dayOfWeek,
      periodStart,
      periodEnd
    } = req.body;
    
    // 获取原记录
    const existingSchedule = await prisma.schedule.findUnique({
      where: { id }
    });
    
    if (!existingSchedule) {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    // 如果修改了时间或机房，需要检查冲突
    const newRoomId = roomId || existingSchedule.computerRoomId;
    const newWeekStart = weekStart ? parseInt(weekStart) : existingSchedule.weekStart;
    const newWeekEnd = weekEnd ? parseInt(weekEnd) : existingSchedule.weekEnd;
    const newDayOfWeek = dayOfWeek ? parseInt(dayOfWeek) : existingSchedule.dayOfWeek;
    const newPeriodStart = periodStart ? parseInt(periodStart) : existingSchedule.periodStart;
    const newPeriodEnd = periodEnd ? parseInt(periodEnd) : existingSchedule.periodEnd;
    
    if (roomId || weekStart || weekEnd || dayOfWeek || periodStart || periodEnd) {
      const conflictCheck = await checkScheduleConflict(
        newRoomId,
        newWeekStart,
        newWeekEnd,
        newDayOfWeek,
        newPeriodStart,
        newPeriodEnd,
        id // 排除当前记录
      );
      
      if (conflictCheck.hasConflict) {
        return res.status(409).json({
          error: '时间段冲突',
          conflict: true,
          conflictingSchedule: conflictCheck.conflictingSchedule
        });
      }
    }
    
    // 更新记录
    const updateData: any = {};
    if (courseName) updateData.courseName = courseName;
    if (teacher) updateData.teacher = teacher;
    if (classes) updateData.classes = typeof classes === 'string' ? classes : classes.join(';');
    if (roomId) updateData.computerRoomId = roomId;
    if (weekStart) updateData.weekStart = parseInt(weekStart);
    if (weekEnd) updateData.weekEnd = parseInt(weekEnd);
    if (dayOfWeek) updateData.dayOfWeek = parseInt(dayOfWeek);
    if (periodStart) updateData.periodStart = parseInt(periodStart);
    if (periodEnd) updateData.periodEnd = parseInt(periodEnd);
    
    const updatedSchedule = await prisma.schedule.update({
      where: { id },
      data: updateData,
      include: {
        computerRoom: true
      }
    });
    
    res.json({
      success: true,
      data: updatedSchedule
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/schedule/:id
 * 取消/删除预约（需要管理员权限）
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 软删除：将状态改为cancelled
    const schedule = await prisma.schedule.update({
      where: { id },
      data: { status: 'cancelled' },
      include: {
        computerRoom: true
      }
    });
    
    res.json({
      success: true,
      message: '预约已取消',
      data: schedule
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/schedule/batch-create
 * 批量创建预约（需要管理员权限）
 * 逻辑：全量冲突检测，有任何冲突则全部不入库；无冲突则事务一次性写入。
 * 入库时 versionId 设为当前启用版本的 id（若无启用版本则为 null）。
 */
router.post('/batch-create', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '请提供课程数据' });
    }

    // 获取当前启用版本
    const activeVersion = await prisma.scheduleVersion.findFirst({ where: { isActive: true } });
    const versionId = activeVersion?.id ?? null;

    // 第一步：对所有条目进行冲突检测，收集所有冲突
    const conflicts: { index: number; item: any; conflictingSchedule: any }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { roomId, weekStart, weekEnd, dayOfWeek, periodStart, periodEnd } = item;

      const conflictCheck = await checkScheduleConflict(
        roomId,
        parseInt(weekStart),
        parseInt(weekEnd),
        parseInt(dayOfWeek),
        parseInt(periodStart),
        parseInt(periodEnd)
      );

      if (conflictCheck.hasConflict) {
        conflicts.push({ index: i, item, conflictingSchedule: conflictCheck.conflictingSchedule });
      }
    }

    // 有冲突：全部不入库，返回冲突详情
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: '存在时间冲突，全部课程未入库',
        conflictCount: conflicts.length,
        conflicts: conflicts.map(c => ({
          index: c.index,
          item: c.item,
          conflictingSchedule: c.conflictingSchedule
        }))
      });
    }

    // 第二步：无冲突，事务一次性写入
    const created = await prisma.$transaction(
      items.map((item: any) =>
        prisma.schedule.create({
          data: {
            computerRoomId: item.roomId,
            courseName: item.courseName,
            teacher: item.teacher,
            classes: item.classes
              ? (typeof item.classes === 'string' ? item.classes : item.classes.join(';'))
              : '',
            weekStart: parseInt(item.weekStart),
            weekEnd: parseInt(item.weekEnd),
            dayOfWeek: parseInt(item.dayOfWeek),
            periodStart: parseInt(item.periodStart),
            periodEnd: parseInt(item.periodEnd),
            source: 'manual',
            status: 'active',
            versionId
          }
        })
      )
    );

    res.json({
      success: true,
      successCount: created.length,
      versionId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/schedule/timetable
 * 获取时间表视图（按机房、星期、节次组织）
 */
router.get('/timetable', async (req, res, next) => {
  try {
    const { weekStart, weekEnd, roomId } = req.query;
    
    const where: any = {
      status: 'active'
    };

    if (weekStart && weekEnd) {
      where.weekStart = { lte: parseInt(weekEnd as string) };
      where.weekEnd = { gte: parseInt(weekStart as string) };
    }

    if (roomId) {
      where.computerRoomId = roomId as string;
    }

    // 只显示启用版本的导入课程，或手动预约的课程
    const activeVersion = await prisma.scheduleVersion.findFirst({
      where: { isActive: true }
    });
    if (activeVersion) {
      where.OR = [
        { versionId: activeVersion.id },
        { versionId: null }
      ];
    } else {
      where.versionId = null;
    }

    // 获取所有课程
    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        computerRoom: true
      },
      orderBy: [
        { computerRoomId: 'asc' },
        { dayOfWeek: 'asc' },
        { periodStart: 'asc' }
      ]
    });
    
    // 获取所有机房
    const rooms = await prisma.computerRoom.findMany({
      where: roomId ? { id: roomId as string } : undefined,
      orderBy: { roomNumber: 'asc' }
    });
    
    // 定义时间段（1-12节）
    const periods = Array.from({ length: 12 }, (_, i) => i + 1);
    const days = [1, 2, 3, 4, 5, 6, 7]; // 周一到周日
    
    // 构建时间表数据结构
    const timetable: Record<string, Record<number, Record<number, any[]>>> = {};
    
    // 初始化所有机房的时间表
    rooms.forEach(room => {
      timetable[room.id] = {};
      days.forEach(day => {
        timetable[room.id][day] = {};
        periods.forEach(period => {
          timetable[room.id][day][period] = [];
        });
      });
    });
    
    // 填充课程数据
    schedules.forEach(schedule => {
      const roomId = schedule.computerRoomId;
      const day = schedule.dayOfWeek;
      
      // 处理跨节次的课程
      for (let period = schedule.periodStart; period <= schedule.periodEnd; period++) {
        if (timetable[roomId] && timetable[roomId][day] && timetable[roomId][day][period]) {
          timetable[roomId][day][period].push(schedule);
        }
      }
    });
    
    // 转换为前端需要的格式
    const result = rooms.map(room => {
      const roomTimetable = days.map(day => {
        const dayName = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][day];
        const dayPeriods = periods.map(period => {
          const schedules = timetable[room.id][day][period] || [];
          return {
            period,
            schedules: schedules.map(s => ({
              id: s.id,
              courseName: s.courseName,
              teacher: s.teacher,
              classes: s.classes,
              weekStart: s.weekStart,
              weekEnd: s.weekEnd,
              periodStart: s.periodStart,
              periodEnd: s.periodEnd,
              source: s.source
            }))
          };
        });
        return {
          day,
          dayName,
          periods: dayPeriods
        };
      });
      
      return {
        room: {
          id: room.id,
          roomNumber: room.roomNumber,
          roomName: room.roomName,
          capacity: room.capacity,
          location: room.location
        },
        timetable: roomTimetable
      };
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/schedule/:id
 * 获取单个课程详情
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        computerRoom: true
      }
    });
    
    if (!schedule) {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    next(error);
  }
});

export default router;

