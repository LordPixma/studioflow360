import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

interface WebSocketEvent {
  type: string;
  booking_id?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

type WSListener = (event: WebSocketEvent) => void;

interface WebSocketContextType {
  connected: boolean;
  subscribe: (listener: WSListener) => () => void;
  lastEvent: WebSocketEvent | null;
}

const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
  subscribe: () => () => {},
  lastEvent: null,
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<WSListener>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('[WS] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as WebSocketEvent;
          setLastEvent(parsed);
          for (const listener of listenersRef.current) {
            listener(parsed);
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // Reconnect on error
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((listener: WSListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ connected, subscribe, lastEvent }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function useBookingUpdates(onUpdate: (event: WebSocketEvent) => void) {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'BOOKING_UPDATED' || event.type === 'BOOKING_CREATED') {
        onUpdate(event);
      }
    });
  }, [subscribe, onUpdate]);
}
