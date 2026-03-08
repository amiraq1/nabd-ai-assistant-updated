import { useState, useCallback, memo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DIRECT_PHONE_MODE_ENABLED,
  DIRECT_PHONE_MODEL_NAME,
  formatDirectPhoneReplyForDisplay,
  requestDirectPhoneReply,
} from "@/lib/direct-phone-chat";
import { NabdSidebar } from "@/components/nabd-sidebar";
import { NabdHeader } from "@/components/nabd-header";
import { ChatInput, type PromptProfileOption } from "@/components/chat-input";
import { ChatMessages } from "@/components/chat-messages";
import type { Conversation, Message } from "@shared/schema";

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

export default function Home() {
  const isDirectPhoneMode = DIRECT_PHONE_MODE_ENABLED;
  const directSessionRef = useRef(0);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [directMessages, setDirectMessages] = useState<Message[]>([]);
  const [directConversationTitle, setDirectConversationTitle] = useState<string | null>(null);

  const { data: serverConversations = [] } = useQuery<Conversation[]>({
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
        <NabdHeader
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          conversationTitle={activeConversation?.title}
          connectionLabel={isDirectPhoneMode ? `DIRECT ${DIRECT_PHONE_MODEL_NAME.toUpperCase()}` : undefined}
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
