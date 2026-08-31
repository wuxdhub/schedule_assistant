import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// 计算当前周次
function calcCurrentWeek(semesterStartDate: Date): number | null {
  const start = new Date(semesterStartDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - start.getTime();
  if (diffMs < 0) return null;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

// 判断 schedule 是否覆盖了某个 periodConfig 时段
function overlaps(
  schedule: { periodStart: number; periodEnd: number },
  config: { startPeriod: number; endPeriod: number }
): boolean {
  return schedule.periodStart <= config.endPeriod && schedule.periodEnd >= config.startPeriod;
}

// GET /api/dashboard/stats - 获取仪表盘统计数据
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // 第一阶段：获取基础信息（后续查询依赖这些结果）
    const activeVersion = await prisma.scheduleVersion.findFirst({
      where: { isActive: true },
    });

    let semester = null;
    if (activeVersion?.semester) {
      semester = await prisma.semester.findFirst({
        where: { semester: activeVersion.semester },
      });
    }

    const currentWeek = semester ? calcCurrentWeek(semester.startDate) : null;

    // 今天星期几（JS: 0=周日，转换为 1=周一 ~ 7=周日）
    const jsDay = new Date().getDay();
    const todayDayOfWeek = jsDay === 0 ? 7 : jsDay;

    // 版本过滤条件：激活版本的课程 + 手动预约（versionId 为 null）
    const versionFilter = activeVersion
      ? { OR: [{ versionId: activeVersion.id }, { versionId: null }] }
      : { versionId: null };

    // 第二阶段：并行查询
    const [
      roomAgg,
      todayCourseCount,
      weekCourseCount,
      busyRooms,
      periodConfigs,
      importCount,
      manualCount,
      rooms,
      weekSchedules,
    ] = await Promise.all([
      // 机房聚合：总数和总座位数
      prisma.computerRoom.aggregate({
        _count: { id: true },
        _sum: { capacity: true },
      }),

      // 今日课程数
      currentWeek
        ? prisma.schedule.count({
            where: {
              status: 'active',
              dayOfWeek: todayDayOfWeek,
              weekStart: { lte: currentWeek },
              weekEnd: { gte: currentWeek },
              ...versionFilter,
            },
          })
        : Promise.resolve(0),

      // 本周课程数
      currentWeek
        ? prisma.schedule.count({
            where: {
              status: 'active',
              weekStart: { lte: currentWeek },
              weekEnd: { gte: currentWeek },
              ...versionFilter,
            },
          })
        : Promise.resolve(0),

      // 今天有课的机房（去重）
      currentWeek
        ? prisma.schedule.findMany({
            where: {
              status: 'active',
              dayOfWeek: todayDayOfWeek,
              weekStart: { lte: currentWeek },
              weekEnd: { gte: currentWeek },
              ...versionFilter,
            },
            select: { computerRoomId: true },
            distinct: ['computerRoomId'],
          })
        : Promise.resolve([]),

      // 节次配置
      prisma.periodConfig.findMany({
        orderBy: { sortOrder: 'asc' },
      }),

      // 导入课程数
      prisma.schedule.count({
        where: { status: 'active', source: 'import', ...versionFilter },
      }),

      // 手动预约数
      prisma.schedule.count({
        where: { status: 'active', source: 'manual', ...versionFilter },
      }),

      // 所有机房
      prisma.computerRoom.findMany({
        orderBy: { roomNumber: 'asc' },
      }),

      // 本周所有课程（用于计算机房使用率）
      currentWeek
        ? prisma.schedule.findMany({
            where: {
              status: 'active',
              weekStart: { lte: currentWeek },
              weekEnd: { gte: currentWeek },
              ...versionFilter,
            },
            select: {
              computerRoomId: true,
              dayOfWeek: true,
              periodStart: true,
              periodEnd: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // 计算机房使用率
    const totalSlotsPerDay = periodConfigs.length;
    const totalSlotsPerWeek = totalSlotsPerDay * 7;

    const roomUsage = rooms.map((room) => {
      const roomSchedules = weekSchedules.filter(
        (s) => s.computerRoomId === room.id
      );

      let usedSlots = 0;
      // 遍历每天每个时段，检查是否被占用
      for (let day = 1; day <= 7; day++) {
        const daySchedules = roomSchedules.filter((s) => s.dayOfWeek === day);
        for (const config of periodConfigs) {
          const isOccupied = daySchedules.some((s) =>
            overlaps(s, config)
          );
          if (isOccupied) usedSlots++;
        }
      }

      const usageRate =
        totalSlotsPerWeek > 0
          ? Math.round((usedSlots / totalSlotsPerWeek) * 1000) / 10
          : 0;

      return {
        roomId: room.id,
        roomName: room.roomName || room.roomNumber,
        usedSlots,
        totalSlots: totalSlotsPerWeek,
        usageRate,
      };
    });

    const totalRooms = roomAgg._count.id;

    res.json({
      success: true,
      data: {
        overview: {
          totalRooms,
          totalCapacity: roomAgg._sum.capacity || 0,
          activeVersion: activeVersion
            ? {
                version: activeVersion.version,
                semester: activeVersion.semester,
              }
            : null,
          currentWeek,
          semesterName: semester?.semester || null,
        },
        daily: {
          todayCourseCount,
          weekCourseCount,
          todayFreeRoomCount: totalRooms - busyRooms.length,
          todayDayOfWeek,
        },
        roomUsage,
        sourceDistribution: {
          importCount,
          manualCount,
        },
      },
    });
  } catch (error) {
    console.error('获取仪表盘数据失败:', error);
    res.status(500).json({
      success: false,
      error: '获取仪表盘数据失败',
    });
  }
});

export default router;
