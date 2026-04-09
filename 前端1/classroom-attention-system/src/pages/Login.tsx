import { useState } from 'react'
import { Form, Input, Tabs, message } from 'antd'
import type { User } from '../types'
import { login as loginApi } from '../services/auth'
import LightRays from '../components/LightRays'

interface LoginProps {
  onLogin: (user: User) => void
  onRegister: () => void
}

const Login = ({ onLogin, onRegister }: LoginProps) => {
  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('teacher')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const res = await loginApi(values.username, values.password)
      if (res.user.role !== activeTab) {
        message.error(
          `该账号是${res.user.role === 'teacher' ? '教师' : '学生'}账号，请切换对应标签登录`,
        )
        setLoading(false)
        return
      }
      message.success('登录成功！')
      onLogin({
        id: res.user.id,
        username: res.user.username,
        name: res.user.realName,
        role: res.user.role,
      })
    } catch (err: any) {
      message.error(err?.error || err?.message || '登录失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-rays">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ffffff"
          raysSpeed={1}
          lightSpread={1}
          rayLength={2}
          followMouse={true}
          mouseInfluence={0.1}
          noiseAmount={0}
          distortion={0}
          pulsating={false}
          fadeDistance={1}
          saturation={1}
        />
      </div>
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0f;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .login-bg-rays {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(180deg, #6bb8e8 0%, #52a8d8 35%, #3d9bcc 65%, #2e8fc2 100%);
        }
        .login-form-container {
          background: linear-gradient(45deg, skyblue, darkblue);
          padding: 30px;
          width: 450px;
          border-radius: 20px;
          position: relative;
          z-index: 10;
          transition: background 0.3s ease;
        }
        .login-form-container:hover {
          background: linear-gradient(45deg, darkblue, skyblue);
        }
        .login-form-container::before {
          display: none;
        }
        .login-title {
          text-align: center;
          margin-bottom: 24px;
        }
        .login-title h1 {
          font-size: 24px;
          font-weight: 600;
          color: white;
          margin: 0 0 8px 0;
        }
        .login-title p {
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          margin: 0;
        }
        .login-tabs-container {
          margin-bottom: 20px;
        }
        .login-tabs .ant-tabs-nav {
          margin-bottom: 0;
        }
        .login-tabs .ant-tabs-tab {
          padding: 12px 24px !important;
          font-size: 15px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7) !important;
          transition: all 0.3s;
        }
        .login-tabs .ant-tabs-tab:hover {
          color: white !important;
        }
        .login-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
          color: white !important;
        }
        .login-tabs .ant-tabs-ink-bar {
          background: white !important;
          height: 3px !important;
          border-radius: 3px;
        }
        .login-tabs .ant-tabs-nav::before {
          border-bottom-color: rgba(255, 255, 255, 0.3) !important;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-label {
          display: block;
          color: white;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
        }
        .input-wrapper {
          border: 1.5px solid #ecedec;
          border-radius: 10em;
          height: 50px;
          display: flex;
          align-items: center;
          padding-left: 10px;
          transition: 0.2s ease-in-out;
          background-color: white;
        }
        .input-wrapper:focus-within {
          border: 1.5px solid orange;
        }
        .input-wrapper .icon {
          color: #999;
          margin-right: 10px;
          display: flex;
          align-items: center;
        }
        .form-input {
          margin-left: 10px;
          border-radius: 10rem;
          border: none;
          width: 100%;
          height: 100%;
          outline: none;
          font-size: 15px;
          background: transparent;
          padding: 0 !important;
        }
        .form-input::placeholder {
          color: #aaa;
        }
        .login-options {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .remember-me {
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
          cursor: pointer;
        }
        .remember-me input {
          width: 18px;
          height: 18px;
          accent-color: white;
        }
        .forgot-password {
          color: white;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.3s;
        }
        .forgot-password:hover {
          color: orange;
        }
        .submit-btn {
          position: relative;
          display: inline-block;
          padding: 15px 30px;
          text-align: center;
          letter-spacing: 1px;
          text-decoration: none;
          background: transparent;
          transition: ease-out 0.5s;
          border: 2px solid white;
          border-radius: 10em;
          box-shadow: inset 0 0 0 0 blue;
          margin: 10px 0;
          color: white;
          font-size: 15px;
          font-weight: 500;
          height: 50px;
          width: 100%;
          cursor: pointer;
        }
        .submit-btn:hover {
          color: white;
          box-shadow: inset 0 -100px 0 0 royalblue;
        }
        .submit-btn:active {
          transform: scale(0.9);
        }
        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .register-link {
          text-align: center;
          color: white;
          font-size: 14px;
          margin: 5px 0;
        }
        .register-link span {
          color: white;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.3s;
        }
        .register-link span:hover {
          color: orange;
        }
      `}</style>

      <div className="login-form-container">
        <div className="login-title">
          <h1>课堂专注度系统</h1>
          <p>请登录以继续</p>
        </div>

        <div className="login-tabs-container">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'teacher' | 'student')}
            centered
            className="login-tabs"
            items={[
              { key: 'teacher', label: '教师登录' },
              { key: 'student', label: '学生登录' },
            ]}
          />
        </div>

        <Form
          name="login"
          onFinish={handleLogin}
          autoComplete="off"
          layout="vertical"
        >
          <div className="form-group">
            <label className="form-label">
              {activeTab === 'teacher' ? '教师工号' : '学号'}
            </label>
            <div className="input-wrapper">
              <span className="icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <Form.Item
                name="username"
                rules={[{ required: true, message: '请输入用户名！' }]}
                style={{ margin: 0, flex: 1 }}
              >
                <Input
                  className="form-input"
                  placeholder={activeTab === 'teacher' ? '请输入教师工号' : '请输入学号'}
                />
              </Form.Item>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">密码</label>
            <div className="input-wrapper">
              <span className="icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码！' }]}
                style={{ margin: 0, flex: 1 }}
              >
                <Input.Password
                  className="form-input"
                  placeholder="请输入密码"
                />
              </Form.Item>
            </div>
          </div>

          <div className="login-options">
            <label className="remember-me">
              <input type="checkbox" />
              <span>记住我</span>
            </label>
            <span className="forgot-password">忘记密码？</span>
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={loading}
          >
            {loading ? '登录中...' : '登 录'}
          </button>

          <div className="register-link">
            还没有账号？<span onClick={onRegister}>立即注册</span>
          </div>
        </Form>
      </div>
    </div>
  )
}

export default Login