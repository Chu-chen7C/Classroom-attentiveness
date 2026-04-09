import React, { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Select,
  Button,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  Timeline as AntTimeline,
  List,
  Progress,
  Tabs,
  Spin,
  Empty,
  message,
} from 'antd'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  SearchOutlined,
  CalendarOutlined,
  TeamOutlined,
  EyeOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { getClassrooms } from '../../services/classroom'
import { getHistoryReview, type SessionData, type OverallStats } from '../../services/attention'

const STATE_TYPE_MAP: Record<string, string> = {
  looking_forward: '正视前方',
  looking_left: '向左看',
  looking_right: '向右看',
  head_down: '低头',
  eyes_closed: '闭眼',
  frowning: '皱眉',
  mouth_open: '张嘴',
  low_light: '光线不足',
}

const STATE_COLOR_MAP: Record<string, string> = {
  looking_forward: '#52c41a',
  looking_left: '#faad14',
  looking_right: '#faad14',
  head_down: '#f5222d',
  eyes_closed: '#f5222d',
  frowning: '#ff7a45',
  mouth_open: '#13c2c2',
  low_light: '#999999',
}

const HistoryReview = () => {
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null)
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null)

  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadHistoryData()
    }
  }, [selectedClassId])

  const loadClasses = async () => {
    try {
      const data = await getClassrooms()
      setClasses(data.map((c: any) => ({ id: c.id, name: c.name })))
    } catch (err) {
      console.error('[HistoryReview] 获取班级列表失败:', err)
    }
  }

  const loadHistoryData = async () => {
    if (!selectedClassId) return
    setLoading(true)
    try {
      const result = await getHistoryReview(Number(selectedClassId))
      setSessions(result.sessions || [])
      setOverallStats(result.overallStats)
      if (result.sessions && result.sessions.length > 0) {
        setSelectedSession(result.sessions[0])
      } else {
        setSelectedSession(null)
      }
    } catch (err: any) {
      console.error('[HistoryReview] 获取历史数据失败:', err)
      message.error(err?.error || '获取历史数据失败')
    } finally {
      setLoading(false)
    }
  }

  const getSessionChartData = (session: SessionData) => {
    if (!session.timeline || session.timeline.length === 0) return []
    
    const timeMap: Record<string, { count: number; totalScore: number }> = {}
    
    session.timeline.forEach((item) => {
      if (!item.start_time) return
      const timeKey = item.start_time.substring(11, 16) || '00:00'
      if (!timeMap[timeKey]) {
        timeMap[timeKey] = { count: 0, totalScore: 0 }
      }
      timeMap[timeKey].count++
      timeMap[timeKey].totalScore += item.attention_score || 0
    })

    return Object.entries(timeMap).map(([time, data]) => ({
      time,
      avgScore: Math.round(data.totalScore / data.count * 100) / 100,
      records: data.count,
    })).sort((a, b) => a.time.localeCompare(b.time))
  }

  const getStateDistribution = (session: SessionData) => {
    if (!session.timeline || session.timeline.length === 0) return []
    
    const stateMap: Record<string, number> = {}
    session.timeline.forEach((item) => {
      const state = item.state_type || 'unknown'
      stateMap[state] = (stateMap[state] || 0) + 1
    })

    return Object.entries(stateMap).map(([state, count]) => ({
      name: STATE_TYPE_MAP[state] || state,
      value: count,
      color: STATE_COLOR_MAP[state] || '#999',
    }))
  }

  const sessionColumns = [
    {
      title: '课堂名称',
      dataIndex: 'classroomName',
      key: 'classroomName',
      render: (text: string) => (
        <Space>
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      ),
    },
    {
      title: '上课时间',
      key: 'timeRange',
      render: (_: any, record: SessionData) => (
        <Space direction="vertical" size={0}>
          <span>{record.startTime || '-'}</span>
          <span style={{ color: '#999', fontSize: 12 }}>至 {record.endTime || '进行中'}</span>
        </Space>
      ),
    },
    {
      title: '平均专注度',
      dataIndex: 'avgScore',
      key: 'avgScore',
      render: (score: number) => (
        <Space>
          <EyeOutlined />
          <span>{score.toFixed(1)}分</span>
          <Progress percent={Math.round(score * 10)} size="small" style={{ width: 60 }} />
        </Space>
      ),
    },
    {
      title: '检测记录数',
      dataIndex: 'totalRecords',
      key: 'totalRecords',
      render: (count: number | null) => (
        <Tag color="blue">{count || 0}条</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'ended') return <Tag color="default">已结束</Tag>
        if (status === 'active') return <Tag color="processing">进行中</Tag>
        return <Tag>{status}</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: SessionData) => (
        <Button
          type="primary"
          size="small"
          icon={<BarChartOutlined />}
          onClick={() => setSelectedSession(record)}
        >
          查看详情
        </Button>
      ),
    },
  ]

  const renderTimelineContent = () => {
    if (!selectedSession) {
      return <Empty description="请从上方列表选择一次监控查看详情" />
    }
    return (
      <Row gutter={16}>
        <Col span={16}>
          <Card title={`${selectedSession.classroomName} - 状态时间线`}>
            <AntTimeline mode="left">
              {(selectedSession.timeline || []).slice(0, 30).map((item: SessionData['timeline'][0], idx: number) => (
                <AntTimeline.Item
                  key={idx}
                  dot={
                    item.attention_score >= 7 ? (
                      <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                    ) : item.attention_score >= 4 ? (
                      <ClockCircleOutlined style={{ color: '#faad14', fontSize: 14 }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#f5222d', fontSize: 14 }} />
                    )
                  }
                  color={STATE_COLOR_MAP[item.state_type] || '#999'}
                >
                  <Card size="small" style={{ marginBottom: 8 }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space>
                        <UserOutlined />
                        <span style={{ fontWeight: 600 }}>{item.real_name || '未知'}</span>
                        <Tag color={STATE_COLOR_MAP[item.state_type] || '#999'} style={{ margin: 0 }}>
                          {STATE_TYPE_MAP[item.state_type] || item.state_type}
                        </Tag>
                        <span style={{
                          fontWeight: 700,
                          color: item.attention_score >= 7 ? '#52c41a' : item.attention_score >= 4 ? '#faad14' : '#f5222d'
                        }}>
                          {item.attention_score.toFixed(1)}分
                        </span>
                      </Space>
                      <Space>
                        <ClockCircleOutlined />
                        <span>{item.start_time || '-'}</span>
                        {item.duration_seconds > 0 && (
                          <span style={{ color: '#999' }}>持续{item.duration_seconds}秒</span>
                        )}
                      </Space>
                      {item.state_details && (
                        <span style={{ color: '#666', fontSize: 12 }}>{item.state_details}</span>
                      )}
                    </Space>
                  </Card>
                </AntTimeline.Item>
              ))}
            </AntTimeline>
            {(selectedSession.timeline || []).length > 30 && (
              <div style={{ textAlign: 'center', marginTop: 16, color: '#999' }}>
                还有{(selectedSession.timeline || []).length - 30}条记录未显示...
              </div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="学生排名">
            {selectedSession.students && selectedSession.students.length > 0 ? (
              <List
                dataSource={selectedSession.students.slice(0, 10)}
                renderItem={(stu: SessionData['students'][0], index: number) => (
                  <List.Item style={{ padding: '10px 16px' }}>
                    <List.Item.Meta
                      avatar={
                        <span
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background:
                              index === 0 ? '#ffd700' :
                              index === 1 ? '#c0c0c0' :
                              index === 2 ? '#cd7f32' : '#f0f0f0',
                            color: index < 3 ? '#fff' : '#666',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          {index + 1}
                        </span>
                      }
                      title={<span style={{ fontWeight: 500 }}>{stu.real_name}</span>}
                      description={`学号: ${stu.student_number}`}
                    />
                    <span style={{
                      fontWeight: 700,
                      fontSize: 18,
                      color: stu.avg_score >= 7 ? '#52c41a' : stu.avg_score >= 4 ? '#faad14' : '#f5222d',
                    }}>
                      {stu.avg_score.toFixed(1)}分
                    </span>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无学生排名数据" />
            )}
          </Card>

          {overallStats?.topStudents && overallStats.topStudents.length > 0 && (
            <Card title="历史最佳" style={{ marginTop: 16 }}>
              <List
                dataSource={overallStats.topStudents.slice(0, 5)}
                renderItem={(stu: OverallStats['topStudents'][0], index: number) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <TrophyOutlined
                          style={{
                            color: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32',
                            fontSize: 20,
                          }}
                        />
                      }
                      title={stu.name}
                      description={`共${stu.recordCount}条记录`}
                    />
                    <span style={{ fontWeight: 600, color: '#1890ff' }}>
                      {stu.avgScore.toFixed(1)}分
                    </span>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>
      </Row>
    )
  }

  if (!selectedClassId) {
    return (
      <div style={{ textAlign: 'center', padding: 120 }}>
        <CalendarOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
        <h3 style={{ color: '#999', marginTop: 16 }}>请选择班级查看历史数据</h3>
        <Select
          placeholder="选择班级"
          style={{ width: 250, marginTop: 24 }}
          onChange={(value) => setSelectedClassId(value)}
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
    )
  }

  return (
    <div>
      <Card style={{ marginBottom: 24 }}>
        <Space size={16}>
          <Select
            placeholder="选择课程"
            style={{ width: 250 }}
            value={selectedClassId}
            onChange={setSelectedClassId}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={loadHistoryData}>
            查询
          </Button>
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#999' }}>加载历史数据中...</div>
        </div>
      ) : sessions.length === 0 ? (
        <Empty description="暂无历史监控数据，请先启动课堂监控" />
      ) : (
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'overview',
            label: '数据概览',
            children: (
              <React.Fragment>
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="总监控次数"
                      value={overallStats?.totalSessions || 0}
                      prefix={<CalendarOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="平均专注度"
                      value={overallStats?.overallAvgScore || 0}
                      suffix="/10"
                      precision={1}
                      valueStyle={{ color: '#1890ff' }}
                      prefix={<EyeOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="检测记录总数"
                      value={overallStats?.totalRecords || 0}
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<TeamOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="参与学生数"
                      value={overallStats?.uniqueStudents || 0}
                      valueStyle={{ color: '#722ed1' }}
                      prefix={<UserOutlined />}
                    />
                  </Card>
                </Col>
              </Row>

              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={16}>
                  <Card title="专注度趋势">
                    <div style={{ height: 300 }}>
                      {selectedSession && getSessionChartData(selectedSession).length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={getSessionChartData(selectedSession)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval={3} />
                            <YAxis domain={[0, 10]} />
                            <RechartsTooltip />
                            <Line
                              type="monotone"
                              dataKey="avgScore"
                              stroke="#1890ff"
                              strokeWidth={2}
                              name="平均专注度"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty description="暂无趋势数据" />
                      )}
                    </div>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card title="状态分布">
                    <div style={{ height: 300 }}>
                      {selectedSession && getStateDistribution(selectedSession).length > 0 ? (
                        <React.Fragment>
                          <ResponsiveContainer width="100%" height="220">
                            <PieChart>
                              <Pie
                                data={getStateDistribution(selectedSession)}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={85}
                                paddingAngle={4}
                                dataKey="value"
                              >
                                {getStateDistribution(selectedSession).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip />
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ textAlign: 'center', marginTop: -12 }}>
                            {getStateDistribution(selectedSession).map((item) => (
                              <Tag key={item.name} color={item.color} style={{ margin: 3 }}>
                                {item.name}: {item.value}
                              </Tag>
                            ))}
                          </div>
                        </React.Fragment>
                      ) : (
                        <Empty description="暂无分布数据" />
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>

              <Card title="历史监控记录">
                <Table
                  dataSource={sessions}
                  columns={sessionColumns}
                  rowKey="id"
                  pagination={{ pageSize: 8 }}
                />
              </Card>
              </React.Fragment>
            )
          },
          {
            key: 'timeline',
            label: '状态时间线',
            children: renderTimelineContent()
          },
          {
            key: 'trends',
            label: '趋势分析',
            children: (
              <React.Fragment>
              <Row gutter={16}>
                <Col span={24}>
                  <Card title="各次监控对比">
                    <div style={{ height: 400 }}>
                      {sessions.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={sessions.map(s => ({
                              name: s.startTime?.substring(5, 16) || '未知',
                              avgScore: s.avgScore || 0,
                              records: s.totalRecords || 0,
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} />
                            <YAxis domain={[0, 10]} />
                            <RechartsTooltip />
                            <Bar
                              dataKey="avgScore"
                              fill="#1890ff"
                              name="平均专注度"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty description="暂无趋势分析数据" />
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>
              </React.Fragment>
            )
          },
        ]} />
      )}
    </div>
  )
}

export default HistoryReview
