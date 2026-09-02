"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Fingerprint, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Control, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ManagedServer } from "./types";

const serverSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  host: z.string().min(1, "请输入主机"),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1, "请输入用户名"),
  hostFingerprint: z.string().min(1, "请输入主机指纹"),
  validationCommand: z.string().min(1, "请输入部署前检查命令"),
  reloadCommand: z.string().min(1, "请输入重载命令"),
  healthCheckCommand: z.string(),
  timeoutSeconds: z.coerce.number().int().min(1).max(300),
  enabled: z.boolean(),
});

type ServerForm = z.infer<typeof serverSchema>;

type ServerFormDialogProps = {
  server: ManagedServer | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ServerForm, server: ManagedServer | null) => Promise<boolean>;
};

export function ServerFormDialog({
  server,
  open,
  busy,
  onOpenChange,
  onSave,
}: ServerFormDialogProps) {
  const [fetchingFingerprint, setFetchingFingerprint] = useState(false);
  const form = useForm<ServerForm>({
    resolver: zodResolver(serverSchema),
    defaultValues: emptyServerForm,
  });

  useEffect(() => {
    form.reset(server ? toFormValues(server) : emptyServerForm);
  }, [form, open, server]);

  async function submit(values: ServerForm) {
    if (await onSave(values, server)) onOpenChange(false);
  }

  async function fetchFingerprint() {
    if (!await form.trigger(["host", "port"])) return;
    setFetchingFingerprint(true);
    try {
      const response = await fetch("/api/servers/fingerprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: form.getValues("host"), port: form.getValues("port") }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "无法获取主机指纹");
      form.setValue("hostFingerprint", body.data.fingerprint, { shouldDirty: true, shouldValidate: true });
      toast.success("已获取主机指纹，请保存服务器配置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法获取主机指纹");
    } finally { setFetchingFingerprint(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{server ? "编辑服务器" : "添加服务器"}</DialogTitle>
          <DialogDescription>配置 SSH 连接与主机指纹；私钥由共享设置统一管理。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="名称" placeholder="Nginx · Tokyo" />
              <TextField control={form.control} name="host" label="主机" placeholder="host.example.com" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>端口</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={(event) => field.onChange(event.target.valueAsNumber)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextField control={form.control} name="username" label="用户名" placeholder="cert" />
            </div>
            <FormField
              control={form.control}
              name="hostFingerprint"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>主机指纹</FormLabel>
                    <Button type="button" variant="outline" size="sm" disabled={busy || fetchingFingerprint} onClick={() => void fetchFingerprint()}>
                      {fetchingFingerprint ? <LoaderCircle className="animate-spin" /> : <Fingerprint />}
                      {fetchingFingerprint ? "获取中..." : server ? "重新获取" : "获取指纹"}
                    </Button>
                  </div>
                  <FormControl>
                    <Input placeholder="填写主机和端口后获取" readOnly {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer font-medium">启用此服务器</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      停用后该服务器不会接收后续的自动或手动证书部署。
                    </p>
                  </div>
                </FormItem>
              )}
            />
            <details className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">高级部署配置</summary>
              <div className="mt-4 space-y-4">
                <CommandField control={form.control} name="validationCommand" label="部署前检查命令" placeholder="sudo -n nginx -t" />
                <CommandField control={form.control} name="reloadCommand" label="重载命令" placeholder="sudo -n nginx -s reload" />
                <CommandField control={form.control} name="healthCheckCommand" label="健康检查命令（可选）" placeholder="curl -fsS http://127.0.0.1/health" />
                <FormField control={form.control} name="timeoutSeconds" render={({ field }) => (
                  <FormItem>
                    <FormLabel>单台超时（秒）</FormLabel>
                    <FormControl><Input type="number" min={1} max={300} {...field} onChange={(event) => field.onChange(event.target.valueAsNumber)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </details>
            <Button className="w-full" disabled={busy}>
              {busy ? "保存中..." : server ? "保存修改" : "保存服务器"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<ServerForm>;
  name: "name" | "host" | "username" | "hostFingerprint";
  label: string;
  placeholder: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CommandField({ control, name, label, placeholder }: { control: Control<ServerForm>; name: "validationCommand" | "reloadCommand" | "healthCheckCommand"; label: string; placeholder: string }) {
  return <FormField control={control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Textarea className="min-h-20" placeholder={placeholder} {...field} /></FormControl><FormMessage /></FormItem>} />;
}

const emptyServerForm: ServerForm = {
  name: "",
  host: "",
  port: 22,
  username: "cert",
  hostFingerprint: "",
  validationCommand: "sudo -n nginx -t",
  reloadCommand: "sudo -n nginx -s reload",
  healthCheckCommand: "",
  timeoutSeconds: 30,
  enabled: true,
};

function toFormValues(server: ManagedServer): ServerForm {
  return {
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    hostFingerprint: server.hostFingerprint ?? "",
    validationCommand: server.validationCommand,
    reloadCommand: server.reloadCommand,
    healthCheckCommand: server.healthCheckCommand ?? "",
    timeoutSeconds: server.timeoutSeconds,
    enabled: server.enabled,
  };
}

