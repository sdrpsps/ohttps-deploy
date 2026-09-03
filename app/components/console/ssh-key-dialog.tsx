"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Key } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const form = useForm<KeyForm>({
    resolver: zodResolver(keySchema),
    defaultValues: { privateKey: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ privateKey: "" });
      fetch("/api/settings/ssh-private-key")
        .then((res) => res.json())
        .then((body) => {
          setPublicKey(body?.data?.publicKey ?? null);
          setIsEncrypted(Boolean(body?.data?.isEncrypted));
        })
        .catch(() => {
          setPublicKey(null);
          setIsEncrypted(false);
        });
    }
  }, [form, open]);

  async function submit({ privateKey }: KeyForm) {
    if (await onSave(privateKey)) {
      try {
        const res = await fetch("/api/settings/ssh-private-key");
        const body = await res.json();
        const nextPub = body?.data?.publicKey ?? null;
        const enc = Boolean(body?.data?.isEncrypted);
        setPublicKey(nextPub);
        setIsEncrypted(enc);
        form.reset({ privateKey: "" });
        if (nextPub) {
          toast.success("私钥已保存，配套公钥已就绪");
          return;
        }
      } catch {}
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>共享 SSH 私钥</DialogTitle>
          <DialogDescription>
            {configured ? "已配置私钥。粘贴新内容会替换当前私钥。" : "配置后，所有服务器将使用这把私钥连接。"}
          </DialogDescription>
        </DialogHeader>

        {isEncrypted && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            ⚠️ 检测到当前私钥受密码保护（Passphrase）。后台 Worker 自动化部署需无密码保护的私钥，请使用 <code>ssh-keygen -p</code> 去除密码后重新导入。
          </div>
        )}

        {publicKey && (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">配套 OpenSSH 公钥 (部署目标端使用)</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  void navigator.clipboard.writeText(publicKey);
                  toast.success("公钥已复制到剪贴板");
                }}
              >
                <Copy className="mr-1 size-3" />
                复制公钥
              </Button>
            </div>
            <code className="block max-h-24 overflow-y-auto break-all rounded border bg-background p-2 font-mono text-xs text-muted-foreground">
              {publicKey}
            </code>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground font-medium">
                在目标服务器上快速配置部署用户与权限
              </summary>
              <div className="mt-2 space-y-2.5 rounded-md bg-muted p-2.5">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-foreground">
                    方式 1：执行一键初始化脚本（推荐）
                  </p>
                  <p className="mb-1 text-[11px]">
                    在目标服务器上以 root 运行初始化脚本 <code>setup-ohttps-deploy-user.sh</code>，自动创建专用用户 <code>cert</code> 并配置最小权限：
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <code className="block flex-1 break-all font-mono text-[11px] text-foreground">
                      {`sudo bash scripts/setup-ohttps-deploy-user.sh "${publicKey}"`}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-xs"
                      onClick={() => {
                        void navigator.clipboard.writeText(`sudo bash scripts/setup-ohttps-deploy-user.sh "${publicKey}"`);
                        toast.success("脚本命令已复制");
                      }}
                    >
                      <Copy className="mr-1 size-3" />
                      复制
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-foreground">
                    方式 2：手动写入现有用户 authorized_keys
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <code className="block flex-1 break-all font-mono text-[11px] text-foreground">
                      {`echo "${publicKey}" >> ~/.ssh/authorized_keys`}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-xs"
                      onClick={() => {
                        void navigator.clipboard.writeText(`echo "${publicKey}" >> ~/.ssh/authorized_keys`);
                        toast.success("写入命令已复制");
                      }}
                    >
                      <Copy className="mr-1 size-3" />
                      复制
                    </Button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <FormField
              control={form.control}
              name="privateKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{configured ? "更换私钥" : "私钥内容"}</FormLabel>
                  <FormControl>
                    <Textarea
                      autoComplete="off"
                      spellCheck={false}
                      className="min-h-40 font-mono text-xs"
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">私钥仅提交给服务端 SQLite，不会在界面或 API 中再次显示。</p>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? "保存中..." : "保存私钥"}
              </Button>
              {publicKey && (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  完成
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
