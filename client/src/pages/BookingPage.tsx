import { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Table,
  Space,
  message,
  Tag,
  Alert,
  Tooltip,
  Row,
  Col,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../services/api';
import { getAllRooms } from '../services/scheduleService';
import type { ComputerRoom } from '../services/scheduleService';
import { getBookingCache, setBookingCache, type FormCache } from '../utils/bookingCache';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function parseRangeRule(value: string): { start: number; end: number }[] {
  const results: { start: number; end: number }[] = [];
  const parts = value.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (match) {
      const start = parseInt(match[1]);
      const end = match[2] ? parseInt(match[2]) : start;
      if (start <= end) results.push({ start, end });
    }
  }
  return results;
}

interface PreviewRow {
  key: string;
  roomId: string;
  roomName: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  weekStart: number;
  weekEnd: number;
  courseName: string;
  teacher: string;
  classes: string;
  conflict?: any;
  saveError?: string;
  saved?: boolean;
}

function loadCache(): FormCache | null {
  return getBookingCache();
}

function saveCache(data: FormCache) {
  setBookingCache(data);
}

export default function BookingPage() {
  const [form] = Form.useForm();
  const [rooms, setRooms] = useState<ComputerRoom[]>([]);
  const [periodRules, setPeriodRules] = useState<string[]>(['']);
  const [weekRules, setWeekRules] = useState<string[]>(['']);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAllRooms().then((res: any) => {
      const list: ComputerRoom[] = res.data || [];
      const CN_NUM: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
      };
      function roomOrder(r: ComputerRoom): number {
        const name = r.roomName || '';
        const m = name.match(/第(.+?)微机室/);
        if (m) return CN_NUM[m[1]] ?? 999;
        return 999;
      }
      list.sort((a, b) => roomOrder(a) - roomOrder(b) || (a.roomNumber > b.roomNumber ? 1 : -1));
      setRooms(list);
    });

    const cache = loadCache();
    if (cache) {
      form.setFieldsValue(cache.formValues);
      setPeriodRules(cache.periodRules?.length ? cache.periodRules : ['']);
      setWeekRules(cache.weekRules?.length ? cache.weekRules : ['']);
    }
  }, []);

  function handleFormChange() {
    saveCache({ formValues: form.getFieldsValue(), periodRules, weekRules });
  }

  function updatePeriodRules(next: string[]) {
    setPeriodRules(next);
    saveCache({ formValues: form.getFieldsValue(), periodRules: next, weekRules });
  }

  function updateWeekRules(next: string[]) {
    setWeekRules(next);
    saveCache({ formValues: form.getFieldsValue(), periodRules, weekRules: next });
  }

  function handleGenerate() {
    const values = form.getFieldsValue();
    const { courseName, teacher, classes, roomIds, weekdays } = values;

    if (!courseName || !teacher) { message.warning('请填写课程名称和授课老师'); return; }
    if (!roomIds || roomIds.length === 0) { message.warning('请选择至少一个机房'); return; }
    if (!weekdays || weekdays.length === 0) { message.warning('请选择至少一个星期'); return; }

    const allPeriodRanges: { start: number; end: number }[] = [];
    for (const rule of periodRules) {
      if (!rule.trim()) continue;
      const parsed = parseRangeRule(rule);
      if (parsed.length === 0) { message.warning(`节次规则"${rule}"格式不正确`); return; }
      allPeriodRanges.push(...parsed);
    }
    if (allPeriodRanges.length === 0) { message.warning('请填写至少一条节次规则'); return; }

    const allWeekRanges: { start: number; end: number }[] = [];
    for (const rule of weekRules) {
      if (!rule.trim()) continue;
      const parsed = parseRangeRule(rule);
      if (parsed.length === 0) { message.warning(`周次规则"${rule}"格式不正确`); return; }
      allWeekRanges.push(...parsed);
    }
    if (allWeekRanges.length === 0) { message.warning('请填写至少一条周次规则'); return; }

    const rows: PreviewRow[] = [];
    for (const roomId of roomIds) {
      const room = rooms.find(r => r.id === roomId);
      const roomName = room?.roomName || room?.roomNumber || roomId;
      for (const day of weekdays) {
        for (const period of allPeriodRanges) {
          for (const week of allWeekRanges) {
            rows.push({
              key: `${roomId}_${day}_${period.start}_${period.end}_${week.start}_${week.end}`,
              roomId, roomName,
              dayOfWeek: day,
              periodStart: period.start, periodEnd: period.end,
              weekStart: week.start, weekEnd: week.end,
              courseName, teacher, classes: classes || '',
            });
          }
        }
      }
    }

    setPreviewRows(rows);
    setSelectedKeys(rows.map(r => r.key));
    message.success(`已生成 ${rows.length} 条预览记录`);
  }

  async function handleSave() {
    if (selectedKeys.length === 0) { message.warning('请勾选要保存的记录'); return; }

    const toSave = previewRows.filter(r => selectedKeys.includes(r.key) && !r.saved);
    if (toSave.length === 0) { message.info('所选记录已全部保存'); return; }

    const items = toSave.map(r => ({
      roomId: r.roomId, courseName: r.courseName, teacher: r.teacher, classes: r.classes,
      weekStart: r.weekStart, weekEnd: r.weekEnd, dayOfWeek: r.dayOfWeek,
      periodStart: r.periodStart, periodEnd: r.periodEnd,
    }));

    setSaving(true);
    try {
      const res = await api.post('/schedule/batch-create', { items }) as any;
      setPreviewRows(prev =>
        prev.map(row => toSave.find(t => t.key === row.key)
          ? { ...row, saved: true, conflict: undefined, saveError: undefined }
          : row)
      );
      message.success(`全部 ${res.successCount} 条记录保存成功`);
    } catch (e: any) {
      const data = e?.responseData;
      if (data?.conflicts && Array.isArray(data.conflicts)) {
        setPreviewRows(prev =>
          prev.map(row => {
            const idx = toSave.findIndex(t => t.key === row.key);
            if (idx === -1) return row;
            const hit = data.conflicts.find((c: any) => c.index === idx);
            return hit
              ? { ...row, conflict: hit.conflictingSchedule, saveError: '时间冲突' }
              : { ...row, conflict: undefined, saveError: undefined };
          })
        );
        message.error(`存在 ${data.conflictCount} 条时间冲突，所有课程均未入库，请修改后重试`);
      } else {
        message.error(`保存失败：${e?.message || '请重试'}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const conflictCount = previewRows.filter(r => selectedKeys.includes(r.key) && r.conflict).length;
  const savedCount = previewRows.filter(r => r.saved).length;

  const columns = [
    { title: '机房', dataIndex: 'roomName', key: 'roomName', width: 120 },
    { title: '星期', dataIndex: 'dayOfWeek', key: 'dayOfWeek', width: 60,
      render: (v: number) => WEEKDAY_LABELS[v - 1] },
    { title: '节次', key: 'period', width: 90,
      render: (_: any, r: PreviewRow) =>
        r.periodStart === r.periodEnd ? `第${r.periodStart}节` : `第${r.periodStart}-${r.periodEnd}节` },
    { title: '周次', key: 'week', width: 100,
      render: (_: any, r: PreviewRow) =>
        r.weekStart === r.weekEnd ? `第${r.weekStart}周` : `第${r.weekStart}-${r.weekEnd}周` },
    { title: '课程名称', dataIndex: 'courseName', key: 'courseName' },
    { title: '老师', dataIndex: 'teacher', key: 'teacher', width: 80 },
    { title: '班级', dataIndex: 'classes', key: 'classes' },
    {
      title: '状态', key: 'status', width: 90,
      render: (_: any, r: PreviewRow) => {
        if (r.saved) return <Tag color="success">已保存</Tag>;
        if (r.conflict) {
          const c = r.conflict;
          return (
            <Tooltip title={`与"${c.courseName}"冲突（${c.computerRoom?.roomName || c.computerRoomId}，第${c.weekStart}-${c.weekEnd}周，周${c.dayOfWeek}，${c.periodStart}-${c.periodEnd}节）`}>
              <Tag color="error">冲突</Tag>
            </Tooltip>
          );
        }
        if (r.saveError) return <Tag color="warning">{r.saveError}</Tag>;
        return <Tag>待保存</Tag>;
      },
    },
  ];

  return (
    <>
      <Card
        title="课程预约"
        extra={
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleGenerate}>
            生成预览
          </Button>
        }
      >
        <Form form={form} layout="vertical" onValuesChange={handleFormChange}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="课程名称" name="courseName" rules={[{ required: true, message: '请输入课程名称' }]}>
                <Input placeholder="如：数据结构" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="授课老师" name="teacher" rules={[{ required: true, message: '请输入授课老师' }]}>
                <Input placeholder="如：张三" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="上课班级" name="classes">
                <Input placeholder="多个班级用分号分隔，如：国贸2301;国贸2302" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="机房（多选）" name="roomIds" rules={[{ required: true, message: '请选择机房' }]}>
                <Select mode="multiple" placeholder="请选择机房" optionFilterProp="label" allowClear
                  options={rooms.map(r => ({ value: r.id, label: r.roomName || r.roomNumber }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="星期（多选）" name="weekdays" rules={[{ required: true, message: '请选择星期' }]}>
                <Select mode="multiple" placeholder="请选择星期" allowClear
                  options={WEEKDAY_LABELS.map((label, i) => ({ value: i + 1, label }))} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="节次规则" required>
                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                  {periodRules.map((rule, idx) => (
                    <Space key={idx}>
                      <Input style={{ width: 220 }} value={rule} placeholder="如：1-2 或 1-2,5-6,8"
                        onChange={e => { const next = [...periodRules]; next[idx] = e.target.value; updatePeriodRules(next); }} />
                      {periodRules.length > 1 && (
                        <Button type="text" danger icon={<DeleteOutlined />}
                          onClick={() => updatePeriodRules(periodRules.filter((_, i) => i !== idx))} />
                      )}
                    </Space>
                  ))}
                  <Button type="dashed" size="small" icon={<PlusOutlined />}
                    onClick={() => updatePeriodRules([...periodRules, ''])}>
                    添加节次规则
                  </Button>
                </Space>
                <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                  支持：1-2（范围）、5（单节）、1-2,5-6,8（混合）
                </div>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item label="周次规则" required>
                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                  {weekRules.map((rule, idx) => (
                    <Space key={idx}>
                      <Input style={{ width: 220 }} value={rule} placeholder="如：1-8 或 1-3,7-9,11"
                        onChange={e => { const next = [...weekRules]; next[idx] = e.target.value; updateWeekRules(next); }} />
                      {weekRules.length > 1 && (
                        <Button type="text" danger icon={<DeleteOutlined />}
                          onClick={() => updateWeekRules(weekRules.filter((_, i) => i !== idx))} />
                      )}
                    </Space>
                  ))}
                  <Button type="dashed" size="small" icon={<PlusOutlined />}
                    onClick={() => updateWeekRules([...weekRules, ''])}>
                    添加周次规则
                  </Button>
                </Space>
                <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                  支持：1-8（范围）、11（单周）、1-3,7-9,11（混合）
                </div>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {previewRows.length > 0 && (
        <Card
          style={{ marginTop: 16 }}
          title="拆分结果预览"
          extra={
            <Button type="primary" icon={<SaveOutlined />} loading={saving}
              onClick={handleSave} disabled={selectedKeys.length === 0}>
              保存选中记录
            </Button>
          }
        >
          <Space style={{ marginBottom: 12 }} size={16}>
            <span>共生成 <strong>{previewRows.length}</strong> 条</span>
            <span>已选 <strong>{selectedKeys.length}</strong> 条</span>
            {savedCount > 0 && <span style={{ color: '#52c41a' }}>已保存 <strong>{savedCount}</strong> 条</span>}
            {conflictCount > 0 && <span style={{ color: '#ff4d4f' }}>含冲突 <strong>{conflictCount}</strong> 条</span>}
          </Space>

          {conflictCount > 0 && (
            <Alert type="error" showIcon style={{ marginBottom: 12 }}
              message={`${conflictCount} 条记录存在时间冲突，有冲突时所有课程均不会入库，请修改后重新生成预览`} />
          )}

          <Table
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: (keys) => setSelectedKeys(keys as string[]),
              getCheckboxProps: (record: PreviewRow) => ({ disabled: record.saved }),
            }}
            columns={columns}
            dataSource={previewRows}
            rowKey="key"
            pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: total => `共 ${total} 条` }}
            size="small"
            bordered
            rowClassName={(record: PreviewRow) => {
              if (record.saved) return 'row-saved';
              if (record.conflict) return 'row-conflict';
              return '';
            }}
          />
          <style>{`
            .row-saved td { background: #f6ffed !important; }
            .row-conflict td { background: #fff2f0 !important; }
          `}</style>
        </Card>
      )}
    </>
  );
}
