"use client";

import { Check, Copy, FileCode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Certificate } from "./types";

type NginxConfigDialogProps = {
  certificate: Certificate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NginxConfigDialog({
  certificate,
  open,
  onOpenChange,
}: NginxConfigDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!certificate) return null;

  const domain = certificate.domain.trim().toLowerCase();
  const certPath = `/etc/nginx/ssl/${domain}/fullchain.pem`;
  const keyPath = `/etc/nginx/ssl/${domain}/privkey.pem`;

  const nginxSnippet = `server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    # 由 ohttps-deploy 自动分发与原子维护的证书路径
    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    location / {
        # 你的后端服务反向代理配置
        # proxy_pass http://127.0.0.1:3000;
        # proxy_set_header Host $host;
        # proxy_set_header X-Real-IP $remote_addr;
        # proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

  const copySnippet = () => {
    void navigator.clipboard.writeText(nginxSnippet);
    setCopied(true);
    toast.success("Nginx 配置片段已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPath = (path: string, label: string) => {
    void navigator.clipboard.writeText(path);
    toast.success(`${label}已复制`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="size-5 text-primary" />
            Nginx 配置引用参考
          </DialogTitle>
          <DialogDescription>
            目标服务器在部署时会将证书放置于以下标准路径，Nginx 需引用这些路径以完成 HTTPS 握手。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">证书路径 (Fullchain)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => copyPath(certPath, "证书路径")}
                >
                  <Copy className="size-3 mr-1" /> 复制
                </Button>
              </div>
              <code className="mt-1 block font-mono text-xs break-all text-muted-foreground">
                {certPath}
              </code>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">私钥路径 (Privkey)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => copyPath(keyPath, "私钥路径")}
                >
                  <Copy className="size-3 mr-1" /> 复制
                </Button>
              </div>
              <code className="mt-1 block font-mono text-xs break-all text-muted-foreground">
                {keyPath}
              </code>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">推荐 Nginx 虚拟主机配置片段</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copySnippet}>
                {copied ? <Check className="mr-1 size-3 text-emerald-500" /> : <Copy className="mr-1 size-3" />}
                {copied ? "已复制" : "复制完整配置"}
              </Button>
            </div>
            <pre className="max-h-72 overflow-x-auto rounded-lg border bg-slate-950 p-3.5 font-mono text-xs text-slate-100">
              <code>{nginxSnippet}</code>
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
