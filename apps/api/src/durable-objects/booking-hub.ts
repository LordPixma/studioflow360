export class BookingHub implements DurableObject {
  private sessions: Set<WebSocket> = new Set();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      this.state.acceptWebSocket(server);
      this.sessions.add(server);

      server.addEventListener('close', () => {
        this.sessions.delete(server);
      });

      server.addEventListener('error', () => {
        this.sessions.delete(server);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message = await request.text();
      this.broadcast(message);
      return new Response('OK');
    }

    return new Response('Not found', { status: 404 });
  }

  private broadcast(message: string): void {
    for (const ws of this.sessions) {
      try {
        ws.send(message);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
    // Client messages not needed for now — hub is broadcast-only
  }

  webSocketClose(ws: WebSocket): void {
    this.sessions.delete(ws);
  }
}
