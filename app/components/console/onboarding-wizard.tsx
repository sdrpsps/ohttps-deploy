import { ArrowRight, Check, Circle, ExternalLink, Settings2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Step = { label: string; done: boolean; action?: string; onAction?: () => void; icon: typeof Settings2 };

export function OnboardingWizard({ steps }: { steps: Step[] }) {
  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;

  const percentage = Math.round((completed / steps.length) * 100);

  return (
    <Card className="overflow-hidden border-primary/25 bg-gradient-to-b from-primary/[0.04] to-card shadow-sm">
      <CardHeader className="p-5 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-3.5" />
              </span>
              <CardTitle className="text-base font-semibold">首次配置指引</CardTitle>
              <Badge variant="secondary" className="font-mono text-xs">
                {completed} / {steps.length}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              按照以下步骤完成初始化配置，开启全自动化证书续期与安全部署
            </CardDescription>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-muted sm:w-44">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="font-mono text-xs font-medium text-muted-foreground">{percentage}%</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 p-5 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div
              key={step.label}
              className={`group flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-150 ${
                step.done
                  ? "border-emerald-500/20 bg-emerald-500/[0.03] dark:border-emerald-500/15"
                  : "border-border/80 bg-card hover:border-primary/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {step.done ? (
                      <div className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <Check className="size-2.5 stroke-[2.5]" />
                      </div>
                    ) : (
                      <div className="flex size-4 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] font-medium text-muted-foreground">
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={`block text-xs font-medium leading-snug ${step.done ? "text-foreground/75" : "text-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                </div>
                <Icon className={`size-3.5 shrink-0 ${step.done ? "text-emerald-500/60" : "text-muted-foreground/50"}`} />
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                {step.done ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" /> 已完成
                  </span>
                ) : step.action && step.onAction ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-[11px] font-medium text-primary hover:text-primary/80"
                    onClick={step.onAction}
                  >
                    <span>{step.action}</span>
                    <ArrowRight className="ml-1 size-3 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Icon className="size-3" /> 等待拉起
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
