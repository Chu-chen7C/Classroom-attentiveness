import { useState } from 'react'
import { Form, Input, Button, Tabs, message } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons'
import type { User } from '../types'
import { register as registerApi } from '../services/auth'

interface RegisterProps {
  onRegister: (user: User) => void
  onBackToLogin: () => void
}

const Register = ({ onRegister, onBackToLogin }: RegisterProps) => {
  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('teacher')
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const handleRegister = async (values: {
    username: string
    password: string
    confirmPassword: string
    name: string
    email?: string
    phone?: string
  }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致！')
      return
    }

    setLoading(true)

    try {
      const res = await registerApi({
        username: values.username,
        password: values.password,
        realName: values.name,
        role: activeTab,
        email: values.email,
        studentId: activeTab === 'student' ? values.username : undefined,
      })
      message.success('注册成功！')
      onRegister({
        id: res.user.id,
        username: res.user.username,
        name: res.user.realName,
        role: res.user.role,
      })
    } catch (err: any) {
      if (err?.code === 409) {
        message.error('该用户名已被注册！')
      } else {
        message.error(err?.error || err?.message || '注册失败，请检查网络连接')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .register-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(to bottom, #fff 0%, #fff 40%, rgba(255, 255, 255, 0) 100%),
            linear-gradient(to right, #0ed2da, #5f29c7);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .register-page::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: linear-gradient(90deg, #ccc 1px, transparent 1px);
          background-size: 50px 100%;
          pointer-events: none;
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 70%);
          -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 70%);
        }
        .register-card {
          max-width: 350px;
          width: 100%;
          background: #F8F9FD;
          background: linear-gradient(0deg, rgb(255, 255, 255) 0%, rgb(244, 247, 251) 100%);
          border-radius: 40px;
          padding: 25px 35px;
          border: 5px solid rgb(255, 255, 255);
          box-shadow: rgba(133, 189, 215, 0.8784313725) 0px 30px 30px -20px;
          position: relative;
          z-index: 1;
        }
        .register-card .heading {
          text-align: center;
          font-weight: 900;
          font-size: 28px;
          color: rgb(16, 137, 211);
          margin: 0 0 6px 0;
        }
        .register-card .sub-heading {
          text-align: center;
          font-size: 11px;
          color: rgb(170, 170, 170);
          margin-bottom: 0;
        }
        .register-card .form {
          margin-top: 20px;
        }
        .register-card .form .input-field {
          width: 100%;
          background: white;
          border: none;
          padding: 15px 20px;
          border-radius: 20px;
          margin-top: 15px;
          box-shadow: #cff0ff 0px 10px 10px -5px;
          border-inline: 2px solid transparent;
        }
        .register-card .form .input-field:focus {
          outline: none;
          border-inline: 2px solid #12B1D1;
        }
        .register-card .form .input-field::placeholder {
          color: rgb(170, 170, 170);
        }
        .register-card .form .input-field.ant-input-affix-wrapper {
          padding: 0 20px;
          border-inline: 2px solid transparent;
          box-shadow: #cff0ff 0px 10px 10px -5px;
          border-radius: 20px;
          background: white;
        }
        .register-card .form .input-field.ant-input-affix-wrapper:focus-within {
          border-inline: 2px solid #12B1D1;
        }
        .register-card .form .input-field.ant-input-affix-wrapper .ant-input {
          border: none;
          background: transparent;
          padding: 0;
        }
        .register-card .form .input-field.ant-input-affix-wrapper .ant-input:focus {
          box-shadow: none;
        }
        .register-card .form .submit-btn {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          width: 100%;
          font-weight: 600;
          background: linear-gradient(45deg, rgb(16, 137, 211) 0%, rgb(18, 177, 209) 100%);
          color: white;
          padding: 15px 20px;
          margin: 20px auto;
          border-radius: 999px;
          box-shadow: rgba(133, 189, 215, 0.8784313725) 0px 20px 10px -15px;
          border: 2px solid rgb(16, 137, 211);
          transition: all 0.2s ease-in-out;
          font-size: 16px;
          position: relative;
          overflow: hidden;
          z-index: 1;
        }
        .register-card .form .submit-btn::before {
          content: "";
          position: absolute;
          width: 100%;
          height: 100%;
          background: linear-gradient(45deg, rgb(16, 137, 211) 0%, rgb(18, 177, 209) 100%);
          transition: all 0.7s ease;
          z-index: -1;
        }
        .register-card .form .submit-btn:hover::before {
          width: 100%;
        }
        .register-card .form .submit-btn .btn-arrow {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.3s ease;
          flex-shrink: 0;
        }
        .register-card .form .submit-btn:hover .btn-arrow {
          transform: rotate(90deg);
          background: rgba(255, 255, 255, 0.9);
        }
        .register-card .form .submit-btn:hover .btn-arrow svg path {
          fill: rgb(16, 137, 211);
        }
        .register-card .back-btn {
          display: block;
          width: 100%;
          text-align: center;
          margin-top: 10px;
          color: #0099ff;
          font-size: 13px;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
        }
        .register-card .back-btn:hover {
          color: #0077cc;
        }
        .register-card .ant-tabs {
          margin-top: 20px;
        }
        .register-card .ant-tabs-nav {
          margin-bottom: 0;
        }
        .register-card .ant-tabs-tab {
          font-size: 13px;
          padding: 8px 0;
          color: rgb(170, 170, 170);
        }
        .register-card .ant-tabs-tab-active .ant-tabs-tab-btn {
          color: rgb(16, 137, 211) !important;
          font-weight: 600;
        }
        .register-card .ant-tabs-ink-bar {
          background: rgb(16, 137, 211) !important;
        }
        .register-card .ant-form-item {
          margin-bottom: 0;
        }
        .register-card .ant-form-item-label > .ant-form-item-required::before {
          display: none;
        }
        .register-card .ant-form-item-label > label {
          font-size: 12px;
          color: rgb(100, 100, 100);
          font-weight: 600;
          margin-top: 15px;
          display: block;
        }
        .register-card .ant-form-item-explain-error {
          font-size: 11px;
          margin-top: 4px;
        }
      `}</style>

      <div className="register-page">
        <div className="register-card">
          <h1 className="heading">用户注册</h1>
          <p className="sub-heading">创建您的课堂专注度系统账号</p>

          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'teacher' | 'student')}
            centered
            items={[
              { key: 'teacher', label: '教师注册' },
              { key: 'student', label: '学生注册' },
            ]}
          />

          <Form
            form={form}
            name="register"
            onFinish={handleRegister}
            autoComplete="off"
            className="form"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: ' ' },
                { min: 3, message: ' ' },
                { max: 20, message: ' ' },
              ]}
            >
              <Input
                className="input-field"
                prefix={<UserOutlined style={{ color: 'rgb(170,170,170)' }} />}
                placeholder={activeTab === 'teacher' ? '请输入教师工号' : '请输入学号'}
              />
            </Form.Item>

            <Form.Item
              name="name"
              rules={[{ required: true, message: ' ' }]}
            >
              <Input
                className="input-field"
                prefix={<UserOutlined style={{ color: 'rgb(170,170,170)' }} />}
                placeholder="请输入真实姓名"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: ' ' },
                { min: 6, message: ' ' },
              ]}
            >
              <Input.Password
                className="input-field"
                prefix={<LockOutlined style={{ color: 'rgb(170,170,170)' }} />}
                placeholder="请输入密码"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              rules={[
                { required: true, message: ' ' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password
                className="input-field"
                prefix={<LockOutlined style={{ color: 'rgb(170,170,170)' }} />}
                placeholder="请再次输入密码"
              />
            </Form.Item>

            <Form.Item
              name="email"
              rules={[{ type: 'email', message: ' ' }]}
            >
              <Input
                className="input-field"
                prefix={<MailOutlined style={{ color: 'rgb(170,170,170)' }} />}
                placeholder="请输入邮箱（选填）"
              />
            </Form.Item>

            <Form.Item
              name="phone"
              rules={[
                { pattern: /^1[3-9]\d{9}$/, message: ' ' },
              ]}
            >
              <Input
                className="input-field"
                prefix={<PhoneOutlined style={{ color: 'rgb(170,170,170)' }} />}
                placeholder="请输入手机号（选填）"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
              >
                <span>注 册</span>
                <span className="btn-arrow">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 16 19"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M7 18C7 18.5523 7.44772 19 8 19C8.55228 19 9 18.5523 9 18H7ZM8.70711 0.292893C8.31658 -0.0976311 7.68342 -0.0976311 7.29289 0.292893L0.928932 6.65685C0.538408 7.04738 0.538408 7.68054 0.928932 8.07107C1.31946 8.46159 1.95262 8.46159 2.34315 8.07107L8 2.41421L13.6569 8.07107C14.0474 8.46159 14.6805 8.46159 15.0711 8.07107C15.4616 7.68054 15.4616 7.04738 15.0711 6.65685L8.70711 0.292893ZM9 18L9 1H7L7 18H9Z"
                      fill="white"
                    />
                  </svg>
                </span>
              </button>
            </Form.Item>

            <button type="button" className="back-btn" onClick={onBackToLogin}>
              已有账号？返回登录
            </button>
          </Form>
        </div>
      </div>
    </>
  )
}

export default Register
