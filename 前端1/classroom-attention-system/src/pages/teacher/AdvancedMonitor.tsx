import React, { useCallback } from 'react';
import { Card, Tag, Statistic, Row, Col, Badge, Typography, Space, Tooltip, Progress } from 'antd';
import {
  UserOutlined,
  VideoCameraOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  WifiOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import {
  useWebSocket,
  type FaceData,
  type DetectionResult,
} from '../../services/websocket';

const { Text } = Typography;

interface AdvancedMonitorProps {
  wsUrl?: string;
  classroomId?: string;
  onFaceRecognized?: (face: FaceData) => void;
  onMetricsUpdate?: (metrics: DetectionResult['metrics']) => void;
}

const AdvancedRealtimeMonitor: React.FC<AdvancedMonitorProps> = ({
  wsUrl = 'ws://localhost:5001',
  onFaceRecognized,
  onMetricsUpdate,
}) => {
  const handleMessage = useCallback((data: DetectionResult) => {
    data.faces.forEach((face: FaceData) => {
      if (face.isRecognized && onFaceRecognized) {
        onFaceRecognized(face);
      }
    });

    if (onMetricsUpdate) {
      onMetricsUpdate(data.metrics);
    }
  }, [onFaceRecognized, onMetricsUpdate]);

  const {
    isConnected,
    metrics,
    faces,
    error,
  } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
  });

  return (
    <div className="advanced-monitor">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <VideoCameraOutlined />
                <span>高级实时监控</span>
                <Badge
                  status={isConnected ? 'success' : 'error'}
                  text={isConnected ? '已连接' : '未连接'}
                />
              </Space>
            }
            extra={
              <Space>
                <Tooltip title={isConnected ? 'WebSocket已连接' : 'WebSocket断开'}>
                  {isConnected ? (
                    <WifiOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                  ) : (
                    <DisconnectOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                  )}
                </Tooltip>
              </Space>
            }
          >
            {error && (
              <div style={{ color: '#ff4d4f', marginBottom: 16 }}>
                错误: {error}
              </div>
            )}

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="帧率 (FPS)"
                    value={metrics?.fps || 0}
                    precision={1}
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ color: metrics?.fps && metrics.fps > 10 ? '#3f8600' : '#cf1322' }}
                  />
                </Card>
              </Col>

              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="检测延迟"
                    value={metrics?.latencyMs || 0}
                    precision={1}
                    suffix="ms"
                    prefix={<EyeOutlined />}
                    valueStyle={{ color: metrics?.latencyMs && metrics.latencyMs < 100 ? '#3f8600' : '#cf1322' }}
                  />
                </Card>
              </Col>

              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="活跃跟踪"
                    value={metrics?.activeTracks || 0}
                    suffix="/ 人"
                    prefix={<UserOutlined />}
                  />
                </Card>
              </Col>

              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="已识别"
                    value={metrics?.recognizedFaces || 0}
                    suffix="/ 人"
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
            </Row>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {faces.map((face: FaceData) => (
                <FaceCard key={face.trackId} face={face} />
              ))}
            </div>

            {faces.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: 40,
                color: '#999',
              }}>
                等待检测数据...
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

const FaceCard: React.FC<{ face: FaceData }> = ({ face }) => {
  const recognitionRate = face.hits > 0
    ? Math.min(100, (face.age / Math.max(face.hits, 1)) * 20)
    : 0;

  return (
    <Card
      size="small"
      style={{
        width: 220,
        borderLeft: `4px solid ${face.isRecognized ? '#52c41a' : '#faad14'}`,
      }}
      title={
        <Space>
          <Text strong>ID: {face.trackId}</Text>
          {face.isRecognized ? (
            <Tag color="success">已识别</Tag>
          ) : (
            <Tag color="warning">未知</Tag>
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {face.studentName && (
          <div>
            <Text type="secondary">姓名：</Text>
            <Text strong>{face.studentName}</Text>
          </div>
        )}

        <div>
          <Text type="secondary">位置：</Text>
          <Text code>{`(${face.position.x}, ${face.position.y})`}</Text>
        </div>

        <div>
          <Text type="secondary">尺寸：</Text>
          <Text>{face.position.width} × {face.position.height}</Text>
        </div>

        <div>
          <Text type="secondary">跟踪时长：</Text>
          <Text>{face.age} 帧</Text>
        </div>

        <div>
          <Text type="secondary">匹配次数：</Text>
          <Text>{face.hits} 次</Text>
        </div>

        <Progress
          percent={recognitionRate}
          size="small"
          status={face.isRecognized ? 'active' : 'normal'}
          format={() => `${Math.round(recognitionRate)}%`}
        />

        {face.trajectory && face.trajectory.length > 0 && (
          <div style={{
            height: 50,
            background: '#f5f5f5',
            borderRadius: 4,
            padding: 4,
            position: 'relative',
            overflow: 'hidden',
          }}>
            <svg width="100%" height="100%" viewBox={`0 0 200 50`}>
              <polyline
                points={face.trajectory
                  .slice(-30)
                  .map(([x, y]: [number, number]) => {
                    const scaleX = 200 / 1280;
                    const scaleY = 50 / 720;
                    return `${x * scaleX},${y * scaleY}`
                  })
                  .join(' ')}
                fill="none"
                stroke={face.isRecognized ? '#52c41a' : '#faad14'}
                strokeWidth="2"
              />
            </svg>
          </div>
        )}
      </Space>
    </Card>
  );
};

export default AdvancedRealtimeMonitor;