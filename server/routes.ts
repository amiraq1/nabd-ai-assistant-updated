import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import {
  generateAssistantReply,
  previewOrchestration,
} from "./ai/orchestrator.js";
import {
  getPromptProfileById,
  listPromptProfiles,
} from "./ai/prompt-profiles.js";
import {
  getLatestTrace,
  getTraceHistory,
  recordTrace,
} from "./ai/trace-store.js";
import {
  listKnowledgeDocuments,
  upsertKnowledgeDocuments,
} from "./rag/retriever.js";
import {
  buildAvailableSkillsXml,
  getSkillsDiagnostics,
  listSkills,
  refreshSkills,
} from "./skills/registry.js";
import { resolveSessionUserId } from "./auth/session-user.js";

const MAX_CONVERSATION_TITLE_CHARS = 120;
const MAX_MESSAGE_CHARS = 10_000;
const DEFAULT_PHONE_PROXY_TIMEOUT_MS = 120_000;

function normalizePhoneGenerateUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/api/generate";
    } else if (!url.pathname.endsWith("/api/generate")) {
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/generate`;
    }

    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";
  const debugMode = !isProduction;
  const debugEndpointsEnabled =
    debugMode || process.env.ENABLE_AI_DEBUG_ENDPOINTS === "true";
  const debugToken = process.env.DEBUG_API_TOKEN?.trim();

  const requireDebugAuth: RequestHandler = (req, res, next) => {
    if (!debugToken) {
      return res.status(503).json({
        message:
          "واجهات التشخيص معطلة لأن DEBUG_API_TOKEN غير مضبوط",
      });
    }

    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : undefined;
    const customToken =
      typeof req.headers["x-debug-token"] === "string"
        ? req.headers["x-debug-token"].trim()
        : undefined;
    const suppliedToken = bearerToken || customToken;

    if (!suppliedToken || suppliedToken !== debugToken) {
      return res.status(401).json({ message: "Unauthorized debug access" });
    }

    return next();
  };

  if (debugEndpointsEnabled) {
    app.post("/api/ai/debug/plan", requireDebugAuth, (req, res) => {
      const content = req.body?.content;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "الحقل content مطلوب" });
      }

      const preview = previewOrchestration(content);
      return res.json(preview);
    });

    app.get("/api/ai/debug/trace/latest", requireDebugAuth, (req, res) => {
      const conversationId =
        typeof req.query.conversationId === "string"
          ? req.query.conversationId
          : undefined;
      const trace = getLatestTrace(conversationId);

      if (!trace) {
        return res.status(404).json({ message: "لا يوجد trace متاح حالياً" });
      }

      return res.json(trace);
    });

    app.get("/api/ai/debug/trace/history", requireDebugAuth, (req, res) => {
      const conversationId =
        typeof req.query.conversationId === "string"
          ? req.query.conversationId
          : undefined;
      const limitValue =
        typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 10;
      const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 50) : 10;

      return res.json({
        count: limit,
        items: getTraceHistory(conversationId, limit),
      });
    });

    app.get("/api/ai/debug/rag/documents", requireDebugAuth, (_req, res) => {
      return res.json({
        items: listKnowledgeDocuments(),
      });
    });

    app.post("/api/ai/debug/rag/documents", requireDebugAuth, (req, res) => {
      const docs = req.body?.documents;
      if (!Array.isArray(docs) || docs.length === 0) {
        return res.status(400).json({
          message: "الحقل documents مطلوب ويجب أن يكون مصفوفة غير فارغة",
        });
      }

      type IngestDocument = {
        id: string;
        title: string;
        source: string;
        content: string;
      };

      const isIngestDocument = (value: IngestDocument | null): value is IngestDocument =>
        value !== null;

      const prepared = docs
        .map((doc: unknown, index: number) => {
          if (!doc || typeof doc !== "object") return null;
          const value = doc as Record<string, unknown>;
          const title = typeof value.title === "string" ? value.title.trim() : "";
          const source = typeof value.source === "string" ? value.source.trim() : "";
          const content = typeof value.content === "string" ? value.content.trim() : "";

          if (!title || !source || !content) return null;
          return {
            id:
              typeof value.id === "string" && value.id.trim()
                ? value.id.trim()
                : `debug-doc-${Date.now()}-${index}`,
            title,
            source,
            content,
          };
        })
        .filter(isIngestDocument);

      if (prepared.length === 0) {
        return res.status(400).json({
          message: "لا يوجد مستندات صالحة للإدخال",
        });
      }

      upsertKnowledgeDocuments(prepared);
      return res.json({
        inserted: prepared.length,
        total: listKnowledgeDocuments().length,
      });
    });

    app.get("/api/ai/debug/skills", requireDebugAuth, (_req, res) => {
      return res.json(getSkillsDiagnostics());
    });

    app.post("/api/ai/debug/skills/reload", requireDebugAuth, (_req, res) => {
      refreshSkills(true);
      return res.json(getSkillsDiagnostics());
    });

    app.get("/api/ai/debug/skills/prompt", requireDebugAuth, (_req, res) => {
      res.type("text/plain");
      return res.send(buildAvailableSkillsXml());
    });
  }

  app.get("/api/skills", (_req, res) => {
    const items = listSkills().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      version: skill.version,
      format: skill.format,
      executable: skill.isExecutable,
      location: skill.skillFilePath,
      inputSchema: skill.inputSchema,
      samplePrompts: skill.samplePrompts ?? [],
    }));

    return res.json({
      count: items.length,
      items,
    });
  });

  app.get("/api/ai/prompt-profiles", (_req, res) => {
    return res.json({
      count: listPromptProfiles().length,
      items: listPromptProfiles(),
    });
  });

  app.post("/api/direct-phone/generate", async (req, res) => {
    if (isProduction && process.env.ENABLE_PHONE_PROXY !== "true") {
      return res.status(403).json({
        message: "Phone proxy is disabled in production",
      });
    }

    const { baseUrl, model, prompt } = req.body ?? {};
    if (typeof baseUrl !== "string" || !baseUrl.trim()) {
      return res.status(400).json({ message: "baseUrl is required" });
    }
    if (typeof model !== "string" || !model.trim()) {
      return res.status(400).json({ message: "model is required" });
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ message: "prompt is required" });
    }

    const targetUrl = normalizePhoneGenerateUrl(baseUrl);
    if (!targetUrl) {
      return res.status(400).json({ message: "baseUrl must be a valid http/https URL" });
    }

    const controller = new AbortController();
    const timeoutMs = Number.parseInt(process.env.PHONE_PROXY_TIMEOUT_MS ?? "", 10);
    const resolvedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_PHONE_PROXY_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.trim(),
          prompt: prompt.trim(),
          stream: false,
        }),
        signal: controller.signal,
      });

      const rawText = await upstreamResponse.text();
      const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";
      res.status(upstreamResponse.status);
      res.type(contentType);
      return res.send(rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown upstream error";
      return res.status(502).json({
        message: `Phone proxy request failed: ${message}`,
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/conversations", async (_req, res) => {
    const userId = resolveSessionUserId(_req, res);
    const convs = await storage.getConversations(userId);
    res.json(convs);
  });

  app.post("/api/conversations", async (req, res) => {
    const userId = resolveSessionUserId(req, res);
    const { title } = req.body ?? {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ message: "العنوان مطلوب" });
    }

    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return res.status(400).json({ message: "العنوان لا يمكن أن يكون فارغاً" });
    }
    if (normalizedTitle.length > MAX_CONVERSATION_TITLE_CHARS) {
      return res.status(400).json({
        message: `العنوان طويل جدًا (الحد الأقصى ${MAX_CONVERSATION_TITLE_CHARS} حرفاً)`,
      });
    }

    const conv = await storage.createConversation({ title: normalizedTitle, userId });
    res.json(conv);
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    const userId = resolveSessionUserId(req, res);
    const deleted = await storage.deleteConversation(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ message: "المحادثة غير موجودة" });
    }
    res.json({ success: true });
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    const userId = resolveSessionUserId(req, res);
    const conversation = await storage.getConversation(req.params.id, userId);
    if (!conversation) {
      return res.status(404).json({ message: "المحادثة غير موجودة" });
    }

    const msgs = await storage.getMessages(req.params.id, userId);
    res.json(msgs);
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    const userId = resolveSessionUserId(req, res);
    const { content, systemPrompt, systemPromptId } = req.body ?? {};
    if (!content || typeof content !== "string") {
      return res.status(400).json({ message: "المحتوى مطلوب" });
    }
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return res.status(400).json({ message: "المحتوى لا يمكن أن يكون فارغاً" });
    }
    if (normalizedContent.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({
        message: `المحتوى طويل جدًا (الحد الأقصى ${MAX_MESSAGE_CHARS} حرفاً)`,
      });
    }

    const conversation = await storage.getConversation(req.params.id, userId);
    if (!conversation) {
      return res.status(404).json({ message: "المحادثة غير موجودة" });
    }

    let resolvedSystemPrompt: string | undefined;
    if (typeof systemPromptId === "string" && systemPromptId.trim()) {
      const profile = getPromptProfileById(systemPromptId.trim());
      if (!profile) {
        return res.status(400).json({ message: "systemPromptId غير صالح" });
      }
      resolvedSystemPrompt = profile.prompt;
    } else if (typeof systemPrompt === "string" && systemPrompt.trim()) {
      const trimmed = systemPrompt.trim();
      if (trimmed.length > 4000) {
        return res.status(400).json({ message: "systemPrompt طويل جدًا" });
      }
      resolvedSystemPrompt = trimmed;
    }

    const userMsg = await storage.createMessage({
      conversationId: req.params.id,
      content: normalizedContent,
      role: "user",
    });

    try {
      const previousMessages = await storage.getMessages(req.params.id, userId);
      const history = previousMessages
        .filter((msg) => msg.id !== userMsg.id)
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const result = await generateAssistantReply({
        content: normalizedContent,
        systemPrompt: resolvedSystemPrompt,
        history,
      });
      recordTrace(req.params.id, result.trace);

      const aiMsg = await storage.createMessage({
        conversationId: req.params.id,
        content: result.content,
        role: "assistant",
      });

      res.json([userMsg, aiMsg]);
    } catch (error) {
      console.error("AI API error:", error);

      const errorMsg = await storage.createMessage({
        conversationId: req.params.id,
        content: "عذراً، فشل الاتصال بالخادم المحلي. يرجى المحاولة مرة أخرى.",
        role: "assistant",
      });

      res.json([userMsg, errorMsg]);
    }
  });

  return httpServer;
}
