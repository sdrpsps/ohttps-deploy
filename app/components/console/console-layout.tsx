"use client";

import { ChevronDown, ChevronRight, KeyRound, LogOut, Menu, Settings2, ShieldCheck, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_VERSION } from "@/lib/version";
import type { DashboardSection, NavigationItem } from "./types";

type ConsoleLayoutProps = {
  section: DashboardSection;
  navigation: NavigationItem[];
  onSettings: () => void;
  onChangePassword?: () => void;
  workerOnline: boolean;
  children: React.ReactNode;
};

export function ConsoleLayout({
  section,
  navigation,
  onSettings,
  onChangePassword,
  workerOnline,
  children,
}: ConsoleLayoutProps) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const selected = navigation.find((item) => item.value === section) ?? navigation[0];
  const SelectedIcon = selected.icon;

  function chooseSection(value: string) {
    const item = navigation.find((entry) => entry.value === value);
    if (item) router.push(item.href);
    setMobileNavOpen(false);
  }

  function navigationList(mobile = false) {
    return (
      <div className="flex flex-1 flex-col justify-between">
        <TabsList className="h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            控制台导航
          </div>
          {navigation.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="group relative flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all hover:bg-sidebar-accent/50 data-[state=active]:bg-sidebar-accent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <Icon className="size-4 shrink-0 transition-transform group-hover:scale-110" />
              <span className="flex-1 text-left">{label}</span>
              {value === section && (
                <span className="size-1.5 rounded-full bg-primary" />
              )}
            </TabsTrigger>
          ))}

          <div className="my-3 border-t border-sidebar-border/80" />

          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            管理与配置
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-foreground hover:bg-sidebar-accent/50"
            onClick={() => {
              onSettings();
              if (mobile) setMobileNavOpen(false);
            }}
          >
            <Settings2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">系统设置</span>
          </Button>
        </TabsList>
      </div>
    );
  }

  return (
    <Tabs value={section} onValueChange={chooseSection} className="min-h-screen bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-sidebar-border/80 bg-sidebar/95 px-4 py-5 backdrop-blur-sm lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          {navigationList()}
        </div>
        <div className="pt-4">
          <WorkerStatus online={workerOnline} />
        </div>
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-5">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <img src="/ohttps-deploy-logo.png" alt="" width={24} height={24} aria-hidden />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold">OHTTPS Deploy</p>
                  <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal text-muted-foreground">
                    {APP_VERSION}
                  </Badge>
                </div>
                <p className="text-[11px] font-normal text-muted-foreground">证书管理与安全控制台</p>
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">移动端导航菜单</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {navigationList(true)}
          </div>
          <div className="pt-4">
            <WorkerStatus online={workerOnline} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="打开导航"
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="hidden size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary sm:flex">
                <SelectedIcon className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>控制台</span>
                  <ChevronRight className="size-3 text-muted-foreground/60" />
                  <span className="font-medium text-foreground">{selected.label}</span>
                </div>
                <p className="hidden text-[11px] text-muted-foreground md:block">{selected.description}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Worker Status Badge */}
            <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs sm:flex">
              <span className="relative flex size-2">
                {workerOnline && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={workerOnline ? "relative inline-flex size-2 rounded-full bg-emerald-500" : "relative inline-flex size-2 rounded-full bg-amber-500"} />
              </span>
              <span className="text-muted-foreground">Worker:</span>
              <span className={workerOnline ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-amber-600 dark:text-amber-400"}>
                {workerOnline ? "正常调度" : "离线"}
              </span>
            </div>

            {/* Theme Mode Toggle */}
            <ThemeToggle />

            {/* Admin Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/20 px-2.5 py-1 text-xs transition-colors hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label="管理员个人菜单"
                >
                  <div className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    <User className="size-3" />
                  </div>
                  <span className="font-mono text-xs font-semibold">admin</span>
                  <ChevronDown className="size-3 text-muted-foreground/60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-semibold leading-none text-foreground">系统管理员</p>
                    <p className="font-mono text-[11px] leading-none text-muted-foreground">admin · 本地自托管</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSettings} className="cursor-pointer">
                  <Settings2 className="mr-2 size-3.5 text-muted-foreground" />
                  <span>系统设置</span>
                </DropdownMenuItem>
                {onChangePassword && (
                  <DropdownMenuItem onClick={onChangePassword} className="cursor-pointer">
                    <KeyRound className="mr-2 size-3.5 text-muted-foreground" />
                    <span>修改密码</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/logout", { method: "POST" });
                    } finally {
                      window.location.href = "/login";
                    }
                  }}
                >
                  <LogOut className="mr-2 size-3.5" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
          <TabsContent value={section} className="mt-0 outline-none">
            {children}
          </TabsContent>
        </main>
      </div>
    </Tabs>
  );
}

function Brand() {
  return (
    <div className="mb-6 flex items-center justify-between px-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
          <img src="/ohttps-deploy-logo.png" alt="OHTTPS Deploy" width={28} height={28} />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-[0.24em] text-primary">OHTTPS</span>
            <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal text-muted-foreground">
              {APP_VERSION}
            </Badge>
          </div>
          <p className="text-sm font-semibold tracking-tight">Deploy Console</p>
        </div>
      </div>
    </div>
  );
}

function WorkerStatus({ online }: { online: boolean }) {
  return (
    <Card className="border-sidebar-border/80 bg-sidebar-accent/50 shadow-none">
      <CardContent className="p-3.5">
        <div className="flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              {online && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={online ? "relative inline-flex size-2 rounded-full bg-emerald-500" : "relative inline-flex size-2 rounded-full bg-amber-500"} />
            </span>
            <span className="text-foreground">Worker 队列引擎</span>
          </div>
          <span className={online ? "text-[11px] font-medium text-emerald-600 dark:text-emerald-400" : "text-[11px] font-medium text-amber-600 dark:text-amber-400"}>
            {online ? "运行中" : "已离线"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {online ? "后台自动轮询扫描证书状态并调度推送任务。" : "任务暂不触发执行，启动 Worker 后将自动恢复。"}
        </p>
      </CardContent>
    </Card>
  );
}
