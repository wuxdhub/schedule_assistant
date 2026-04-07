import { useEffect, useState, useMemo } from 'react';
import {
  Typography,
  Segmented,
  Switch,
  Button,
  Tabs,
  Table,
  Spin,
  message,
  Space,
  Tag
} from 'antd';
import { DownloadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getTimetableInfo,
  getTimetableJson,
  exportHighlightByWeekRoomWithSend,
  exportHighlightByWeekWeekdayWithSend
} from '../services/scheduleService';

const { Title, Text } = Typography;

// 节次标签
const PERIOD_LABELS = ['1-2节', '3-4节', '5节', '6-7节', '8-9节', '10节', '晚'];

// 节次范围（与后端 PERIOD_RANGES 一致）
const PERIOD_RANGES = [
  { start: 1, end: 2, rowIndex: 0 },
  { start: 3, end: 4, rowIndex: 1 },
  { start: 5, end: 5, rowIndex: 2 },
  { start: 6, end: 7, rowIndex: 3 },
  { start: 8, end: 9, rowIndex: 4 },
  { start: 10, end: 10, rowIndex: 5 },
  { start: 11, end: 12, rowIndex: 6 }
];

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 判断某条课程是否在目标周次内
function isInWeek(schedule: any, targetWeek: number): boolean {
  if (schedule.__weekRanges) {
    return schedule.__weekRanges.some(
      (range: { start: number; end: number }) =>
        targetWeek >= range.start && targetWeek <= range.end
    );
  }
  return schedule.weekStart <= targetWeek && targetWeek <= schedule.weekEnd;
}

// 根据节次找到对应的 rowIndex 列表
function getRowIndexes(periodStart: number, periodEnd: number): number[] {
  const indexes: number[] = [];
  for (const pr of PERIOD_RANGES) {
    const overlap = Math.min(periodEnd, pr.end) - Math.max(periodStart, pr.start) + 1;
    if (overlap > 0) indexes.push(pr.rowIndex);
  }
  return indexes;
}

// 格式化课程单元格内容
function formatCellText(s: any): string {
  const weekStr =
    s.__combinedWeekText ||
    (s.weekStart === s.weekEnd ? `{${s.weekStart}周}` : `{${s.weekStart}-${s.weekEnd}周}`);
  const periodText =
    s.periodStart === s.periodEnd
      ? `第${s.periodStart}节`
      : `第${s.periodStart}-${s.periodEnd}节`;
  return `${s.courseName}◇${periodText}${weekStr}◇${s.teacher}◇${s.classes}`;
}

// 计算当前周次（根据学期起始日期）
function calcCurrentWeek(semesterStartDate: string | null): number | null {
  if (!semesterStartDate) return null;
  const start = dayjs(semesterStartDate).startOf('day');
  const today = dayjs().startOf('day');
  const diff = today.diff(start, 'day');
  if (diff < 0) return null;
  return Math.floor(diff / 7) + 1;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// 按机房表格
// ─────────────────────────────────────────────
function RoomTable({
  room,
  currentWeek,
  highlightEnabled
}: {
  room: any;
  currentWeek: number | null;
  highlightEnabled: boolean;
}) {
  // 构建 dayOfWeek(1-7) -> rowIndex -> schedules[]
  const cellMap = useMemo(() => {
    const map: Map<number, Map<number, any[]>> = new Map();
    for (const s of room.schedules || []) {
      const rowIndexes = getRowIndexes(s.periodStart, s.periodEnd);
      for (const ri of rowIndexes) {
        const dayMap = map.get(s.dayOfWeek) || new Map<number, any[]>();
        const list = dayMap.get(ri) || [];
        list.push(s);
        dayMap.set(ri, list);
        map.set(s.dayOfWeek, dayMap);
      }
    }
    return map;
  }, [room]);

  const columns = [
    {
      title: '节次',
      dataIndex: 'period',
      key: 'period',
      width: 55,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>
    },
    ...WEEKDAY_LABELS.map((label, idx) => {
      const day = idx + 1;
      // 判断该列是否有满足高亮条件的课程（用于标红列标题）
      const dayHasHighlight = (() => {
        if (!highlightEnabled || currentWeek === null) return false;
        const dayMap = cellMap.get(day);
        if (!dayMap) return false;
        return Array.from(dayMap.values()).some((schedules) =>
          schedules.some((s: any) => isInWeek(s, currentWeek))
        );
      })();
      return {
        title: (
          <span style={{ color: dayHasHighlight ? '#ff4d4f' : undefined, fontWeight: dayHasHighlight ? 600 : undefined }}>
            {label}
          </span>
        ),
        key: `day${day}`,
        dataIndex: `day${day}`,
        render: (schedules: any[]) => {
        if (!schedules || schedules.length === 0) return null;
        return (
          <div style={{ fontSize: 11, lineHeight: '1.4' }}>
            {schedules.map((s, i) => {
              const highlight =
                highlightEnabled && currentWeek !== null && isInWeek(s, currentWeek);
              return (
                <div key={i}>
                  <div
                    style={{
                      color: highlight ? '#ff4d4f' : '#000',
                      fontWeight: highlight ? 600 : 400,
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {formatCellText(s)}
                  </div>
                  {i < schedules.length - 1 && (
                    <div style={{ height: 6 }} />
                  )}
                </div>
              );
            })}
          </div>
        );
      }
    };
    })
  ];

  const dataSource = PERIOD_LABELS.map((label, ri) => {
    const row: any = { key: ri, period: label };
    for (let day = 1; day <= 7; day++) {
      const schedules = cellMap.get(day)?.get(ri) || [];
      row[`day${day}`] = schedules.sort((a: any, b: any) => a.periodStart - b.periodStart);
    }
    return row;
  });

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      pagination={false}
      bordered
      size="small"
      tableLayout="fixed"
      style={{ width: '100%' }}
    />
  );
}

// ─────────────────────────────────────────────
// 按星期表格
// ─────────────────────────────────────────────
function WeekdayTable({
  dayOfWeek,
  rooms,
  currentWeek,
  highlightEnabled
}: {
  dayOfWeek: number;
  rooms: any[];
  currentWeek: number | null;
  highlightEnabled: boolean;
}) {
  // 构建 roomIdx -> rowIndex -> schedules[]
  const cellMap = useMemo(() => {
    const map: Array<Map<number, any[]>> = rooms.map(() => new Map<number, any[]>());
    rooms.forEach((room, roomIdx) => {
      for (const s of room.schedules || []) {
        if (s.dayOfWeek !== dayOfWeek) continue;
        const rowIndexes = getRowIndexes(s.periodStart, s.periodEnd);
        for (const ri of rowIndexes) {
          const list = map[roomIdx].get(ri) || [];
          list.push(s);
          map[roomIdx].set(ri, list);
        }
      }
    });
    return map;
  }, [rooms, dayOfWeek]);

  const columns = [
    {
      title: '节次',
      dataIndex: 'period',
      key: 'period',
      width: 55,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>
    },
    ...rooms.map((room, roomIdx) => {
      const roomHasHighlight = (() => {
        if (!highlightEnabled || currentWeek === null) return false;
        return Array.from(cellMap[roomIdx].values()).some((schedules) =>
          schedules.some((s: any) => isInWeek(s, currentWeek))
        );
      })();
      return {
      title: (
        <span style={{ color: roomHasHighlight ? '#ff4d4f' : undefined, fontWeight: roomHasHighlight ? 600 : undefined }}>
          {room.roomName || room.roomNumber}
        </span>
      ),
      key: `room${roomIdx}`,
      dataIndex: `room${roomIdx}`,
      render: (schedules: any[]) => {
        if (!schedules || schedules.length === 0) return null;
        return (
          <div style={{ fontSize: 11, lineHeight: '1.4' }}>
            {schedules.map((s, i) => {
              const highlight =
                highlightEnabled && currentWeek !== null && isInWeek(s, currentWeek);
              return (
                <div key={i}>
                  <div
                    style={{
                      color: highlight ? '#ff4d4f' : '#000',
                      fontWeight: highlight ? 600 : 400,
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {formatCellText(s)}
                  </div>
                  {i < schedules.length - 1 && (
                    <div style={{ height: 6 }} />
                  )}
                </div>
              );
            })}
          </div>
        );
      }
    };
    })
  ];

  const dataSource = PERIOD_LABELS.map((label, ri) => {
    const row: any = { key: ri, period: label };
    rooms.forEach((_, roomIdx) => {
      const schedules = cellMap[roomIdx]?.get(ri) || [];
      row[`room${roomIdx}`] = schedules.sort((a: any, b: any) => a.periodStart - b.periodStart);
    });
    return row;
  });

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      pagination={false}
      bordered
      size="small"
      tableLayout="fixed"
      style={{ width: '100%' }}
    />
  );
}

// ─────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────
export default function CourseQueryPage() {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [info, setInfo] = useState<{
    version: string | null;
    semester: string | null;
    semesterStartDate: string | null;
    semesterEndDate: string | null;
  }>({ version: null, semester: null, semesterStartDate: null, semesterEndDate: null });
  const [rooms, setRooms] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'room' | 'weekday'>('room');
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [activeRoomKey, setActiveRoomKey] = useState<string>('');
  const [activeWeekdayKey, setActiveWeekdayKey] = useState<string>('1');
  const [roomTabOffset, setRoomTabOffset] = useState(0);
  const ROOM_TAB_WINDOW = 11; // 一次显示几个机房 tab

  const today = dayjs();
  const todayWeekday = today.day() === 0 ? 7 : today.day(); // 1=周一 ... 7=周日
  const currentWeek = useMemo(
    () => calcCurrentWeek(info.semesterStartDate),
    [info.semesterStartDate]
  );

  useEffect(() => {
    Promise.all([getTimetableInfo(), getTimetableJson()])
      .then(([infoRes, dataRes]: any) => {
        setInfo(infoRes.data);
        const roomList = dataRes.data.rooms || [];
        setRooms(roomList);
        if (roomList.length > 0) {
          setActiveRoomKey(String(roomList[0].id));
        }
      })
      .catch(() => message.error('加载课表数据失败'))
      .finally(() => setLoading(false));
  }, []);

  // 导出
  async function handleExport() {
    const semesterLabel = info.semester || '课表';
    const versionLabel = info.version ? `v${info.version}` : '';
    const suffix = viewMode === 'room' ? '机房' : '星期';
    const filename = `${semesterLabel}${versionLabel ? '-' + versionLabel : ''}-上机课表-${suffix}.xlsx`;

    // 高亮时需要传当前周次，否则传 0 表示不高亮
    const exportWeek = highlightEnabled ? (currentWeek ?? 0) : 0;
    if (highlightEnabled && !currentWeek) {
      message.warning('无法计算当前周次，请检查学期配置');
      return;
    }

    setExporting(true);
    try {
      let blob: Blob;
      if (viewMode === 'room') {
        blob = await exportHighlightByWeekRoomWithSend(exportWeek);
      } else {
        blob = await exportHighlightByWeekWeekdayWithSend(exportWeek);
      }
      downloadBlob(blob, filename);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  }

  const roomTabs = rooms.map((room) => ({
    key: String(room.id),
    label: room.roomName || room.roomNumber
  }));

  const weekdayTabs = WEEKDAY_LABELS.map((label, idx) => ({
    key: String(idx + 1),
    label: label
  }));

  const activeRoom = rooms.find((r) => String(r.id) === activeRoomKey);
  const activeWeekdayIndex = parseInt(activeWeekdayKey, 10);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* 顶部信息栏：标题居左，信息居右 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          课程查询
        </Title>
        <Space size={16} wrap style={{ alignItems: 'center' }}>
          {/* 日期+星期：主色，稍大 */}
          <Text style={{ fontSize: 15, fontWeight: 500, color: '#1677ff' }}>
            {today.format('YYYY年M月D日')} {WEEKDAY_LABELS[todayWeekday - 1]}
          </Text>
          {/* 学期+版本：次要信息，灰色细分隔 */}
          {info.semester && (
            <Text style={{ fontSize: 13, color: '#595959' }}>
              {info.semester}{info.version ? ` · 第${info.version}版本机房上机课表` : ''}
            </Text>
          )}
          {/* 周次：绿色徽标感 */}
          {currentWeek !== null ? (
            <span style={{
              display: 'inline-block',
              padding: '1px 10px',
              borderRadius: 12,
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              color: '#389e0d',
              fontSize: 13,
              fontWeight: 500
            }}>
              第 {currentWeek} 周
            </span>
          ) : (
            <span style={{
              display: 'inline-block',
              padding: '1px 10px',
              borderRadius: 12,
              background: '#fff7e6',
              border: '1px solid #ffd591',
              color: '#d46b08',
              fontSize: 13
            }}>
              周次未知（请配置学期）
            </span>
          )}
        </Space>
      </div>

      {/* 控制栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <Segmented
          value={viewMode}
          options={[
            { label: '按机房查询', value: 'room' },
            { label: '按星期查询', value: 'weekday' }
          ]}
          onChange={(v) => setViewMode(v as 'room' | 'weekday')}
        />
        <Space>
          <Space>
            <Text>当周课程筛选</Text>
            <Switch
              checked={highlightEnabled}
              onChange={setHighlightEnabled}
              checkedChildren="开"
              unCheckedChildren="关"
            />
          </Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={handleExport}
          >
            导出课表
          </Button>
        </Space>
      </div>

      {/* 课表区 */}
      {viewMode === 'room' ? (
        <div>
          {/* 自定义 Tab 栏：左右尖括号 + 均分填满的机房标签 */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
            <Button
              type="text"
              icon={<LeftOutlined />}
              disabled={roomTabOffset === 0}
              onClick={() => setRoomTabOffset((o) => Math.max(0, o - 1))}
              style={{ flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {roomTabs.slice(roomTabOffset, roomTabOffset + ROOM_TAB_WINDOW).map((tab) => {
                const isActive = tab.key === activeRoomKey;
                return (
                  <div
                    key={tab.key}
                    onClick={() => setActiveRoomKey(tab.key)}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '8px 4px',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: isActive ? '#1677ff' : 'rgba(0,0,0,0.88)',
                      borderBottom: isActive ? '2px solid #1677ff' : '2px solid transparent',
                      fontWeight: isActive ? 600 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'color 0.2s'
                    }}
                  >
                    {tab.label}
                  </div>
                );
              })}
            </div>
            <Button
              type="text"
              icon={<RightOutlined />}
              disabled={roomTabOffset + ROOM_TAB_WINDOW >= roomTabs.length}
              onClick={() =>
                setRoomTabOffset((o) => Math.min(roomTabs.length - ROOM_TAB_WINDOW, o + 1))
              }
              style={{ flexShrink: 0 }}
            />
          </div>
          {/* 内容区 */}
          {activeRoom && (
            <RoomTable
              room={activeRoom}
              currentWeek={currentWeek}
              highlightEnabled={highlightEnabled}
            />
          )}
        </div>
      ) : (
        <Tabs
          activeKey={activeWeekdayKey}
          onChange={setActiveWeekdayKey}
          items={weekdayTabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            children:
              activeWeekdayKey === tab.key ? (
                <WeekdayTable
                  dayOfWeek={parseInt(tab.key, 10)}
                  rooms={rooms}
                  currentWeek={currentWeek}
                  highlightEnabled={highlightEnabled}
                />
              ) : null
          }))}
          tabBarStyle={{ marginBottom: 8 }}
        />
      )}
    </div>
  );
}
