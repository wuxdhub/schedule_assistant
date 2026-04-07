import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Space,
  Popconfirm,
  message
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import locale from 'antd/es/date-picker/locale/zh_CN';
import api from '../services/api';

dayjs.locale('zh-cn');

interface Semester {
  id: string;
  semester: string;
  startDate: string;
  endDate: string;
  sortOrder: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const SemesterPage = () => {
  const [data, setData] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/semester/list');
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
    setModalOpen(true);
  };

  const openEdit = (record: Semester) => {
    setEditingId(record.id);
    form.setFieldsValue({
      semester: record.semester,
      startDate: dayjs(record.startDate),
      endDate: dayjs(record.endDate),
      sortOrder: record.sortOrder
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/semester/${id}`);
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
        semester: values.semester,
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate.format('YYYY-MM-DD'),
        sortOrder: values.sortOrder ?? 0
      };

      if (editingId) {
        await api.put(`/semester/${editingId}`, payload);
        message.success('修改成功');
      } else {
        await api.post('/semester/create', payload);
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

  const columns: ColumnsType<Semester> = [
    {
      title: '学期',
      dataIndex: 'semester',
      key: 'semester'
    },
    {
      title: '开始时间',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD')
    },
    {
      title: '结束时间',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD')
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Semester) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该学期吗？"
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
      title="学期管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增学期
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
      />

      <Modal
        title={editingId ? '编辑学期' : '新增学期'}
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
            name="semester"
            label="学期名称"
            rules={[{ required: true, message: '请输入学期名称' }]}
          >
            <Input placeholder="如：2025-2026学年第一学期" />
          </Form.Item>

          <Form.Item
            name="startDate"
            label="开始时间"
            rules={[{ required: true, message: '请选择开始时间' }]}
          >
            <DatePicker
              locale={locale}
              style={{ width: '100%' }}
              placeholder="开始时间"
            />
          </Form.Item>

          <Form.Item
            name="endDate"
            label="结束时间"
            rules={[{ required: true, message: '请选择结束时间' }]}
          >
            <DatePicker
              locale={locale}
              style={{ width: '100%' }}
              placeholder="结束时间"
            />
          </Form.Item>

          <Form.Item name="sortOrder" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="数字越小越靠前" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default SemesterPage;
