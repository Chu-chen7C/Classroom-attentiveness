import { useState } from 'react'
import {
  Card,
  Button,
  Result,
  Statistic,
  Row,
  Col,
  Progress,
  Tag,
  Space,
  Typography,
  List,
  Avatar,
  Badge,
  Timeline,
  Alert,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  FireOutlined,
  RiseOutlined,
  UserOutlined,
  BookOutlined,
  ArrowLeftOutlined,
  BarChartOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const StudentResult = () => {
  const [showDetail, setShowDetail] = useState(false)

  // 模拟答题结果数据
  const resultData = {
    quizTitle: 'TCP/IP协议基础测试',
    totalQuestions: 5,
    correctCount: 4,
    wrongCount: 1,
    totalTime: 240,
    avgTimePerQuestion: 48,
    rank: 8,
    totalParticipants: 48,
    score: 80,
    attentionScore: 8.5,
    attentionLevel: 'high' as const,
    answerHistory: [
      {
        question: 'TCP/IP协议分为几层？',
        yourAnswer: '4层',
        isCorrect: true,
        timeSpent: 45,
      },
      {
        question: 'IP地址的分类中，A类地址的第一个字节范围是？',
        yourAnswer: '1-126',
        isCorrect: true,
        timeSpent: 52,
      },
      {
        question: '子网掩码的作用是什么？',
        yourAnswer: '区分网络地址和主机地址',
        isCorrect: true,
        timeSpent: 38,
      },
      {
        question: 'HTTP协议工作在哪一层？',
        yourAnswer: '传输层',
        isCorrect: false,
        timeSpent: 65,
      },
      {
        question: 'DNS的作用是什么？',
        yourAnswer: '域名解析',
        isCorrect: true,
        timeSpent: 40,
      },
    ],
  }

  const getAttentionLevelInfo = (level: string) => {
    switch (level) {
      case 'high':
        return { color: '#52c41a', text: '高专注', icon: <FireOutlined /> }
      case 'medium':
        return { color: '#faad14', text: '中专注', icon: <RiseOutlined /> }
      case 'low':
        return { color: '#f5222d', text: '低专注', icon: <ClockCircleOutlined /> }
      default:
        return { color: '#999', text: '未知', icon: <UserOutlined /> }
    }
  }

  const attentionInfo = getAttentionLevelInfo(resultData.attentionLevel)

  if (showDetail) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => setShowDetail(false)}
          style={{ marginBottom: 24 }}
        >
          返回概览
        </Button>

        <Card title="答题详情">
          <Timeline mode="left">
            {resultData.answerHistory.map((item, index) => (
              <Timeline.Item
                key={index}
                dot={
                  item.isCorrect ? (
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                  ) : (
                    <ClockCircleOutlined style={{ color: '#f5222d', fontSize: 16 }} />
                  )
                }
                label={`第${index + 1}题`}
              >
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text strong>{item.question}</Text>
                    <Space>
                      <Text type="secondary">你的答案：</Text>
                      <Tag color={item.isCorrect ? 'success' : 'error'}>
                        {item.yourAnswer}
                      </Tag>
                    </Space>
                    <Text type="secondary">
                      <ClockCircleOutlined /> 用时：{item.timeSpent}秒
                    </Text>
                  </Space>
                </Card>
              </Timeline.Item>
            ))}
          </Timeline>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Result
        status="success"
        icon={<TrophyOutlined style={{ color: '#faad14' }} />}
        title="答题完成！"
        subTitle={
          <Space direction="vertical" size={8}>
            <Text>{resultData.quizTitle}</Text>
            <Tag color="blue">专注度: {resultData.attentionScore}分</Tag>
          </Space>
        }
        extra={[
          <Button type="primary" key="detail" onClick={() => setShowDetail(true)}>
            查看详情
          </Button>,
          <Button key="back">返回课堂</Button>,
        ]}
      />

      {/* 成绩概览 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="正确率"
              value={resultData.score}
              suffix="%"
              valueStyle={{ color: resultData.score >= 60 ? '#52c41a' : '#f5222d' }}
              prefix={<CheckCircleOutlined />}
            />
            <Progress
              percent={resultData.score}
              showInfo={false}
              strokeColor={resultData.score >= 60 ? '#52c41a' : '#f5222d'}
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="排名"
              value={resultData.rank}
              suffix={`/${resultData.totalParticipants}`}
              valueStyle={{ color: '#1890ff' }}
              prefix={<TrophyOutlined />}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              超过了 {Math.round((1 - resultData.rank / resultData.totalParticipants) * 100)}% 的同学
            </Text>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="专注度"
              value={resultData.attentionScore}
              suffix="/10"
              valueStyle={{ color: attentionInfo.color }}
              prefix={attentionInfo.icon}
            />
            <Tag color={attentionInfo.color} style={{ marginTop: 8 }}>
              {attentionInfo.text}
            </Tag>
          </Card>
        </Col>
      </Row>

      {/* 详细统计 */}
      <Card title="答题统计" style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="总题数"
              value={resultData.totalQuestions}
              suffix="题"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="正确"
              value={resultData.correctCount}
              suffix="题"
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="错误"
              value={resultData.wrongCount}
              suffix="题"
              valueStyle={{ color: '#f5222d' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="总用时"
              value={Math.round(resultData.totalTime / 60)}
              suffix="分"
              prefix={<ClockCircleOutlined />}
            />
          </Col>
        </Row>

        <Divider />

        <Row gutter={16}>
          <Col span={12}>
            <Card size="small" title="正确率分布">
              <Progress
                type="circle"
                percent={resultData.score}
                strokeColor={resultData.score >= 60 ? '#52c41a' : '#f5222d'}
                format={() => `${resultData.correctCount}/${resultData.totalQuestions}`}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="用时分析">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>总用时</Text>
                  <Text strong>{Math.round(resultData.totalTime / 60)}分{resultData.totalTime % 60}秒</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>平均每题</Text>
                  <Text strong>{resultData.avgTimePerQuestion}秒</Text>
                </div>
                <Progress
                  percent={Math.round((resultData.avgTimePerQuestion / 60) * 100)}
                  showInfo={false}
                  strokeColor="#1890ff"
                />
              </Space>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 答题记录 */}
      <Card
        title="答题记录"
        extra={
          <Button type="link" onClick={() => setShowDetail(true)}>
            查看全部
          </Button>
        }
      >
        <List
          dataSource={resultData.answerHistory.slice(0, 3)}
          renderItem={(item, index) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  <Avatar
                    style={{
                      backgroundColor: item.isCorrect ? '#52c41a' : '#f5222d',
                    }}
                  >
                    {index + 1}
                  </Avatar>
                }
                title={item.question}
                description={`用时: ${item.timeSpent}秒`}
              />
              <Tag color={item.isCorrect ? 'success' : 'error'}>
                {item.isCorrect ? '正确' : '错误'}
              </Tag>
            </List.Item>
          )}
        />
      </Card>

      {/* 提示信息 */}
      <Alert
        message="温馨提示"
        description="
          您的答题数据已记录，将用于课堂专注度分析。
          继续保持良好的学习状态，提高课堂参与度！
        "
        type="info"
        showIcon
        style={{ marginTop: 24 }}
      />
    </div>
  )
}

export default StudentResult
