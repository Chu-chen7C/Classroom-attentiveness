import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Space,
  Tag,
  message,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  UserOutlined,
  BookOutlined,
  ClockCircleOutlined,
  ImportOutlined,
  ExportOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import type { Classroom } from '../../types'
import {
  getClassrooms as apiGetClassrooms,
  createClassroom as apiCreateClassroom,
  updateClassroom as apiUpdateClassroom,
  deleteClassroom as apiDeleteClassroom,
} from '../../services/classroom'
import {
  getStudents as apiGetStudents,
  addStudent as apiAddStudent,
  updateStudent as apiUpdateStudent,
  deleteStudent as apiDeleteStudent,
} from '../../services/student'

interface Student {
  id: string
  studentId: string
  name: string
  classId: string
  faceRegistered: boolean
  faceImage?: string
  joinTime: string
}

const ClassManager = () => {
  const navigate = useNavigate()
  const [classes, setClasses] = useState<Classroom[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [isClassModalOpen, setIsClassModalOpen] = useState(false)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [currentClass, setCurrentClass] = useState<Classroom | null>(null)
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [searchText, setSearchText] = useState('')
  const [, setLoading] = useState(true)
  const [classForm] = Form.useForm()
  const [studentForm] = Form.useForm()

  useEffect(() => {
    async function fetchInitialData() {
      try {
        const data = await apiGetClassrooms()
        const mappedClasses: Classroom[] = data.map((c) => ({
          id: c.id,
          name: c.name,
          teacherId: '',
          teacherName: '',
          studentCount: c.studentCount,
          startTime: c.startTime || '待定',
          status: c.status as Classroom['status'],
        }))
        setClasses(mappedClasses)
        if (mappedClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(mappedClasses[0].id)
          await loadStudents(mappedClasses[0].id)
        }
      } catch (err) {
        console.error('获取班级列表失败:', err)
        message.error('获取班级列表失败')
      } finally {
        setLoading(false)
      }
    }
    fetchInitialData()
  }, [])

  async function loadStudents(classroomId: string) {
    try {
      const data = await apiGetStudents(classroomId)
      const mappedStudents: Student[] = data.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        name: s.name,
        classId: classroomId,
        faceRegistered: s.faceRegistered,
        joinTime: s.joinTime || new Date().toLocaleString('zh-CN'),
      }))
      setStudents(mappedStudents)
    } catch (err) {
      console.error('获取学生列表失败:', err)
    }
  }

  const refreshClasses = async () => {
    try {
      const data = await apiGetClassrooms()
      const mappedClasses: Classroom[] = data.map((c) => ({
        id: c.id,
        name: c.name,
        teacherId: '',
        teacherName: '',
        studentCount: c.studentCount,
        startTime: c.startTime || '待定',
        status: c.status as Classroom['status'],
      }))
      setClasses(mappedClasses)
    } catch (err) {
      message.error('刷新班级列表失败')
    }
  }
  const classColumns = [
    {
      title: '班级名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <BookOutlined style={{ color: '#1890ff' }} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      ),
    },
    {
      title: '学生人数',
      dataIndex: 'studentCount',
      key: 'studentCount',
      render: (count: number) => (
        <Space>
          <TeamOutlined />
          <span>{count}人</span>
        </Space>
      ),
    },
    {
      title: '上课时间',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (text: string) => (
        <Space>
          <ClockCircleOutlined />
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge
          status={status === 'ongoing' ? 'processing' : 'default'}
          text={status === 'ongoing' ? '进行中' : '已结束'}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_: any, record: Classroom) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => handleViewStudents(record)}
          >
            管理学生
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditClass(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除班级将同时删除所有学生数据，是否继续？"
            onConfirm={() => handleDeleteClass(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 学生表格列
  const studentColumns = [
    {
      title: '学号',
      dataIndex: 'studentId',
      key: 'studentId',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '人脸录入',
      dataIndex: 'faceRegistered',
      key: 'faceRegistered',
      width: 100,
      render: (registered: boolean) => (
        <Tag color={registered ? 'success' : 'warning'}>
          {registered ? '已录入' : '未录入'}
        </Tag>
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'joinTime',
      key: 'joinTime',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: Student) => (
        <Space>
          <Button
            size="small"
            type={record.faceRegistered ? 'default' : 'primary'}
            onClick={() => handleRegisterFace(record)}
          >
            {record.faceRegistered ? '重新录入' : '录入人脸'}
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditStudent(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            onConfirm={() => handleDeleteStudent(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 班级操作
  const handleAddClass = () => {
    setCurrentClass(null)
    classForm.resetFields()
    setIsClassModalOpen(true)
  }

  const handleEditClass = (record: Classroom) => {
    setCurrentClass(record)
    classForm.setFieldsValue(record)
    setIsClassModalOpen(true)
  }

  const handleDeleteClass = async (id: string) => {
    try {
      await apiDeleteClassroom(id)
      setClasses(classes.filter((c) => c.id !== id))
      message.success('班级删除成功')
    } catch (err: any) {
      message.error(err?.error || '删除失败')
    }
  }

  const handleSaveClass = async (values: any) => {
    try {
      if (currentClass) {
        await apiUpdateClassroom(currentClass.id, values)
        await refreshClasses()
        message.success('班级更新成功')
      } else {
        await apiCreateClassroom({
          name: values.name,
          description: values.description,
          courseType: values.courseType,
        })
        await refreshClasses()
        message.success('班级创建成功')
      }
    } catch (err: any) {
      message.error(err?.error || '保存失败')
    }
    setIsClassModalOpen(false)
  }

  // 学生操作
  const handleViewStudents = async (record: Classroom) => {
    setCurrentClass(record)
    setSelectedClassId(record.id)
    setIsDetailModalOpen(true)
    await loadStudents(record.id)
  }

  const handleAddStudent = () => {
    setCurrentStudent(null)
    studentForm.resetFields()
    setIsStudentModalOpen(true)
  }

  const handleEditStudent = (record: Student) => {
    setCurrentStudent(record)
    studentForm.setFieldsValue(record)
    setIsStudentModalOpen(true)
  }

  const handleDeleteStudent = async (id: string) => {
    try {
      await apiDeleteStudent(id)
      setStudents(students.filter((s) => s.id !== id))
      message.success('学生删除成功')
    } catch (err: any) {
      message.error(err?.error || '删除失败')
    }
  }

  const handleSaveStudent = async (values: any) => {
    try {
      if (currentStudent) {
        await apiUpdateStudent(currentStudent.id, values)
        await loadStudents(selectedClassId)
        message.success('学生信息更新成功')
      } else {
        await apiAddStudent({
          studentId: values.studentId,
          name: values.name,
          classroomId: selectedClassId,
          seatRow: values.seatRow,
          seatCol: values.seatCol,
        })
        await loadStudents(selectedClassId)
        await refreshClasses()
        message.success('学生添加成功')
      }
    } catch (err: any) {
      message.error(err?.error || '保存失败')
    }
    setIsStudentModalOpen(false)
  }

  const handleRegisterFace = (record: Student) => {
    navigate(`/face-register?studentId=${record.id}&classroomId=${selectedClassId}`)
  }

  // 筛选当前班级的学生
  const currentClassStudents = students.filter(
    (s) => s.classId === selectedClassId &&
    (s.name.includes(searchText) || s.studentId.includes(searchText))
  )

  // 统计信息
  const stats = {
    totalClasses: classes.length,
    totalStudents: students.length,
    faceRegisteredCount: students.filter((s) => s.faceRegistered).length,
    faceNotRegisteredCount: students.filter((s) => !s.faceRegistered).length,
  }

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="班级总数"
              value={stats.totalClasses}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="学生总数"
              value={stats.totalStudents}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已录人脸"
              value={stats.faceRegisteredCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="未录人脸"
              value={stats.faceNotRegisteredCount}
              valueStyle={{ color: '#faad14' }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 班级列表 */}
      <Card
        title="班级管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClass}>
            新建班级
          </Button>
        }
      >
        <Table
          dataSource={classes}
          columns={classColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 班级编辑弹窗 */}
      <Modal
        title={currentClass ? '编辑班级' : '新建班级'}
        open={isClassModalOpen}
        onCancel={() => setIsClassModalOpen(false)}
        onOk={() => classForm.submit()}
      >
        <Form form={classForm} layout="vertical" onFinish={handleSaveClass}>
          <Form.Item
            name="name"
            label="班级名称"
            rules={[{ required: true, message: '请输入班级名称' }]}
          >
            <Input placeholder="例如：计算机网络原理" />
          </Form.Item>
          <Form.Item
            name="startTime"
            label="上课时间"
            rules={[{ required: true, message: '请输入上课时间' }]}
          >
            <Input placeholder="例如：2024-01-15 08:00" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 学生管理弹窗 */}
      <Modal
        title={`${currentClass?.name} - 学生管理`}
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <Input
                placeholder="搜索学生"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 200 }}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddStudent}>
                添加学生
              </Button>
              <Button icon={<ImportOutlined />}>批量导入</Button>
              <Button icon={<ExportOutlined />}>导出</Button>
            </Space>
          }
        >
          <Table
            dataSource={currentClassStudents}
            columns={studentColumns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            size="small"
          />
        </Card>
      </Modal>

      {/* 学生编辑弹窗 */}
      <Modal
        title={currentStudent ? '编辑学生' : '添加学生'}
        open={isStudentModalOpen}
        onCancel={() => setIsStudentModalOpen(false)}
        onOk={() => studentForm.submit()}
      >
        <Form form={studentForm} layout="vertical" onFinish={handleSaveStudent}>
          <Form.Item
            name="studentId"
            label="学号"
            rules={[{ required: true, message: '请输入学号' }]}
          >
            <Input placeholder="请输入学号" />
          </Form.Item>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ClassManager
