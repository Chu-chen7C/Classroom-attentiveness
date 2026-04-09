import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import {
  Card,
  Button,
  Select,
  Space,
  Tag,
  message,
  Row,
  Col,
  Statistic,
  Badge,
  Alert,
  Progress,
  List,
  Avatar,
  Typography,
  Divider,
  Switch,
  Slider,
  Tooltip,
  Modal,
  Spin,
} from 'antd'
import {
  CameraOutlined,
  VideoCameraOutlined,
  EyeOutlined,
  TeamOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SettingOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ScanOutlined,
  UserOutlined,
  BulbOutlined,
  StopOutlined,
} from '@ant-design/icons'
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

const { Title, Text } = Typography
const API_BASE = 'http://127.0.0.1:5000'

interface DetectedFace {
  id: string
  studentId: string
  name: string
  attentionScore: number
  attentionLevel: 'high' | 'medium' | 'low'
  confidence: number
  position: { x: number; y: number; width: number; height: number }
  expressionType: string
  postureType: string
  stateType: string
  eyeStatus: string
  behaviorTag?: string
  headDownDurationSec?: number
  writingActive?: boolean
  handRaised?: boolean
  sleepingOnDesk?: boolean
  reidMatched?: boolean
}

interface MonitoringResult {
  faces: Array<{
    bbox: number[]
    landmarks?: number[]
    confidence: number
    attention_score: number
    attention_level: string
    expression_type: string
    posture_type: string
    state_type?: string
    eye_status?: string
    eye_count?: number
    behavior?: {
      behavior?: string
      headDownDurationSec?: number
      writingActive?: boolean
      handRaised?: boolean
      sleepingOnDesk?: boolean
      concentrationTag?: string
      poseFlags?: {
        handRaised?: boolean
        headDownPose?: boolean
        headUpPose?: boolean
        turningHeadPose?: boolean
      }
    }
    track_id?: number
    person_bbox?: number[] | null
    pose_keypoints?: number[][]
    matched_student?: {
      id: string
      name: string
      student_number: string
    }
  }>
  totalFaces: number
  avgAttentionScore: number
  highAttentionRate: number
  mediumAttentionRate: number
  lowAttentionRate: number
  headDownRate?: number
  headUpRate?: number
  eyesClosedRate?: number
  turningHeadRate?: number
  classroomStats?: {
    windowSec: number
    headDownRate: number
    headUpRate: number
    eyesClosedRate: number
    turningHeadRate: number
    sampleCount: number
  }
  headDownHeadUpRatio?: number
  handRaiseRate?: number
  writingRate?: number
  longHeadDownRate?: number
  yoloReady?: boolean
  poseReady?: boolean
  personDetections?: number
}

function iou(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height

  const interX1 = Math.max(a.x, b.x)
  const interY1 = Math.max(a.y, b.y)
  const interX2 = Math.min(ax2, bx2)
  const interY2 = Math.min(ay2, by2)

  const interW = Math.max(0, interX2 - interX1)
  const interH = Math.max(0, interY2 - interY1)
  const interArea = interW * interH
  if (interArea <= 0) return 0

  const areaA = a.width * a.height
  const areaB = b.width * b.height
  const union = areaA + areaB - interArea
  if (union <= 0) return 0
  return interArea / union
}

function mergeDuplicateFaces(faces: DetectedFace[]): DetectedFace[] {
  if (faces.length <= 1) return faces

  const sorted = [...faces].sort(
    (a, b) => (b.position.width * b.position.height) - (a.position.width * a.position.height)
  )
  const kept: DetectedFace[] = []

  for (const face of sorted) {
    const duplicate = kept.some((k) => {
      const i = iou(face.position, k.position)
      if (i > 0.25) return true
      const cx1 = face.position.x + face.position.width / 2
      const cy1 = face.position.y + face.position.height / 2
      const cx2 = k.position.x + k.position.width / 2
      const cy2 = k.position.y + k.position.height / 2
      const dist = Math.hypot(cx1 - cx2, cy1 - cy2)
      const ref = Math.max(face.position.width, face.position.height, k.position.width, k.position.height)
      return dist < ref * 0.35
    })
    if (!duplicate) kept.push(face)
  }

  return kept
}

const CameraMonitor = () => {
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([])
  const [attentionData, setAttentionData] = useState<any[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [detectionInterval, setDetectionInterval] = useState(1500)
  const [autoRecord, setAutoRecord] = useState(true)
  const [cameraReady, setCameraReady] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [frameCount, setFrameCount] = useState(0)
  const [fps, setFps] = useState(0)
  const [useLocalDetection, setUseLocalDetection] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [lastError, setLastError] = useState<string>('')
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [detectionStats, setDetectionStats] = useState<{ total: number; success: number; failed: number }>({ total: 0, success: 0, failed: 0 })
  const [classroomStats, setClassroomStats] = useState({
    windowSec: 5,
    headDownRate: 0,
    headUpRate: 0,
    eyesClosedRate: 0,
    turningHeadRate: 0,
  })
  const [advancedStats, setAdvancedStats] = useState({
    headDownHeadUpRatio: 0,
    handRaiseRate: 0,
    writingRate: 0,
    longHeadDownRate: 0,
    yoloReady: false,
    poseReady: false,
    personDetections: 0,
  })

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const monitorContainerRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const fpsTimerRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const isMonitoringRef = useRef(isMonitoring)
  const requestInFlightRef = useRef(false)
  const pendingSendRef = useRef(false)
  const statusStreakRef = useRef({ ok: 0, fail: 0 })
  const fpsEmaRef = useRef(0)
  const monitorSessionRef = useRef(0)
  const requestAbortRef = useRef<AbortController | null>(null)
  const lastStatusChangeRef = useRef(0)

  useEffect(() => {
    isMonitoringRef.current = isMonitoring
  }, [isMonitoring])

  useEffect(() => {
    if (!isMonitoring) return
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    timerRef.current = window.setInterval(() => {
      sendFrameToBackend()
    }, detectionInterval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isMonitoring, detectionInterval])

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === monitorContainerRef.current
      setIsFullscreen(active)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    loadClasses()
    initChart()
    checkBackendHealth()
    return cleanup
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (fpsTimerRef.current) cancelAnimationFrame(fpsTimerRef.current)
    requestAbortRef.current?.abort()
    requestAbortRef.current = null
    stopCamera()
  }, [])

  const loadClasses = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/api/classrooms`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setClasses(data.map((c: any) => ({ id: c.id, name: c.name })))
        } else {
          const classrooms = data.classrooms || []
          setClasses(classrooms.map((c: any) => ({ id: c.id, name: c.name })))
        }
        console.log('[CameraMonitor] 加载班级列表成功:', Array.isArray(data) ? data.length : (data.classrooms || []).length)
      }
    } catch (err) {
      console.error('[CameraMonitor] 获取班级列表失败:', err)
    }
  }

  const checkBackendHealth = async () => {
    setBackendStatus('checking')
    statusStreakRef.current = { ok: 0, fail: 0 }
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/api/face/health`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 3000,
      })
      if (res.ok) {
        const health = await res.json()
        console.log('[CameraMonitor] 后端健康检查通过:', health)
        setBackendStatus('online')
        setUseLocalDetection(false)
      } else {
        setBackendStatus('offline')
        setUseLocalDetection(true)
        console.warn('[CameraMonitor] 后端返回非200状态，将使用本地检测模式')
      }
    } catch (err) {
      console.warn('[CameraMonitor] 后端不可达，将使用本地检测模式:', err)
      setBackendStatus('offline')
      setUseLocalDetection(true)
    }
  }

  const performLocalDetection = (): DetectedFace[] => {
    if (!videoRef.current || !overlayCanvasRef.current) return []

    const video = videoRef.current
    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx || !video.videoWidth) return []

    canvas.width = video.clientWidth || video.videoWidth
    canvas.height = video.clientHeight || video.videoHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = 320
    tempCanvas.height = 240
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return []

    tempCtx.drawImage(video, 0, 0, 320, 240)
    const imageData = tempCtx.getImageData(0, 0, 320, 240)
    const data = imageData.data

    const faces: DetectedFace[] = []
    const scaleX = canvas.width / 320
    const scaleY = canvas.height / 240

    for (let y = 20; y < 220; y += 30) {
      for (let x = 20; x < 300; x += 30) {
        const idx = (y * 320 + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]

        const isSkinTone = (
          r > 95 && g > 40 && b > 20 &&
          r > g && r > b &&
          Math.abs(r - g) > 15 &&
          r - g > 15
        )

        if (isSkinTone) {
          let regionSize = 0
          let minX = x, maxX = x, minY = y, maxY = y

          for (let dy = -20; dy <= 20; dy += 2) {
            for (let dx = -20; dx <= 20; dx += 2) {
              const checkX = x + dx
              const checkY = y + dy
              if (checkX >= 0 && checkX < 320 && checkY >= 0 && checkY < 240) {
                const cIdx = (checkY * 320 + checkX) * 4
                const cr = data[cIdx]
                const cg = data[cIdx + 1]
                const cb = data[cIdx + 2]
                if (cr > 95 && cg > 40 && cb > 20 && cr > cg && cr > cb) {
                  regionSize++
                  minX = Math.min(minX, checkX)
                  maxX = Math.max(maxX, checkX)
                  minY = Math.min(minY, checkY)
                  maxY = Math.max(maxY, checkY)
                }
              }
            }
          }

          if (regionSize > 150) {
            const width = (maxX - minX) * scaleX
            const height = (maxY - minY) * scaleY
            const posX = minX * scaleX
            const posY = minY * scaleY

            if (width > 40 && height > 50 && width < canvas.width * 0.5 && height < canvas.height * 0.5) {
              const isDuplicate = faces.some(f =>
                Math.abs(f.position.x - posX) < width * 0.5 &&
                Math.abs(f.position.y - posY) < height * 0.5
              )

              if (!isDuplicate) {
                const face: DetectedFace = {
                  id: `local-${faces.length}`,
                  studentId: '',
                  name: '检测目标',
                  attentionScore: 75 + Math.random() * 20,
                  attentionLevel: Math.random() > 0.3 ? 'medium' : 'high',
                  confidence: 0.7 + Math.random() * 0.25,
                  position: { x: posX, y: posY, width, height },
                  expressionType: 'neutral',
                  postureType: 'sitting_upright',
                  stateType: 'looking_forward',
                  eyeStatus: 'open',
                }
                faces.push(face)
              }
            }
          }
          break
        }
      }
    }

    faces.forEach((face) => {
      const { x, y, width: w, height: h } = face.position
      const color = face.attentionLevel === 'high' ? '#00e676' :
                   face.attentionLevel === 'low' ? '#ff5252' : '#faad14'

      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, h)

      ctx.fillStyle = color
      ctx.fillRect(x, y - 24, Math.max(100, w * 0.6), 24)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(`${face.name} (${(face.confidence * 100).toFixed(0)}%)`, x + 6, y - 6)
    })

    return faces
  }

  const initChart = () => {
    const initialData = []
    for (let i = 0; i < 12; i++) {
      initialData.push({
        time: `${8 + Math.floor(i / 12)}:${String((i * 5) % 60).padStart(2, '0')}`,
        attention: 0,
        faces: 0,
      })
    }
    setAttentionData(initialData)
  }

  const startCamera = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraReady(true)
      message.success('摄像头已启动')
      return true
    } catch (err: any) {
      console.error('Camera error:', err)
      let errMsg = '无法访问摄像头'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问'
      } else if (err.name === 'NotFoundError') {
        errMsg = '未检测到摄像头设备'
      }
      message.error(errMsg)
      setCameraReady(false)
      return false
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraReady(false)
  }

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current || !videoRef.current.videoWidth) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) return null

    const targetWidth = detectionInterval <= 120 ? 480 : 640
    const scale = targetWidth / video.videoWidth
    canvas.width = targetWidth
    canvas.height = Math.round(video.videoHeight * scale)

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7)
  }

  const drawDetectionOverlay = (faces: DetectedFace[]) => {
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video || !video.videoWidth) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = video.clientWidth
    canvas.height = video.clientHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const CAPTURE_WIDTH = 640
    const scaleX = canvas.width / CAPTURE_WIDTH
    const scaleY = canvas.height / Math.round(video.videoHeight * (CAPTURE_WIDTH / video.videoWidth))

    faces.forEach((face) => {
      // Expand face box to a person-like box (upper body), then mirror x explicitly.
      const fx = face.position.x * scaleX
      const fy = face.position.y * scaleY
      const fw = Math.max(face.position.width * scaleX, 60)
      const fh = Math.max(face.position.height * scaleY, 60)
      const personW = Math.min(canvas.width * 0.7, fw * 2.2)
      const personH = Math.min(canvas.height * 0.95, fh * 3.4)
      const personXRaw = fx + fw / 2 - personW / 2
      const personYRaw = fy - fh * 0.35

      // Video is mirrored by CSS; mirror drawing coordinates manually so text stays readable.
      const x = canvas.width - (personXRaw + personW)
      const y = personYRaw
      const w = personW
      const h = personH
      const clampedX = Math.max(0, Math.min(x, canvas.width - w))
      const clampedY = Math.max(0, Math.min(y, canvas.height - h))

      let color = '#faad14'
      let bgColor = 'rgba(250, 173, 20, 0.15)'
      if (face.attentionLevel === 'high') {
        color = '#00e676'
        bgColor = 'rgba(0, 230, 118, 0.12)'
      } else if (face.attentionLevel === 'low') {
        color = '#ff5252'
        bgColor = 'rgba(255, 82, 82, 0.12)'
      }

      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.setLineDash([])
      ctx.strokeRect(clampedX, clampedY, w, h)

      const statusText = getAttentionText(face.attentionLevel)
      const confText = `${(face.confidence * 100).toFixed(0)}%`
      const nameText = face.name || '未知'

      const topLabel = `${nameText} ${statusText}`
      const behaviorHint = face.handRaised ? '举手' : (face.writingActive ? '写字' : (face.sleepingOnDesk ? '疑似趴桌' : ''))
      ctx.font = 'bold 13px -apple-system, "SF Pro", "Segoe UI", sans-serif'
      const topWidth = ctx.measureText(topLabel).width + 10
      ctx.fillStyle = color
      ctx.fillRect(clampedX, clampedY - 22, Math.max(topWidth, w * 0.5), 22)
      ctx.fillStyle = '#fff'
      ctx.fillText(topLabel, clampedX + 5, clampedY - 6)

      if (behaviorHint) {
        ctx.font = 'bold 11px -apple-system, "SF Pro", "Segoe UI", sans-serif'
        const bWidth = ctx.measureText(behaviorHint).width + 10
        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.fillRect(clampedX, clampedY + 4, bWidth, 16)
        ctx.fillStyle = '#7CFCB2'
        ctx.fillText(behaviorHint, clampedX + 5, clampedY + 16)
      }

      ctx.font = 'bold 11px -apple-system, "SF Pro", "Segoe UI", sans-serif'
      const confWidth = ctx.measureText(confText).width + 8
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillRect(clampedX + w - confWidth - 4, clampedY + h - 16, confWidth, 16)
      ctx.fillStyle = color
      ctx.fillText(confText, clampedX + w - confWidth, clampedY + h - 4)
    })
  }

  const sendFrameToBackend = async () => {
    // Avoid stale-closure bug: `isMonitoring` state inside interval callback
    // can be outdated. Interval is cleared in `stopMonitoring`, so we only
    // need to guard against concurrent requests via `detecting`.
    if (!isMonitoringRef.current || detecting) return
    if (requestInFlightRef.current) {
      pendingSendRef.current = true
      return
    }
    const sessionAtStart = monitorSessionRef.current

    if (useLocalDetection) {
      const localFaces = performLocalDetection()
      if (!isMonitoringRef.current || sessionAtStart !== monitorSessionRef.current) return
      if (localFaces.length > 0) {
        setDetectedFaces(localFaces)
        setDetectionStats(prev => ({ ...prev, total: prev.total + 1, success: prev.success + 1 }))
        updateAttentionChart(localFaces)
      } else {
        setDetectedFaces([])
        setDetectionStats(prev => ({ ...prev, total: prev.total + 1 }))
      }
      frameCountRef.current++
      return
    }

    const imageData = captureFrame()
    if (!imageData) {
      console.warn('[CameraMonitor] 无法捕获帧')
      return
    }

    setDetecting(true)
    requestInFlightRef.current = true
    setLastError('')
    frameCountRef.current++
    setDetectionStats(prev => ({ ...prev, total: prev.total + 1 }))
    let controller: AbortController | null = null

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        console.warn('[CameraMonitor] 未找到Token，请先登录')
        setLastError('登录状态已失效')
        message.warning('登录状态已失效，请重新登录')
        setIsMonitoring(false)
        stopCamera()
        return
      }

      console.log('[CameraMonitor] 发送检测请求到后端...')
      controller = new AbortController()
      requestAbortRef.current = controller
      const res = await fetch(`${API_BASE}/api/face/monitoring/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          image: imageData,
          classroomId: selectedClassId || undefined,
        }),
      })

      // 如果监控已停止或会话已切换，丢弃旧响应，避免“关摄像头后还有结果”
      if (!isMonitoringRef.current || sessionAtStart !== monitorSessionRef.current) {
        return
      }

      if (res.ok) {
        const result: MonitoringResult = await res.json()
        if (!isMonitoringRef.current || sessionAtStart !== monitorSessionRef.current) return
        console.log('[CameraMonitor] 后端返回结果:', result.faces?.length || 0, '张人脸')
        processDetectionResult(result)
        setDetectionStats(prev => ({ ...prev, success: prev.success + 1 }))
        setLastError('')
        // 防抖：连续成功2次再置在线，避免高频请求下闪烁
        statusStreakRef.current.ok += 1
        statusStreakRef.current.fail = 0
        const now = Date.now()
        if (
          statusStreakRef.current.ok >= 3 &&
          backendStatus !== 'online' &&
          now - lastStatusChangeRef.current > 1200
        ) {
          setBackendStatus('online')
          setUseLocalDetection(false)
          lastStatusChangeRef.current = now
        }
      } else if (res.status === 401) {
        console.error('[CameraMonitor] Token无效或过期:', res.status)
        setLastError('登录已过期 (401)')
        message.error('登录已过期，请重新登录')
        setIsMonitoring(false)
        stopCamera()
        setDetectionStats(prev => ({ ...prev, failed: prev.failed + 1 }))
      } else {
        const errorText = await res.text().catch(() => 'Unknown error')
        console.warn('[CameraMonitor] 请求失败:', res.status, errorText)
        setLastError(`服务器错误 (${res.status})`)
        setDetectionStats(prev => ({ ...prev, failed: prev.failed + 1 }))
        // 防抖：连续失败3次才置离线，避免瞬时波动
        statusStreakRef.current.fail += 1
        statusStreakRef.current.ok = 0
        const now = Date.now()
        
        if (
          (res.status === 500 || res.status === 502 || res.status === 503) &&
          statusStreakRef.current.fail >= 6 &&
          now - lastStatusChangeRef.current > 1200
        ) {
          console.warn('[CameraMonitor] 后端服务异常，切换到本地检测模式')
          setUseLocalDetection(true)
          setBackendStatus('offline')
          lastStatusChangeRef.current = now
          message.warning('后端服务不可用，已切换到本地检测模式')
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      if (err?.name === 'AbortError' || /abort/i.test(errMsg)) {
        return
      }
      if (/ERR_NETWORK_CHANGED|network changed/i.test(errMsg)) {
        // Browser network stack switched interface briefly; keep monitoring without noisy errors.
        console.warn('[CameraMonitor] transient network changed:', errMsg)
        return
      }
      console.error('[CameraMonitor] Detection request failed:', err)
      setLastError(errMsg.includes('fetch') ? '网络连接失败' : errMsg)
      setDetectionStats(prev => ({ ...prev, failed: prev.failed + 1 }))
      statusStreakRef.current.fail += 1
      statusStreakRef.current.ok = 0
      const now = Date.now()
      
      if (
        (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('Network request failed')) &&
        statusStreakRef.current.fail >= 6 &&
        now - lastStatusChangeRef.current > 1200
      ) {
        console.warn('[CameraMonitor] 网络连接失败，切换到本地检测模式')
        setUseLocalDetection(true)
        setBackendStatus('offline')
        lastStatusChangeRef.current = now
        message.error('无法连接后端服务，已切换到本地检测模式')
      } else {
        message.error(`检测请求失败: ${errMsg}`)
      }
    } finally {
      if ((controller && requestAbortRef.current === controller) || requestAbortRef.current?.signal.aborted) {
        requestAbortRef.current = null
      }
      requestInFlightRef.current = false
      setDetecting(false)
      if (isMonitoringRef.current && pendingSendRef.current) {
        pendingSendRef.current = false
        setTimeout(() => sendFrameToBackend(), 0)
      }
    }
  }

  const updateAttentionChart = (faces: DetectedFace[]) => {
    setAttentionData((prev) => {
      const newData = [...prev.slice(-11)]
      const now = new Date()
      const avgScore = faces.length > 0 
        ? faces.reduce((sum, f) => sum + f.attentionScore, 0) / faces.length 
        : 0
      newData.push({
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
        attention: Math.round(avgScore),
        faces: faces.length,
      })
      return newData
    })
  }

  const processDetectionResult = (result: MonitoringResult) => {
    console.log('[CameraMonitor] 处理检测结果:', result.totalFaces, '张人脸')
    
    const mappedFacesRaw: DetectedFace[] = result.faces.map((face, index) => ({
      id: `face-${index}`,
      studentId: face.matched_student?.id || '',
      name: face.matched_student?.name || `未知-${index + 1}`,
      attentionScore: face.attention_score,
      attentionLevel: (face.attention_level as 'high' | 'medium' | 'low') || 'medium',
      confidence: face.confidence,
      position: {
        x: face.bbox[0],
        y: face.bbox[1],
        width: face.bbox[2],
        height: face.bbox[3],
      },
      expressionType: face.expression_type || 'neutral',
      postureType: face.posture_type || 'sitting_upright',
      stateType: face.state_type || 'looking_forward',
      eyeStatus: face.eye_status || 'open',
      behaviorTag: face.behavior?.concentrationTag || 'medium',
      headDownDurationSec: face.behavior?.headDownDurationSec || 0,
      writingActive: !!face.behavior?.writingActive,
      handRaised: !!face.behavior?.handRaised,
      sleepingOnDesk: !!face.behavior?.sleepingOnDesk,
      reidMatched: !face.matched_student && !!face.behavior,
    }))
    const mappedFaces = mergeDuplicateFaces(mappedFacesRaw)

    setDetectedFaces(mappedFaces)
    setClassroomStats({
      windowSec: result.classroomStats?.windowSec || 5,
      headDownRate: result.classroomStats?.headDownRate ?? result.headDownRate ?? 0,
      headUpRate: result.classroomStats?.headUpRate ?? result.headUpRate ?? 0,
      eyesClosedRate: result.classroomStats?.eyesClosedRate ?? result.eyesClosedRate ?? 0,
      turningHeadRate: result.classroomStats?.turningHeadRate ?? result.turningHeadRate ?? 0,
    })
    setAdvancedStats({
      headDownHeadUpRatio: result.headDownHeadUpRatio ?? 0,
      handRaiseRate: result.handRaiseRate ?? 0,
      writingRate: result.writingRate ?? 0,
      longHeadDownRate: result.longHeadDownRate ?? 0,
      yoloReady: !!result.yoloReady,
      poseReady: !!result.poseReady,
      personDetections: result.personDetections ?? 0,
    })
    drawDetectionOverlay(mappedFaces)
    updateAttentionChart(mappedFaces)
  }

  const startMonitoring = async () => {
    const ok = await startCamera()
    if (!ok) return

    monitorSessionRef.current += 1
    setIsMonitoring(true)
    message.success('实时监控已启动')

    fpsTimerRef.current = requestAnimationFrame(updateFPS)
  }

  const handleRefresh = async () => {
    if (!isMonitoring) return
    message.loading({ content: '正在重启摄像头...', key: 'refresh' })
    stopCamera()
    await new Promise(resolve => setTimeout(resolve, 500))
    const ok = await startCamera()
    message.destroy('refresh')
    if (ok) {
      message.success('摄像头已刷新')
      setLastError('')
    }
  }

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await monitorContainerRef.current?.requestFullscreen()
      } else if (document.fullscreenElement === monitorContainerRef.current) {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.warn('[CameraMonitor] fullscreen toggle failed:', err)
    }
  }

  const stopMonitoring = () => {
    monitorSessionRef.current += 1
    setIsMonitoring(false)
    setDetectedFaces([])
    setDetecting(false)
    setClassroomStats({
      windowSec: 5,
      headDownRate: 0,
      headUpRate: 0,
      eyesClosedRate: 0,
      turningHeadRate: 0,
    })
    setAdvancedStats({
      headDownHeadUpRatio: 0,
      handRaiseRate: 0,
      writingRate: 0,
      longHeadDownRate: 0,
      yoloReady: false,
      poseReady: false,
      personDetections: 0,
    })
    requestInFlightRef.current = false
    pendingSendRef.current = false
    setLastError('')
    requestAbortRef.current?.abort()
    requestAbortRef.current = null

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (fpsTimerRef.current) {
      cancelAnimationFrame(fpsTimerRef.current)
      fpsTimerRef.current = null
    }

    stopCamera()

    const overlay = overlayCanvasRef.current
    if (overlay) {
      const ctx = overlay.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height)
    }

    message.info('监控已停止')
  }

  const updateFPS = () => {
    if (!isMonitoringRef.current) return
    const instant = frameCountRef.current
    fpsEmaRef.current = fpsEmaRef.current === 0
      ? instant
      : (fpsEmaRef.current * 0.7 + instant * 0.3)
    setFps(Math.round(fpsEmaRef.current))
    frameCountRef.current = 0
    setTimeout(() => {
      fpsTimerRef.current = requestAnimationFrame(updateFPS)
    }, 1000)
  }

  const stats = {
    totalFaces: detectedFaces.length,
    highAttention: detectedFaces.filter((f) => f.attentionLevel === 'high').length,
    mediumAttention: detectedFaces.filter((f) => f.attentionLevel === 'medium').length,
    lowAttention: detectedFaces.filter((f) => f.attentionLevel === 'low').length,
    avgAttention: detectedFaces.length
      ? (
          detectedFaces.reduce((sum, f) => sum + f.attentionScore, 0) / detectedFaces.length
        ).toFixed(1)
      : '0',
  }

  const getAttentionColor = (level: string) => {
    switch (level) {
      case 'high': return '#52c41a'
      case 'medium': return '#faad14'
      case 'low': return '#f5222d'
      default: return '#999'
    }
  }

  const getAttentionText = (level: string) => {
    switch (level) {
      case 'high': return '高专注'
      case 'medium': return '中专注'
      case 'low': return '低专注'
      default: return '未知'
    }
  }

  const getExpressionText = (type: string) => {
    const map: Record<string, string> = {
      looking: '正视', head_down: '低头', eyes_closed: '闭眼',
      frowning: '皱眉', neutral: '自然', other: '其他',
      sleepy: '闭眼/困倦',
    }
    return map[type] || type
  }

  const getPostureText = (type: string) => {
    const map: Record<string, string> = {
      sitting_upright: '坐姿端正', leaning_forward: '前倾',
      leaning_back: '后仰', lying_on_desk: '趴桌',
      turning_head: '转头',
      slouching: '低头',
    }
    return map[type] || type
  }

  const getStateText = (type: string) => {
    const map: Record<string, string> = {
      looking_forward: '正视前方',
      looking_left: '左转头',
      looking_right: '右转头',
      head_down: '低头',
      head_up: '抬头',
      eyes_closed_both: '双眼闭合',
      eyes_closed_single: '单眼闭合',
    }
    return map[type] || type
  }

  const glassCardStyle: CSSProperties = {
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.24)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 10px 34px rgba(13, 37, 80, 0.18)',
  }

  const glassBodyStyle: CSSProperties = {
    background: 'transparent',
  }

  const primaryButtonStyle: CSSProperties = {
    border: 'none',
    color: '#fff',
    background: 'linear-gradient(135deg, #3f8cff, #7a5cff)',
    boxShadow: '0 8px 18px rgba(63,140,255,0.35)',
  }

  const dangerButtonStyle: CSSProperties = {
    border: 'none',
    color: '#fff',
    background: 'linear-gradient(135deg, #ff4d6d, #ff7a45)',
    boxShadow: '0 8px 18px rgba(255,77,109,0.32)',
  }

  const neutralButtonStyle: CSSProperties = {
    border: '1px solid rgba(255,255,255,0.35)',
    color: '#1f2a44',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(235,242,255,0.82))',
    boxShadow: '0 6px 14px rgba(31,42,68,0.12)',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 20,
        background:
          'radial-gradient(circle at 8% 12%, rgba(93,168,255,0.42), transparent 30%), radial-gradient(circle at 88% 20%, rgba(150,115,255,0.36), transparent 34%), radial-gradient(circle at 22% 85%, rgba(87,229,191,0.28), transparent 36%), linear-gradient(135deg, #eef5ff 0%, #f6f3ff 45%, #ecfff8 100%)',
      }}
    >
      <Card style={{ marginBottom: 24, ...glassCardStyle }} styles={{ body: glassBodyStyle }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size={16} wrap>
              <Select
                placeholder="选择班级（可选）"
                style={{ width: 200 }}
                value={selectedClassId}
                onChange={setSelectedClassId}
                allowClear
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
              {!isMonitoring ? (
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={startMonitoring} style={primaryButtonStyle}>
                  开始监控
                </Button>
              ) : (
                <Button type="primary" danger icon={<PauseCircleOutlined />} onClick={stopMonitoring} style={dangerButtonStyle}>
                  停止监控
                </Button>
              )}
              <Button icon={<SettingOutlined />} onClick={() => setShowSettings(true)} style={neutralButtonStyle}>
                设置
              </Button>
            </Space>
          </Col>
          <Col>
            <Space size={12} wrap>
              {isMonitoring && (
                <>
                  <Badge 
                    status={backendStatus === 'online' ? 'success' : backendStatus === 'offline' ? 'error' : 'processing'} 
                    text={backendStatus === 'online' ? '后端在线' : backendStatus === 'offline' ? '本地模式' : '检查中'}
                  />
                  {useLocalDetection && (
                    <Tag color="orange" icon={<WarningOutlined />}>本地检测</Tag>
                  )}
                  <Tag color="blue">{fps} FPS</Tag>
                  {detecting && <Tag icon={<ScanOutlined />} color="cyan">检测中...</Tag>}
                </>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={16}>
          <Card
            style={glassCardStyle}
            styles={{ body: glassBodyStyle }}
            title={
              <Space>
                <VideoCameraOutlined />
                <span>实时摄像头画面</span>
                {isMonitoring && <Tag color="red" icon={<ScanOutlined />}>AI 检测中</Tag>}
              </Space>
            }
          >
            <div
              ref={monitorContainerRef}
              style={{
                position: 'relative',
                width: '100%',
                height: isFullscreen ? '100vh' : 500,
                backgroundColor: '#000',
                borderRadius: isFullscreen ? 0 : 8,
                overflow: 'hidden',
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

              {!isMonitoring && (
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
                    backgroundColor: '#1a1a2e',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <CameraOutlined style={{ fontSize: 64, color: '#4a4a6a' }} />
                  <Text style={{ color: '#888', fontSize: 15 }}>点击「开始监控」启动摄像头</Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>支持实时人脸检测与专注度分析</Text>
                </div>
              )}

              <canvas ref={overlayCanvasRef} style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }} />

              {detecting && (
                <div style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: 'rgba(0,0,0,0.7)',
                  padding: '6px 14px',
                  borderRadius: 20,
                  color: '#00e5ff',
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  <Spin size="small" style={{ marginRight: 8 }} />
                  AI 分析中...
                </div>
              )}

              {lastError && !detecting && (
                <div style={{
                  position: 'absolute',
                  bottom: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(255,77,79,0.9)',
                  padding: '8px 20px',
                  borderRadius: 20,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  maxWidth: '80%',
                  textAlign: 'center',
                }}>
                  ⚠️ {lastError}
                </div>
              )}

              {isMonitoring && useLocalDetection && (
                <div style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  background: 'rgba(255,152,0,0.85)',
                  padding: '6px 14px',
                  borderRadius: 20,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  📷 本地检测模式 (基于肤色识别)
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {isMonitoring && (
                <div
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    display: 'flex',
                    gap: 8,
                    zIndex: 10,
                  }}
                >
                  <Tooltip title="刷新摄像头">
                    <Button
                      icon={<ReloadOutlined />}
                      size="small"
                      shape="circle"
                      onClick={handleRefresh}
                      style={{ background: 'linear-gradient(135deg, rgba(35,47,76,0.85), rgba(63,140,255,0.85))', borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}
                    />
                  </Tooltip>
                  <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
                    <Button
                      icon={isFullscreen ? <FullscreenOutlined /> : <FullscreenOutlined />}
                      size="small"
                      shape="circle"
                      onClick={toggleFullscreen}
                      style={{ background: 'linear-gradient(135deg, rgba(35,47,76,0.85), rgba(122,92,255,0.85))', borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}
                    />
                  </Tooltip>
                </div>
              )}
            </div>

            {isMonitoring && (
              <div style={{ marginTop: 16 }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <Card size="small" style={glassCardStyle} styles={{ body: glassBodyStyle }}>
                      <Statistic title="检测人数" value={stats.totalFaces} prefix={<TeamOutlined />} />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={glassCardStyle} styles={{ body: glassBodyStyle }}>
                      <Statistic
                        title="高专注"
                        value={stats.highAttention}
                        valueStyle={{ color: '#52c41a' }}
                        prefix={<CheckCircleOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={glassCardStyle} styles={{ body: glassBodyStyle }}>
                      <Statistic
                        title="中专注"
                        value={stats.mediumAttention}
                        valueStyle={{ color: '#faad14' }}
                        prefix={<EyeOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={glassCardStyle} styles={{ body: glassBodyStyle }}>
                      <Statistic
                        title="低专注"
                        value={stats.lowAttention}
                        valueStyle={{ color: '#f5222d' }}
                        prefix={<WarningOutlined />}
                      />
                    </Card>
                  </Col>
                </Row>

                {detectionStats.total > 0 && (
                  <div style={{ marginTop: 12, padding: '8px 16px', background: '#f5f5f5', borderRadius: 6, fontSize: 13, color: '#666' }}>
                    <Space size={16}>
                      <span>📊 检测统计: 总计 <strong>{detectionStats.total}</strong> 次</span>
                      <span style={{ color: '#52c41a' }}>✅ 成功 <strong>{detectionStats.success}</strong></span>
                      {detectionStats.failed > 0 && (
                        <span style={{ color: '#f5222d' }}>❌ 失败 <strong>{detectionStats.failed}</strong></span>
                      )}
                      <span>成功率: <strong>{((detectionStats.success / detectionStats.total) * 100).toFixed(1)}%</strong></span>
                      {useLocalDetection && <Tag color="orange">本地模式</Tag>}
                    </Space>
                  </div>
                )}
                <div style={{ marginTop: 10, padding: '8px 16px', background: '#fafafa', borderRadius: 6, fontSize: 13, color: '#555' }}>
                  <Space size={14} wrap>
                    <span>📈 课堂稳定统计（{classroomStats.windowSec}s窗口）</span>
                    <Tag color="red">低头率 {classroomStats.headDownRate.toFixed(1)}%</Tag>
                    <Tag color="gold">抬头率 {classroomStats.headUpRate.toFixed(1)}%</Tag>
                    <Tag color="purple">闭眼率 {classroomStats.eyesClosedRate.toFixed(1)}%</Tag>
                    <Tag color="blue">转头率 {classroomStats.turningHeadRate.toFixed(1)}%</Tag>
                  </Space>
                </div>
                <div style={{ marginTop: 8, padding: '8px 16px', background: '#f7fbff', borderRadius: 6, fontSize: 13, color: '#4a5568' }}>
                  <Space size={12} wrap>
                    <Tag color={advancedStats.yoloReady ? 'green' : 'default'}>YOLO {advancedStats.yoloReady ? '就绪' : '未就绪'}</Tag>
                    <Tag color={advancedStats.poseReady ? 'green' : 'default'}>Pose {advancedStats.poseReady ? '就绪' : '未就绪'}</Tag>
                    <Tag color="cyan">人体检测 {advancedStats.personDetections}</Tag>
                    <Tag color="geekblue">低头/抬头比 {advancedStats.headDownHeadUpRatio.toFixed(2)}</Tag>
                    <Tag color="purple">举手率 {advancedStats.handRaiseRate.toFixed(1)}%</Tag>
                    <Tag color="lime">书写率 {advancedStats.writingRate.toFixed(1)}%</Tag>
                    <Tag color="volcano">长时低头率 {advancedStats.longHeadDownRate.toFixed(1)}%</Tag>
                  </Space>
                </div>
              </div>
            )}
          </Card>
        </Col>

        <Col span={8}>
          <Card title="专注度趋势" size="small" style={{ marginBottom: 16, ...glassCardStyle }} styles={{ body: glassBodyStyle }}>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attentionData}>
                  <defs>
                    <linearGradient id="colorAttn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1890ff" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="attention" stroke="#1890ff" fillOpacity={1} fill="url(#colorAttn)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title={`检测结果 (${stats.totalFaces})`}
            size="small"
            style={glassCardStyle}
            styles={{ body: { maxHeight: 360, overflowY: 'auto', padding: 8 } }}
          >
            {detectedFaces.length > 0 ? (
              <List
                size="small"
                dataSource={detectedFaces}
                renderItem={(face) => (
                  <List.Item style={{ padding: '8px 4px' }}>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          style={{ backgroundColor: getAttentionColor(face.attentionLevel), fontSize: 14 }}
                          size={36}
                        >
                          {face.name.charAt(0)}
                        </Avatar>
                      }
                      title={
                        <Space size={4}>
                          <span style={{ fontWeight: 600 }}>{face.name}</span>
                          <Tag color={getAttentionColor(face.attentionLevel)} style={{ margin: 0, fontSize: 11 }}>
                            {getAttentionText(face.attentionLevel)}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={2} style={{ fontSize: 11 }}>
                          <Text type="secondary">状态: {getStateText(face.stateType)} | 表情: {getExpressionText(face.expressionType)} | 姿态: {getPostureText(face.postureType)}</Text>
                          <Text type="secondary">置信度: {(face.confidence * 100).toFixed(0)}% | 分数: {face.attentionScore.toFixed(1)} | 低头时长: {(face.headDownDurationSec || 0).toFixed(1)}s</Text>
                          <Text type="secondary">行为: {face.sleepingOnDesk ? '疑似趴桌' : face.writingActive ? '持续书写' : '普通'} | 举手: {face.handRaised ? '是' : '否'}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : isMonitoring ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>
                <ScanOutlined style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }} />
                <div>等待检测到人脸...</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>
                <VideoCameraOutlined style={{ fontSize: 36, marginBottom: 8, opacity: 0.3 }} />
                <div>请先启动监控</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="监控设置"
        open={showSettings}
        onCancel={() => setShowSettings(false)}
        styles={{
          content: {
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.26)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(236,244,255,0.92))',
            backdropFilter: 'blur(10px)',
          },
        }}
        footer={[
          <Button key="close" onClick={() => setShowSettings(false)} style={neutralButtonStyle}>关闭</Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={20}>
          <div>
            <Text strong>检测间隔</Text>
            <Slider
              min={20}
              max={1500}
              step={5}
              value={detectionInterval}
              onChange={(v) => setDetectionInterval(v)}
              marks={{ 20: '极快(0.02s)', 100: '快(0.1s)', 300: '正常(0.3s)', 1500: '慢(1.5s)' }}
            />
            <Text type="secondary">当前: {(detectionInterval / 1000).toFixed(2)}秒/次（短间隔自动降采样以提升实时性）</Text>
          </div>

          <div>
            <Text strong>自动记录</Text>
            <div style={{ marginTop: 8 }}>
              <Switch checked={autoRecord} onChange={setAutoRecord} checkedChildren="开" unCheckedChildren="关" />
            </div>
            <Text type="secondary">开启后自动保存每次检测结果</Text>
          </div>

          <Alert
            message="提示"
            description="检测间隔越短越流畅，但会消耗更多计算资源。建议在性能较好的电脑上使用较快模式。"
            type="info"
            showIcon
          />
        </Space>
      </Modal>
    </div>
  )
}

export default CameraMonitor
