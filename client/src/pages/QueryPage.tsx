import { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Select, Button, Table, Space, Row, Col, message, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { queryAvailableRooms, getAllRooms, ComputerRoom } from '../services/scheduleService';
import { useAuth } from '../contexts/AuthContext';

const { Option } = Select;

const QueryPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<ComputerRoom[]>([]);
  // 预留：如果后续需要在界面显示全部机房信息，可复用该状态（目前不使用）
  // const [allRooms, setAllRooms] = useState<ComputerRoom[]>([]);
  const { isAdmin } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadAllRooms();
  }, []);

  const loadAllRooms = async () => {
    try {
      await getAllRooms();
    } catch (error: any) {
      console.error('加载机房列表失败:', error);
      message.error('加载机房列表失败：' + (error.message || '未知错误'));
    }
  };

  const handleQuery = async (values: any) => {
    setLoading(true);
    // 重置分页到第一页
    setCurrentPage(1);
    try {
      const filter: any = {};

      // 处理周次
      if (values.weekType === 'single' && values.weekSingle) {
        filter.weeks = [values.weekSingle];
      } else if (values.weekType === 'range' && values.weekStart && values.weekEnd) {
        filter.weeks = { start: values.weekStart, end: values.weekEnd };
      } else if (values.weekType === 'multiple' && values.weeksMultiple) {
        filter.weeks = values.weeksMultiple;
      }

      // 星期为必填项
      if (!values.dayOfWeek) {
        message.error('请选择星期');
        // 触发表单校验高亮
        form.validateFields(['dayOfWeek']);
        setLoading(false);
        return;
      }
      filter.dayOfWeek = values.dayOfWeek;

      if (values.periodStart) {
        filter.periodStart = values.periodStart;
      }

      if (values.periodEnd) {
        filter.periodEnd = values.periodEnd;
      }

      if (values.minCapacity) {
        filter.minCapacity = values.minCapacity;
      }

      const response = await queryAvailableRooms(filter);
      // API响应拦截器返回的是 response.data，后端格式：{ success: true, data: [...], count: ... }
      const rooms = (response && response.data) ? response.data : (Array.isArray(response) ? response : []);
      setRooms(Array.isArray(rooms) ? rooms : []);
      
      if (rooms.length === 0) {
        message.info('未找到符合条件的空闲机房');
      }
    } catch (error: any) {
      message.error('查询失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 预约功能已从智能查询移除（管理端/查询页仅用于查找空闲机房）

  const columns = [
    {
      title: '机房号',
      dataIndex: 'roomNumber',
      key: 'roomNumber',
      width: 150,
      render: (_: any, record: ComputerRoom) => {
        if (record.roomName) {
          return `${record.roomName}（${record.roomNumber}）`;
        }
        return record.roomNumber;
      }
    },
    {
      title: '容量',
      dataIndex: 'capacity',
      key: 'capacity',
      width: 100,
      render: (capacity: number) => `${capacity} 人`
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      ellipsis: true
    },
    // 智能查询不再提供一键预约操作
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="智能查询与筛选">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleQuery}
          initialValues={{
            weekType: 'single',
            periodStart: 1,
            periodEnd: 2
          }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="周次类型" name="weekType">
                <Select
                  onChange={() => {
                    // 切换周次类型时清空相关输入，避免残留
                    form.setFieldsValue({
                      weekSingle: undefined,
                      weekStart: undefined,
                      weekEnd: undefined,
                      weeksMultiple: []
                    });
                  }}
                >
                  <Option value="single">单个周次</Option>
                  <Option value="range">连续周次</Option>
                  <Option value="multiple">不连续周次</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) =>
                  prevValues.weekType !== currentValues.weekType
                }
              >
                {({ getFieldValue }) => {
                  const weekType = getFieldValue('weekType');
                  if (weekType === 'single') {
                    return (
                      <Form.Item label="周次" name="weekSingle" rules={[{ required: true, message: '请输入周次' }]}>
                        <InputNumber min={1} max={20} placeholder="如：14" style={{ width: '100%' }} />
                      </Form.Item>
                    );
                  }
                  if (weekType === 'range') {
                    return (
                      <>
                        <Form.Item label="起始周次" name="weekStart" rules={[{ required: true, message: '请输入起始周次' }]}>
                          <InputNumber min={1} max={20} placeholder="如：14" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item label="结束周次" name="weekEnd" rules={[{ required: true, message: '请输入结束周次' }]}>
                          <InputNumber min={1} max={20} placeholder="如：16" style={{ width: '100%' }} />
                        </Form.Item>
                      </>
                    );
                  }
                  return (
                    <Form.Item
                      label="周次（多个）"
                      name="weeksMultiple"
                      rules={[{ required: true, message: '请选择周次' }]}
                    >
                      <Select mode="multiple" placeholder="选择多个周次">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(week => (
                          <Option key={week} value={week}>
                            第{week}周
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="星期"
                name="dayOfWeek"
                rules={[{ required: true, message: '请选择星期' }]}
              >
                <Select placeholder="选择星期">
                  <Option value={1}>周一</Option>
                  <Option value={2}>周二</Option>
                  <Option value={3}>周三</Option>
                  <Option value={4}>周四</Option>
                  <Option value={5}>周五</Option>
                  <Option value={6}>周六</Option>
                  <Option value={7}>周日</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="起始节次" name="periodStart">
                <InputNumber min={1} max={13} placeholder="如：3" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="结束节次" name="periodEnd">
                <InputNumber min={1} max={13} placeholder="如：5" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="最小容量" name="minCapacity">
                <InputNumber min={1} placeholder="学生人数" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              查询空闲机房
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="查询结果">
        <Table
          columns={columns}
          dataSource={rooms}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            current: currentPage,
            onChange: (page) => setCurrentPage(page)
          }}
        />
      </Card>

      {/* 预约弹窗已移除 */}
    </Space>
  );
};

export default QueryPage;


