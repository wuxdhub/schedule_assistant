import prisma from '../lib/prisma';

export interface QueryFilter {
  weeks?: number[] | { start: number; end: number }; // 周次：数组或范围
  dayOfWeek?: number; // 星期几 (1-7)
  periodStart?: number; // 起始节次
  periodEnd?: number; // 结束节次
  minCapacity?: number; // 最小容量
}

export interface AvailableRoom {
  id: string;
  roomNumber: string;
  roomName?: string | null; // 机房中文名称
  capacity: number;
  location: string | null;
  description: string | null;
}

/**
 * 检查时间段是否冲突
 */
function isTimeConflict(
  week: number,
  dayOfWeek: number,
  periodStart: number,
  periodEnd: number,
  schedule: {
    weekStart: number;
    weekEnd: number;
    dayOfWeek: number;
    periodStart: number;
    periodEnd: number;
  }
): boolean {
  // 检查周次是否重叠
  if (week < schedule.weekStart || week > schedule.weekEnd) {
    return false;
  }
  
  // 检查星期是否相同
  if (dayOfWeek !== schedule.dayOfWeek) {
    return false;
  }
  
  // 检查节次是否重叠
  return !(periodEnd < schedule.periodStart || periodStart > schedule.periodEnd);
}

/**
 * 智能查询空闲机房
 */
export async function queryAvailableRooms(filter: QueryFilter): Promise<AvailableRoom[]> {
  // 1. 获取所有机房
  const allRooms = await prisma.computerRoom.findMany({
    where: filter.minCapacity ? {
      capacity: { gte: filter.minCapacity }
    } : undefined
  });
  
  // 2. 确定要检查的周次列表
  let weeksToCheck: number[] = [];
  if (filter.weeks) {
    if (Array.isArray(filter.weeks)) {
      weeksToCheck = filter.weeks;
    } else {
      // 范围格式
      for (let i = filter.weeks.start; i <= filter.weeks.end; i++) {
        weeksToCheck.push(i);
      }
    }
  }
  
  if (weeksToCheck.length === 0) {
    // 如果没有指定周次，返回所有机房（不进行冲突检查）
    return allRooms.map(room => ({
      id: room.id,
      roomNumber: room.roomNumber,
      roomName: room.roomName,
      capacity: room.capacity,
      location: room.location,
      description: room.description
    }));
  }
  
  // 3. 获取最新版本的过滤条件
  const latestVersion = await prisma.scheduleVersion.findFirst({
    orderBy: { version: 'desc' }
  });

  const versionFilter = latestVersion
    ? {
        OR: [
          { versionId: latestVersion.id },
          { versionId: null } // 手动预约的课程
        ]
      }
    : { versionId: null };

  // 4. 获取所有有效的课程安排（只查询最新版本）
  const allSchedules = await prisma.schedule.findMany({
    where: {
      status: 'active',
      weekStart: { lte: weeksToCheck.length > 0 ? Math.max(...weeksToCheck) : 20 },
      weekEnd: { gte: weeksToCheck.length > 0 ? Math.min(...weeksToCheck) : 1 },
      ...(filter.dayOfWeek && { dayOfWeek: filter.dayOfWeek }),
      ...versionFilter
    },
    include: {
      computerRoom: true
    }
  });
  
  // 5. 筛选出空闲的机房
  const availableRooms: AvailableRoom[] = [];
  
  for (const room of allRooms) {
    let isAvailable = true;
    
    // 检查每个周次和指定的时间段
    for (const week of weeksToCheck) {
      if (!filter.dayOfWeek || !filter.periodStart || !filter.periodEnd) {
        // 如果没有指定具体时间段，只检查周次和星期
        const hasConflict = allSchedules.some(schedule => 
          schedule.computerRoomId === room.id &&
          week >= schedule.weekStart &&
          week <= schedule.weekEnd &&
          (!filter.dayOfWeek || schedule.dayOfWeek === filter.dayOfWeek)
        );
        
        if (hasConflict) {
          isAvailable = false;
          break;
        }
      } else {
        // 检查具体时间段是否冲突
        if (filter.dayOfWeek && filter.periodStart !== undefined && filter.periodEnd !== undefined) {
          const dayOfWeek = filter.dayOfWeek;
          const periodStart = filter.periodStart;
          const periodEnd = filter.periodEnd;
          const hasConflict = allSchedules.some(schedule => 
            schedule.computerRoomId === room.id &&
            isTimeConflict(week, dayOfWeek, periodStart, periodEnd, schedule)
          );
          
          if (hasConflict) {
            isAvailable = false;
            break;
          }
        }
      }
    }
    
    if (isAvailable) {
      availableRooms.push({
        id: room.id,
        roomNumber: room.roomNumber,
        roomName: room.roomName,
        capacity: room.capacity,
        location: room.location,
        description: room.description
      });
    }
  }
  
  return availableRooms;
}

/**
 * 检查预约是否冲突
 * 只检查最新版本的课程和手动预约的课程
 */
export async function checkScheduleConflict(
  roomId: string,
  weekStart: number,
  weekEnd: number,
  dayOfWeek: number,
  periodStart: number,
  periodEnd: number,
  excludeScheduleId?: string // 排除的课程ID（用于修改时）
): Promise<{ hasConflict: boolean; conflictingSchedule?: any }> {
  // 获取最新版本的过滤条件
  const latestVersion = await prisma.scheduleVersion.findFirst({
    orderBy: { version: 'desc' }
  });

  const versionFilter = latestVersion
    ? {
        OR: [
          { versionId: latestVersion.id },
          { versionId: null } // 手动预约的课程
        ]
      }
    : { versionId: null };

  const schedules = await prisma.schedule.findMany({
    where: {
      computerRoomId: roomId,
      status: 'active',
      weekStart: { lte: weekEnd },
      weekEnd: { gte: weekStart },
      dayOfWeek: dayOfWeek,
      ...versionFilter,
      ...(excludeScheduleId && { id: { not: excludeScheduleId } })
    }
  });
  
  for (const schedule of schedules) {
    // 检查周次是否重叠
    if (weekStart > schedule.weekEnd || weekEnd < schedule.weekStart) {
      continue;
    }
    
    // 检查节次是否重叠
    if (periodStart > schedule.periodEnd || periodEnd < schedule.periodStart) {
      continue;
    }
    
    return {
      hasConflict: true,
      conflictingSchedule: schedule
    };
  }
  
  return { hasConflict: false };
}

