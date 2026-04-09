import { Layout, Menu, Avatar, Dropdown, Badge, Space, Typography } from 'antd'
import {
  DashboardOutlined,
  VideoCameraOutlined,
  TeamOutlined,
  UserAddOutlined,
  HistoryOutlined,
  FileTextOutlined,
  UserOutlined,
  LogoutOutlined,
  BellOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { User } from '../types'
import Particles from '../components/Particles'

const { Header, Sider, Content } = Layout
const { Text } = Typography

interface TeacherLayoutProps {
  user: User
  onLogout: () => void
}

const TeacherLayout = ({ user, onLogout }: TeacherLayoutProps) => {
  const location = useLocation()
  const navigate = useNavigate()

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '首页概览',
    },
    {
      key: '/classes',
      icon: <TeamOutlined />,
      label: '班级管理',
    },
    {
      key: '/face-register',
      icon: <UserAddOutlined />,
      label: '人脸录入',
    },
    {
      key: '/monitor',
      icon: <VideoCameraOutlined />,
      label: '摄像头监控',
    },
    {
      key: '/history',
      icon: <HistoryOutlined />,
      label: '历史复盘',
    },
    {
      key: '/report',
      icon: <FileTextOutlined />,
      label: '报告导出',
    },
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人中心',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      onLogout()
    } else if (key === 'profile') {
      // 处理个人中心
    } else if (key === 'settings') {
      // 处理设置
    } else {
      navigate(key)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>
        {`
          .blob-sider .ant-layout-sider-children {
            position: relative;
            background-image: radial-gradient(circle at 50% 50%, #0000 0, #0000 2px, hsl(0 0% 4%) 2px);
            background-size: 8px 8px;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          .blob-sider .ant-layout-sider-children::before {
            content: "";
            position: absolute;
            inset: -8em;
            z-index: 0;
            --f: blur(7em) brightness(5);
            animation: blobs-bg 150s linear infinite, hue-thingy 5s linear infinite;
            filter: var(--f);
            background-color: #000;
            background-image:
              radial-gradient(ellipse 66px 50px at 50% 50%, #0f0 0%, transparent 100%),
              radial-gradient(ellipse 77px 60px at 50% 50%, #0f0 0%, transparent 100%),
              radial-gradient(ellipse 78px 100px at 50% 50%, #0f0 0%, transparent 100%),
              radial-gradient(ellipse 73px 96px at 50% 50%, #0f0 0%, transparent 100%),
              radial-gradient(ellipse 76px 77px at 50% 50%, #0f0 0%, transparent 100%),
              radial-gradient(ellipse 66px 51px at 50% 50%, #0f0 0%, transparent 100%),
              radial-gradient(ellipse 90px 57px at 50% 50%, #0f0 0%, transparent 100%),
              radial-gradient(ellipse 89px 93px at 50% 50%, #0f0 0%, transparent 100%);
            background-size: 726px 576px, 1242px 454px, 876px 1160px, 691px 873px, 914px 550px, 1159px 340px, 1017px 831px, 313px 977px;
            pointer-events: none;
          }
          .blob-sider .ant-layout-sider-children::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 1;
            backdrop-filter: hue-rotate(90deg);
            mask: linear-gradient(45deg, #0000, #000);
            animation: rotaty 5s linear infinite;
            transform-origin: center;
            pointer-events: none;
          }
          .blob-sider .ant-layout-sider-children > * {
            position: relative;
            z-index: 2;
          }
          .main-grid-bg {
            position: relative;
            background: linear-gradient(45deg, #3498db, #2ecc71) !important;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .main-grid-bg::before {
            content: "";
            position: absolute;
            width: 100%;
            height: 100%;
            background-image:
              linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px);
            background-size: 20px 20px;
            pointer-events: none;
            z-index: 0;
          }
          .main-grid-bg > * {
            position: relative;
            z-index: 1;
          }
          .content-grid-bg {
            position: relative;
            background: linear-gradient(45deg, #3498db, #2ecc71) !important;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1) !important;
            border-radius: 10px !important;
            overflow: hidden;
          }
          .content-grid-bg::before {
            content: "";
            position: absolute;
            width: 100%;
            height: 100%;
            background-image:
              linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px);
            background-size: 20px 20px;
            pointer-events: none;
            z-index: 0;
          }
          .content-grid-bg > * {
            position: relative;
            z-index: 1;
          }
          @keyframes hue-thingy {
            0% { filter: var(--f) hue-rotate(0deg); }
            to { filter: var(--f) hue-rotate(1turn); }
          }
          @keyframes rotaty {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes blobs-bg {
            0% {
              background-position: 271px 478px, 62px 291px, 67px 861px, 553px 413px, 36px 392px, 1077px 226px, 400px 799px, 7px 264px;
            }
            to {
              background-position: -14975px -2978px, 31112px 11187px, -20081px 8981px, 11609px -3952px, -12760px 12492px, -9354px 2946px, 9553px 21574px, 946px 9057px;
            }
          }
        `}
      </style>
      {/* 侧边栏 */}
      <Sider
        className="blob-sider"
        theme="light"
        width={260}
        style={{
          background: '#05070a',
          boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
          zIndex: 10,
        }}
      >
        {/* Logo区域 */}
        <div
          style={{
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            padding: '0 20px',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
            }}
          >
            <VideoCameraOutlined style={{ fontSize: 22, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
              课堂专注度
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              智能分析系统
            </div>
          </div>
        </div>

        {/* 菜单 */}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            background: 'transparent',
            borderRight: 0,
            padding: '16px 12px',
          }}
          theme="dark"
        />

        {/* 底部信息 */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 20px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
            © 2024 课堂专注度系统
          </Text>
        </div>
      </Sider>

      <Layout className="main-grid-bg" style={{ background: 'transparent' }}>
        {/* 粒子背景 */}
        <div style={{ position: 'relative', width: '100%', height: 72 }}>
          <Particles
            particleColors={['#ffffff']}
            particleCount={200}
            particleSpread={10}
            speed={0.1}
            particleBaseSize={100}
            moveParticlesOnHover
            alphaParticles={false}
            disableRotation={false}
            pixelRatio={1}
          />
        </div>
        {/* 顶部导航 */}
        <Header
          style={{
            background: 'transparent',
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
            height: 72,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        >
          {/* 页面标题 */}
          <div>
            <Text
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#1a1a2e',
              }}
            >
              {menuItems.find((item) => item.key === location.pathname)?.label ||
                '课堂专注度智能分析系统'}
            </Text>
          </div>

          {/* 右侧操作区 */}
          <Space size={20}>
            {/* 通知 */}
            <Badge count={3} size="small" style={{ backgroundColor: '#ff4d4f' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e6f7ff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f8fafc'
                }}
              >
                <BellOutlined style={{ fontSize: 18, color: '#666' }} />
              </div>
            </Badge>

            {/* 用户下拉 */}
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleMenuClick }}
              placement="bottomRight"
              arrow
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 16px 6px 6px',
                  borderRadius: 12,
                  background: '#f8fafc',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e6f7ff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f8fafc'
                }}
              >
                <Avatar
                  size={36}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  }}
                >
                  {user.name.charAt(0)}
                </Avatar>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {user.role === 'teacher' ? '教师' : '学生'}
                  </div>
                </div>
              </div>
            </Dropdown>
          </Space>
        </Header>

        {/* 内容区域 */}
        <Content
          className="content-grid-bg"
          style={{
            margin: 24,
            padding: 28,
            background: 'transparent',
            minHeight: 280,
            boxShadow: 'none',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default TeacherLayout
