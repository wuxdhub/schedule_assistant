import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  message,
  Row,
  Col,
  Collapse
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  getScheduleList,
  Schedule
} from '../services/scheduleService';
import { formatScheduleText } from '../utils/scheduleFormatter';
import { useAuth } from '../contexts/AuthContext';

const SchedulePage = () => {
  const { isAdmin } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const response = await getScheduleList({ status: 'active' });
      // API响应拦截器返回的是 response.data，后端格式：{ success: true, data: [...] }
      const schedules = (response && response.data) ? response.data : (Array.isArray(response) ? response : []);
      setSchedules(Array.isArray(schedules) ? schedules : []);
    } catch (error: any) {
      console.error('加载课表失败:', error);
      message.error('加载课表失败：' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // （不再需要加载机房列表；管理界面仅用于展示整合数据）

  // 管理页不再提供修改或取消预约功能（只供查看整合课表）

  // 按机房和星期分组课程
  const schedulesByRoomAndDay = useMemo(() => {
    const grouped: Record<string, Record<number, Schedule[]>> = {};
    schedules.forEach(schedule => {
      const roomId = schedule.computerRoom.id;
      const day = schedule.dayOfWeek;
      
      if (!grouped[roomId]) {
        grouped[roomId] = {};
      }
      if (!grouped[roomId][day]) {
        grouped[roomId][day] = [];
      }
      grouped[roomId][day].push(schedule);
    });
    
    // 对每个机房每天的课程按节次排序
    Object.keys(grouped).forEach(roomId => {
      Object.keys(grouped[roomId]).forEach(day => {
        grouped[roomId][parseInt(day)].sort((a, b) => {
          if (a.periodStart !== b.periodStart) {
            return a.periodStart - b.periodStart;
          }
          return a.periodEnd - b.periodEnd;
        });
      });
    });
    
    return grouped;
  }, [schedules]);

  // 生成列定义（用于每天的课程表格）
  const generateColumns = useCallback(() => [
    {
      title: '节次',
      key: 'period',
      width: 120,
      render: (_: any, record: Schedule) => {
        const periodStr = record.periodStart === record.periodEnd
          ? `第${record.periodStart}节`
          : `第${record.periodStart}-${record.periodEnd}节`;
        return periodStr;
      }
    },
    {
      title: '课程名称',
      dataIndex: 'courseName',
      key: 'courseName',
      width: 200
    },
    {
      title: '周次',
      key: 'weeks',
      width: 120,
      render: (_: any, record: Schedule) => {
        const weekStr = record.weekStart === record.weekEnd
          ? `第${record.weekStart}周`
          : `第${record.weekStart}-${record.weekEnd}周`;
        return weekStr;
      }
    },
    {
      title: '授课教师',
      dataIndex: 'teacher',
      key: 'teacher',
      width: 120
    },
    {
      title: '上课班级',
      dataIndex: 'classes',
      key: 'classes',
      width: 200
    },
  ], []);

  // 生成按机房和星期分组的Collapse面板
  const collapseItems = useMemo(() => {
    const items: any[] = [];
    const days = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    
    // 获取所有唯一的机房ID，并按机房名称排序
    const roomIds = [...new Set(schedules.map(s => s.computerRoom.id))];
    
    // 按机房名称排序（第一机房、第二机房...第十二机房）
    const sortedRoomIds = roomIds.sort((a, b) => {
      const roomA = schedules.find(s => s.computerRoom.id === a)?.computerRoom;
      const roomB = schedules.find(s => s.computerRoom.id === b)?.computerRoom;
      if (!roomA || !roomB) return 0;
      
      // 提取机房名称中的数字（第一、第二等）
      const getRoomOrder = (roomName: string | null | undefined): number => {
        if (!roomName) return 999; // 没有名称的排在最后
        const match = roomName.match(/第([一二三四五六七八九十]+)/);
        if (!match) return 999;
        const chineseNumbers: Record<string, number> = {
          '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
          '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12
        };
        // 处理"十一"、"十二"等多字数字
        if (match[1].length > 1) {
          if (match[1] === '十一') return 11;
          if (match[1] === '十二') return 12;
        }
        return chineseNumbers[match[1]] || 999;
      };
      
      const orderA = getRoomOrder(roomA.roomName);
      const orderB = getRoomOrder(roomB.roomName);
      return orderA - orderB;
    });
    
    sortedRoomIds.forEach(roomId => {
      const room = schedules.find(s => s.computerRoom.id === roomId)?.computerRoom;
      if (!room) return;
      
      const roomDisplayName = room.roomName 
        ? `${room.roomName}（${room.roomNumber}）`
        : room.roomNumber;
      
      // 统计该机房的课程总数
      const totalCourses = schedules.filter(s => s.computerRoom.id === roomId).length;
      
      // 为每个星期创建子面板
      const dayItems: any[] = [];
      for (let day = 1; day <= 7; day++) {
        const daySchedules = schedulesByRoomAndDay[roomId]?.[day] || [];
        if (daySchedules.length === 0) continue; // 如果某天没有课程，跳过
        
        dayItems.push({
          key: `${roomId}-${day}`,
          label: `${days[day]} - ${daySchedules.length} 条课程数据`,
          children: (
            <Table
              columns={generateColumns()}
              dataSource={daySchedules}
              rowKey="id"
              size="small"
              scroll={{ x: 1400 }}
              pagination={false}
            />
          )
        });
      }
      
      // 如果该机房有课程，添加到主面板
      if (dayItems.length > 0) {
        items.push({
          key: roomId,
          label: `${roomDisplayName} - 共 ${totalCourses} 条课程数据`,
          children: (
            <Collapse
              items={dayItems}
              defaultActiveKey={dayItems.map(item => item.key)}
              ghost
            />
          )
        });
      }
    });
    
    return items;
  }, [schedulesByRoomAndDay, schedules, generateColumns]);

  return (
    <Card
      title="课表整合与维护"
      extra={
        <Button icon={<ReloadOutlined />} onClick={loadSchedules}>
          刷新
        </Button>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          加载中...
        </div>
      ) : collapseItems.length > 0 ? (
        <Collapse
          items={collapseItems}
          defaultActiveKey={collapseItems.map(item => item.key)}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          暂无课程数据
        </div>
      )}

      {/* 管理界面不再提供修改弹窗 */}
    </Card>
  );
};

export default SchedulePage;


