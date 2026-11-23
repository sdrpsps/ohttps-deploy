import { ArrowRight, Check, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Step = { label: string; done: boolean; action?: string; onAction?: () => void; icon: typeof Settings2 };

export function OnboardingWizard({ steps }: { steps: Step[] }) {
  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;

  const percentage = Math.round((completed / steps.length) * 100);

  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/[0.02] shadow-none">
      <CardHeader className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">初始化配置</CardTitle>
          <Badge variant="secondary" className="font-mono text-[11px]">
            {completed} / {steps.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:w-40">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="font-mono text-[11px] font-medium text-muted-foreground">{percentage}%</span>
        </div>
      </CardHeader>

      <CardContent className="grid gap-2.5 border-t border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div
              key={step.label}
              className={`group flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                step.done
                  ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                  : "border-border/80 bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {step.done ? (
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3 stroke-[2.5]" />
                  </div>
                ) : (
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] font-medium text-muted-foreground">
                    {index + 1}
                  </div>
                )}
                <span className={`truncate text-xs font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {step.label}
                </span>
              </div>

              {step.done ? (
                <span className="shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  完成
                </span>
              ) : step.action && step.onAction ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-[11px] font-medium text-primary hover:text-primary/80"
                  onClick={step.onAction}
                >
                  <span>{step.action}</span>
                  <ArrowRight className="ml-1 size-3 transition-transform group-hover:translate-x-0.5" />
                </Button>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Icon className="size-3" /> 待上线
                </span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
