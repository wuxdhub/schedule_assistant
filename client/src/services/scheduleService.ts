import api from './api';

export interface ComputerRoom {
  id: string;
  roomNumber: string;
  roomName?: string | null; // 机房中文名称
  capacity: number;
  location: string | null;
  description: string | null;
}

export interface Schedule {
  id: string;
  computerRoomId: string;
  computerRoom: ComputerRoom;
  courseName: string;
  teacher: string;
  classes: string;
  weekStart: number;
  weekEnd: number;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  source: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueryFilter {
  weeks?: number[] | { start: number; end: number };
  dayOfWeek?: number;
  periodStart?: number;
  periodEnd?: number;
  minCapacity?: number;
}

// 检查文件是否已导入
export const checkFileImported = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  return api.post('/upload/check', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

// 上传Excel文件
export const uploadExcel = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  return api.post('/upload/excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

// 查询空闲机房
export const queryAvailableRooms = async (filter: QueryFilter) => {
  return api.post('/query/available-rooms', filter);
};

// 获取所有机房
export const getAllRooms = async () => {
  return api.get('/query/rooms');
};

// 创建预约
export const createSchedule = async (data: {
  roomId: string;
  courseName: string;
  teacher: string;
  weekStart: number;
  weekEnd: number;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
}) => {
  return api.post('/schedule/create', data);
};

// 获取课程列表
export const getScheduleList = async (params?: {
  weekStart?: number;
  weekEnd?: number;
  roomId?: string;
  status?: string;
}) => {
  return api.get('/schedule/list', { params });
};

// 更新课程
export const updateSchedule = async (id: string, data: Partial<Schedule>) => {
  return api.put(`/schedule/${id}`, data);
};

// 删除课程
export const deleteSchedule = async (id: string) => {
  return api.delete(`/schedule/${id}`);
};

// 导出Excel
export const exportExcel = async (): Promise<Blob> => {
  return api.get('/export/excel', {
    responseType: 'blob'
  }) as Promise<Blob>;
};

// 按周次导出Excel（最新一版课表筛选导出）
export const exportExcelByWeek = async (week: number): Promise<Blob> => {
  return api.get('/export/excel-by-week', {
    params: { week },
    responseType: 'blob'
  }) as Promise<Blob>;
};

// (定义在文件底部，支持 sendToWechat 参数)

// 方案二：按机房视角，高亮导出
export const exportHighlightByWeekRoom = async (week: number): Promise<Blob> => {
  return api.get('/export/highlight-by-week/room', {
    params: { week },
    responseType: 'blob'
  }) as Promise<Blob>;
};

// 方案二：按星期视角，高亮导出
export const exportHighlightByWeekWeekday = async (week: number): Promise<Blob> => {
  return api.get('/export/highlight-by-week/weekday', {
    params: { week },
    responseType: 'blob'
  }) as Promise<Blob>;
};

// variants with optional sendToWechat
export const exportHighlightByWeekRoomWithSend = async (week: number, sendToWechat?: boolean): Promise<Blob> => {
  return api.get('/export/highlight-by-week/room', {
    params: sendToWechat ? { week, sendToWechat: true } : { week },
    responseType: 'blob'
  }) as Promise<Blob>;
};

export const exportHighlightByWeekWeekdayWithSend = async (week: number, sendToWechat?: boolean): Promise<Blob> => {
  return api.get('/export/highlight-by-week/weekday', {
    params: sendToWechat ? { week, sendToWechat: true } : { week },
    responseType: 'blob'
  }) as Promise<Blob>;
};

// 获取课表信息（最新版本+学期）
export const getTimetableInfo = async () => {
  return api.get('/export/timetable-info');
};

// 获取完整课表 JSON 数据（合并周次后）
export const getTimetableJson = async () => {
  return api.get('/export/timetable-json');
};

// 导出导入时上传的原始文件（原始 Excel），后端需在上传时保存原文件并提供此接口
export const exportOriginalFile = async (sendToWechat?: boolean): Promise<Blob> => {
  return api.get('/export/original', {
    params: sendToWechat ? { sendToWechat: true } : {},
    responseType: 'blob'
  }) as Promise<Blob>;
};


