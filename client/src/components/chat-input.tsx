import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, ChevronDown, Mic } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface PromptProfileOption {
  id: string;
  label: string;
  description: string;
  promptLength?: number;
}

const FALLBACK_PROFILES: PromptProfileOption[] = [
  {
    id: "default_balanced",
    label: "محادثة ذكية",
    description: "توازن بين الوضوح والدقة.",
  },
  {
    id: "frontend_architect",
    label: "مهندس واجهات",
    description: "حلول تقنية منظمة وقابلة للصيانة.",
  },
  {
    id: "research_rag",
    label: "بحث تحليلي",
    description: "تحليل مع الاستفادة من المصادر المتاحة.",
  },
  {
    id: "translation_pro",
    label: "الترجمة",
    description: "ترجمة دقيقة تحفظ المعنى.",
  },
  {
    id: "content_writer",
    label: "إبداع المحتوى",
    description: "صياغة عربية جذابة ومهنية.",
  },
];

interface ChatInputProps {
  onSend: (message: string, systemPromptId?: string) => void;
  isLoading?: boolean;
  variant?: "hero" | "chat";
  promptProfiles?: PromptProfileOption[];
}

export function ChatInput({
  onSend,
  isLoading,
  variant = "chat",
  promptProfiles = [],
}: ChatInputProps) {
  const profiles = promptProfiles.length > 0 ? promptProfiles : FALLBACK_PROFILES;
  const showPromptProfilePicker = profiles.length > 1;

  const [message, setMessage] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "default_balanced");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(profiles[0]?.id ?? "default_balanced");
    }
  }, [profiles, selectedProfileId]);

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? FALLBACK_PROFILES[0];

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [message, adjustHeight]);

  const handleSubmit = () => {
    if (!message.trim() || isLoading) return;
    onSend(message.trim(), selectedProfile?.id);
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isHero = variant === "hero";

  return (
    <div className={cn("relative z-10 w-full", isHero ? "" : "sticky bottom-0 px-4 pb-2 pt-2 md:px-8")}>
      <div className={cn("mx-auto", isHero ? "max-w-6xl" : "max-w-4xl")}>
        <div
          className={cn(
            "rork-panel group relative overflow-hidden backdrop-blur-xl transition-all duration-300",
            isHero
              ? "rounded-[2rem] shadow-xl shadow-black/10"
              : "rounded-[1.65rem] shadow-lg shadow-black/10",
            "focus-within:border-primary/45 focus-within:shadow-[0_20px_32px_-24px_hsl(var(--foreground)/0.7)]",
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-primary/12 via-transparent to-transparent" />
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isHero ? "بمَ تفكر اليوم؟" : "اكتب لتبدأ النبض..."}
            rows={1}
            dir="auto"
            className={cn(
              "w-full resize-none rounded-none border-0 bg-transparent px-5 pb-3 pt-5 text-base leading-8 text-foreground placeholder:text-foreground/45",
              "max-h-[220px] font-medium tracking-[0.01em] focus-visible:ring-0 focus-visible:ring-offset-0",
              isHero ? "min-h-[132px] px-6 pb-4 pt-6 text-[1.06rem]" : "min-h-[88px]",
            )}
            aria-label="رسالة المستخدم"
            data-testid="input-chat-message"
          />

          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 border-t border-border/75 px-4 py-3.5 md:px-5",
              isHero && "px-5 py-4 md:px-6",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="إرفاق ملف"
                data-testid="button-attach"
                className="h-9 w-9 rounded-xl border-border/80 bg-background/45 text-foreground/50 hover:border-primary/35 hover:bg-background/80 hover:text-foreground"
              >
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </Button>

              {showPromptProfilePicker && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="تحديد نمط الرد"
                      data-testid="dropdown-prompt-profile-trigger"
                      className="h-9 gap-2 rounded-xl border-border/80 bg-background/45 px-3.5 text-sm font-semibold text-foreground/75 hover:border-primary/35 hover:bg-background/80 hover:text-foreground"
                    >
                      <span>{selectedProfile?.label ?? "محادثة ذكية"}</span>
                      <ChevronDown className="h-4 w-4 opacity-55" strokeWidth={2} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="min-w-[220px] rounded-xl border-border/80 bg-popover/95 p-1.5 backdrop-blur-xl"
                  >
                    {profiles.map((profile) => (
                      <DropdownMenuItem
                        key={profile.id}
                        onClick={() => setSelectedProfileId(profile.id)}
                        data-testid={`dropdown-item-profile-${profile.id}`}
                        className={cn(
                          "cursor-pointer rounded-lg py-2 text-sm font-medium transition-colors",
                          selectedProfileId === profile.id &&
                            "bg-primary/15 text-primary focus:bg-primary/20",
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>{profile.label}</span>
                          <span className="text-[11px] text-foreground/45">{profile.description}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="إدخال صوتي"
                data-testid="button-mic"
                className="h-9 w-9 rounded-xl border-border/80 bg-background/45 text-foreground/50 hover:border-primary/35 hover:bg-background/80 hover:text-foreground"
              >
                <Mic className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </Button>
              <Button
                type="button"
                aria-label="إرسال"
                data-testid="button-send-message"
                className={cn(
                  "h-9 w-9 rounded-xl border transition-all duration-300",
                  message.trim()
                    ? "rork-cta animate-[rorkCtaPulse_2.4s_ease-in-out_infinite] hover:-translate-y-0.5"
                    : "border-border/80 bg-background/45 text-foreground/25",
                )}
                onClick={handleSubmit}
                disabled={!message.trim() || isLoading}
              >
                <Send
                  className={cn(
                    "h-[18px] w-[18px] rotate-180",
                    message.trim() && "animate-in slide-in-from-bottom-2",
                  )}
                  strokeWidth={2}
                />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
