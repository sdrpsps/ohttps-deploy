"use client";

import { FormEvent, useId, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, Lock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  className,
  pocketIdEnabled = false,
  authError = false,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { pocketIdEnabled?: boolean; authError?: boolean }) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isPocketIdSubmitting, setIsPocketIdSubmitting] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const passwordFormId = useId();

  async function signInPocketId() {
    setError("");
    setIsPocketIdSubmitting(true);
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "pocket-id", callbackURL: "/", errorCallbackURL: "/login?authError=1" }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error();
      window.location.assign(data.url);
    } catch {
      setError("Pocket ID 登录暂时不可用，请稍后重试或使用管理员密码");
      setIsPocketIdSubmitting(false);
    }
  }

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
      <Card className="border-border/80 shadow-xl shadow-primary/5 backdrop-blur-sm">
        <CardHeader className="space-y-3 pb-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <img src="/ohttps-deploy-logo.png" alt="OHTTPS Deploy" width={30} height={30} />
          </div>
          <CardTitle className="text-lg font-bold tracking-tight">OHTTPS Deploy</CardTitle>
        </CardHeader>

        <CardContent className="pb-6">
          {pocketIdEnabled && (
            <div className="space-y-3">
              <Button type="button" className="w-full gap-2" disabled={isSubmitting || isPocketIdSubmitting} onClick={signInPocketId}>
                {isPocketIdSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                使用通行密钥登录
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                disabled={isSubmitting || isPocketIdSubmitting}
                aria-expanded={showPasswordForm}
                aria-controls={passwordFormId}
                onClick={() => setShowPasswordForm((visible) => !visible)}
              >
                {showPasswordForm ? "收起密码登录" : "使用管理员密码登录"}
              </Button>
            </div>
          )}
          {(error || authError) && (
            <div
              className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{error || "Pocket ID 登录未完成，请确认使用已授权的管理员账号后重试"}</span>
            </div>
          )}
          <form id={passwordFormId} hidden={pocketIdEnabled && !showPasswordForm} onSubmit={submit} className={cn("space-y-4", pocketIdEnabled && "mt-4")}>
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

            <Button type="submit" className="w-full gap-2 font-medium shadow-sm" disabled={isSubmitting || isPocketIdSubmitting}>
              {isSubmitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  验证登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
