import { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Radio,
  Checkbox,
  Space,
  Typography,
  Progress,
  Tag,
  Alert,
  Result,
  Avatar,
  Badge,
  Statistic,
  Row,
  Col,
  Divider,
} from 'antd'
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  UserOutlined,
  BookOutlined,
  TrophyOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import type { QuizData, QuizOption } from '../../types'

const { Title, Text, Paragraph } = Typography

const StudentQuiz = () => {
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [startTime, setStartTime] = useState<number>(0)

  // 模拟题目数据
  useEffect(() => {
    const mockQuiz: QuizData = {
      id: '1',
      classroomId: '1',
      title: 'TCP/IP协议基础测试',
      type: 'single',
      options: [
        { id: 'A', text: '应用层、传输层、网络层、数据链路层' },
        { id: 'B', text: '应用层、表示层、会话层、传输层' },
        { id: 'C', text: '物理层、数据链路层、网络层、传输层' },
        { id: 'D', text: '网络层、传输层、会话层、应用层' },
      ],
      correctAnswer: 'A',
      timeLimit: 60,
      createdAt: '2024-01-15 08:00',
      status: 'published',
    }
    setQuiz(mockQuiz)
    setTimeLeft(mockQuiz.timeLimit)
    setStartTime(Date.now())
  }, [])

  // 倒计时
  useEffect(() => {
    if (timeLeft <= 0 || isSubmitted) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, isSubmitted])

  const handleAnswerChange = (value: string | string[]) => {
    if (isSubmitted) return
    if (Array.isArray(value)) {
      setAnswers(value)
    } else {
      setAnswers([value])
    }
  }

  const handleSubmit = () => {
    if (isSubmitted) return

    const timeSpent = Math.round((Date.now() - startTime) / 1000)
    
    // 判断答案是否正确
    if (quiz) {
      const isAnswerCorrect = quiz.type === 'single'
        ? answers[0] === quiz.correctAnswer
        : Array.isArray(quiz.correctAnswer) &&
          answers.length === quiz.correctAnswer.length &&
          answers.every((a) => quiz.correctAnswer?.includes(a))
      
      setIsCorrect(isAnswerCorrect)
    }
    
    setIsSubmitted(true)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getProgressColor = () => {
    const percentage = (timeLeft / (quiz?.timeLimit || 60)) * 100
    if (percentage > 60) return '#52c41a'
    if (percentage > 30) return '#faad14'
    return '#f5222d'
  }

  if (!quiz) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        <Card loading />
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
        <Result
          status={isCorrect ? 'success' : 'error'}
          title={isCorrect ? '回答正确！' : '回答错误'}
          subTitle={
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Text>用时：{Math.round((Date.now() - startTime) / 1000)}秒</Text>
              {!isCorrect && (
                <Alert
                  message="提示"
                  description="不显示正确答案，请继续专注听课"
                  type="info"
                  showIcon
                />
              )}
            </Space>
          }
          extra={[
            <Button type="primary" key="back" size="large">
              返回课堂
            </Button>,
          ]}
        />

        <Card style={{ marginTop: 24 }}>
          <Title level={5}>答题统计</Title>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={8}>
              <Statistic
                title="你的答案"
                value={answers.join(', ')}
                valueStyle={{ color: isCorrect ? '#52c41a' : '#f5222d' }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="用时"
                value={Math.round((Date.now() - startTime) / 1000)}
                suffix="秒"
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="状态"
                value={isCorrect ? '正确' : '错误'}
                valueStyle={{ color: isCorrect ? '#52c41a' : '#f5222d' }}
              />
            </Col>
          </Row>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      {/* 头部信息 */}
      <Card style={{ marginBottom: 24 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size={16}>
              <Avatar size={64} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  学生端答题
                </Title>
                <Text type="secondary">
                  <BookOutlined /> {quiz.title}
                </Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Card size="small" style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Space>
                <ClockCircleOutlined style={{ fontSize: 24, color: getProgressColor() }} />
                <div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: getProgressColor() }}>
                    {formatTime(timeLeft)}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>剩余时间</div>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
        <Progress
          percent={Math.round((timeLeft / quiz.timeLimit) * 100)}
          showInfo={false}
          strokeColor={getProgressColor()}
          style={{ marginTop: 16 }}
        />
      </Card>

      {/* 答题区域 */}
      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>题目</span>
            <Tag color={quiz.type === 'single' ? 'blue' : 'purple'}>
              {quiz.type === 'single' ? '单选题' : '多选题'}
            </Tag>
          </Space>
        }
      >
        <Paragraph style={{ fontSize: 16, marginBottom: 24 }}>
          {quiz.title}
        </Paragraph>

        {quiz.type === 'single' ? (
          <Radio.Group
            onChange={(e) => handleAnswerChange(e.target.value)}
            value={answers[0]}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {quiz.options.map((option) => (
                <Radio
                  key={option.id}
                  value={option.id}
                  style={{
                    width: '100%',
                    padding: 16,
                    border: '1px solid #d9d9d9',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <Space>
                    <Tag>{option.id}</Tag>
                    <span>{option.text}</span>
                  </Space>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        ) : (
          <Checkbox.Group
            onChange={(values) => handleAnswerChange(values as string[])}
            value={answers}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {quiz.options.map((option) => (
                <Checkbox
                  key={option.id}
                  value={option.id}
                  style={{
                    width: '100%',
                    padding: 16,
                    border: '1px solid #d9d9d9',
                    borderRadius: 8,
                  }}
                >
                  <Space>
                    <Tag>{option.id}</Tag>
                    <span>{option.text}</span>
                  </Space>
                </Checkbox>
              ))}
            </Space>
          </Checkbox.Group>
        )}

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            <ExclamationCircleOutlined /> 请在规定时间内完成答题
          </Text>
          <Button
            type="primary"
            size="large"
            onClick={handleSubmit}
            disabled={answers.length === 0}
            icon={<CheckCircleOutlined />}
          >
            提交答案
          </Button>
        </div>
      </Card>

      {/* 提示信息 */}
      <Alert
        message="答题须知"
        description="
          1. 请在规定时间内完成答题
          2. 单选题只能选择一个答案，多选题可选择多个答案
          3. 提交后将显示答题结果（不显示正确答案）
          4. 答题数据将用于课堂专注度分析
        "
        type="info"
        showIcon
        style={{ marginTop: 24 }}
      />
    </div>
  )
}

export default StudentQuiz
