import { useState } from 'react';
import { Card, Upload, Button, message, Alert, Space, Modal } from 'antd';
import { UploadOutlined, InboxOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { uploadExcel, checkFileImported } from '../services/scheduleService';
import dayjs from 'dayjs';

const { Dragger } = Upload;

const DataImportPage = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);

  // 检查文件是否已导入
  const handleCheckFile = async (file: File) => {
    setChecking(true);
    try {
      const checkResult = await checkFileImported(file);
      
      if (checkResult.imported && checkResult.version) {
        // 文件已导入过，显示确认对话框
        Modal.confirm({
          title: '文件已导入过',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p>该文件已在之前导入过：</p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>版本号：v{checkResult.version.version}</li>
                <li>文件名：<span style={{ fontFamily: 'monospace' }}>{checkResult.version.fileName || '未知'}</span></li>
                <li>导入时间：{dayjs(checkResult.version.createdAt).format('YYYY-MM-DD HH:mm:ss')}</li>
                <li>记录数：{checkResult.version.recordCount} 条</li>
              </ul>
              <p style={{ marginTop: 12, color: '#ff4d4f' }}>是否继续导入？继续导入将创建新版本。</p>
            </div>
          ),
          okText: '继续导入',
          cancelText: '取消',
          onOk: () => {
            handleUpload(file);
          }
        });
      } else {
        // 文件未导入过，直接导入
        handleUpload(file);
      }
    } catch (error: any) {
      message.error('检查文件失败：' + (error.message || '未知错误'));
    } finally {
      setChecking(false);
    }
  };

  const handleUpload = async (file?: File) => {
    const uploadFile = file || fileList[0]?.originFileObj;
    if (!uploadFile) {
      message.warning('请先选择要上传的文件');
      return;
    }

    setLoading(true);
    try {
      const response = await uploadExcel(uploadFile);
      setResult({
        imported: response.imported,
        failed: response.failed
      });
      message.success(`导入成功！成功 ${response.imported} 条，失败 ${response.failed} 条`);
      setFileList([]);
    } catch (error: any) {
      message.error(error.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const uploadProps = {
    accept: '.xlsx,.xls',
    fileList,
    maxCount: 1, // 限制只能上传一个文件
    beforeUpload: () => false,
    onChange: (info: any) => {
      // 只保留最新的一个文件
      const newFileList = info.fileList.slice(-1);
      setFileList(newFileList);
      setResult(null);
    },
    onRemove: () => {
      setFileList([]);
      setResult(null);
    }
  };

  return (
    <Card title="数据导入与初始化" style={{ maxWidth: 800, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="导入说明"
          description="请上传教务处提供的Excel格式机房课表文件。系统将自动解析并导入所有课程信息作为初始数据。"
          type="info"
          showIcon
        />

        <Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">支持 .xlsx 和 .xls 格式的Excel文件</p>
        </Dragger>

        {fileList.length > 0 && (
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => {
              const file = fileList[0].originFileObj;
              if (file) {
                handleCheckFile(file);
              }
            }}
            loading={loading || checking}
            size="large"
            block
          >
            {checking ? '检查文件中...' : '开始导入'}
          </Button>
        )}

        {result && (
          <Alert
            message="导入结果"
            description={`成功导入 ${result.imported} 条记录，失败 ${result.failed} 条记录`}
            type={result.failed === 0 ? 'success' : 'warning'}
            showIcon
          />
        )}
      </Space>
    </Card>
  );
};

export default DataImportPage;


