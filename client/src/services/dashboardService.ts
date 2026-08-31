import api from './api';

export interface DashboardStats {
  overview: {
    totalRooms: number;
    totalCapacity: number;
    activeVersion: {
      version: number;
      semester: string | null;
    } | null;
    currentWeek: number | null;
    semesterName: string | null;
  };
  daily: {
    todayCourseCount: number;
    weekCourseCount: number;
    todayFreeRoomCount: number;
    todayDayOfWeek: number;
  };
  roomUsage: Array<{
    roomId: string;
    roomName: string;
    usedSlots: number;
    totalSlots: number;
    usageRate: number;
  }>;
  sourceDistribution: {
    importCount: number;
    manualCount: number;
  };
}

// 获取仪表盘统计数据
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const res: any = await api.get('/dashboard/stats');
  return res.data;
};
