import { Check, Circle, ExternalLink, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Step = { label: string; done: boolean; action?: string; onAction?: () => void; icon: typeof Settings2 };

export function OnboardingWizard({ steps }: { steps: Step[] }) {
  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;
  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardHeader className="p-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div><CardTitle className="text-lg">首次配置向导</CardTitle><CardDescription className="mt-1">按顺序完成配置，即可开始安全同步和部署证书。</CardDescription></div>
          <Badge variant="secondary">已完成 {completed}/{steps.length} 步</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-5 pt-0 md:grid-cols-5">
        {steps.map((step, index) => { const Icon = step.icon; return (
          <div key={step.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              {step.done ? <Check className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
              <span>{index + 1}. {step.label}</span>
            </div>
            {!step.done && step.action && step.onAction && <Button variant="link" size="sm" className="mt-2 h-auto p-0" onClick={step.onAction}>{step.action}<ExternalLink className="ml-1 size-3" /></Button>}
            {step.done && <p className="mt-2 text-xs text-primary">已完成</p>}
            {!step.done && !step.action && <p className="mt-2 text-xs text-muted-foreground"><Icon className="mr-1 inline size-3" />等待 Worker</p>}
          </div>
        ); })}
      </CardContent>
    </Card>
  );
}
