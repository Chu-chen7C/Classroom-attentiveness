import { useEffect, useRef, useState, useCallback } from 'react';

interface FaceData {
  trackId: number;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: {
    x: number;
    y: number;
  };
  isRecognized: boolean;
  studentName: string | null;
  studentId: string | null;
  hits: number;
  age: number;
  trajectory: Array<[number, number]>;
}

interface DetectionResult {
  type: string;
  timestamp: number;
  metrics: {
    fps: number;
    latencyMs: number;
    totalFrames: number;
    activeTracks: number;
    recognizedFaces: number;
  };
  faces: FaceData[];
}

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: DetectionResult) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
}

interface WebSocketState {
  isConnected: boolean;
  lastMessage: DetectionResult | null;
  metrics: DetectionResult['metrics'] | null;
  faces: FaceData[];
  error: string | null;
}

export function useWebSocket(options: UseWebSocketOptions): WebSocketState & {
  sendMessage: (data: any) => void;
  connect: () => void;
  disconnect: () => void;
} {
  const {
    url,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnect = true,
    reconnectInterval = 3000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manuallyClosedRef = useRef(false);

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
    metrics: null,
    faces: [],
    error: null,
  });

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    manuallyClosedRef.current = false;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const data: DetectionResult = JSON.parse(event.data);

          setState(prev => ({
            ...prev,
            lastMessage: data,
            metrics: data.metrics,
            faces: data.faces,
          }));

          onMessage?.(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (event) => {
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
        }));
        onError?.(event);
      };

      ws.onclose = () => {
        setState(prev => ({ ...prev, isConnected: false }));

        onDisconnect?.();

        if (reconnect && !manuallyClosedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
      }));
    }
  }, [url, onMessage, onConnect, onDisconnect, onError, reconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    manuallyClosedRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    ...state,
    sendMessage,
    connect,
    disconnect,
  };
}

export type { FaceData, DetectionResult, WebSocketState };