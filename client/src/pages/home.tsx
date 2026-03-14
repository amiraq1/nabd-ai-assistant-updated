import { useState, useEffect, useCallback, memo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Smartphone } from "lucide-react";
import {
  clearDirectPhoneRuntimeSettings,
  DIRECT_PHONE_MODE_ENABLED,
  DIRECT_PHONE_MODEL_NAME,
  formatDirectPhoneReplyForDisplay,
  requestDirectPhoneReply,
} from "@/lib/direct-phone-chat";
import { NabdSidebar } from "@/components/nabd-sidebar";
import { NabdHeader } from "@/components/nabd-header";
import { ChatInput, type PromptProfileOption } from "@/components/chat-input";
import { ChatMessages } from "@/components/chat-messages";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import type { Conversation, Message } from "@shared/schema";
import {
  isUISchemaGeneratedEvent,
  type UIComponent,
  type UISchemaGeneratedEvent,
} from "@shared/ui-schema";

interface PromptProfileSummary extends PromptProfileOption {}

interface PromptProfilesResponse {
  count: number;
  items: PromptProfileSummary[];
}

const DIRECT_CONVERSATION_ID = "direct-phone";
const DIRECT_PHONE_PROFILE: PromptProfileOption[] = [
  {
    id: "direct_phone",
    label: "tinyllama",
    description: "اتصال مباشر بهاتفك",
  },
];

function createLocalMessage(role: Message["role"], content: string): Message {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: DIRECT_CONVERSATION_ID,
    role,
    content,
    createdAt: new Date(),
  };
}

const HeroSection = memo(
  ({
    onSend,
    isLoading,
    promptProfiles,
  }: {
    onSend: (content: string, systemPromptId?: string) => void;
    isLoading: boolean;
    promptProfiles: PromptProfileOption[];
  }) => (
    <div className="flex-1 overflow-y-auto px-4 py-7 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-col items-center gap-2 pt-10 pb-2 text-center">
          <h1 className="hero-brand-title" data-testid="text-hero-title">
            نبضـ
          </h1>
          <p className="text-base font-medium tracking-wide text-foreground/50">
            ذكاء بلا ضجيج.
          </p>
        </div>
        <ChatInput
          onSend={onSend}
          isLoading={isLoading}
          variant="hero"
          promptProfiles={promptProfiles}
        />
      </div>
    </div>
  ),
);

HeroSection.displayName = "HeroSection";

const LivePreviewCanvas = memo(({ schema }: { schema: UIComponent | null }) => (
  <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 md:px-6">
      <div className="flex items-center gap-2.5">
        <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.16)]" />
        <h2 className="text-sm font-semibold tracking-[0.11em] text-foreground/75 uppercase">
          Live Preview Canvas
        </h2>
      </div>
      <span className="rounded-full border border-border/80 bg-background/45 px-2.5 py-1 text-[11px] font-semibold text-foreground/50">
        Responsive
      </span>
    </div>

    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-6 md:p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 16%, hsl(var(--primary)/0.2), transparent 28%), radial-gradient(circle at 82% 88%, hsl(var(--accent)/0.22), transparent 32%)",
        }}
      />
      <div className="relative flex h-full w-full max-w-[420px] items-center justify-center">
        <div className="pointer-events-none absolute inset-x-8 top-5 h-16 rounded-full bg-primary/18 blur-3xl" />
        <div className="relative w-full max-w-[350px] rounded-[2.1rem] border border-border/80 bg-card/65 p-2 shadow-[0_22px_44px_-26px_hsl(0_0%_0%_/_0.9)] backdrop-blur-xl">
          <div className="relative aspect-[9/19.5] overflow-hidden rounded-[1.75rem] border border-border/65 bg-white shadow-[inset_0_1px_0_hsl(0_0%_100%_/_0.82)] dark:bg-card">
            <div className="absolute inset-x-0 top-0 h-10 border-b border-border/55 bg-background/75 backdrop-blur-md" />
            <div className="absolute left-1/2 top-2.5 h-1.5 w-16 -translate-x-1/2 rounded-full bg-foreground/18" />
            {schema ? (
              <div className="relative h-full overflow-y-auto px-4 pb-4 pt-14">
                <WidgetRenderer schema={schema} />
              </div>
            ) : (
              <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="rounded-2xl border border-primary/25 bg-primary/12 p-3 text-primary">
                  <Smartphone className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground/80">Generated app preview appears here</p>
                <p className="max-w-[220px] text-xs leading-6 text-foreground/50">
                  Your AI-generated screens will render in this canvas in real time.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </section>
));

LivePreviewCanvas.displayName = "LivePreviewCanvas";

export default function Home() {
  const isDirectPhoneMode = DIRECT_PHONE_MODE_ENABLED;
  const directSessionRef = useRef(0);
  const activeConversationIdRef = useRef<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<Message[]>([]);
  const [directConversationTitle, setDirectConversationTitle] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<UISchemaGeneratedEvent | null>(null);

  const { data: serverConversations = [], isSuccess: conversationsReady } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: !isDirectPhoneMode,
  });

  const { data: promptProfilesResponse } = useQuery<PromptProfilesResponse>({
    queryKey: ["/api/ai/prompt-profiles"],
    enabled: !isDirectPhoneMode,
  });

  const { data: serverMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", activeConversationId, "messages"],
    enabled: !isDirectPhoneMode && !!activeConversationId,
  });

  const { data: previewSnapshot = null } = useQuery<UISchemaGeneratedEvent | null>({
    queryKey: ["/api/conversations", activeConversationId, "preview"],
    enabled: !isDirectPhoneMode && !!activeConversationId,
  });

  const directConversations: Conversation[] = directConversationTitle
    ? [
        {
          id: DIRECT_CONVERSATION_ID,
          userId: "direct-phone",
          title: directConversationTitle,
          createdAt: new Date(),
        },
      ]
    : [];

  const conversations = isDirectPhoneMode ? directConversations : serverConversations;
  const messages = isDirectPhoneMode ? directMessages : serverMessages;
  const promptProfiles = isDirectPhoneMode
    ? DIRECT_PHONE_PROFILE
    : (promptProfilesResponse?.items ?? []);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) {
      setPreviewEvent(null);
      return;
    }

    if (previewSnapshot && isUISchemaGeneratedEvent(previewSnapshot)) {
      setPreviewEvent(previewSnapshot);
      return;
    }

    setPreviewEvent(null);
  }, [activeConversationId, previewSnapshot]);

  useEffect(() => {
    if (isDirectPhoneMode || !conversationsReady || typeof window === "undefined") {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/ui-preview`);

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as unknown;
        if (!isUISchemaGeneratedEvent(parsed)) {
          return;
        }

        const activeId = activeConversationIdRef.current;
        if (!activeId || parsed.conversationId !== activeId) {
          return;
        }

        setPreviewEvent(parsed);
      } catch (error) {
        console.error("Failed to parse UI schema websocket payload:", error);
      }
    };

    return () => {
      socket.close();
    };
  }, [conversationsReady, isDirectPhoneMode]);

  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/conversations", { title });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConversationId(data.id);
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      conversationId,
      content,
      systemPromptId,
    }: {
      conversationId: string;
      content: string;
      systemPromptId?: string;
    }) => {
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        content,
        role: "user",
        systemPromptId,
      });
      return res.json();
    },
    onSuccess: () => {
      if (activeConversationId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", activeConversationId, "messages"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", activeConversationId, "preview"],
        });
      }
    },
  });

  const directSendMessage = useMutation({
    mutationFn: async (content: string) => requestDirectPhoneReply(content),
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
      return id;
    },
    onSuccess: (deletedId: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (activeConversationId === deletedId) {
        setActiveConversationId(null);
      }
    },
  });

  const resetDirectConversation = useCallback(() => {
    directSessionRef.current += 1;
    setDirectMessages([]);
    setDirectConversationTitle(null);
    setActiveConversationId(null);
  }, []);

  const handleDisconnectPhone = useCallback(() => {
    resetDirectConversation();
    clearDirectPhoneRuntimeSettings();

    if (typeof window !== "undefined") {
      window.location.assign(`${window.location.origin}${window.location.pathname}`);
    }
  }, [resetDirectConversation]);

  const handleSend = useCallback(
    async (content: string, systemPromptId?: string) => {
      if (isDirectPhoneMode) {
        const shortTitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
        const sessionAtSend = directSessionRef.current;

        setDirectMessages((current) => [...current, createLocalMessage("user", content)]);
        setDirectConversationTitle((current) => current ?? shortTitle);
        setActiveConversationId(DIRECT_CONVERSATION_ID);

        try {
          const reply = await directSendMessage.mutateAsync(content);
          if (directSessionRef.current !== sessionAtSend) return;

          setDirectMessages((current) => [
            ...current,
            createLocalMessage("assistant", formatDirectPhoneReplyForDisplay(reply)),
          ]);
        } catch (error) {
          if (directSessionRef.current !== sessionAtSend) return;

          const message =
            error instanceof Error
              ? error.message
              : "تعذر الوصول إلى tinyllama على الهاتف";
          setDirectMessages((current) => [
            ...current,
            createLocalMessage("assistant", `تعذر الاتصال بالهاتف: ${message}`),
          ]);
        }

        return;
      }

      if (!activeConversationId) {
        const shortTitle = content.length > 30 ? `${content.slice(0, 30)}...` : content;
        const conv = await createConversation.mutateAsync(shortTitle);
        await sendMessage.mutateAsync({ conversationId: conv.id, content, systemPromptId });
      } else {
        await sendMessage.mutateAsync({
          conversationId: activeConversationId,
          content,
          systemPromptId,
        });
      }
    },
    [
      activeConversationId,
      createConversation,
      directSendMessage,
      isDirectPhoneMode,
      sendMessage,
    ],
  );

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const isInChat = isDirectPhoneMode ? directMessages.length > 0 : !!activeConversationId;
  const isLoading = isDirectPhoneMode
    ? directSendMessage.isPending
    : sendMessage.isPending || createConversation.isPending;

  const chatContent = (
    <>
      <NabdHeader
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        conversationTitle={activeConversation?.title}
        connectionLabel={isDirectPhoneMode ? `DIRECT ${DIRECT_PHONE_MODEL_NAME.toUpperCase()}` : undefined}
        onDisconnectPhone={isDirectPhoneMode ? handleDisconnectPhone : undefined}
      />

      {!isInChat ? (
        <HeroSection
          onSend={handleSend}
          isLoading={isLoading}
          promptProfiles={promptProfiles}
        />
      ) : (
        <div className="relative flex min-h-0 w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-col">
          <ChatMessages messages={messages} isLoading={isLoading} />
          <ChatInput
            onSend={handleSend}
            isLoading={isLoading}
            variant="chat"
            promptProfiles={promptProfiles}
          />
        </div>
      )}
    </>
  );

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.12] mix-blend-screen"
        style={{
          backgroundImage:
            "linear-gradient(115deg, transparent 0%, hsl(var(--foreground)/0.12) 1.5%, transparent 3.5%, transparent 100%), linear-gradient(to right, hsl(var(--foreground)/0.08) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)/0.08) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 24px 24px, 24px 24px",
        }}
      />
      <div className="pointer-events-none absolute -left-24 top-10 h-[320px] w-[320px] rounded-full bg-accent/30 blur-[90px]" />
      <div className="pointer-events-none absolute -right-28 bottom-12 h-[360px] w-[360px] rounded-full bg-primary/28 blur-[95px]" />

      <div className="z-10 flex min-w-0 flex-1 flex-col">
        <div className="hidden min-h-0 flex-1 md:flex">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="home-chat-preview-layout"
            className="min-h-0"
          >
            <ResizablePanel defaultSize={30} minSize={24} maxSize={45} className="min-w-0">
              <div className="flex h-full min-h-0 flex-col border-r border-border/70 bg-background/45">
                {chatContent}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border/70" />
            <ResizablePanel defaultSize={70} minSize={55}>
              <div className="h-full bg-background/30">
                <LivePreviewCanvas schema={previewEvent?.schema ?? null} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:hidden">
          <div className="min-h-0 basis-[42%] border-b border-border/70 bg-background/32">
            <LivePreviewCanvas schema={previewEvent?.schema ?? null} />
          </div>
          <div className="flex min-h-0 basis-[58%] flex-col bg-background/45">
            {chatContent}
          </div>
        </div>
      </div>

      <NabdSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => setActiveConversationId(id)}
        onNewConversation={() => {
          if (isDirectPhoneMode) {
            resetDirectConversation();
            return;
          }

          setActiveConversationId(null);
        }}
        onDeleteConversation={(id) => {
          if (isDirectPhoneMode && id === DIRECT_CONVERSATION_ID) {
            resetDirectConversation();
            return;
          }

          deleteConversation.mutate(id);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </div>
  );
}
