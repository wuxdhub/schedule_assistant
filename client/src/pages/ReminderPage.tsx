import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Popconfirm,
  message,
  Tag
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import api from '../services/api';

interface Reminder {
  id: string;
  reminderTime: string;
  intervalDays: number;
  webhookUrl: string | null;
  isEnabled: boolean;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const ReminderPage = () => {
  const [data, setData] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [sendingId, setSendingId] = useState<string | null>(null);

  const handleSendNow = async (id: string) => {
    setSendingId(id);
    try {
      await api.post(`/reminder/${id}/send-now`);
      message.success('已发送，请稍后查看企业微信');
    } catch (err: any) {
      message.error(err?.message || '发送失败');
    } finally {
      setSendingId(null);
    }
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reminder/list');
      const list = res?.data ?? (Array.isArray(res) ? res : []);
      setData(list);
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    // 默认值
    form.setFieldsValue({ intervalDays: 0, isEnabled: true });
    setModalOpen(true);
  };

  const openEdit = (record: Reminder) => {
    setEditingId(record.id);
    form.setFieldsValue({
      reminderTime: record.reminderTime.slice(0, 5), // HH:mm
      intervalDays: record.intervalDays,
      webhookUrl: record.webhookUrl ?? '',
      isEnabled: record.isEnabled,
      description: record.description ?? ''
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/reminder/${id}`);
      message.success('删除成功');
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = {
        reminderTime: values.reminderTime,
        intervalDays: values.intervalDays ?? 0,
        webhookUrl: values.webhookUrl || null,
        isEnabled: values.isEnabled,
        description: values.description || null
      };

      if (editingId) {
        await api.put(`/reminder/${editingId}`, payload);
        message.success('修改成功');
      } else {
        await api.post('/reminder/create', payload);
        message.success('新增成功');
      }

      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<Reminder> = [
    {
      title: '提醒时间',
      dataIndex: 'reminderTime',
      key: 'reminderTime',
      width: 100,
      render: (val: string) => val.slice(0, 5)
    },
    {
      title: '间隔天数',
      dataIndex: 'intervalDays',
      key: 'intervalDays',
      width: 100,
      render: (val: number) => val === 0 ? '当天' : `+${val}天`
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 160,
      render: (val: string | null) => val || '-'
    },
    {
      title: 'Webhook URL',
      dataIndex: 'webhookUrl',
      key: 'webhookUrl',
      ellipsis: true,
      render: (val: string | null) => {
        if (!val) return '-';
        const visible = val.length > 12
          ? val.slice(0, 8) + '****' + val.slice(-4)
          : '****';
        return <span style={{ fontFamily: 'monospace' }}>{visible}</span>;
      }
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      render: (val: boolean) => (
        <Tag color={val ? 'green' : 'default'}>{val ? '启用' : '禁用'}</Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_: any, record: Reminder) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            loading={sendingId === record.id}
            onClick={() => handleSendNow(record.id)}
          >
            立即发送
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该提醒吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Card
      title="定时提醒"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增提醒
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total) => `共 ${total} 条` }}
      />

      <Modal
        title={editingId ? '编辑提醒' : '新增提醒'}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="reminderTime"
            label="提醒时间"
            rules={[
              { required: true, message: '请输入提醒时间' },
              { pattern: /^\d{2}:\d{2}$/, message: '格式为 HH:mm，如 18:00' }
            ]}
          >
            <Input placeholder="HH:mm，如 18:00" maxLength={5} />
          </Form.Item>

          <Form.Item
            name="intervalDays"
            label="间隔天数"
            tooltip="0表示当天，1表示加一天，以此类推"
            rules={[{ required: true, message: '请输入间隔天数' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0=当天，1=加一天" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input placeholder="可选，备注说明" maxLength={200} />
          </Form.Item>

          <Form.Item name="webhookUrl" label="Webhook URL">
            <Input.Password placeholder="企业微信或其他 webhook 地址" maxLength={500} visibilityToggle={false} />
          </Form.Item>

          <Form.Item name="isEnabled" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ReminderPage;
