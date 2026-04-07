import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  message,
  Tag,
  Switch,
  Tooltip
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import api from '../services/api';

interface ScheduleVersion {
  id: string;
  version: number;
  semester: string | null;
  isActive: boolean;
  fileName: string;
  originalFilePath: string | null;
  fileHash: string | null;
  description: string | null;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
}

const ScheduleVersionPage = () => {
  const [data, setData] = useState<ScheduleVersion[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/schedule-version/list');
      const list = res?.data ?? (Array.isArray(res) ? res : []);
      setData(list);
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchSemesters = async () => {
    try {
      const res = await api.get('/semester/list');
      const list: any[] = res?.data ?? (Array.isArray(res) ? res : []);
      setSemesters(list.map(s => s.semester));
    } catch {
      // 加载失败不影响主功能
    }
  };

  useEffect(() => {
    fetchList();
    fetchSemesters();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    // 自动推算下一个版本号
    const maxVersion = data.length > 0 ? Math.max(...data.map(d => d.version)) : 0;
    form.setFieldsValue({ version: maxVersion + 1, isActive: false });
    setModalOpen(true);
  };

  const openEdit = (record: ScheduleVersion) => {
    setEditingId(record.id);
    form.setFieldsValue({
      version: record.version,
      semester: record.semester,
      isActive: record.isActive,
      fileName: record.fileName,
      description: record.description
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/schedule-version/${id}`);
      message.success('删除成功');
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.patch(`/schedule-version/${id}/activate`);
      message.success('已启用该版本');
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '操作失败');
    }
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = {
        version: values.version,
        semester: values.semester || null,
        isActive: values.isActive ?? false,
        fileName: values.fileName,
        description: values.description || null
      };

      if (editingId) {
        await api.put(`/schedule-version/${editingId}`, payload);
        message.success('修改成功');
      } else {
        await api.post('/schedule-version/create', payload);
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

  const columns: ColumnsType<ScheduleVersion> = [
    {
      title: '学期',
      dataIndex: 'semester',
      key: 'semester',
      render: (val: string | null) => val || '-'
    },
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      width: 100
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (val: boolean) =>
        val ? <Tag color="green">启用</Tag> : <Tag color="default">未启用</Tag>
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true
    },
    {
      title: '课程数',
      dataIndex: 'recordCount',
      key: 'recordCount',
      width: 80
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (val: string | null) => val || '-'
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
      render: (_: any, record: ScheduleVersion) => (
        <Space>
          {!record.isActive && (
            <Tooltip title="启用此版本">
              <Popconfirm
                title="启用后其他版本将自动停用，确定吗？"
                onConfirm={() => handleActivate(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" size="small" icon={<CheckCircleOutlined />}>
                  启用
                </Button>
              </Popconfirm>
            </Tooltip>
          )}
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="删除版本后，关联的课程记录将失去版本信息，确定删除吗？"
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
      title="课表版本管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增版本
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
        rowClassName={(record) => record.isActive ? 'ant-table-row-selected' : ''}
      />

      <Modal
        title={editingId ? '编辑版本' : '新增版本'}
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
          <Form.Item name="semester" label="学期">
            <Select
              placeholder="请选择学期"
              allowClear
              options={semesters.map(s => ({ label: s, value: s }))}
            />
          </Form.Item>

          <Form.Item
            name="version"
            label="版本号"
            rules={[{ required: true, message: '请输入版本号' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="如：1" />
          </Form.Item>

          <Form.Item
            name="fileName"
            label="文件名"
            rules={[{ required: true, message: '请输入文件名' }]}
          >
            <Input placeholder="如：2025-2026-1课表.xlsx" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="版本备注说明（可选）" />
          </Form.Item>

          <Form.Item name="isActive" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="未启用" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ScheduleVersionPage;
