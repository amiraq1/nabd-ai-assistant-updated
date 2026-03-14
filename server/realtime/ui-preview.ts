import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import type { UISchemaGeneratedEvent } from "../../shared/ui-schema.js";
import { USER_COOKIE_NAME, __sessionUserInternals } from "../auth/session-user.js";

const userSockets = new Map<string, Set<WebSocket>>();
let webSocketServer: WebSocketServer | null = null;

function addSocket(userId: string, socket: WebSocket): void {
  const sockets = userSockets.get(userId) ?? new Set<WebSocket>();
  sockets.add(socket);
  userSockets.set(userId, sockets);
}

function removeSocket(userId: string, socket: WebSocket): void {
  const sockets = userSockets.get(userId);
  if (!sockets) {
    return;
  }

  sockets.delete(socket);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

export function setupUiPreviewRealtime(): void {
  if (webSocketServer) {
    return;
  }

  webSocketServer = new WebSocketServer({ noServer: true });

  webSocketServer.on("connection", (socket, request) => {
    const cookies = __sessionUserInternals.parseCookieHeader(request.headers.cookie);
    const userId = cookies[USER_COOKIE_NAME];

    if (!__sessionUserInternals.isLikelyUserId(userId)) {
      socket.close(1008, "Missing valid session");
      return;
    }

    addSocket(userId, socket);

    socket.on("close", () => {
      removeSocket(userId, socket);
    });

    socket.on("error", () => {
      removeSocket(userId, socket);
    });
  });
}

export function handleUiPreviewUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): boolean {
  if (!webSocketServer) {
    setupUiPreviewRealtime();
  }

  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname !== "/ws/ui-preview" || !webSocketServer) {
    return false;
  }

  webSocketServer.handleUpgrade(request, socket, head, (client, incomingRequest) => {
    webSocketServer?.emit("connection", client, incomingRequest);
  });

  return true;
}

export function broadcastUiSchemaUpdate(
  userId: string,
  payload: UISchemaGeneratedEvent,
): void {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) {
    return;
  }

  const message = JSON.stringify(payload);

  for (const socket of Array.from(sockets)) {
    if (socket.readyState !== WebSocket.OPEN) {
      removeSocket(userId, socket);
      continue;
    }

    socket.send(message);
  }
}
