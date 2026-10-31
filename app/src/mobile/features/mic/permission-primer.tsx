import { Check, Mic, ShieldCheck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { MIC_COPY } from "./mic-copy";

type PermissionPrimerProps = {
  open: boolean;
  mode: "primer" | "guide";
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
};

export function PermissionPrimer({
  open,
  mode,
  busy = false,
  onOpenChange,
  onContinue,
}: PermissionPrimerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl border-pet-border bg-pet-bg pb-[calc(env(safe-area-inset-bottom)+24px)] text-pet-text"
      >
        <SheetHeader className="gap-2 px-6 pt-6">
          <div className="flex size-11 items-center justify-center rounded-full bg-pet-primary/15 text-pet-primary">
            {mode === "primer" ? <Mic className="size-5" /> : <ShieldCheck className="size-5" />}
          </div>
          <SheetTitle className="text-lg text-pet-text">
            {mode === "primer" ? MIC_COPY.permissionPrimerTitle : MIC_COPY.permissionGuideTitle}
          </SheetTitle>
          <SheetDescription className="text-sm leading-relaxed text-pet-muted">
            {mode === "primer"
              ? "先说清楚，再打开麦克风。"
              : "系统不会再自动弹窗，需要你手动打开。"}
          </SheetDescription>
        </SheetHeader>

        {mode === "primer" ? (
          <ul className="flex flex-col gap-3 px-6 text-sm text-pet-text">
            {MIC_COPY.permissionPrimerLines.map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <Check className="size-4 shrink-0 text-pet-success" />
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <ol className="flex flex-col gap-3 px-6 text-sm text-pet-text">
            {MIC_COPY.permissionGuideSteps.map((step, index) => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-pet-primary/15 text-xs text-pet-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-2 px-6 pt-5">
          <Button
            type="button"
            size="lg"
            className="h-12 rounded-full bg-pet-primary text-pet-primary-foreground"
            disabled={busy}
            onClick={onContinue}
          >
            {mode === "primer" ? MIC_COPY.permissionPrimerContinue : MIC_COPY.permissionGuideClose}
          </Button>
          {mode === "primer" && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 rounded-full text-pet-muted"
              onClick={() => onOpenChange(false)}
            >
              {MIC_COPY.permissionPrimerLater}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
