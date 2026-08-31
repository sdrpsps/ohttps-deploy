"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  ohttpsApiId: z.string().max(200), ohttpsApiKey: z.string().max(500), webhookUrl: z.string().url("请输入有效 URL").or(z.literal("")), webhookSecret: z.string().max(500),
  renewBeforeDays: z.coerce.number().int().min(1).max(365), ohttpsMinIntervalSeconds: z.coerce.number().int().min(60).max(31_536_000), ohttpsDailyCallLimit: z.coerce.number().int().min(1).max(100_000), schedulerIntervalMinutes: z.coerce.number().int().min(1).max(1_440), logRetentionDays: z.coerce.number().int().min(1).max(3_650),
});
type SettingsForm = z.infer<typeof schema>;

export type SettingsSummary = Omit<SettingsForm, "ohttpsApiId" | "ohttpsApiKey" | "webhookSecret"> & { ohttpsConfigured: boolean; webhookSecretConfigured: boolean; sharedSshPrivateKeyConfigured: boolean };

type Props = { open: boolean; busy: boolean; settings: SettingsSummary | null; onOpenChange: (open: boolean) => void; onSave: (value: SettingsForm) => Promise<boolean>; onConfigureSshKey: () => void };

export function SettingsDialog({ open, busy, settings, onOpenChange, onSave, onConfigureSshKey }: Props) {
  const form = useForm<SettingsForm>({ resolver: zodResolver(schema), defaultValues: defaults });
  useEffect(() => { if (open) form.reset({ ...defaults, ...settings, ohttpsApiId: "", ohttpsApiKey: "", webhookSecret: "" }); }, [form, open, settings]);
  async function submit(value: SettingsForm) { if (await onSave(value)) onOpenChange(false); }
  const secretHint = (configured: boolean) => configured ? "已配置；留空则保持不变。" : "尚未配置。";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>系统设置</DialogTitle><DialogDescription>凭据仅保存到受保护的 SQLite 数据库，界面和 API 不会返回其内容。</DialogDescription></DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
            <section className="space-y-3 rounded-lg border p-4"><div><h3 className="text-sm font-semibold">ohttps 凭据</h3><p className="text-xs text-muted-foreground">用于拉取证书；留空不会覆盖已保存的密钥。</p></div>
              <TextField control={form.control} name="ohttpsApiId" label="API ID" placeholder={secretHint(settings?.ohttpsConfigured ?? false)} />
              <TextField control={form.control} name="ohttpsApiKey" label="API Key" type="password" placeholder={secretHint(settings?.ohttpsConfigured ?? false)} />
            </section>
            <section className="space-y-3 rounded-lg border p-4"><div><h3 className="text-sm font-semibold">Webhook 通知</h3><p className="text-xs text-muted-foreground">部署、同步和过期事件会以签名 JSON 投递。</p></div>
              <TextField control={form.control} name="webhookUrl" label="Webhook URL" placeholder="https://example.com/ssl-events；留空则停用通知" />
              <TextField control={form.control} name="webhookSecret" label="签名密钥" type="password" placeholder={secretHint(settings?.webhookSecretConfigured ?? false)} />
            </section>
            <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><div className="col-span-full"><h3 className="text-sm font-semibold">调度与续期</h3><p className="text-xs text-muted-foreground">控制本地扫描频率、续期窗口和 API 调用保护。</p></div>
              <TextField control={form.control} name="renewBeforeDays" label="默认续期天数" type="number" />
              <TextField control={form.control} name="ohttpsMinIntervalSeconds" label="API 最小间隔（秒）" type="number" />
              <TextField control={form.control} name="ohttpsDailyCallLimit" label="每日 API 调用上限" type="number" />
              <TextField control={form.control} name="schedulerIntervalMinutes" label="扫描频率（分钟）" type="number" />
              <TextField control={form.control} name="logRetentionDays" label="日志保留天数" type="number" />
            </section>
            <section className="flex items-center justify-between rounded-lg border p-4"><div><p className="text-sm font-semibold">SSH 部署凭据</p><p className="mt-1 text-xs text-muted-foreground">所有服务器共用一把私钥，数据库文件需限制访问权限。</p><p className="mt-1 text-xs">{settings?.sharedSshPrivateKeyConfigured ? "已配置" : "尚未配置"}</p></div><Button type="button" variant="outline" onClick={onConfigureSshKey}>配置私钥</Button></section>
            <section className="rounded-lg border p-4"><h3 className="text-sm font-semibold">日志与保留策略</h3><p className="mt-1 text-xs text-muted-foreground">日志自动清理前请先完成归档或确认。</p></section>
            <section className="rounded-lg border p-4"><h3 className="text-sm font-semibold">管理员安全</h3><p className="mt-1 text-xs text-muted-foreground">管理员密码仅用于登录，不会出现在 API 响应或业务日志中。</p></section>
            <Button className="w-full" disabled={busy}>{busy ? "保存中..." : "保存设置"}</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({ control, name, label, type = "text", placeholder }: { control: ReturnType<typeof useForm<SettingsForm>>["control"]; name: keyof SettingsForm; label: string; type?: string; placeholder?: string }) {
  return <FormField control={control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input type={type} placeholder={placeholder} {...field} onChange={(event) => field.onChange(type === "number" ? event.target.valueAsNumber : event.target.value)} /></FormControl><FormMessage /></FormItem>} />;
}

const defaults: SettingsForm = { ohttpsApiId: "", ohttpsApiKey: "", webhookUrl: "", webhookSecret: "", renewBeforeDays: 20, ohttpsMinIntervalSeconds: 86400, ohttpsDailyCallLimit: 100, schedulerIntervalMinutes: 60, logRetentionDays: 90 };
