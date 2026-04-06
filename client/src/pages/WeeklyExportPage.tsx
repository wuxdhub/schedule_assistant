import { useState, useEffect, useRef } from 'react';
import { Card, Form, InputNumber, Button, Alert, Space, message, DatePicker, Calendar, Row, Col, Typography, Checkbox, TimePicker, Switch, Divider } from 'antd';
import { DownloadOutlined, SendOutlined, ClockCircleOutlined } from '@ant-design/icons';
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
  const [sendToWechatEnabled, setSendToWechatEnabled] = useState(false);
  const [semesterStart, setSemesterStart] = useState<Dayjs | null>(null);
  const [semesterEnd, setSemesterEnd] = useState<Dayjs | null>(null);
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [computedWeek, setComputedWeek] = useState<number | null>(null);
  
  // 第二天课表功能状态
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [sendTime, setSendTime] = useState<Dayjs | null>(null);
  const [loadingTomorrowSchedule, setLoadingTomorrowSchedule] = useState(false);
  const [tomorrowInfo, setTomorrowInfo] = useState<{week: number, dayOfWeek: number, date: string} | null>(null);
  const timerRef = useRef<number | null>(null);

  const STORAGE_KEY_START = 'semesterStartDate';
  const STORAGE_KEY_END = 'semesterEndDate';
  const STORAGE_KEY_AUTO_SEND = 'autoSendEnabled';
  const STORAGE_KEY_SEND_TIME = 'sendTime';

  useEffect(() => {
    const storedStart = localStorage.getItem(STORAGE_KEY_START);
    if (storedStart) {
      const parsed = dayjs(storedStart);
      if (parsed.isValid()) {
        setSemesterStart(parsed);
      }
    }

    const storedEnd = localStorage.getItem(STORAGE_KEY_END);
    if (storedEnd) {
      const parsed = dayjs(storedEnd);
      if (parsed.isValid()) {
        setSemesterEnd(parsed);
      }
    }

    const storedAutoSend = localStorage.getItem(STORAGE_KEY_AUTO_SEND);
    if (storedAutoSend) {
      setAutoSendEnabled(storedAutoSend === 'true');
    }

    const storedSendTime = localStorage.getItem(STORAGE_KEY_SEND_TIME);
    if (storedSendTime) {
      const parsed = dayjs(storedSendTime);
      if (parsed.isValid()) {
        setSendTime(parsed);
      }
    }
  }, []);

  // 计算第二天是第几周星期几
  const calculateTomorrowInfo = () => {
    if (!semesterStart) {
      return null;
    }
    
    const tomorrow = dayjs().add(1, 'day');
    const start = semesterStart.startOf('day');
    const diffDays = tomorrow.diff(start, 'day');
    
    if (diffDays < 0) {
      return null; // 第二天早于学期开始
    }
    
    // 如果设置了学期结束日，检查是否超出范围
    if (semesterEnd && tomorrow.isAfter(semesterEnd.endOf('day'))) {
      return null; // 第二天晚于学期结束
    }
    
    const week = Math.floor(diffDays / 7) + 1;
    const dayOfWeek = tomorrow.day() === 0 ? 7 : tomorrow.day(); // 转换为1-7，周日为7
    
    return {
      week,
      dayOfWeek,
      date: tomorrow.format('YYYY-MM-DD')
    };
  };

  // 更新第二天信息
  useEffect(() => {
    const info = calculateTomorrowInfo();
    setTomorrowInfo(info);
  }, [semesterStart, semesterEnd]);

  const getValidWeek = (): number | null => {
    const week = form.getFieldValue('week');
    if (!week || week < 1 || week > 30) {
      message.error('周次必须在 1-30 之间');
      return null;
    }
    return week;
  };

  const validateSemesterDates = (start: Dayjs | null, end: Dayjs | null): boolean => {
    if (start && end && end.isBefore(start)) {
      message.error('学期结束日不能早于学期起始日');
      return false;
    }
    return true;
  };

  // 发送到企业微信（通过后端API）
  const sendToWechatGroup = async (info: {week: number, dayOfWeek: number, date: string}) => {
    const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    
    try {
      // 调用后端的单日课表接口，并设置sendToWechat=true
      const response = await fetch(`/api/export/daily-schedule?week=${info.week}&dayOfWeek=${info.dayOfWeek}&sendToWechat=true`, {
        method: 'GET',
      });
      
      if (response.ok) {
        message.success(`第二天课表已发送到企业微信群 (${info.date} 第${info.week}周${dayNames[info.dayOfWeek]})`);
        return true;
      } else {
        const errorText = await response.text();
        throw new Error(errorText || '发送失败');
      }
    } catch (error) {
      message.error('发送到企业微信失败：' + (error as Error).message);
      return false;
    }
  };

  // 手动发送第二天课表
  const handleManualSend = async () => {
    if (!tomorrowInfo) {
      message.error('无法计算第二天信息，请检查学期设置');
      return;
    }
    
    setLoadingTomorrowSchedule(true);
    try {
      await sendToWechatGroup(tomorrowInfo);
    } catch (error) {
      message.error('发送失败：' + (error as Error).message);
    } finally {
      setLoadingTomorrowSchedule(false);
    }
  };

  // 设置定时发送
  const setupAutoSend = () => {
    // 清除现有定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (!autoSendEnabled || !sendTime) {
      return;
    }
    
    const now = dayjs();
    const targetTime = dayjs().hour(sendTime.hour()).minute(sendTime.minute()).second(0);
    
    // 如果今天的发送时间已过，设置为明天
    const nextSendTime = targetTime.isBefore(now) ? targetTime.add(1, 'day') : targetTime;
    const delay = nextSendTime.diff(now);
    
    console.log(`设置定时发送: ${nextSendTime.format('YYYY-MM-DD HH:mm:ss')}, 延迟: ${Math.round(delay / 1000)}秒, 定时器ID: ${timerRef.current}`);
    
    timerRef.current = window.setTimeout(async () => {
      // 防止重复执行：检查定时器是否仍然有效
      const currentTimerId = timerRef.current;
      console.log(`执行定时发送任务, 定时器ID: ${currentTimerId}`);
      
      // 立即清除定时器引用，防止重复执行
      timerRef.current = null;
      
      const currentInfo = calculateTomorrowInfo();
      if (currentInfo) {
        try {
          await sendToWechatGroup(currentInfo);
        } catch (error) {
          console.error('定时发送失败:', error);
        }
      }
      
      // 只有在自动发送仍然启用时才设置下一次发送
      if (autoSendEnabled && sendTime) {
        setupAutoSend();
      }
    }, delay);
    
    console.log(`新定时器已设置, ID: ${timerRef.current}`);
  };

  // 当自动发送设置改变时重新设置定时器
  useEffect(() => {
    // 添加延迟以避免React严格模式的双重调用
    const timeoutId = setTimeout(() => {
      setupAutoSend();
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      if (timerRef.current) {
        console.log(`清理定时器: ${timerRef.current}`);
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoSendEnabled, sendTime]);

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
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="使用说明"
          description="设置学期起始日和结束日后，在日历中选择任意日期计算周次，也可直接输入周次。学期结束日为可选设置，用于验证选择日期的有效性。"
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
                        if (!validateSemesterDates(semesterStart, semesterEnd)) {
                          return;
                        }
                        localStorage.setItem(STORAGE_KEY_START, semesterStart!.toISOString());
                        message.success('学期起始日已保存');
                      }}
                    >
                      保存
                    </Button>
                    <Button
                      danger
                      onClick={() => {
                        localStorage.removeItem(STORAGE_KEY_START);
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

            <Row gutter={16} align="middle" style={{ marginTop: 16 }}>
              <Col xs={24} sm={10} md={8}>
                <Form.Item label="学期结束日">
                  <Space>
                    <DatePicker
                      value={semesterEnd ?? undefined}
                      onChange={(d) => setSemesterEnd(d ?? null)}
                      allowClear
                    />
                    <Button
                      onClick={() => {
                        if (!semesterEnd) {
                          message.error('请选择学期结束日后再保存');
                          return;
                        }
                        if (!validateSemesterDates(semesterStart, semesterEnd)) {
                          return;
                        }
                        localStorage.setItem(STORAGE_KEY_END, semesterEnd!.toISOString());
                        message.success('学期结束日已保存');
                      }}
                    >
                      保存
                    </Button>
                    <Button
                      danger
                      onClick={() => {
                        localStorage.removeItem(STORAGE_KEY_END);
                        setSemesterEnd(null);
                        message.success('已清除学期结束日');
                      }}
                    >
                      清除
                    </Button>
                  </Space>
                </Form.Item>
              </Col>

              <Col xs={24} sm={14} md={16}>
                <Typography.Text type="secondary">
                  当前已保存的学期结束日：{' '}
                  {semesterEnd ? semesterEnd.format('YYYY-MM-DD') : '未设置'}
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
                    message.warning('请先设置学期起始日以计算周次');
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
                  
                  // 如果设置了学期结束日，检查是否超出学期范围
                  if (semesterEnd) {
                    const end = semesterEnd.startOf('day');
                    if (sel.isAfter(end)) {
                      message.warning('所选日期晚于学期结束日，无法计算周次');
                      setComputedWeek(null);
                      return;
                    }
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
                  <Checkbox checked={sendToWechatEnabled} onChange={(e) => setSendToWechatEnabled(e.target.checked)}>
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
                          const blob = await exportHighlightByWeekRoomWithSend(week, sendToWechatEnabled);
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
                          const blob = await exportHighlightByWeekWeekdayWithSend(week, sendToWechatEnabled);
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
                      onClick={() => handleExportOriginal(sendToWechatEnabled)}
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

        <Divider />

        {/* 第二天课表自动发送功能 */}
        <Card type="inner" title="第二天课表自动发送" style={{ background: '#f6ffed' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              message="第二天课表功能"
              description="根据学期设置自动计算第二天是第几周星期几，生成课表图片并可定时发送到企业微信群。"
              type="success"
              showIcon
            />

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Card size="small" title="第二天信息">
                  {tomorrowInfo ? (
                    <Space direction="vertical">
                      <Typography.Text>
                        <strong>日期：</strong>{tomorrowInfo.date}
                      </Typography.Text>
                      <Typography.Text>
                        <strong>学期周次：</strong>第{tomorrowInfo.week}周
                      </Typography.Text>
                      <Typography.Text>
                        <strong>星期：</strong>星期{['', '一', '二', '三', '四', '五', '六', '日'][tomorrowInfo.dayOfWeek]}
                      </Typography.Text>
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">
                      请先设置学期起始日以计算第二天信息
                    </Typography.Text>
                  )}
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card size="small" title="定时发送设置">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Switch
                        checked={autoSendEnabled}
                        onChange={(checked) => {
                          setAutoSendEnabled(checked);
                          localStorage.setItem(STORAGE_KEY_AUTO_SEND, checked.toString());
                        }}
                      />
                      <span style={{ marginLeft: 8 }}>启用自动发送</span>
                    </div>
                    
                    <div>
                      <Typography.Text>发送时间：</Typography.Text>
                      <TimePicker
                        value={sendTime}
                        onChange={(time) => {
                          setSendTime(time);
                          if (time) {
                            localStorage.setItem(STORAGE_KEY_SEND_TIME, time.toISOString());
                          }
                        }}
                        format="HH:mm"
                        placeholder="选择发送时间"
                        disabled={!autoSendEnabled}
                      />
                    </div>

                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      定时发送仅在学期期间有效
                    </Typography.Text>
                  </Space>
                </Card>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleManualSend}
                  loading={loadingTomorrowSchedule}
                  disabled={!tomorrowInfo}
                  size="large"
                  style={{ width: '100%' }}
                >
                  手动发送第二天课表
                </Button>
              </Col>
              
              <Col xs={24} md={12}>
                <Button
                  icon={<ClockCircleOutlined />}
                  disabled={!autoSendEnabled || !sendTime}
                  size="large"
                  style={{ width: '100%' }}
                >
                  {autoSendEnabled && sendTime
                    ? `定时发送已设置 (${sendTime.format('HH:mm')})`
                    : '请设置定时发送'
                  }
                </Button>
              </Col>
            </Row>
          </Space>
        </Card>
      </Space>
    </div>
  );
};

export default WeeklyExportPage;


