import { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Alert, Space, message, DatePicker, Calendar, Row, Col, Typography, Checkbox } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import {
  exportOriginalFile,
  exportHighlightByWeekRoomWithSend,
  exportHighlightByWeekWeekdayWithSend
} from '../services/scheduleService';
import dayjs, { Dayjs } from 'dayjs';

const WeeklyExportPage = () => {
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [loadingWeekday, setLoadingWeekday] = useState(false);
  const [form] = Form.useForm();
  const [sendToWechat, setSendToWechat] = useState(false);
  const [semesterStart, setSemesterStart] = useState<Dayjs | null>(null);
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [computedWeek, setComputedWeek] = useState<number | null>(null);

  const STORAGE_KEY = 'semesterStartDate';

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = dayjs(stored);
      if (parsed.isValid()) {
        setSemesterStart(parsed);
      }
    }
  }, []);

  const getValidWeek = (): number | null => {
    const week = form.getFieldValue('week');
    if (!week || week < 1 || week > 30) {
      message.error('周次必须在 1-30 之间');
      return null;
    }
    return week;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    // 确保传入的是有效的 Blob 对象
    if (!(blob instanceof Blob)) {
      throw new Error('无效的响应数据，期望 Blob 对象');
    }
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // 导出原始课表（上传时的原始文件，后端需保存原文件并提供接口）
  const handleExportOriginal = async (sendWechat?: boolean) => {
    setLoadingOriginal(true);
    try {
      const blob = await exportOriginalFile(sendWechat);
      downloadBlob(
        blob,
        `机房课表_${new Date().toISOString().split('T')[0]}.xlsx`
      );
      message.success('原始课表导出成功！');
    } catch (error: any) {
      message.error('原始课表导出失败：' + (error.message || '未知错误'));
    } finally {
      setLoadingOriginal(false);
    }
  };

  // 已直接在按钮中调用带 sendToWechat 的导出函数

  return (
    <Card style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="使用说明"
          description="在日历中选择任意日期计算周次，也可直接输入周次。"
          type="info"
          showIcon
        />

        <Card type="inner" style={{ background: '#fafafa' }}>
          <Form layout="vertical">
            <Row gutter={16} align="middle">
              <Col xs={24} sm={10} md={8}>
                <Form.Item label="学期起始日">
                  <Space>
                    <DatePicker
                      value={semesterStart ?? undefined}
                      onChange={(d) => setSemesterStart(d ?? null)}
                      allowClear
                    />
                    <Button
                      onClick={() => {
                        if (!semesterStart) {
                          message.error('请选择学期起始日后再保存');
                          return;
                        }
                        localStorage.setItem(STORAGE_KEY, semesterStart!.toISOString());
                        message.success('学期起始日已保存');
                      }}
                    >
                      保存
                    </Button>
                    <Button
                      danger
                      onClick={() => {
                        localStorage.removeItem(STORAGE_KEY);
                        setSemesterStart(null);
                        message.success('已清除学期起始日');
                      }}
                    >
                      清除
                    </Button>
                  </Space>
                </Form.Item>
              </Col>

              <Col xs={24} sm={14} md={16}>
                <Typography.Text type="secondary">
                  当前已保存的学期起始日：{' '}
                  {semesterStart ? semesterStart.format('YYYY-MM-DD') : '未设置'}
                </Typography.Text>
              </Col>
            </Row>
          </Form>
        </Card>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Card type="inner" title="日历选择周次">
              <Calendar
                onSelect={(date) => {
                  setSelectedDate(date);
                  if (!semesterStart) {
                    message.warning('请先设置学期起始日（右上保存）以计算周次');
                    return;
                  }
                  const start = semesterStart.startOf('day');
                  const sel = date.startOf('day');
                  const diffDays = sel.diff(start, 'day');
                  if (diffDays < 0) {
                    message.warning('所选日期早于学期起始日，无法计算周次');
                    setComputedWeek(null);
                    return;
                  }
                  const week = Math.floor(diffDays / 7) + 1;
                  setComputedWeek(week);
                  form.setFieldsValue({ week });
                }}
                fullscreen={false}
              />
              <div style={{ marginTop: 12 }}>
                <Typography.Text>
                  选中日期：{selectedDate ? selectedDate.format('YYYY-MM-DD') : '无'}
                </Typography.Text>
                <br />
                <Typography.Text strong>
                  计算周次：{computedWeek ?? '-'}
                </Typography.Text>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card type="inner" title="周次设置与导出">
              <Form
                form={form}
                layout="vertical"
                initialValues={{ week: 11 }}
              >
                <Form.Item
                  label="周次"
                  name="week"
                  rules={[
                    { required: true, message: '请输入周次' },
                    { type: 'number', min: 1, max: 30, message: '周次范围为 1-30' }
                  ]}
                >
                  <InputNumber min={1} max={30} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item>
                  <Checkbox checked={sendToWechat} onChange={(e) => setSendToWechat(e.target.checked)}>
                    发送文件到企业微信群
                  </Checkbox>
                </Form.Item>

                <Form.Item>
                  <div style={{ marginTop: 0, marginBottom: 10 }}>
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={async () => {
                        const week = getValidWeek();
                        if (!week) return;
                        setLoadingRoom(true);
                        try {
                          const blob = await exportHighlightByWeekRoomWithSend(week, sendToWechat);
                          downloadBlob(blob, `课表-第${week}周-按机房.xlsx`);
                          message.success(`方案二（按机房）：第 ${week} 周高亮课表导出成功！`);
                        } catch (error: any) {
                          message.error('方案二（按机房）导出失败：' + (error.message || '未知错误'));
                        } finally {
                          setLoadingRoom(false);
                        }
                      }}
                      loading={loadingRoom}
                      size="large"
                      style={{
                        width: '50%',
                        padding: '12px 16px',
                        fontSize: 15,
                        borderRadius: 8,
                        border: 'none',
                        boxShadow: '0 6px 16px rgba(13,97,255,0.08)',
                      }}
                    >
                      按机房导出
                    </Button>
                  </div>

                  <div>
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={async () => {
                        const week = getValidWeek();
                        if (!week) return;
                        setLoadingWeekday(true);
                        try {
                          const blob = await exportHighlightByWeekWeekdayWithSend(week, sendToWechat);
                          downloadBlob(blob, `课表-第${week}周-按星期.xlsx`);
                          message.success(`方案二（按星期）：第 ${week} 周高亮课表导出成功！`);
                        } catch (error: any) {
                          message.error('方案二（按星期）导出失败：' + (error.message || '未知错误'));
                        } finally {
                          setLoadingWeekday(false);
                        }
                      }}
                      loading={loadingWeekday}
                      size="large"
                      style={{
                        width: '50%',
                        padding: '12px 16px',
                        fontSize: 15,
                        borderRadius: 8,
                        border: 'none',
                        boxShadow: '0 6px 16px rgba(13,97,255,0.08)',
                      }}
                    >
                      按星期导出
                    </Button>
                  </div>

                  <div style={{ textAlign: 'left', margin: '6px 0' }}>
                    <div style={{ fontSize: 15, color: '#8c8c8c', marginTop: 10 }}>
                      周次筛选，红色高亮本周课程
                    </div>
                  </div>

                  <div style={{ marginTop: 48 }}>
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={() => handleExportOriginal(sendToWechat)}
                      loading={loadingOriginal}
                      size="large"
                      style={{
                        width: '50%',
                        padding: '12px 16px',
                        fontSize: 15,
                        borderRadius: 8,
                        border: 'none',
                        boxShadow: '0 6px 16px rgba(13,97,255,0.08)',
                      }}
                    >
                      导出原课表
                    </Button>
                  </div>
                </Form.Item>
              </Form>
            </Card>
          </Col>
        </Row>
      </Space>
    </Card>
  );
};

export default WeeklyExportPage;


