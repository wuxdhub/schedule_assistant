import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  message,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  Row,
  Col
} from 'antd';
import { ReloadOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import {
  getScheduleList,
  Schedule,
  updateSchedule,
  deleteSchedule,
  getAllRooms,
  ComputerRoom
} from '../services/scheduleService';
import { useAuth } from '../contexts/AuthContext';

const SchedulePage = () => {
  const { isAdmin } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<ComputerRoom[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [form] = Form.useForm();
  const [searchCourseName, setSearchCourseName] = useState('');
  const [searchTeacher, setSearchTeacher] = useState('');

  useEffect(() => {
    loadSchedules();
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const response = await getAllRooms();
      const roomsData = (response && response.data) ? response.data : (Array.isArray(response) ? response : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
    } catch (error: any) {
      console.error('加载机房列表失败:', error);
      message.error('加载机房列表失败');
    }
  };

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const response = await getScheduleList({ status: 'active' });
      const schedules = (response && response.data) ? response.data : (Array.isArray(response) ? response : []);
      setSchedules(Array.isArray(schedules) ? schedules : []);
    } catch (error: any) {
      console.error('加载课表失败:', error);
      message.error('加载课表失败：' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 打开编辑弹窗
  const handleEdit = (record: Schedule) => {
    setEditingSchedule(record);
    form.setFieldsValue({
      computerRoomId: record.computerRoomId,
      courseName: record.courseName,
      teacher: record.teacher,
      classes: record.classes,
      weekStart: record.weekStart,
      weekEnd: record.weekEnd,
      dayOfWeek: record.dayOfWeek,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd
    });
    setEditModalVisible(true);
  };

  // 保存修改
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!editingSchedule) return;

      await updateSchedule(editingSchedule.id, values);
      message.success('修改成功');
      setEditModalVisible(false);
      setEditingSchedule(null);
      form.resetFields();
      loadSchedules();
    } catch (error: any) {
      console.error('修改失败:', error);
      message.error('修改失败：' + (error.message || '未知错误'));
    }
  };

  // 删除课程
  const handleDelete = async (id: string) => {
    try {
      await deleteSchedule(id);
      message.success('删除成功');
      loadSchedules();
    } catch (error: any) {
      console.error('删除失败:', error);
      message.error('删除失败：' + (error.message || '未知错误'));
    }
  };

  // 取消编辑
  const handleCancel = () => {
    setEditModalVisible(false);
    setEditingSchedule(null);
    form.resetFields();
  };

  // 重置查询条件
  const handleReset = () => {
    setSearchCourseName('');
    setSearchTeacher('');
  };

  // 排序和筛选后的课表数据
  const sortedSchedules = useMemo(() => {
    // 提取机房名称中的数字用于排序
    const getRoomOrder = (roomName: string | null | undefined): number => {
      if (!roomName) return 999;
      const match = roomName.match(/第([一二三四五六七八九十]+)/);
      if (!match) return 999;
      const chineseNumbers: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
        '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12
      };
      if (match[1].length > 1) {
        if (match[1] === '十一') return 11;
        if (match[1] === '十二') return 12;
      }
      return chineseNumbers[match[1]] || 999;
    };

    // 先筛选
    let filtered = schedules;
    if (searchCourseName) {
      filtered = filtered.filter(s => s.courseName.includes(searchCourseName));
    }
    if (searchTeacher) {
      filtered = filtered.filter(s => s.teacher.includes(searchTeacher));
    }

    // 再排序
    return [...filtered].sort((a, b) => {
      // 先按机房排序
      const roomOrderA = getRoomOrder(a.computerRoom.roomName);
      const roomOrderB = getRoomOrder(b.computerRoom.roomName);
      if (roomOrderA !== roomOrderB) {
        return roomOrderA - roomOrderB;
      }

      // 再按星期排序
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }

      // 最后按节次排序
      if (a.periodStart !== b.periodStart) {
        return a.periodStart - b.periodStart;
      }

      return 0;
    });
  }, [schedules, searchCourseName, searchTeacher]);

  // 表格列定义
  const columns = [
    {
      title: '机房',
      key: 'room',
      width: 180,
      render: (_: any, record: Schedule) => {
        const room = record.computerRoom;
        return room.roomName
          ? `${room.roomName}（${room.roomNumber}）`
          : room.roomNumber;
      }
    },
    {
      title: '星期',
      key: 'day',
      width: 70,
      render: (_: any, record: Schedule) => {
        const days = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        return days[record.dayOfWeek] || '';
      }
    },
    {
      title: '节次',
      key: 'period',
      width: 100,
      render: (_: any, record: Schedule) => {
        return record.periodStart === record.periodEnd
          ? `第${record.periodStart}节`
          : `第${record.periodStart}-${record.periodEnd}节`;
      }
    },
    {
      title: '课程名称',
      dataIndex: 'courseName',
      key: 'courseName',
      width: 180,
      ellipsis: true
    },
    {
      title: '周次',
      key: 'weeks',
      width: 100,
      render: (_: any, record: Schedule) => {
        return record.weekStart === record.weekEnd
          ? `第${record.weekStart}周`
          : `第${record.weekStart}-${record.weekEnd}周`;
      }
    },
    {
      title: '授课教师',
      dataIndex: 'teacher',
      key: 'teacher',
      width: 100
    },
    {
      title: '上课班级',
      dataIndex: 'classes',
      key: 'classes',
      width: 250,
      ellipsis: true
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Schedule) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这条课程数据吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      {/* 查询条件 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Input
              placeholder="请输入课程名称"
              value={searchCourseName}
              onChange={(e) => setSearchCourseName(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Input
              placeholder="请输入教师姓名"
              value={searchTeacher}
              onChange={(e) => setSearchTeacher(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>
              查询
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={handleReset}>
              重置
            </Button>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={sortedSchedules}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 1200 }}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条课程数据`
          }}
        />
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑课程"
        open={editModalVisible}
        onOk={handleSave}
        onCancel={handleCancel}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="computerRoomId"
            label="机房"
            rules={[{ required: true, message: '请选择机房' }]}
          >
            <Select placeholder="请选择机房">
              {rooms.map(room => (
                <Select.Option key={room.id} value={room.id}>
                  {room.roomName ? `${room.roomName}（${room.roomNumber}）` : room.roomNumber}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="courseName"
            label="课程名称"
            rules={[{ required: true, message: '请输入课程名称' }]}
          >
            <Input placeholder="请输入课程名称" />
          </Form.Item>

          <Form.Item
            name="teacher"
            label="授课教师"
            rules={[{ required: true, message: '请输入授课教师' }]}
          >
            <Input placeholder="请输入授课教师" />
          </Form.Item>

          <Form.Item
            name="classes"
            label="上课班级"
            rules={[{ required: true, message: '请输入上课班级' }]}
          >
            <Input placeholder="请输入上课班级" />
          </Form.Item>

          <Form.Item
            name="dayOfWeek"
            label="星期"
            rules={[{ required: true, message: '请选择星期' }]}
          >
            <Select placeholder="请选择星期">
              <Select.Option value={1}>周一</Select.Option>
              <Select.Option value={2}>周二</Select.Option>
              <Select.Option value={3}>周三</Select.Option>
              <Select.Option value={4}>周四</Select.Option>
              <Select.Option value={5}>周五</Select.Option>
              <Select.Option value={6}>周六</Select.Option>
              <Select.Option value={7}>周日</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="周次">
            <Space>
              <Form.Item
                name="weekStart"
                noStyle
                rules={[{ required: true, message: '请输入起始周' }]}
              >
                <InputNumber min={1} max={20} placeholder="起始周" />
              </Form.Item>
              <span>至</span>
              <Form.Item
                name="weekEnd"
                noStyle
                rules={[{ required: true, message: '请输入结束周' }]}
              >
                <InputNumber min={1} max={20} placeholder="结束周" />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item label="节次">
            <Space>
              <Form.Item
                name="periodStart"
                noStyle
                rules={[{ required: true, message: '请输入起始节次' }]}
              >
                <InputNumber min={1} max={12} placeholder="起始节次" />
              </Form.Item>
              <span>至</span>
              <Form.Item
                name="periodEnd"
                noStyle
                rules={[{ required: true, message: '请输入结束节次' }]}
              >
                <InputNumber min={1} max={12} placeholder="结束节次" />
              </Form.Item>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SchedulePage;
