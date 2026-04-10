import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Card,
  Button,
  Select,
  Space,
  Tag,
  message,
  Row,
  Col,
  List,
  Avatar,
  Badge,
  Progress,
  Typography,
  Divider,
  Alert,
  Steps,
  Modal,
  Spin,
} from 'antd'
import {
  CameraOutlined,
  CheckCircleOutlined,
  UserOutlined,
  ReloadOutlined,
  SaveOutlined,
  DeleteOutlined,
  LoadingOutlined,
  UploadOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import { registerFace, deleteFace, getStudents } from '../../services/student'
import { getClassrooms } from '../../services/classroom'

const { Title } = Typography
const { Step } = Steps
const API_BASE = 'http://127.0.0.1:5000'

interface Student {
  id: string
  studentId: string
  name: string
  classId: string
  faceRegistered: boolean
  joinTime: string
}

interface ClassOption {
  id: string
  name: string
}

const CAPTURE_QUALITY = 0.95
const DETECT_INTERVAL_MS = 400
const PROGRESS_INCREMENT = 20
const PROGRESS_DECREMENT = 3
const MIN_ENROLL_SAMPLES = 4
const BURST_CAPTURE_COUNT = 5
const BURST_CAPTURE_INTERVAL_MS = 140

const FaceRegister = () => {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedSamples, setCapturedSamples] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [faceDetected, setFaceDetected] = useState(false)
  const [captureProgress, setCaptureProgress] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detectStatus, setDetectStatus] = useState('等待开始')
  const [uploadMode, setUploadMode] = useState(false)
  const [actionDone, setActionDone] = useState({
    front: false,
    blink: false,
    mouth: false,
    left: false,
    right: false,
  })
  const actionItems: Array<{ key: keyof typeof actionDone; label: string }> = [
    { key: 'front', label: '正视摄像头' },
    { key: 'blink', label: '眨眼' },
    { key: 'mouth', label: '张嘴' },
    { key: 'left', label: '左转头' },
    { key: 'right', label: '右转头' },
  ]
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const actionDoneRef = useRef(actionDone)
  const isCapturingRef = useRef(false)

  useEffect(() => {
    actionDoneRef.current = actionDone
  }, [actionDone])

  useEffect(() => {
    isCapturingRef.current = isCapturing
  }, [isCapturing])

  const addCaptureSample = useCallback((img: string) => {
    if (!img || img.length < 1000) return
    setCapturedSamples((prev) => {
      if (prev.length >= 6) return prev
      if (prev.some((x) => x === img)) return prev
      return [...prev, img]
    })
  }, [])

  const nextActionHint = (() => {
    if (!actionDone.front) return '请先正视镜头，保持面部完整入框'
    if (!actionDone.blink) return '请做一次眨眼动作'
    if (!actionDone.mouth) return '请做一次张嘴动作'
    if (!actionDone.left) return '请向左转头 20-40 度'
    if (!actionDone.right) return '请向右转头 20-40 度'
    return '动作采样已完成，可自动拍照或手动立即拍照'
  })()

  const markActionDone = useCallback((key: keyof typeof actionDone) => {
    setActionDone((prev) => {
      if (prev[key]) return prev
      const next = { ...prev, [key]: true }
      const doneCount = Object.values(next).filter(Boolean).length
      setCaptureProgress(Math.round((doneCount / 5) * 100))
      return next
    })
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件（支持JPG、PNG等格式）')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      message.error('图片大小不能超过10MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      setCapturedImage(result)
      setCapturedSamples([result])
      setCurrentStep(2)
      setDetectStatus('照片已上传')
      setIsCapturing(false)
      stopCamera()
    }
    reader.onerror = () => {
      message.error('文件读取失败，请重试')
    }
    reader.readAsDataURL(file)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const loadClasses = useCallback(async () => {
    try {
      console.log('[FaceReg] 正在获取班级列表...')
      const data = await getClassrooms()
      console.log('[FaceReg] 班级数据:', JSON.stringify(data))
      setClasses(data.map((c: any) => ({ id: c.id, name: c.name })))
      if (data.length > 0 && !selectedClassId) {
        setSelectedClassId(data[0].id)
        console.log(`[FaceReg] 自动选择班级: ${data[0].name} (ID: ${data[0].id})`)
      } else if (data.length === 0) {
        message.warning('暂无班级，请先创建班级')
      }
    } catch (err: any) {
      console.error('[FaceReg] 获取班级列表失败:', err)
      if (err?.code === 401) {
        message.error('登录已过期，请重新登录')
        setTimeout(() => window.location.href = '/login', 1500)
      } else {
        message.error('获取班级列表失败: ' + (err?.error || err?.message || '未知错误'))
      }
    }
  }, [selectedClassId])

  const loadStudents = useCallback(async (classId: string) => {
    setLoading(true)
    try {
      const data = await getStudents(classId)
      const mapped: Student[] = data.map((s: any) => ({
        id: s.id,
        studentId: s.studentId,
        name: s.name,
        classId: classId,
        faceRegistered: s.faceRegistered,
        joinTime: s.joinTime || '',
      }))
      setStudents(mapped)
      console.log(`[FaceReg] 加载学生列表: ${mapped.length}人`)
    } catch (err) {
      console.error('[FaceReg] 获取学生列表失败:', err)
      message.error('获取学生列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClasses()
  }, [loadClasses])

  useEffect(() => {
    if (selectedClassId) {
      loadStudents(selectedClassId)
    }
  }, [selectedClassId, loadStudents])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const preStudentId = params.get('studentId')
    const preClassId = params.get('classroomId')
    if (preClassId) {
      setSelectedClassId(preClassId)
    }
    if (preStudentId) {
      setTimeout(() => {
        const found = students.find((s) => s.id === preStudentId)
        if (found) {
          setSelectedStudent(found)
          setCurrentStep(0)
        }
      }, 500)
    }
  }, [students])

  useEffect(() => {
    return () => {
      stopCamera()
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current)
      }
    }
  }, [])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const startCamera = async (): Promise<boolean> => {
    try {
      console.log('[FaceReg] 正在请求摄像头权限...')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream

        return new Promise((resolve) => {
          const video = videoRef.current
          if (!video) {
            resolve(false)
            return
          }

          const onLoaded = () => {
            console.log(`[FaceReg] 摄像头已启动: ${video.videoWidth}x${video.videoHeight}`)
            resolve(true)
          }

          if (video.readyState >= 2) {
            onLoaded()
          } else {
            video.onloadeddata = onLoaded
            setTimeout(() => {
              console.warn('[FaceReg] 视频加载超时')
              resolve(true)
            }, 3000)
          }
        })
      }
      return false
    } catch (err: any) {
      console.error('[FaceReg] 摄像头错误:', err)
      let errMsg = '无法访问摄像头'
      if (err.name === 'NotAllowedError') {
        errMsg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问'
      } else if (err.name === 'NotFoundError') {
        errMsg = '未检测到摄像头设备，请确认摄像头已连接'
      } else if (err.name === 'NotReadableError') {
        errMsg = '摄像头被其他程序占用，请关闭其他使用摄像头的应用'
      }
      message.error(errMsg, 5)
      return false
    }
  }

  const handleStartCapture = async () => {
    if (!selectedStudent) {
      message.warning('请先从左侧选择要录入的学生')
      return
    }

    setIsCapturing(true)
    setCapturedImage(null)
    setCapturedSamples([])
    setCurrentStep(1)
    setCaptureProgress(0)
    setFaceDetected(false)
    setActionDone({
      front: false,
      blink: false,
      mouth: false,
      left: false,
      right: false,
    })
    setDetectStatus('正在启动摄像头...')

    const ok = await startCamera()
    if (!ok) {
      setIsCapturing(false)
      setDetectStatus('摄像头启动失败')
      return
    }

    setDetectStatus('等待视频流就绪...')

    const waitForVideoReady = (): Promise<boolean> => {
      return new Promise((resolve) => {
        const video = videoRef.current
        if (!video) {
          resolve(false)
          return
        }

        const checkReady = () => {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            console.log(`[FaceReg] 视频就绪: ${video.videoWidth}x${video.videoHeight}`)
            resolve(true)
          } else {
            setTimeout(checkReady, 100)
          }
        }

        const timeoutId = setTimeout(() => {
          console.warn('[FaceReg] 视频就绪超时，使用默认尺寸')
          resolve(false)
        }, 5000)

        video.onloadeddata = () => {
          clearTimeout(timeoutId)
          checkReady()
        }

        checkReady()
      })
    }

    await waitForVideoReady()

    setDetectStatus('正在检测人脸...')
    let detectAttemptCount = 0
    const MAX_DETECT_ATTEMPTS = 3

    detectTimerRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !isCapturingRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('[FaceReg] 视频未就绪，跳过本次检测')
        return
      }

      const vw = Math.max(video.videoWidth, 320)
      const vh = Math.max(video.videoHeight, 240)

      canvas.width = vw
      canvas.height = vh
      ctx.drawImage(video, 0, 0, vw, vh)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

      if (dataUrl.length < 1000) {
        console.warn(`[FaceReg] 图像数据过小(${dataUrl.length}B)，跳过检测`)
        detectAttemptCount++
        if (detectAttemptCount > MAX_DETECT_ATTEMPTS) {
          console.warn('[FaceReg] 连续多次图像数据异常，停止自动检测')
          setDetectStatus('⚠️ 视频信号异常，请手动点击"立即拍照"')
          setCaptureProgress(70)
        }
        return
      }

      detectAttemptCount = 0
      addCaptureSample(dataUrl)

      try {
        const token = localStorage.getItem('token')
        console.log(`[FaceReg] 发送检测请求: 图像大小=${dataUrl.length}B`)
        const res = await fetch(`${API_BASE}/api/face/monitoring/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ image: dataUrl, classroomId: selectedClassId || undefined }),
        })

        if (!res.ok) {
          console.warn('[FaceReg] 检测接口返回错误:', res.status)
          setDetectStatus(`检测服务异常(${res.status})，可手动拍照`)
          setCaptureProgress((prev) => Math.min(prev + 5, 80))
          return
        }

        const result = await res.json()
        const detected = (result.totalFaces || 0) > 0
        setFaceDetected(detected)

        if (detected) {
          const face = Array.isArray(result.faces) && result.faces.length > 0 ? result.faces[0] : null
          const state = face?.state_type || ''
          const eye = face?.eye_status || ''
          markActionDone('front')
          if (state === 'looking_left') markActionDone('left')
          if (state === 'looking_right') markActionDone('right')
          if (state === 'mouth_open' || state === 'talking') markActionDone('mouth')
          if (eye === 'single_closed' || eye === 'both_closed' || state === 'eyes_closed_both' || state === 'eyes_closed_single') {
            markActionDone('blink')
          }

          addCaptureSample(dataUrl)
          const cur = actionDoneRef.current
          const doneCount = Object.values({
            ...cur,
            front: cur.front || true,
            left: cur.left || state === 'looking_left',
            right: cur.right || state === 'looking_right',
            mouth: cur.mouth || state === 'mouth_open' || state === 'talking',
            blink: cur.blink || eye === 'single_closed' || eye === 'both_closed' || state === 'eyes_closed_both' || state === 'eyes_closed_single',
          }).filter(Boolean).length
          setDetectStatus(`✅ 已采集动作 ${doneCount}/5（正视/眨眼/张嘴/左转/右转）`)
          if (doneCount >= 5 && capturedSamples.length >= 4) {
            setTimeout(handleAutoCapture, 300)
          }
        } else {
          setDetectStatus('⏳ 请将脸部对准框内，并按提示完成动作采样')
        }
      } catch (err: any) {
        console.warn('[FaceReg] 检测请求失败:', err?.message || err)
        setDetectStatus('检测连接异常，可直接点击"立即拍摄"')
      }
    }, DETECT_INTERVAL_MS)
  }

  const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480
    canvas.width = vw
    canvas.height = vh
    ctx.drawImage(video, 0, 0, vw, vh)

    const imageData = canvas.toDataURL('image/jpeg', CAPTURE_QUALITY)
    if (!imageData || imageData.length < 1000) return null
    return imageData
  }, [])

  const captureBurstSamples = useCallback(async (count: number) => {
    const imgs: string[] = []
    for (let i = 0; i < count; i++) {
      const img = captureFrame()
      if (img) {
        imgs.push(img)
      }
      if (i < count - 1) {
        await waitMs(BURST_CAPTURE_INTERVAL_MS)
      }
    }
    if (imgs.length > 0) {
      imgs.forEach((img) => addCaptureSample(img))
      setCapturedImage((prev) => prev || imgs[0])
      setDetectStatus(`已连续采样 ${imgs.length} 帧`)
    }
    return imgs
  }, [addCaptureSample, captureFrame])

  const handleAutoCapture = async () => {
    if (detectTimerRef.current) {
      clearInterval(detectTimerRef.current)
      detectTimerRef.current = null
    }
    await handleCapture()
  }

  const handleCapture = async () => {
    if (detectTimerRef.current) {
      clearInterval(detectTimerRef.current)
      detectTimerRef.current = null
    }
    if (!videoRef.current || !canvasRef.current) {
      message.error('摄像头未就绪，请重新开始')
      return
    }

    const first = captureFrame()
    if (!first) {
      message.error('拍摄失败，请保持画面稳定后重试')
      return
    }

    addCaptureSample(first)
    setCapturedImage(first)
    const extra = await captureBurstSamples(BURST_CAPTURE_COUNT - 1)
    console.log(`[FaceReg] 连拍完成: 首帧+额外${extra.length}帧`)

    stopCamera()
    setIsCapturing(false)
    setCurrentStep(2)
    setDetectStatus('照片已捕获并完成多帧采样')
  }

  const handleSave = async () => {
    if (!capturedImage || !selectedStudent) {
      message.warning('请先拍摄照片')
      return
    }

    if (capturedSamples.length < MIN_ENROLL_SAMPLES) {
      message.warning(`当前仅采样 ${capturedSamples.length} 张，建议至少 ${MIN_ENROLL_SAMPLES} 张后再保存，以提高识别准确率`)
      return
    }

    setSaving(true)

    try {
      console.log(`[FaceReg] ===== 开始提交注册 =====`)
      console.log(`[FaceReg] 学生: ${selectedStudent.name} (ID: ${selectedStudent.id})`)
      console.log(`[FaceReg] 图片大小: ${capturedImage.length} bytes`)
      console.log(`[FaceReg] Token: ${localStorage.getItem('token')?.substring(0, 25)}...`)
      const images = Array.from(new Set([...capturedSamples, capturedImage].filter(Boolean))).slice(0, 8)
      const result = await registerFace(selectedStudent.id, images.length > 1 ? images : capturedImage)

      console.log(`[FaceReg] ===== 注册成功 =====`)
      console.log(`[FaceReg] 响应:`, result)

      message.success(
        `${selectedStudent.name} 的人脸录入成功！特征维度 ${result.featureCount}，模板 ${result.templateCount ?? result.sampleCount ?? images.length} 组`,
        5
      )

      await loadStudents(selectedClassId)
      resetState()
    } catch (err: any) {
      console.error(`[FaceReg] ===== 注册失败 =====`)
      console.error(`[FaceReg] 完整错误对象:`, err)

      const errMsg = err?.error || err?.message || JSON.stringify(err) || '未知错误'

      if (typeof errMsg === 'string' && errMsg.includes('未检测到有效人脸')) {
        message.error('照片中未检测到清晰人脸。建议：面部正对、光线充足、距离适中', 6)
      } else if (err?.code === 401) {
        message.error('登录已过期，即将跳转到登录页面...', 5)
        setTimeout(() => window.location.href = '/login', 2000)
      } else if (err?.code === 404) {
        message.error('学生数据不存在，请刷新页面重试')
      } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('Network request failed') || errMsg.includes('fetch')) {
        message.error('网络连接失败！请确认后端服务运行在 http://127.0.0.1:5000', 6)
      } else if (err?.code && err?.code >= 500) {
        message.error(`服务器内部错误(${err.code})，请查看后端日志`, 5)
      } else {
        message.error(`录入失败: ${errMsg}`, 8)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRetake = () => {
    setCapturedImage(null)
    setCapturedSamples([])
    setCurrentStep(1)
    setCaptureProgress(0)
    setFaceDetected(false)
    setDetectStatus('重新拍摄中...')
    setTimeout(() => handleStartCapture(), 300)
  }

  const handleDeleteFace = async (student: Student) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除 ${student.name} 的人脸数据吗？删除后该学生将无法被自动识别。`,
      onOk: async () => {
        try {
          await deleteFace(student.id)
          message.success(`${student.name} 的人脸数据已删除`)
          await loadStudents(selectedClassId)
          if (selectedStudent?.id === student.id) {
            setSelectedStudent(null)
            setCurrentStep(0)
          }
        } catch (err: any) {
          message.error(err?.error || '删除失败')
        }
      },
    })
  }

  const resetState = () => {
    setCurrentStep(0)
    setCapturedImage(null)
    setSelectedStudent(null)
    setCaptureProgress(0)
    setFaceDetected(false)
    setDetectStatus('等待开始')
  }

  const filteredStudents = selectedClassId
    ? students.filter((s) => s.classId === selectedClassId)
    : students

  const unregisteredStudents = filteredStudents.filter((s) => !s.faceRegistered)
  const registeredStudents = filteredStudents.filter((s) => s.faceRegistered)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="人脸录入说明"
          description={'1. 选择班级 → 2. 选择学生 → 3. 点击「开始录入」→ 4. 对准摄像头 → 5. 自动/手动拍照 → 6. 确认保存'}
          type="info"
          showIcon
          closable
        />
      </div>
      <Row gutter={24}>
        <Col span={8}>
          <Card
            title="选择学生"
            extra={
              <Select
                placeholder="选择班级"
                style={{ width: 150 }}
                allowClear
                onChange={setSelectedClassId}
                value={selectedClassId || undefined}
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
            }
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
                <div style={{ marginTop: 16, color: '#999' }}>加载学生数据...</div>
              </div>
            ) : (
              <div style={{ maxHeight: 600, overflow: 'auto' }}>
                <Divider orientation="left">
                  <Badge count={unregisteredStudents.length} showZero>
                    <Tag color="warning">待录入</Tag>
                  </Badge>
                </Divider>
                <List
                  dataSource={unregisteredStudents}
                  locale={{ emptyText: '所有学生已完成录入' }}
                  renderItem={(student) => (
                    <List.Item
                      style={{
                        cursor: 'pointer',
                        backgroundColor:
                          selectedStudent?.id === student.id ? '#e6f7ff' : 'transparent',
                      }}
                      onClick={() => {
                        setSelectedStudent(student)
                        setCurrentStep(0)
                      }}
                    >
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} />}
                        title={student.name}
                        description={`学号: ${student.studentId}`}
                      />
                      {selectedStudent?.id === student.id && (
                        <CheckCircleOutlined style={{ color: '#1890ff' }} />
                      )}
                    </List.Item>
                  )}
                />

                <Divider orientation="left">
                  <Badge count={registeredStudents.length} showZero>
                    <Tag color="success">已录入</Tag>
                  </Badge>
                </Divider>
                <List
                  dataSource={registeredStudents}
                  locale={{ emptyText: '暂无已录入学生' }}
                  renderItem={(student) => (
                    <List.Item
                      actions={[
                        <Button
                          key="delete"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDeleteFace(student)}
                        >
                          删除
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} style={{ background: '#52c41a' }} />}
                        title={
                          <Space>
                            {student.name}
                            <Tag color="success" icon={<CheckCircleOutlined />}>
                              已录入
                            </Tag>
                          </Space>
                        }
                        description={`学号: ${student.studentId}`}
                      />
                    </List.Item>
                  )}
                />
              </div>
            )}
          </Card>
        </Col>

        <Col span={16}>
          <Card title="人脸录入">
            <Steps current={currentStep} style={{ marginBottom: 24 }}>
              <Step title="选择学生" icon={<UserOutlined />} />
              <Step title="拍摄人脸" icon={<CameraOutlined />} />
              <Step title="确认保存" icon={<SaveOutlined />} />
            </Steps>

            {currentStep === 0 && (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <UserOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
                <Title level={4} style={{ marginTop: 16, color: '#999' }}>
                  请从左侧选择要录入人脸的学生
                </Title>
                {selectedStudent && (
                  <Alert
                    message={`已选择: ${selectedStudent.name} (${selectedStudent.studentId})`}
                    type="info"
                    showIcon
                    style={{ marginTop: 16, maxWidth: 450, margin: '16px auto' }}
                    action={
                      <Button type="primary" onClick={handleStartCapture}>
                        开始录入
                      </Button>
                    }
                  />
                )}
              </div>
            )}

            {currentStep === 1 && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Space>
                    <Button
                      icon={<CameraOutlined />}
                      type={!uploadMode ? 'primary' : 'default'}
                      onClick={() => setUploadMode(false)}
                    >
                      摄像头拍摄
                    </Button>
                    <Button
                      icon={<UploadOutlined />}
                      type={uploadMode ? 'primary' : 'default'}
                      onClick={() => {
                        setUploadMode(true)
                        stopCamera()
                        setIsCapturing(false)
                        if (detectTimerRef.current) clearInterval(detectTimerRef.current)
                        fileInputRef.current?.click()
                      }}
                    >
                      上传照片
                    </Button>
                  </Space>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                </div>

                {!uploadMode && (
                  <>
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: 400,
                        backgroundColor: '#000',
                        borderRadius: 8,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transform: 'scaleX(-1)',
                        }}
                      />

                      {!isCapturing && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)',
                            flexDirection: 'column',
                            gap: 12,
                          }}
                        >
                          <LoadingOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                          <Typography.Text style={{ color: '#fff', fontSize: 15 }}>{detectStatus}</Typography.Text>
                        </div>
                      )}

                      <canvas ref={canvasRef} style={{ visibility: 'hidden', position: 'absolute' }} />
                    </div>
                    <div style={{ marginTop: 12, textAlign: 'center' }}>
                      <Progress percent={captureProgress} status={faceDetected ? 'active' : 'normal'} />
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>{detectStatus}</Typography.Text>
                    </div>
                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#f7fbff', border: '1px solid #d9ecff' }}>
                      <div style={{ marginBottom: 8, fontSize: 13, color: '#445' }}>
                        当前建议动作：<strong>{nextActionHint}</strong>
                      </div>
                      <Space wrap size={[8, 8]}>
                        {actionItems.map((item) => (
                          <Tag key={item.key} color={actionDone[item.key] ? 'success' : 'default'}>
                            {actionDone[item.key] ? '✓' : '…'} {item.label}
                          </Tag>
                        ))}
                        <Tag color="blue">样本数 {capturedSamples.length}</Tag>
                      </Space>
                    </div>
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <Space>
                        <Button onClick={() => handleCapture()}>立即拍照</Button>
                        <Button danger onClick={() => { stopCamera(); if (detectTimerRef.current) clearInterval(detectTimerRef.current); setIsCapturing(false); setCurrentStep(0); setCaptureProgress(0); }}>
                          取消
                        </Button>
                      </Space>
                    </div>
                  </>
                )}

                {uploadMode && (
                  <div style={{ textAlign: 'center', padding: 48 }}>
                    <PictureOutlined style={{ fontSize: 64, color: '#1890ff' }} />
                    <Title level={4} style={{ marginTop: 16 }}>请选择一张清晰的人脸照片</Title>
                    <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                      支持 JPG、PNG 格式，建议照片中面部正对、光线充足
                    </Typography.Text>
                    <Button
                      type="primary"
                      size="large"
                      icon={<UploadOutlined />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      选择照片上传
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                    />
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && capturedImage && (
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 640,
                    height: 480,
                    margin: '0 auto',
                    border: '3px solid #52c41a',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={capturedImage}
                    alt="Captured face"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                  />
                </div>

                <canvas ref={canvasRef} style={{ display: 'none' }} />

                <Space style={{ marginTop: 24 }} size="large">
                  <Button
                    size="large"
                    icon={<ReloadOutlined />}
                    onClick={handleRetake}
                    disabled={saving}
                  >
                    重新拍摄
                  </Button>
                  <Button
                    size="large"
                    type="primary"
                    icon={saving ? <LoadingOutlined /> : <SaveOutlined />}
                    onClick={handleSave}
                    loading={saving}
                  >
                    {saving ? '正在提取特征并保存...' : '确认保存'}
                  </Button>
                </Space>

                <Alert
                  message="准备就绪"
                  description={`${selectedStudent?.name || ''} 的照片已采集完毕（样本数: ${capturedSamples.length || 1}），点击"确认保存"将提取增强特征并存入数据库`}
                  type="success"
                  showIcon
                  style={{ marginTop: 20, maxWidth: 640, margin: '20px auto' }}
                />
                <Alert
                  message="动作采样说明"
                  description={`正视:${actionDone.front ? '✅' : '❌'} 眨眼:${actionDone.blink ? '✅' : '❌'} 张嘴:${actionDone.mouth ? '✅' : '❌'} 左转:${actionDone.left ? '✅' : '❌'} 右转:${actionDone.right ? '✅' : '❌'}`}
                  type="info"
                  showIcon
                  style={{ marginTop: 10, maxWidth: 640, margin: '10px auto' }}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default FaceRegister
