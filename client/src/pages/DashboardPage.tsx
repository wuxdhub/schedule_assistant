import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Spin, Typography, Empty } from 'antd';
import {
  HomeOutlined,
  TeamOutlined,
  DatabaseOutlined,
  CalendarOutlined,
  BookOutlined,
  ReadOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { Column, Pie } from '@ant-design/charts';
import { getDashboardStats, DashboardStats } from '../services/dashboardService';

const { Title } = Typography;

const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const DashboardPage = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await getDashboardStats();
        setStats(data);
      } catch (error) {
        console.error('获取仪表盘数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!stats) {
    return <Empty description="暂无数据" />;
  }

  const { overview, daily, roomUsage, sourceDistribution } = stats;

  // 激活版本展示文本
  const versionText = overview.activeVersion
    ? `V${overview.activeVersion.version}`
    : '未配置';
  const semesterText = overview.semesterName || '';

  // 当前周次展示文本
  const weekText = overview.currentWeek != null ? `第 ${overview.currentWeek} 周` : '未配置';

  // 柱状图配置
  const columnConfig = {
    data: roomUsage.map((r) => ({ roomName: r.roomName, usageRate: r.usageRate })),
    xField: 'roomName',
    yField: 'usageRate',
    label: {
      text: (d: { usageRate: number }) => `${d.usageRate}%`,
      textBaseline: 'bottom' as const,
    },
    axis: {
      y: { title: '使用率 (%)', labelFormatter: (v: number) => `${v}%` },
    },
    style: {
      radiusTopLeft: 4,
      radiusTopRight: 4,
    },
    height: 300,
  };

  // 饼图配置
  const totalSource = sourceDistribution.importCount + sourceDistribution.manualCount;
  const pieData = [
    { type: '导入课程', value: sourceDistribution.importCount },
    { type: '手动预约', value: sourceDistribution.manualCount },
  ];
  const pieConfig = {
    data: pieData,
    angleField: 'value',
    colorField: 'type',
    innerRadius: 0.6,
    label: {
      text: (d: { type: string; value: number }) => {
        const pct = totalSource > 0 ? ((d.value / totalSource) * 100).toFixed(1) : '0';
        return `${d.type}\n${pct}%`;
      },
      style: { fontSize: 12, textAlign: 'center' as const },
    },
    legend: { color: { position: 'bottom' as const } },
    height: 300,
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        首页概览
        <span style={{ fontSize: 14, fontWeight: 'normal', color: '#999', marginLeft: 12 }}>
          今天是 {DAY_NAMES[daily.todayDayOfWeek]}
          {overview.currentWeek != null && `，${weekText}`}
        </span>
      </Title>

      {/* 基础概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="机房总数" value={overview.totalRooms} prefix={<HomeOutlined />} suffix="间" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="总座位数" value={overview.totalCapacity} prefix={<TeamOutlined />} suffix="个" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="激活版本"
              value={versionText}
              prefix={<DatabaseOutlined />}
              suffix={semesterText ? <span style={{ fontSize: 12, color: '#999' }}>{semesterText}</span> : undefined}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="当前周次" value={weekText} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* 今日/本周动态 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="今日课程数" value={daily.todayCourseCount} prefix={<BookOutlined />} suffix="节" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="本周课程数" value={daily.weekCourseCount} prefix={<ReadOutlined />} suffix="节" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="今日空闲机房"
              value={daily.todayFreeRoomCount}
              prefix={<CheckCircleOutlined />}
              suffix={`/ ${overview.totalRooms} 间`}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表行 */}
      <Row gutter={16}>
        <Col span={16}>
          <Card title="机房使用率（本周）">
            {roomUsage.length > 0 ? (
              <Column {...columnConfig} />
            ) : (
              <Empty description="暂无机房数据" />
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="课程来源占比">
            {totalSource > 0 ? (
              <Pie {...pieConfig} />
            ) : (
              <Empty description="暂无课程数据" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );};

export default DashboardPage;
