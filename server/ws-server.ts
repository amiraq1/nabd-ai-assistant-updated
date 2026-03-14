import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import { generateAppSchema } from "./services/ai-architect.js";

interface BuildUiRequestMessage {
  type: "BUILD_UI_REQUEST";
  payload?: {
    prompt?: string;
  };
}

function safeSend(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function parseBuildRequest(message: string): BuildUiRequestMessage | null {
  try {
    const parsed = JSON.parse(message) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const value = parsed as Record<string, unknown>;
    if (value.type !== "BUILD_UI_REQUEST") {
      return null;
    }

    return {
      type: "BUILD_UI_REQUEST",
      payload:
        value.payload && typeof value.payload === "object"
          ? (value.payload as { prompt?: string })
          : undefined,
    };
  } catch {
    return null;
  }
}

let webSocketServer: WebSocketServer | null = null;

export function setupWebSocket(): void {
  if (webSocketServer) {
    return;
  }

  webSocketServer = new WebSocketServer({ noServer: true });

  webSocketServer.on("connection", (ws: WebSocket) => {
    console.log("App builder client connected");

    ws.on("message", async (rawMessage) => {
      const parsedMessage = parseBuildRequest(rawMessage.toString());
      if (!parsedMessage) {
        safeSend(ws, {
          type: "BUILD_UI_ERROR",
          error: "Invalid websocket message payload.",
        });
        return;
      }

      const userPrompt = parsedMessage.payload?.prompt?.trim();
      if (!userPrompt) {
        safeSend(ws, {
          type: "BUILD_UI_ERROR",
          error: "A prompt is required to build UI.",
        });
        return;
      }

      safeSend(ws, {
        type: "BUILD_STATUS",
        status: "generating",
      });

      try {
        const uiSchema = await generateAppSchema(userPrompt);
        safeSend(ws, {
          type: "BUILD_UI_SUCCESS",
          payload: { schema: uiSchema },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown app builder error";
        safeSend(ws, {
          type: "BUILD_UI_ERROR",
          error: message,
        });
      }
    });

    ws.on("close", () => {
      console.log("App builder client disconnected");
    });
  });
}

export function handleAppBuilderUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): boolean {
  if (!webSocketServer) {
    setupWebSocket();
  }

  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname !== "/ws/app-builder" || !webSocketServer) {
    return false;
  }

  webSocketServer.handleUpgrade(request, socket, head, (client, incomingRequest) => {
    webSocketServer?.emit("connection", client, incomingRequest);
  });

  return true;
}
