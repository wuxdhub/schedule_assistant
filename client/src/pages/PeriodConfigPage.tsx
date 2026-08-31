import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Space,
  Popconfirm,
  message
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  PeriodConfig,
  getPeriodConfigList,
  createPeriodConfig,
  updatePeriodConfig,
  deletePeriodConfig
} from '../services/scheduleService';

const PeriodConfigPage = () => {
  const [data, setData] = useState<PeriodConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchList = async () => {
    setLoading(true);
    try {
      const res: any = await getPeriodConfigList();
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

  const openEdit = (record: PeriodConfig) => {
    setEditingId(record.id);
    form.setFieldsValue({
      label: record.label,
      startPeriod: record.startPeriod,
      endPeriod: record.endPeriod,
      sortOrder: record.sortOrder
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePeriodConfig(id);
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
        label: values.label,
        startPeriod: values.startPeriod,
        endPeriod: values.endPeriod,
        sortOrder: values.sortOrder ?? 0
      };

      if (editingId) {
        await updatePeriodConfig(editingId, payload);
        message.success('修改成功');
      } else {
        await createPeriodConfig(payload);
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

  const columns: ColumnsType<PeriodConfig> = [
    {
      title: '显示标签',
      dataIndex: 'label',
      key: 'label'
    },
    {
      title: '起始节次',
      dataIndex: 'startPeriod',
      key: 'startPeriod',
      width: 100
    },
    {
      title: '结束节次',
      dataIndex: 'endPeriod',
      key: 'endPeriod',
      width: 100
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: PeriodConfig) => (
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
            title="确定删除该节次配置吗？"
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
      title="节次配置"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增节次
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingId ? '编辑节次' : '新增节次'}
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
            name="label"
            label="显示标签"
            rules={[{ required: true, message: '请输入显示标签' }]}
          >
            <Input placeholder='如："1-2节"、"晚"' />
          </Form.Item>

          <Form.Item
            name="startPeriod"
            label="起始节次"
            rules={[{ required: true, message: '请输入起始节次' }]}
          >
            <InputNumber min={1} max={20} style={{ width: '100%' }} placeholder="如：1" />
          </Form.Item>

          <Form.Item
            name="endPeriod"
            label="结束节次"
            rules={[{ required: true, message: '请输入结束节次' }]}
          >
            <InputNumber min={1} max={20} style={{ width: '100%' }} placeholder="如：2" />
          </Form.Item>

          <Form.Item name="sortOrder" label="排序序号" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="数字越小越靠前" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default PeriodConfigPage;
