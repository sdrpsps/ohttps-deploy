"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Control, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import type { ManagedServer } from "./types";

const serverSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  host: z.string().min(1, "请输入主机"),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1, "请输入用户名"),
  hostFingerprint: z.string().min(1, "请输入主机指纹"),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <TextField control={form.control} name="hostFingerprint" label="主机指纹" placeholder="SHA256:..." />
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

const emptyServerForm: ServerForm = {
  name: "",
  host: "",
  port: 22,
  username: "cert",
  hostFingerprint: "",
};

function toFormValues(server: ManagedServer): ServerForm {
  return {
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    hostFingerprint: server.hostFingerprint ?? "",
  };
}
