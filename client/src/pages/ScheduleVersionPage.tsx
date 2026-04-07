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
  Tooltip,
  Upload
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, InboxOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import api from '../services/api';
import { checkFileImported } from '../services/scheduleService';

const { Dragger } = Upload;

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
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [checking, setChecking] = useState(false);
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
    setFileList([]);
    form.resetFields();
    const maxVersion = data.length > 0 ? Math.max(...data.map(d => d.version)) : 0;
    form.setFieldsValue({ version: maxVersion + 1, isActive: false });
    setModalOpen(true);
  };

  const openEdit = (record: ScheduleVersion) => {
    setEditingId(record.id);
    setFileList([]);
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

  // 编辑模式：直接调用版本接口
  const handleEditSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      await api.put(`/schedule-version/${editingId}`, {
        version: values.version,
        semester: values.semester || null,
        isActive: values.isActive ?? false,
        fileName: values.fileName,
        description: values.description || null
      });
      message.success('修改成功');
      setModalOpen(false);
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 新增模式：上传 Excel 并导入
  const doImport = async (file: File, values: any) => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('version', String(values.version));
      if (values.semester) formData.append('semester', values.semester);
      formData.append('isActive', String(values.isActive ?? false));
      if (values.description) formData.append('description', values.description);

      const res = await api.post('/upload/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success(`导入成功！成功 ${res.imported} 条，失败 ${res.failed} 条`);
      setModalOpen(false);
      setFileList([]);
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '导入失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubmit = async (values: any) => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning('请选择要上传的课表文件');
      return;
    }

    setChecking(true);
    try {
      const checkResult = await checkFileImported(file);
      setChecking(false);

      if (checkResult.imported && checkResult.version) {
        Modal.confirm({
          title: '文件已导入过',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p>该文件已在之前导入过：</p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>版本号：v{checkResult.version.version}</li>
                <li>文件名：{checkResult.version.fileName || '未知'}</li>
                <li>导入时间：{dayjs(checkResult.version.createdAt).format('YYYY-MM-DD HH:mm:ss')}</li>
                <li>记录数：{checkResult.version.recordCount} 条</li>
              </ul>
              <p style={{ marginTop: 12, color: '#ff4d4f' }}>是否继续导入？继续将创建新版本。</p>
            </div>
          ),
          okText: '继续导入',
          cancelText: '取消',
          onOk: () => doImport(file, values)
        });
      } else {
        await doImport(file, values);
      }
    } catch (err: any) {
      setChecking(false);
      message.error('检查文件失败：' + (err?.message || '未知错误'));
    }
  };

  const handleSubmit = (values: any) => {
    if (editingId) {
      handleEditSubmit(values);
    } else {
      handleCreateSubmit(values);
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
            title="删除版本将同时删除该版本下所有课程数据，确定删除吗？"
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
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total) => `共 ${total} 条` }}
        rowClassName={(record) => record.isActive ? 'ant-table-row-selected' : ''}
      />

      <Modal
        title={editingId ? '编辑版本' : '新增版本'}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => { setModalOpen(false); setFileList([]); }}
        confirmLoading={submitting || checking}
        okText={editingId ? '保存' : (checking ? '检查文件中...' : '导入')}
        cancelText="取消"
        destroyOnClose
        width={520}
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

          {/* 新增时显示文件上传，编辑时显示文件名输入框 */}
          {editingId ? (
            <Form.Item
              name="fileName"
              label="文件名"
              rules={[{ required: true, message: '请输入文件名' }]}
            >
              <Input placeholder="如：2025-2026-1课表.xlsx" />
            </Form.Item>
          ) : (
            <Form.Item label="初始课表上传" required>
              <Dragger
                accept=".xlsx,.xls"
                fileList={fileList}
                maxCount={1}
                beforeUpload={() => false}
                onChange={(info) => setFileList(info.fileList.slice(-1))}
                onRemove={() => setFileList([])}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽课表文件到此区域</p>
                <p className="ant-upload-hint">支持 .xlsx 和 .xls 格式</p>
              </Dragger>
            </Form.Item>
          )}

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
