import { useState, useEffect, useRef } from 'react'
import {
  Row,
  Col,
  Card,
  Statistic,
  Progress,
  Table,
  Tag,
  Badge,
  Space,
  Alert,
  Button,
  Tooltip,
} from 'antd'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import {
  EyeOutlined,
  TeamOutlined,
  WarningOutlined,
  ReloadOutlined,
  FullscreenOutlined,
} from '@ant-design/icons'
import type { AttentionData, ChartData, HeatmapData } from '../../types'
import InteractionSuggestionFloat from '../../components/InteractionSuggestionFloat'

const RealtimeMonitor = () => {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [attentionData, setAttentionData] = useState<AttentionData[]>([])
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([])
  const [showSuggestion, setShowSuggestion] = useState(true)

  // 模拟实时数据更新
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
      updateRealtimeData()
    }, 5000)

    // 初始化数据
    generateInitialData()

    return () => clearInterval(timer)
  }, [])

  const generateInitialData = () => {
    // 生成初始图表数据（每5分钟一个点）
    const initialChartData: ChartData[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 5 * 60 * 1000)
      initialChartData.push({
        time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        value: 6 + Math.random() * 3,
      })
    }
    setChartData(initialChartData)

    // 生成学生列表数据
    const students: AttentionData[] = []
    for (let i = 1; i <= 20; i++) {
      students.push({
        timestamp: new Date().toISOString(),
        studentId: `2024${String(i).padStart(3, '0')}`,
        studentName: `学生${i}`,
        expressionType: Math.random() > 0.3 ? 'looking' : 'head_down',
        postureType: Math.random() > 0.4 ? 'sitting_upright' : 'leaning_forward',
        attentionScore: Math.floor(Math.random() * 10),
        attentionLevel: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low',
      })
    }
    setAttentionData(students)
  }

  const updateRealtimeData = () => {
    // 更新图表数据
    setChartData((prev) => {
      const newData = [...prev]
      if (newData.length > 12) {
        newData.shift()
      }
      newData.push({
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        value: 5 + Math.random() * 4,
      })
      return newData
    })

    // 随机更新学生数据
    setAttentionData((prev) =>
      prev.map((student) => ({
        ...student,
        attentionScore: Math.min(10, Math.max(0, student.attentionScore + (Math.random() - 0.5) * 2)),
        attentionLevel:
          Math.random() > 0.8
            ? Math.random() > 0.5
              ? 'high'
              : 'low'
            : student.attentionLevel,
      }))
    )
  }

  const getAttentionLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'success'
      case 'medium':
        return 'warning'
      case 'low':
        return 'error'
      default:
        return 'default'
    }
  }

  const getAttentionLevelText = (level: string) => {
    switch (level) {
      case 'high':
        return '高专注'
      case 'medium':
        return '中专注'
      case 'low':
        return '低专注'
      default:
        return '未知'
    }
  }

  const columns = [
    {
      title: '学号',
      dataIndex: 'studentId',
      key: 'studentId',
      width: 100,
    },
    {
      title: '姓名',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 100,
    },
    {
      title: '表情状态',
      dataIndex: 'expressionType',
      key: 'expressionType',
      width: 100,
      render: (type: string) => {
        const map: Record<string, string> = {
          looking: '正视',
          head_down: '低头',
          eyes_closed: '闭眼',
          frowning: '皱眉',
          neutral: '中性',
          other: '其他',
        }
        return map[type] || type
      },
    },
    {
      title: '姿态状态',
      dataIndex: 'postureType',
      key: 'postureType',
      width: 100,
      render: (type: string) => {
        const map: Record<string, string> = {
          sitting_upright: '坐姿端正',
          leaning_forward: '前倾',
          leaning_back: '后仰',
          lying_on_desk: '趴桌',
        }
        return map[type] || type
      },
    },
    {
      title: '专注度得分',
      dataIndex: 'attentionScore',
      key: 'attentionScore',
      width: 120,
      render: (score: number) => (
        <Progress
          percent={score * 10}
          size="small"
          strokeColor={score >= 8 ? '#52c41a' : score >= 5 ? '#faad14' : '#f5222d'}
          format={() => `${score.toFixed(1)}分`}
        />
      ),
    },
    {
      title: '专注等级',
      dataIndex: 'attentionLevel',
      key: 'attentionLevel',
      width: 100,
      render: (level: string) => (
        <Tag color={getAttentionLevelColor(level)}>{getAttentionLevelText(level)}</Tag>
      ),
    },
  ]

  // 统计数据
  const stats = {
    totalStudents: attentionData.length,
    highAttention: attentionData.filter((s) => s.attentionLevel === 'high').length,
    mediumAttention: attentionData.filter((s) => s.attentionLevel === 'medium').length,
    lowAttention: attentionData.filter((s) => s.attentionLevel === 'low').length,
    avgScore: attentionData.length
      ? (attentionData.reduce((sum, s) => sum + s.attentionScore, 0) / attentionData.length).toFixed(1)
      : '0',
  }

  return (
    <div>
      {/* 实时状态栏 */}
      <Alert
        message={
          <Space>
            <Badge status="processing" color="#f5222d" />
            <span style={{ fontWeight: 600 }}>实时监控中</span>
            <span style={{ color: '#666' }}>
              当前时间：{currentTime.toLocaleTimeString('zh-CN')}
            </span>
          </Space>
        }
        type="info"
        showIcon={false}
        style={{ marginBottom: 24 }}
        action={
          <Space>
            <Button icon={<ReloadOutlined />} size="small" onClick={updateRealtimeData}>
              刷新
            </Button>
            <Button icon={<FullscreenOutlined />} size="small">
              全屏
            </Button>
          </Space>
        }
      />

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="课堂人数"
              value={stats.totalStudents}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={5}>
          <Card>
            <Statistic
              title="平均专注度"
              value={stats.avgScore}
              suffix="/10"
              precision={1}
              valueStyle={{ color: '#1890ff' }}
              prefix={<EyeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={5}>
          <Card>
            <Statistic
              title="高专注人数"
              value={stats.highAttention}
              suffix={`/${stats.totalStudents}`}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={5}>
          <Card>
            <Statistic
              title="中专注人数"
              value={stats.mediumAttention}
              suffix={`/${stats.totalStudents}`}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={5}>
          <Card>
            <Statistic
              title="低专注人数"
              value={stats.lowAttention}
              suffix={`/${stats.totalStudents}`}
              valueStyle={{ color: '#f5222d' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 专注度曲线图 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card title="课堂专注度趋势（近1小时）" extra={<Tag color="red">实时</Tag>}>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1890ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[0, 10]} />
                  <RechartsTooltip
                    formatter={(value: number) => [`${value.toFixed(1)}分`, '专注度']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#1890ff"
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 学生专注度列表 */}
      <Row gutter={16}>
        <Col span={24}>
          <Card
            title="学生实时专注度"
            extra={
              <Space>
                <Tag color="success">高专注: {stats.highAttention}人</Tag>
                <Tag color="warning">中专注: {stats.mediumAttention}人</Tag>
                <Tag color="error">低专注: {stats.lowAttention}人</Tag>
              </Space>
            }
          >
            <Table
              dataSource={attentionData}
              columns={columns}
              rowKey="studentId"
              pagination={{ pageSize: 10 }}
              size="small"
              scroll={{ x: 800 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 互动建议悬浮窗 */}
      <InteractionSuggestionFloat
        visible={showSuggestion}
        onClose={() => setShowSuggestion(false)}
      />
    </div>
  )
}

export default RealtimeMonitor
