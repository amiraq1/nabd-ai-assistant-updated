import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NabdHeaderProps {
  onToggleSidebar: () => void;
  conversationTitle?: string;
  connectionLabel?: string;
}

export function NabdHeader({
  onToggleSidebar,
  conversationTitle,
  connectionLabel,
}: NabdHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-border/80 bg-background/88 backdrop-blur-xl"
      data-testid="header"
    >
      <div className="mx-auto flex h-[4.25rem] w-full max-w-6xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.15)]" />
            <h1 className="font-serif text-3xl leading-none text-foreground">
              نبضـ
            </h1>
          </div>
          {conversationTitle && (
            <span className="rork-chip max-w-[18rem] truncate rounded-full px-3 py-1 text-sm font-medium">
              {conversationTitle}
            </span>
          )}
          {connectionLabel && (
            <span className="truncate rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-primary/80">
              {connectionLabel}
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-2xl border-border/80 bg-card/60 text-foreground/70 hover-rise hover:text-foreground"
          onClick={onToggleSidebar}
          data-testid="button-toggle-sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
