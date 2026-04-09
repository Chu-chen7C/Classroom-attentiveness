import { useState } from 'react'
import {
  Card,
  Button,
  DatePicker,
  Select,
  Form,
  Radio,
  Space,
  Tag,
  Row,
  Col,
  Statistic,
  List,
  Typography,
  Steps,
  Result,
} from 'antd'
import {
  DownloadOutlined,
  CalendarOutlined,
  FileTextOutlined,
  BarChartOutlined,
  PrinterOutlined,
  EyeOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Title, Text } = Typography

const ReportExport = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [reportType, setReportType] = useState<'single' | 'weekly' | 'monthly'>('single')
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [_dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  // 模拟课堂数据
  const classroomOptions = [
    { value: '1', label: '计算机网络原理 - 第1周', date: '2024-01-15' },
    { value: '2', label: '计算机网络原理 - 第2周', date: '2024-01-22' },
    { value: '3', label: '计算机网络原理 - 第3周', date: '2024-01-29' },
    { value: '4', label: '计算机网络原理 - 第4周', date: '2024-02-05' },
  ]

  // 模拟报告数据
  const reportData = {
    classroomName: '计算机网络原理',
    teacherName: '张教授',
    classDate: '2024年1月15日',
    studentCount: 48,
    duration: '90分钟',
    avgAttentionScore: 7.8,
    highAttentionRate: 65,
    mediumAttentionRate: 25,
    lowAttentionRate: 10,
    quizCount: 3,
    quizAccuracy: 72,
    interactionCount: 4,
    effectiveInteractionRate: 75,
    suggestions: [
      '周二上午课程低专注率较高，建议增加案例教学',
      '小组讨论互动效果良好，可适当增加频次',
      '课程后半段学生专注度下降明显，建议增加互动环节',
      '针对答题正确率较低的知识点，建议加强复习',
    ],
    topStudents: [
      { name: '李明', score: 9.5, attention: '高专注' },
      { name: '王芳', score: 9.3, attention: '高专注' },
      { name: '张伟', score: 9.1, attention: '高专注' },
    ],
    needAttentionStudents: [
      { name: '赵强', score: 4.2, attention: '低专注' },
      { name: '刘洋', score: 4.8, attention: '低专注' },
    ],
  }

  const steps = [
    {
      title: '选择报告类型',
      icon: <FileTextOutlined />,
    },
    {
      title: '选择课堂',
      icon: <CalendarOutlined />,
    },
    {
      title: '生成报告',
      icon: <BarChartOutlined />,
    },
  ]

  const handleGenerate = () => {
    setIsGenerating(true)
    // 模拟生成过程
    setTimeout(() => {
      setIsGenerating(false)
      setIsComplete(true)
      setCurrentStep(2)
    }, 2000)
  }

  const handleDownload = () => {
    // 模拟下载
    const element = document.createElement('a')
    const file = new Blob(['课堂优化报告内容'], { type: 'application/pdf' })
    element.href = URL.createObjectURL(file)
    element.download = `课堂优化报告_${reportData.classDate}.pdf`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card title="选择报告类型" style={{ marginTop: 24 }}>
            <Radio.Group
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Radio value="single">
                  <Card
                    size="small"
                    style={{ width: 400, marginLeft: 8 }}
                    styles={{ body: { padding: 12 } }}
                  >
                    <Space>
                      <FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>单课堂报告</div>
                        <div style={{ color: '#666', fontSize: 12 }}>生成单次课堂的详细分析报告</div>
                      </div>
                    </Space>
                  </Card>
                </Radio>
                <Radio value="weekly">
                  <Card
                    size="small"
                    style={{ width: 400, marginLeft: 8 }}
                    styles={{ body: { padding: 12 } }}
                  >
                    <Space>
                      <CalendarOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>周度报告</div>
                        <div style={{ color: '#666', fontSize: 12 }}>汇总一周内的课堂数据</div>
                      </div>
                    </Space>
                  </Card>
                </Radio>
                <Radio value="monthly">
                  <Card
                    size="small"
                    style={{ width: 400, marginLeft: 8 }}
                    styles={{ body: { padding: 12 } }}
                  >
                    <Space>
                      <BarChartOutlined style={{ fontSize: 24, color: '#722ed1' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>月度报告</div>
                        <div style={{ color: '#666', fontSize: 12 }}>汇总整月的教学数据分析</div>
                      </div>
                    </Space>
                  </Card>
                </Radio>
              </Space>
            </Radio.Group>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Button type="primary" onClick={() => setCurrentStep(1)}>
                下一步 <ArrowRightOutlined />
              </Button>
            </div>
          </Card>
        )
      case 1:
        return (
          <Card title="选择课堂" style={{ marginTop: 24 }}>
            <Form layout="vertical">
              <Form.Item label="选择课程">
                <Select
                  placeholder="请选择要生成报告的课程"
                  style={{ width: 400 }}
                  value={selectedClass}
                  onChange={setSelectedClass}
                  options={classroomOptions}
                />
              </Form.Item>
              {reportType !== 'single' && (
                <Form.Item label="选择时间范围">
                  <RangePicker
                    style={{ width: 400 }}
                    onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                  />
                </Form.Item>
              )}
            </Form>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrentStep(0)}>上一步</Button>
              <Button
                type="primary"
                onClick={handleGenerate}
                loading={isGenerating}
                disabled={!selectedClass}
              >
                生成报告
              </Button>
            </div>
          </Card>
        )
      case 2:
        if (isComplete) {
          return (
            <div style={{ marginTop: 24 }}>
              <Result
                status="success"
                title="报告生成成功！"
                subTitle="课堂优化报告已生成，您可以预览或下载PDF文件"
                extra={[
                  <Button key="preview" icon={<EyeOutlined />} size="large">
                    预览报告
                  </Button>,
                  <Button
                    key="download"
                    type="primary"
                    icon={<DownloadOutlined />}
                    size="large"
                    onClick={handleDownload}
                  >
                    下载PDF
                  </Button>,
                ]}
              />

              {/* 报告预览 */}
              <Card
                title="报告预览"
                style={{ marginTop: 24 }}
                extra={
                  <Button icon={<PrinterOutlined />}>
                    打印
                  </Button>
                }
              >
                <div style={{ padding: 24, backgroundColor: '#fafafa', borderRadius: 8 }}>
                  {/* 报告头部 */}
                  <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <Title level={3} style={{ marginBottom: 8 }}>
                      课堂优化报告
                    </Title>
                    <Text type="secondary">
                      {reportData.classroomName} | {reportData.classDate}
                    </Text>
                  </div>

                  {/* 基本信息 */}
                  <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Text type="secondary">授课教师：</Text>
                        <Text strong>{reportData.teacherName}</Text>
                      </Col>
                      <Col span={8}>
                        <Text type="secondary">学生人数：</Text>
                        <Text strong>{reportData.studentCount}人</Text>
                      </Col>
                      <Col span={8}>
                        <Text type="secondary">课程时长：</Text>
                        <Text strong>{reportData.duration}</Text>
                      </Col>
                    </Row>
                  </Card>

                  {/* 核心数据 */}
                  <Card size="small" title="核心数据" style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      <Col span={6}>
                        <Statistic
                          title="平均专注度"
                          value={reportData.avgAttentionScore}
                          suffix="/10"
                          precision={1}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="高专注占比"
                          value={reportData.highAttentionRate}
                          suffix="%"
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="答题正确率"
                          value={reportData.quizAccuracy}
                          suffix="%"
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="有效互动率"
                          value={reportData.effectiveInteractionRate}
                          suffix="%"
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Col>
                    </Row>
                  </Card>

                  {/* 优化建议 */}
                  <Card size="small" title="优化建议" style={{ marginBottom: 16 }}>
                    <List
                      dataSource={reportData.suggestions}
                      renderItem={(item, index) => (
                        <List.Item>
                          <Space>
                            <Tag color="blue">{index + 1}</Tag>
                            <Text>{item}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Card>

                  {/* 学生表现 */}
                  <Row gutter={16}>
                    <Col span={12}>
                      <Card size="small" title="表现优秀学生">
                        <List
                          dataSource={reportData.topStudents}
                          renderItem={(item) => (
                            <List.Item>
                              <List.Item.Meta
                                title={item.name}
                                description={`专注度: ${item.score}分`}
                              />
                              <Tag color="success">{item.attention}</Tag>
                            </List.Item>
                          )}
                        />
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card size="small" title="需关注学生">
                        <List
                          dataSource={reportData.needAttentionStudents}
                          renderItem={(item) => (
                            <List.Item>
                              <List.Item.Meta
                                title={item.name}
                                description={`专注度: ${item.score}分`}
                              />
                              <Tag color="error">{item.attention}</Tag>
                            </List.Item>
                          )}
                        />
                      </Card>
                    </Col>
                  </Row>
                </div>
              </Card>
            </div>
          )
        }
        return null
      default:
        return null
    }
  }

  return (
    <div>
      <Card>
        <Steps current={currentStep} items={steps} />
        {renderStepContent()}
      </Card>
    </div>
  )
}

export default ReportExport
