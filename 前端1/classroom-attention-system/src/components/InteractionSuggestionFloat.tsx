import { useState, useEffect } from 'react'
import { Card, Button, Tag, Space, Typography, Badge, List } from 'antd'
import {
  CloseOutlined,
  BellOutlined,
  TeamOutlined,
  QuestionCircleOutlined,
  MessageOutlined,
  CoffeeOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import type { InteractionSuggestion } from '../types'

const { Text, Paragraph } = Typography

interface InteractionSuggestionFloatProps {
  visible: boolean
  onClose: () => void
}

const InteractionSuggestionFloat = ({ visible, onClose }: InteractionSuggestionFloatProps) => {
  const [suggestions, setSuggestions] = useState<InteractionSuggestion[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState<InteractionSuggestion | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)

  useEffect(() => {
    // 模拟接收建议
    const mockSuggestions: InteractionSuggestion[] = [
      {
        id: '1',
        type: 'group_discussion',
        title: '小组讨论',
        description: '检测到连续10分钟低专注率超过30%，建议组织小组讨论提升参与度',
        duration: 5,
        materials: '讨论话题：TCP/IP协议的分层结构及各层功能',
        triggerCondition: '低专注率>30%持续10分钟',
        priority: 'high',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'targeted_question',
        title: '针对性提问',
        description: '中专注学生答题正确率低于60%，建议针对性提问',
        duration: 3,
        materials: '提问知识点：IP地址的分类及子网掩码计算',
        triggerCondition: '正确率<60%',
        priority: 'medium',
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: '3',
        type: 'thinking_question',
        title: '拓展思考题',
        description: '高专注且正确率超过90%，适合推送拓展思考题',
        duration: 5,
        materials: '思考题：IPv6相比IPv4的优势及迁移挑战',
        triggerCondition: '高专注+正确率>90%',
        priority: 'low',
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
    ]
    setSuggestions(mockSuggestions)
    setActiveSuggestion(mockSuggestions[0])
  }, [])

  const getIconByType = (type: string) => {
    switch (type) {
      case 'group_discussion':
        return <TeamOutlined />
      case 'targeted_question':
        return <QuestionCircleOutlined />
      case 'thinking_question':
        return <MessageOutlined />
      case 'break':
        return <CoffeeOutlined />
      default:
        return <BellOutlined />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'red'
      case 'medium':
        return 'orange'
      case 'low':
        return 'blue'
      default:
        return 'default'
    }
  }

  if (!visible) return null

  if (isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          right: 24,
          top: 100,
          zIndex: 1000,
        }}
      >
        <Badge count={suggestions.length} offset={[-5, 5]}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<BellOutlined />}
            onClick={() => setIsMinimized(false)}
            style={{
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              width: 56,
              height: 56,
            }}
          />
        </Badge>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        top: 100,
        width: 360,
        zIndex: 1000,
      }}
      className="fade-in"
    >
      <Card
        title={
          <Space>
            <BellOutlined style={{ color: '#1890ff' }} />
            <span>互动建议</span>
            <Tag color="red">{suggestions.length}条新建议</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button
              type="text"
              size="small"
              onClick={() => setIsMinimized(true)}
            >
              最小化
            </Button>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
            />
          </Space>
        }
        style={{
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          borderRadius: 12,
        }}
        styles={{ body: { padding: 16 } }}
      >
        {activeSuggestion ? (
          <div>
            {/* 当前建议详情 */}
            <div style={{ marginBottom: 16 }}>
              <Space style={{ marginBottom: 8 }}>
                {getIconByType(activeSuggestion.type)}
                <Text strong style={{ fontSize: 16 }}>
                  {activeSuggestion.title}
                </Text>
                <Tag color={getPriorityColor(activeSuggestion.priority)}>
                  {activeSuggestion.priority === 'high'
                    ? '高优先级'
                    : activeSuggestion.priority === 'medium'
                    ? '中优先级'
                    : '低优先级'}
                </Tag>
              </Space>
              <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {activeSuggestion.description}
              </Paragraph>
              <Space size={16}>
                <Text type="secondary">
                  <ClockCircleOutlined /> 建议时长：{activeSuggestion.duration}分钟
                </Text>
              </Space>
            </div>

            {/* 配套素材 */}
            {activeSuggestion.materials && (
              <div
                style={{
                  backgroundColor: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Text strong style={{ color: '#52c41a', display: 'block', marginBottom: 4 }}>
                  配套素材
                </Text>
                <Text>{activeSuggestion.materials}</Text>
              </div>
            )}

            {/* 触发条件 */}
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                触发条件：{activeSuggestion.triggerCondition}
              </Text>
            </div>

            {/* 操作按钮 */}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setActiveSuggestion(null)}>查看全部</Button>
              <Space>
                <Button>忽略</Button>
                <Button type="primary" icon={<PlayCircleOutlined />}>
                  一键启用
                </Button>
              </Space>
            </Space>
          </div>
        ) : (
          <List
            dataSource={suggestions}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer', padding: '8px 0' }}
                onClick={() => setActiveSuggestion(item)}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: '#f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        color: '#1890ff',
                      }}
                    >
                      {getIconByType(item.type)}
                    </div>
                  }
                  title={
                    <Space>
                      <span>{item.title}</span>
                      <Tag color={getPriorityColor(item.priority)}>
                        {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Text ellipsis style={{ maxWidth: 240, fontSize: 12 }}>
                        {item.description}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        <ClockCircleOutlined /> {item.duration}分钟
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  )
}

export default InteractionSuggestionFloat
