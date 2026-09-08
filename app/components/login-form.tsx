"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, Lock, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError("用户名或密码错误，请检查输入");
        return;
      }

      window.location.href = "/";
    } catch {
      setError("网络或服务器异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/80 shadow-2xl shadow-primary/5 backdrop-blur-sm">
        <CardHeader className="space-y-3 pb-6 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-inner">
            <img src="/ohttps-deploy-logo.png" alt="OHTTPS Deploy" width={36} height={36} className="drop-shadow-sm" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-xl font-bold tracking-tight">OHTTPS Deploy</CardTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[11px] text-primary">
                控制台
              </Badge>
            </div>
            <CardDescription className="text-xs">
              证书全生命周期自动化管理与安全部署平台
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-medium text-foreground">
                管理员用户名
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="admin"
                  autoComplete="username"
                  defaultValue="admin"
                  required
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-foreground">
                  登录密码
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  初始密码见 Worker 启动日志
                </span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  required
                  className="pl-9 pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full gap-2 shadow-sm font-medium" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  验证登录中...
                </>
              ) : (
                <>
                  进入管理控制台
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="border-t border-border/50 bg-muted/20 px-6 py-4">
          <div className="flex w-full items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>自托管单管理员控制台 · 本地数据卷权限安全隔离保护</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
