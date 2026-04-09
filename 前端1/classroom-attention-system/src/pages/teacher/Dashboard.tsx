import { useState, useEffect } from 'react'
import { Row, Col, Card, Button, List, Progress, Space, Avatar, Badge, Empty, Spin } from 'antd'
import {
  TeamOutlined,
  EyeOutlined,
  RiseOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ArrowRightOutlined,
  BulbOutlined,
  TrophyOutlined,
  VideoCameraOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { Classroom } from '../../types'
import { getOverviewStats, getClassrooms } from '../../services/classroom'
import { getHistoryReview, type OverallStats } from '../../services/attention'

const Dashboard = () => {
  const navigate = useNavigate()
  const [currentClassroom, setCurrentClassroom] = useState<Classroom | null>(null)
  const [attentionStats, setAttentionStats] = useState({
    avgScore: 0,
    highRate: 0,
    mediumRate: 0,
    lowRate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [topStudents, setTopStudents] = useState<Array<{
    studentNumber: string
    name: string
    avgScore: number
    recordCount: number
  }>>([])
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const stats = await getOverviewStats()
        const high = stats.highAttentionRate || 0
        setAttentionStats({
          avgScore: stats.avgAttentionScore || 0,
          highRate: high,
          mediumRate: Math.max(0, 100 - high * 2),
          lowRate: Math.max(0, 100 - high - Math.max(0, 100 - high * 2)),
        })

        const classrooms = await getClassrooms()
        if (classrooms.length > 0) {
          const latest = classrooms[0]
          setCurrentClassroom({
            id: latest.id,
            name: latest.name,
            teacherId: '',
            teacherName: '',
            studentCount: latest.studentCount,
            startTime: latest.startTime || new Date().toLocaleString(),
            status: latest.status as Classroom['status'],
          })

          try {
            const historyData = await getHistoryReview(Number(latest.id))
            setOverallStats(historyData.overallStats)
            setTopStudents(historyData.overallStats?.topStudents?.slice(0, 5) || [])
          } catch {
            console.warn('[Dashboard] 无法获取排名数据')
          }
        }
      } catch (err) {
        console.error('获取仪表盘数据失败:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const quickActions = [
    {
      title: '开始监控',
      desc: '实时监控课堂状态',
      icon: <VideoCameraOutlined />,
      gradient: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
      onClick: () => navigate('/monitor'),
    },
    {
      title: '人脸录入',
      desc: '录入学生人脸数据',
      icon: <PlusOutlined />,
      gradient: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
      onClick: () => navigate('/face-register'),
    },
    {
      title: '查看历史',
      desc: '查看历史课堂数据',
      icon: <HistoryOutlined />,
      gradient: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
      onClick: () => navigate('/history'),
    },
  ]

  const statCards = [
    {
      title: '平均专注度',
      value: attentionStats.avgScore,
      suffix: '/10',
      precision: 1,
      color: '#667eea',
      bgColor: 'linear-gradient(135deg, #667eea20 0%, #764ba220 100%)',
      icon: <EyeOutlined />,
      progress: attentionStats.avgScore * 10,
    },
    {
      title: '高专注占比',
      value: attentionStats.highRate,
      suffix: '%',
      color: '#52c41a',
      bgColor: 'linear-gradient(135deg, #52c41a20 0%, #389e0d20 100%)',
      icon: <RiseOutlined />,
      progress: attentionStats.highRate,
    },
    {
      title: '中专注占比',
      value: attentionStats.mediumRate,
      suffix: '%',
      color: '#faad14',
      bgColor: 'linear-gradient(135deg, #faad1420 0%, #d4880620 100%)',
      icon: <ClockCircleOutlined />,
      progress: attentionStats.mediumRate,
    },
    {
      title: '低专注占比',
      value: attentionStats.lowRate,
      suffix: '%',
      color: '#ff4d4f',
      bgColor: 'linear-gradient(135deg, #ff4d4f20 0%, #cf132220 100%)',
      icon: <TeamOutlined />,
      progress: attentionStats.lowRate,
    },
  ]

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 120 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#999' }}>加载仪表盘数据中...</div>
      </div>
    )
  }

  return (
    <div>
      {currentClassroom && (
        <Card
          style={{
            marginBottom: 24,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
          }}
          styles={{ body: { padding: 28 } }}
        >
          <Row gutter={24} align="middle">
            <Col flex="auto">
              <Space direction="vertical" size={12}>
                <div>
                  <Badge status="processing" color="#52c41a" text="系统就绪" />
                </div>
                <h2 style={{ margin: 0, color: '#fff', fontSize: 28, fontWeight: 600 }}>
                  {currentClassroom.name}
                </h2>
                <Space size={24}>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15 }}>
                    <ClockCircleOutlined style={{ marginRight: 8 }} />
                    学生数：{currentClassroom.studentCount}人
                  </span>
                  {overallStats && (
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15 }}>
                      <TrophyOutlined style={{ marginRight: 8 }} />
                      已记录{overallStats.totalRecords}条检测数据
                    </span>
                  )}
                </Space>
              </Space>
            </Col>
            <Col>
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={() => navigate('/monitor')}
                style={{
                  height: 50,
                  padding: '0 32px',
                  fontSize: 16,
                  fontWeight: 600,
                  background: '#fff',
                  color: '#667eea',
                  border: 'none',
                  borderRadius: 12,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                }}
              >
                进入实时监控
              </Button>
            </Col>
          </Row>
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {quickActions.map((action, index) => (
          <Col xs={24} sm={8} key={index}>
            <Card
              hoverable
              onClick={action.onClick}
              style={{
                borderRadius: 16,
                border: 'none',
                overflow: 'hidden',
              }}
              styles={{ body: { padding: 0 } }}
            >
              <div
                style={{
                  padding: '24px 20px',
                  background: action.gradient,
                  color: '#fff',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>{action.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                  {action.title}
                </div>
                <div style={{ fontSize: 13, opacity: 0.9 }}>{action.desc}</div>
              </div>
              <div
                style={{
                  padding: '12px 20px',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#666', fontSize: 14 }}>立即进入</span>
                <ArrowRightOutlined style={{ color: '#999' }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {statCards.map((stat, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card
              style={{
                borderRadius: 16,
                border: 'none',
                background: stat.bgColor,
              }}
              styles={{ body: { padding: 24 } }}
            >
              <Space align="start" size={16}>
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 14,
                    background: stat.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    color: '#fff',
                  }}
                >
                  {stat.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>{stat.title}</div>
                  <div
                    style={{
                      color: stat.color,
                      fontSize: 28,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {stat.precision ? stat.value.toFixed(stat.precision) : stat.value}
                    <span style={{ fontSize: 16, fontWeight: 400, marginLeft: 4 }}>
                      {stat.suffix}
                    </span>
                  </div>
                </div>
              </Space>
              <Progress
                percent={stat.progress}
                showInfo={false}
                strokeColor={stat.color}
                trailColor="rgba(0,0,0,0.06)"
                style={{ marginTop: 16 }}
                size={6}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BulbOutlined style={{ color: '#faad14' }} />
                <span style={{ fontWeight: 600 }}>使用提示</span>
              </Space>
            }
            style={{ borderRadius: 16, border: 'none' }}
            styles={{ header: { borderBottom: '1px solid #f0f0f0', padding: '16px 24px' }, body: { padding: 16 } }}
          >
            <List
              dataSource={[
                {
                  title: '录入学生人脸',
                  description: '在「人脸录入」页面添加学生并拍摄/上传人脸照片，用于后续自动识别',
                },
                {
                  title: '启动实时监控',
                  description: '选择班级后点击「开始监控」，系统将实时分析画面中的人物状态和专注度',
                },
                {
                  title: '查看历史数据',
                  description: '监控数据会自动保存，可在「历史复盘」页面查看学生的状态时间线和排名',
                },
              ]}
              renderItem={(item) => (
                <List.Item style={{ padding: '16px 20px' }}>
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 20,
                        }}
                      >
                        <BulbOutlined />
                      </div>
                    }
                    title={<span style={{ fontWeight: 600 }}>{item.title}</span>}
                    description={<span style={{ color: '#666' }}>{item.description}</span>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <TrophyOutlined style={{ color: '#faad14' }} />
                <span style={{ fontWeight: 600 }}>专注度排行榜</span>
              </Space>
            }
            extra={
              <Button type="link" onClick={() => navigate('/history')} style={{ color: '#667eea' }}>
                查看全部
              </Button>
            }
            style={{ borderRadius: 16, border: 'none' }}
            styles={{ header: { borderBottom: '1px solid #f0f0f0', padding: '16px 24px' }, body: { padding: 16 } }}
          >
            {topStudents.length > 0 ? (
              <List
                dataSource={topStudents}
                renderItem={(item, index) => (
                  <List.Item style={{ padding: '14px 20px' }}>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          size={44}
                          style={{
                            background:
                              index === 0
                                ? 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)'
                                : index === 1
                                ? 'linear-gradient(135deg, #c0c0c0 0%, #a0a0a0 100%)'
                                : index === 2
                                ? 'linear-gradient(135deg, #cd7f32 0%, #b87333 100%)'
                                : '#f0f0f0',
                            color: index < 3 ? '#fff' : '#999',
                            fontWeight: 700,
                            fontSize: 16,
                          }}
                        >
                          {index + 1}
                        </Avatar>
                      }
                      title={<span style={{ fontWeight: 500, fontSize: 15 }}>{item.name}</span>}
                      description={
                        <span style={{ color: '#999', fontSize: 13 }}>
                          共{item.recordCount}条记录
                        </span>
                      }
                    />
                    <div
                      style={{
                        color: item.avgScore >= 7 ? '#52c41a' : item.avgScore >= 4 ? '#faad14' : '#f5222d',
                        fontWeight: 700,
                        fontSize: 18,
                      }}
                    >
                      {item.avgScore.toFixed(1)}分
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                description="暂无排行数据"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: 40 }}
              >
                <Button type="primary" onClick={() => navigate('/monitor')}>
                  开始监控以生成数据
                </Button>
              </Empty>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
