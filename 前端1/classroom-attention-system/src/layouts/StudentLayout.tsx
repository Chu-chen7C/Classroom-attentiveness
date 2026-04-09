import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import type { User } from '../types'

const { Content } = Layout

interface StudentLayoutProps {
  user: User
}

const StudentLayout = ({ user }: StudentLayoutProps) => {
  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  )
}

export default StudentLayout
