import { AlertTriangle, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@shared/schema";
import { useEffect, useRef } from "react";

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
}

function splitAccuracyWarning(content: string): {
  warning: string | null;
  body: string;
} {
  if (!content.startsWith("تنبيه دقة:")) {
    return { warning: null, body: content };
  }

  const [warning, ...rest] = content.split(/\n\s*\n/);
  return {
    warning: warning.trim(),
    body: rest.join("\n\n").trim(),
  };
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 md:px-6 md:py-8">
      {messages.map((msg) => {
        const { warning, body } = splitAccuracyWarning(msg.content);

        return (
          <div
            key={msg.id}
            className={cn(
              "flex items-start gap-3",
              msg.role === "user" ? "flex-row-reverse" : "flex-row",
            )}
            data-testid={`message-${msg.id}`}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition-colors",
                msg.role === "user"
                  ? "border-primary/36 bg-primary/14 text-primary"
                  : "border-border/80 bg-card text-foreground/70",
              )}
            >
              {msg.role === "user" ? (
                <User className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>
            <div
              className={cn(
                "max-w-[84%] whitespace-pre-wrap rounded-[1.45rem] border px-4 py-3.5 text-sm leading-7 shadow-sm",
                msg.role === "user"
                  ? "border-primary/30 bg-[linear-gradient(140deg,hsl(var(--primary)/0.2),hsl(var(--primary)/0.08))] text-foreground/96"
                  : "border-border/80 bg-card/92 text-foreground/85",
              )}
            >
              {warning && (
                <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-6 text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{warning}</span>
                </div>
              )}
              {body}
            </div>
          </div>
        );
      })}
      {isLoading && (
        <div className="flex items-start gap-3" data-testid="message-loading">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-card text-foreground/70">
            <Bot className="h-4 w-4" />
          </div>
          <div className="rounded-[1.45rem] border border-border/80 bg-card/90 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground/60">نبض يفكر...</span>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/55" style={{ animationDelay: "0ms" }} />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/55" style={{ animationDelay: "150ms" }} />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/55" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
