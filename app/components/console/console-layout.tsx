"use client";

import { ChevronDown, KeyRound, LogOut, Menu, Settings2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  userName: string;
  userImage?: string | null;
  localAdmin: boolean;
  section: DashboardSection;
  navigation: NavigationItem[];
  onSettings: () => void;
  onChangePassword?: () => void;
  workerOnline: boolean;
  children: React.ReactNode;
};

export function ConsoleLayout({
  userName,
  userImage,
  localAdmin,
  section,
  navigation,
  onSettings,
  onChangePassword,
  workerOnline,
  children,
}: ConsoleLayoutProps) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const selected = navigation.find((item) => item.value === section) ?? navigation[0];

  function chooseSection(value: string) {
    const item = navigation.find((entry) => entry.value === value);
    if (item && item.value !== section) {
      startTransition(() => router.push(item.href));
    }
    setMobileNavOpen(false);
  }

  function navigationList(mobile = false) {
    return (
      <div className="flex flex-1 flex-col justify-between">
        <TabsList className="h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
          {navigation.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="group relative flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:bg-sidebar-accent/50 data-[state=active]:bg-sidebar-accent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <Icon className="size-4 shrink-0 transition-transform group-hover:scale-105" />
              <span className="flex-1 text-left">{label}</span>
            </TabsTrigger>
          ))}

          <div className="my-2 border-t border-sidebar-border/80" />

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-lg px-3 py-2 text-xs font-medium text-foreground hover:bg-sidebar-accent/50"
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
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-sidebar-border/80 bg-sidebar/95 px-3.5 py-4 backdrop-blur-sm lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          {navigationList()}
        </div>
        <div className="pt-3">
          <WorkerStatus online={workerOnline} />
        </div>
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-4">
          <SheetHeader className="mb-3 text-left">
            <SheetTitle className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                <img src="/ohttps-deploy-logo.png" alt="" width={20} height={20} aria-hidden />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight">OHTTPS Deploy</span>
                <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal text-muted-foreground">
                  {APP_VERSION}
                </Badge>
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">移动端导航菜单</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {navigationList(true)}
          </div>
          <div className="pt-3">
            <WorkerStatus online={workerOnline} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="打开导航"
            >
              <Menu className="size-4" />
            </Button>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">{selected.label}</h1>
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
                  <Avatar className="size-5">
                    <AvatarImage src={userImage ?? undefined} alt={`${userName}的头像`} referrerPolicy="no-referrer" />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <User className="size-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-xs font-semibold">{userName}</span>
                  <ChevronDown className="size-3 text-muted-foreground/60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-semibold leading-none text-foreground">系统管理员</p>
                    <p className="font-mono text-[11px] leading-none text-muted-foreground">{localAdmin ? "本地管理员" : "通行密钥登录"}</p>
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
          {isNavigating ? (
            <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/15" aria-hidden="true">
              <div className="h-full w-1/3 animate-[loading_1s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:animate-none" />
            </div>
          ) : null}
        </header>

        <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6" aria-busy={isNavigating}>
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
    <div className="mb-5 flex items-center gap-2.5 px-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
        <img src="/ohttps-deploy-logo.png" alt="OHTTPS Deploy" width={20} height={20} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold tracking-tight text-foreground">OHTTPS Deploy</span>
        <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal text-muted-foreground">
          {APP_VERSION}
        </Badge>
      </div>
    </div>
  );
}

function WorkerStatus({ online }: { online: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-sidebar-border/80 bg-sidebar-accent/40 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          {online && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span className={online ? "relative inline-flex size-2 rounded-full bg-emerald-500" : "relative inline-flex size-2 rounded-full bg-amber-500"} />
        </span>
        <span className="font-medium text-foreground">Worker 引擎</span>
      </div>
      <span className={online ? "text-[11px] font-medium text-emerald-600 dark:text-emerald-400" : "text-[11px] font-medium text-amber-600 dark:text-amber-400"}>
        {online ? "运行中" : "已离线"}
      </span>
    </div>
  );
}
