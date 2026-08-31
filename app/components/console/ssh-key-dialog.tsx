"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";

const keySchema = z.object({ privateKey: z.string().min(1, "请输入私钥内容") });
type KeyForm = z.infer<typeof keySchema>;

type SshKeyDialogProps = {
  open: boolean;
  configured: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (privateKey: string) => Promise<boolean>;
};

export function SshKeyDialog({
  open,
  configured,
  busy,
  onOpenChange,
  onSave,
}: SshKeyDialogProps) {
  const form = useForm<KeyForm>({
    resolver: zodResolver(keySchema),
    defaultValues: { privateKey: "" },
  });

  useEffect(() => {
    if (open) form.reset({ privateKey: "" });
  }, [form, open]);

  async function submit({ privateKey }: KeyForm) {
    if (await onSave(privateKey)) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>共享 SSH 私钥</DialogTitle>
          <DialogDescription>
            {configured ? "已配置。粘贴新内容会替换当前密钥。" : "配置后，所有服务器将使用这把私钥连接。"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <FormField
              control={form.control}
              name="privateKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>私钥内容</FormLabel>
                  <FormControl>
                    <Textarea
                      autoComplete="off"
                      spellCheck={false}
                      className="min-h-48 font-mono text-xs"
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">私钥仅提交给服务端 SQLite，不会在界面或 API 中再次显示。</p>
            <Button className="w-full" disabled={busy}>
              {busy ? "保存中..." : "保存私钥"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
