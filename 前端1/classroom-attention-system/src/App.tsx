import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import type { User } from './types'
import TeacherLayout from './layouts/TeacherLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import TeacherDashboard from './pages/teacher/Dashboard'
import ClassManager from './pages/teacher/ClassManager'
import FaceRegister from './pages/teacher/FaceRegister'
import CameraMonitor from './pages/teacher/CameraMonitor'
import HistoryReview from './pages/teacher/HistoryReview'
import ReportExport from './pages/teacher/ReportExport'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [showRegister, setShowRegister] = useState(false)

  const handleLogin = (userData: User) => {
    setUser(userData)
  }

  const handleLogout = () => {
    setUser(null)
  }

  const handleRegister = (userData: User) => {
    setUser(userData)
    setShowRegister(false)
  }

  // 未登录时显示登录或注册页面
  if (!user) {
    if (showRegister) {
      return <Register onRegister={handleRegister} onBackToLogin={() => setShowRegister(false)} />
    }
    return <Login onLogin={handleLogin} onRegister={() => setShowRegister(true)} />
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* 教师端路由 */}
        {user.role === 'teacher' && (
          <Route path="/" element={<TeacherLayout user={user} onLogout={handleLogout} />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<TeacherDashboard />} />
            <Route path="classes" element={<ClassManager />} />
            <Route path="face-register" element={<FaceRegister />} />
            <Route path="monitor" element={<CameraMonitor />} />
            <Route path="history" element={<HistoryReview />} />
            <Route path="report" element={<ReportExport />} />
          </Route>
        )}

        {/* 默认重定向 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
