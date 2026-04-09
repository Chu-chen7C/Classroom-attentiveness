import { useState } from 'react'
import {
  Card,
  Button,
  Form,
  Input,
  Radio,
  Space,
  Tag,
  Table,
  Modal,
  message,
  InputNumber,
  Row,
  Col,
  Statistic,
  QRCode,
  Tabs,
  List,
  Avatar,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  BarChartOutlined,
  QrcodeOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import type { QuizData, QuizOption, StudentAnswer } from '../../types'

const QuizManager = () => {
  const [quizzes, setQuizzes] = useState<QuizData[]>([
    {
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
      status: 'ended',
    },
    {
      id: '2',
      classroomId: '1',
      title: 'IP地址分类多选题',
      type: 'multiple',
      options: [
        { id: 'A', text: 'A类地址第一个字节范围是1-126' },
        { id: 'B', text: 'B类地址第一个字节范围是128-191' },
        { id: 'C', text: 'C类地址第一个字节范围是192-223' },
        { id: 'D', text: 'D类地址用于组播' },
      ],
      correctAnswer: ['A', 'B', 'C', 'D'],
      timeLimit: 90,
      createdAt: '2024-01-15 08:30',
      status: 'published',
    },
  ])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false)
  const [isQRModalOpen, setIsQRModalOpen] = useState(false)
  const [currentQuiz, setCurrentQuiz] = useState<QuizData | null>(null)
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState('list')

  // 模拟学生答题数据
  const studentAnswers: StudentAnswer[] = [
    { studentId: '2024001', quizId: '1', answer: 'A', isCorrect: true, timeSpent: 45, submittedAt: '2024-01-15 08:05' },
    { studentId: '2024002', quizId: '1', answer: 'B', isCorrect: false, timeSpent: 30, submittedAt: '2024-01-15 08:06' },
    { studentId: '2024003', quizId: '1', answer: 'A', isCorrect: true, timeSpent: 55, submittedAt: '2024-01-15 08:07' },
    { studentId: '2024004', quizId: '1', answer: 'A', isCorrect: true, timeSpent: 40, submittedAt: '2024-01-15 08:08' },
    { studentId: '2024005', quizId: '1', answer: 'C', isCorrect: false, timeSpent: 25, submittedAt: '2024-01-15 08:09' },
  ]

  const columns = [
    {
      title: '题目',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: QuizData) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{text}</span>
          <Space size={8}>
            <Tag color={record.type === 'single' ? 'blue' : 'purple'}>
              {record.type === 'single' ? '单选题' : '多选题'}
            </Tag>
            <Tag icon={<ClockCircleOutlined />}>
              {record.timeLimit}秒
            </Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          draft: { color: 'default', text: '草稿' },
          published: { color: 'processing', text: '进行中' },
          ended: { color: 'success', text: '已结束' },
        }
        const { color, text } = statusMap[status] || { color: 'default', text: status }
        return <Badge status={color as any} text={text} />
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: any, record: QuizData) => (
        <Space>
          {record.status === 'draft' && (
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handlePublish(record)}
            >
              发布
            </Button>
          )}
          {record.status === 'published' && (
            <>
              <Button
                size="small"
                icon={<QrcodeOutlined />}
                onClick={() => handleShowQR(record)}
              >
                二维码
              </Button>
              <Button
                size="small"
                icon={<PauseCircleOutlined />}
                onClick={() => handleEnd(record)}
              >
                结束
              </Button>
            </>
          )}
          {record.status === 'ended' && (
            <Button
              size="small"
              icon={<BarChartOutlined />}
              onClick={() => handleShowStats(record)}
            >
              统计
            </Button>
          )}
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const handleCreate = () => {
    setCurrentQuiz(null)
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleEdit = (quiz: QuizData) => {
    setCurrentQuiz(quiz)
    form.setFieldsValue({
      ...quiz,
      options: quiz.options.map((opt) => `${opt.id}:${opt.text}`).join('\n'),
    })
    setIsModalOpen(true)
  }

  const handleDelete = (quiz: QuizData) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除题目"${quiz.title}"吗？`,
      onOk: () => {
        setQuizzes(quizzes.filter((q) => q.id !== quiz.id))
        message.success('删除成功')
      },
    })
  }

  const handlePublish = (quiz: QuizData) => {
    setQuizzes(quizzes.map((q) => (q.id === quiz.id ? { ...q, status: 'published' } : q)))
    message.success('题目已发布')
    setCurrentQuiz(quiz)
    setIsQRModalOpen(true)
  }

  const handleEnd = (quiz: QuizData) => {
    setQuizzes(quizzes.map((q) => (q.id === quiz.id ? { ...q, status: 'ended' } : q)))
    message.success('答题已结束')
  }

  const handleShowStats = (quiz: QuizData) => {
    setCurrentQuiz(quiz)
    setIsStatsModalOpen(true)
  }

  const handleShowQR = (quiz: QuizData) => {
    setCurrentQuiz(quiz)
    setIsQRModalOpen(true)
  }

  const handleSave = (values: any) => {
    const options: QuizOption[] = values.options
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const [id, ...textParts] = line.split(':')
        return { id: id.trim(), text: textParts.join(':').trim() }
      })

    const newQuiz: QuizData = {
      id: currentQuiz?.id || Date.now().toString(),
      classroomId: '1',
      title: values.title,
      type: values.type,
      options,
      correctAnswer: values.correctAnswer,
      timeLimit: values.timeLimit,
      createdAt: currentQuiz?.createdAt || new Date().toLocaleString('zh-CN'),
      status: currentQuiz?.status || 'draft',
    }

    if (currentQuiz) {
      setQuizzes(quizzes.map((q) => (q.id === currentQuiz.id ? newQuiz : q)))
      message.success('更新成功')
    } else {
      setQuizzes([...quizzes, newQuiz])
      message.success('创建成功')
    }
    setIsModalOpen(false)
  }

  // 统计数据
  const stats = {
    totalParticipants: studentAnswers.length,
    correctCount: studentAnswers.filter((a) => a.isCorrect).length,
    avgTime: Math.round(studentAnswers.reduce((sum, a) => sum + a.timeSpent, 0) / studentAnswers.length),
    accuracy: Math.round((studentAnswers.filter((a) => a.isCorrect).length / studentAnswers.length) * 100),
  }

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'list',
            label: '答题管理',
            children: (<>
          <Card
            title="互动答题列表"
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                新建题目
              </Button>
            }
          >
            <Table
              dataSource={quizzes}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
          </>
          )
        },
        {
          key: 'stats',
          label: '答题统计',
          children: (<>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="参与人数"
                  value={stats.totalParticipants}
                  suffix="/48"
                  prefix={<UserOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="正确率"
                  value={stats.accuracy}
                  suffix="%"
                  valueStyle={{ color: stats.accuracy >= 60 ? '#52c41a' : '#f5222d' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="平均用时"
                  value={stats.avgTime}
                  suffix="秒"
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="正确人数"
                  value={stats.correctCount}
                  suffix={`/${stats.totalParticipants}`}
                  prefix={<BarChartOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Card title="学生答题详情">
            <List
              dataSource={studentAnswers}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} />}
                    title={`学生 ${item.studentId}`}
                    description={`用时: ${item.timeSpent}秒 | 提交时间: ${item.submittedAt}`}
                  />
                  <Space>
                    <Tag color={item.isCorrect ? 'success' : 'error'}>
                      答案: {item.answer}
                    </Tag>
                    {item.isCorrect ? (
                      <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#f5222d', fontSize: 20 }} />
                    )}
                  </Space>
                </List.Item>
              )}
            />
          </Card>
          </>
          )
        },
        ]}
      />

      {/* 创建/编辑题目弹窗 */}
      <Modal
        title={currentQuiz ? '编辑题目' : '新建题目'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="title"
            label="题目内容"
            rules={[{ required: true, message: '请输入题目内容' }]}
          >
            <Input.TextArea rows={2} placeholder="请输入题目内容" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type"
                label="题目类型"
                rules={[{ required: true }]}
                initialValue="single"
              >
                <Radio.Group>
                  <Radio.Button value="single">单选题</Radio.Button>
                  <Radio.Button value="multiple">多选题</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="timeLimit"
                label="答题时间限制"
                rules={[{ required: true }]}
                initialValue={60}
              >
                <InputNumber min={30} max={120} addonAfter="秒" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="options"
            label="选项（格式：A:选项内容，每行一个）"
            rules={[{ required: true, message: '请输入选项' }]}
          >
            <Input.TextArea
              rows={5}
              placeholder={`A:选项A内容
B:选项B内容
C:选项C内容
D:选项D内容`}
            />
          </Form.Item>

          <Form.Item
            name="correctAnswer"
            label="正确答案"
            rules={[{ required: true, message: '请输入正确答案' }]}
          >
            <Input placeholder="单选填A/B/C/D，多选用逗号分隔如A,B,C" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 二维码弹窗 */}
      <Modal
        title="学生扫码答题"
        open={isQRModalOpen}
        onCancel={() => setIsQRModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsQRModalOpen(false)}>
            关闭
          </Button>,
        ]}
        centered
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h3 style={{ marginBottom: 16 }}>{currentQuiz?.title}</h3>
          <QRCode
            value={`http://localhost:3000/student/quiz/${currentQuiz?.id}`}
            size={200}
          />
          <p style={{ marginTop: 16, color: '#666' }}>
            请学生使用手机扫描二维码进入答题
          </p>
          <Tag color="blue">限时 {currentQuiz?.timeLimit} 秒</Tag>
        </div>
      </Modal>

      {/* 统计弹窗 */}
      <Modal
        title="答题统计"
        open={isStatsModalOpen}
        onCancel={() => setIsStatsModalOpen(false)}
        width={800}
        footer={null}
      >
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card>
              <Statistic
                title="参与人数"
                value={stats.totalParticipants}
                suffix="/48"
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="正确率"
                value={stats.accuracy}
                suffix="%"
                valueStyle={{ color: stats.accuracy >= 60 ? '#52c41a' : '#f5222d' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="平均用时"
                value={stats.avgTime}
                suffix="秒"
              />
            </Card>
          </Col>
        </Row>

        <Card title="学生答题情况">
          <Table
            dataSource={studentAnswers}
            columns={[
              { title: '学号', dataIndex: 'studentId', key: 'studentId' },
              { title: '答案', dataIndex: 'answer', key: 'answer' },
              {
                title: '是否正确',
                dataIndex: 'isCorrect',
                key: 'isCorrect',
                render: (isCorrect: boolean) => (
                  <Tag color={isCorrect ? 'success' : 'error'}>
                    {isCorrect ? '正确' : '错误'}
                  </Tag>
                ),
              },
              { title: '用时(秒)', dataIndex: 'timeSpent', key: 'timeSpent' },
              { title: '提交时间', dataIndex: 'submittedAt', key: 'submittedAt' },
            ]}
            rowKey="studentId"
            pagination={{ pageSize: 5 }}
            size="small"
          />
        </Card>
      </Modal>
    </div>
  )
}

export default QuizManager
