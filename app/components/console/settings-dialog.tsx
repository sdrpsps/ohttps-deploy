"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Bell, Clock, Key, KeyRound, LoaderCircle, Send, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  ohttpsApiId: z.string().max(200), ohttpsApiKey: z.string().max(500), webhookUrl: z.string().url("请输入有效 URL").or(z.literal("")),
  renewBeforeDays: z.coerce.number().int().min(1).max(365), ohttpsMinIntervalSeconds: z.coerce.number().int().min(60).max(31_536_000), ohttpsDailyCallLimit: z.coerce.number().int().min(1).max(100_000), schedulerIntervalMinutes: z.coerce.number().int().min(1).max(1_440), logRetentionDays: z.coerce.number().int().min(1).max(3_650),
});
type SettingsForm = z.infer<typeof schema>;

export type SettingsSummary = Omit<SettingsForm, "ohttpsApiKey"> & {
  ohttpsApiId?: string;
  ohttpsApiKeyMasked?: string;
  ohttpsConfigured: boolean;
  sharedSshPrivateKeyConfigured: boolean;
};

type Props = { open: boolean; busy: boolean; settings: SettingsSummary | null; onOpenChange: (open: boolean) => void; onSave: (value: SettingsForm) => Promise<boolean>; onTestBark: (webhookUrl: string) => void; onConfigureSshKey: () => void; onChangePassword: () => void };

export function SettingsDialog({ open, busy, settings, onOpenChange, onSave, onTestBark, onConfigureSshKey, onChangePassword }: Props) {
  const form = useForm<SettingsForm>({ resolver: zodResolver(schema), defaultValues: defaults });
  useEffect(() => {
    if (open) {
      form.reset({
        ...defaults,
        ...settings,
        ohttpsApiId: settings?.ohttpsApiId ?? "",
        ohttpsApiKey: "",
      });
    }
  }, [form, open, settings]);
  async function submit(value: SettingsForm) { if (await onSave(value)) onOpenChange(false); }
  const secretHint = (configured: boolean) => configured ? "已配置；留空则保持不变。" : "尚未配置。";
  const intervalSeconds = form.watch("ohttpsMinIntervalSeconds");
  const webhookUrl = form.watch("webhookUrl");

  async function testBark() {
    if (await form.trigger("webhookUrl")) onTestBark(form.getValues("webhookUrl"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <SlidersHorizontal className="size-5 text-primary" />
            <span>全局系统设置</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            核心凭据保存于受文件权限隔离保护的本地 SQLite 数据库；敏感 API Key 仅支持掩码回显以防意外泄密。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-5 pt-1" onSubmit={form.handleSubmit(submit)}>
            {/* 1. ohttps Credentials */}
            <section className="space-y-3 rounded-xl border border-border/80 bg-muted/[0.08] p-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <KeyRound className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">ohttps 凭据配置</h3>
                    <p className="text-[11px] text-muted-foreground">用于定时自动获取或续期证书；留空保存不会覆盖已有密钥。</p>
                  </div>
                </div>
                {settings?.ohttpsConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    已生效就绪
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">未配置</Badge>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <TextField
                  control={form.control}
                  name="ohttpsApiId"
                  label="API ID"
                  placeholder={secretHint(settings?.ohttpsConfigured ?? false)}
                />
                <TextField
                  control={form.control}
                  name="ohttpsApiKey"
                  label={settings?.ohttpsApiKeyMasked ? `API Key (已保存: ${settings.ohttpsApiKeyMasked})` : "API Key"}
                  type="password"
                  placeholder={settings?.ohttpsApiKeyMasked ? `留空保持不变 (${settings.ohttpsApiKeyMasked})` : secretHint(false)}
                />
              </div>
            </section>

            {/* 2. Bark */}
            <section className="space-y-3 rounded-xl border border-border/80 bg-muted/[0.08] p-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <Bell className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">Bark 推送通知</h3>
                    <p className="text-[11px] text-muted-foreground">部署结果、证书同步与即将过期等重要事件将以 Bark JSON 格式推送。</p>
                  </div>
                </div>
                {settings?.webhookUrl ? (
                  <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400">
                    已配置 URL
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">未开启</Badge>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 pt-1">
                <div className="min-w-64 flex-1">
                  <TextField
                    control={form.control}
                    name="webhookUrl"
                    label="Bark 推送 URL"
                    placeholder="https://api.day.app/你的设备 Key；留空则停用"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="mb-0.5 h-9 gap-1.5" disabled={busy || !webhookUrl} onClick={() => void testBark()}>
                  <Send className="size-3.5" />
                  发送测试消息
                </Button>
              </div>
            </section>

            {/* 3. Scheduler and Renewal Policies */}
            <section className="space-y-3 rounded-xl border border-border/80 bg-muted/[0.08] p-4">
              <div className="border-b border-border/40 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Clock className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">后台扫描调度与频控</h3>
                    <p className="text-[11px] text-muted-foreground">本地版本扫描频率、续期提前天数及 ohttps 调用上限保护。</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <TextField control={form.control} name="renewBeforeDays" label="默认提前续期天数" type="number" />
                <div className="space-y-1">
                  <TextField control={form.control} name="ohttpsMinIntervalSeconds" label="API 最小调用间隔 (秒)" type="number" />
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      当前换算：{formatSecondsFriendly(intervalSeconds)}
                    </span>
                    <div className="flex gap-1 text-xs">
                      <button
                        type="button"
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => form.setValue("ohttpsMinIntervalSeconds", 86400, { shouldValidate: true, shouldDirty: true })}
                      >
                        24h
                      </button>
                      <button
                        type="button"
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => form.setValue("ohttpsMinIntervalSeconds", 43200, { shouldValidate: true, shouldDirty: true })}
                      >
                        12h
                      </button>
                      <button
                        type="button"
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => form.setValue("ohttpsMinIntervalSeconds", 3600, { shouldValidate: true, shouldDirty: true })}
                      >
                        1h
                      </button>
                    </div>
                  </div>
                </div>

                <TextField control={form.control} name="ohttpsDailyCallLimit" label="每日 API 调用限额" type="number" />
                <TextField control={form.control} name="schedulerIntervalMinutes" label="后台扫描轮询周期 (分钟)" type="number" />
                <div className="sm:col-span-2">
                  <TextField control={form.control} name="logRetentionDays" label="执行与审计日志保留天数" type="number" />
                </div>
              </div>
            </section>

            {/* 4. SSH & Security Actions */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/[0.08] p-3.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Key className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">共享 SSH 私钥</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {settings?.sharedSshPrivateKeyConfigured ? "已配置共享私钥" : "尚未配置私钥"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    onOpenChange(false);
                    onConfigureSshKey();
                  }}
                >
                  配置私钥
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/[0.08] p-3.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">管理员身份安全</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">修改当前管理员 admin 登录密码</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    onOpenChange(false);
                    onChangePassword();
                  }}
                >
                  修改密码
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={busy} className="gap-1.5 shadow-sm">
                {busy && <LoaderCircle className="size-3.5 animate-spin" />}
                <span>{busy ? "保存设置中..." : "保存系统设置"}</span>
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function formatSecondsFriendly(seconds: number): string {
  if (!seconds || seconds <= 0) return "-";
  if (seconds % 86400 === 0) return `${seconds / 86400} 天`;
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  if (seconds >= 3600) return `约 ${(seconds / 3600).toFixed(1)} 小时`;
  return `${seconds} 秒`;
}

function TextField({ control, name, label, type = "text", placeholder, autoComplete, disabled = false }: { control: ReturnType<typeof useForm<SettingsForm>>["control"]; name: keyof SettingsForm; label: string; type?: string; placeholder?: string; autoComplete?: string; disabled?: boolean }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              disabled={disabled}
              placeholder={placeholder}
              autoComplete={autoComplete ?? (type === "password" ? "new-password" : "off")}
              {...field}
              onChange={(event) =>
                field.onChange(
                  type === "number"
                    ? Number.isNaN(event.target.valueAsNumber)
                      ? ""
                      : event.target.valueAsNumber
                    : event.target.value
                )
              }
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const defaults: SettingsForm = { ohttpsApiId: "", ohttpsApiKey: "", webhookUrl: "", renewBeforeDays: 20, ohttpsMinIntervalSeconds: 86400, ohttpsDailyCallLimit: 100, schedulerIntervalMinutes: 60, logRetentionDays: 90 };
