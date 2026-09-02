"use client";

import { Menu, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardSection, NavigationItem } from "./types";

type ConsoleLayoutProps = {
  section: DashboardSection;
  navigation: NavigationItem[];
  onSettings: () => void;
  workerOnline: boolean;
  children: React.ReactNode;
};

export function ConsoleLayout({
  section,
  navigation,
  onSettings,
  workerOnline,
  children,
}: ConsoleLayoutProps) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const selected = navigation.find((item) => item.value === section) ?? navigation[0];

  function chooseSection(value: string) {
    const item = navigation.find((entry) => entry.value === value);
    if (item) router.push(item.href);
    setMobileNavOpen(false);
  }

  function navigationList(mobile = false) {
    return (
      <TabsList className="h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
        {navigation.map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 data-[state=active]:bg-sidebar-accent data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            <Icon className="size-4" />
            {label}
          </TabsTrigger>
        ))}
        <Button
          variant="ghost"
          className="mt-7 justify-start gap-3 px-3 text-muted-foreground"
          onClick={() => {
            onSettings();
            if (mobile) setMobileNavOpen(false);
          }}
        >
          <Settings2 className="size-4" />
          设置
        </Button>
      </TabsList>
    );
  }

  return (
    <Tabs value={section} onValueChange={chooseSection} className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-sidebar-border bg-sidebar px-4 py-5 lg:block">
        <Brand />
        {navigationList()}
        <WorkerStatus online={workerOnline} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-5">
          <SheetHeader className="mb-6 text-left">
            <SheetTitle className="flex items-center gap-3">
              <img src="/ohttps-deploy-logo.png" alt="" width={36} height={36} aria-hidden />
              Deploy Console
            </SheetTitle>
            <SheetDescription>证书管理与部署控制台</SheetDescription>
          </SheetHeader>
          {navigationList(true)}
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="打开导航">
              <Menu className="size-5" />
            </Button>
            <div>
              <h1 className="text-base font-semibold">{selected.label}</h1>
              <p className="text-xs text-muted-foreground">{selected.description}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
          <TabsContent value={section} className="mt-0">
            {children}
          </TabsContent>
        </main>
      </div>
    </Tabs>
  );
}

function Brand() {
  return (
    <div className="mb-8 flex items-center gap-3 px-3">
      <img src="/ohttps-deploy-logo.png" alt="OHTTPS Deploy" width={36} height={36} />
      <div>
        <p className="text-[10px] font-bold tracking-[0.24em] text-primary">OHTTPS</p>
        <p className="text-sm font-semibold">Deploy Console</p>
      </div>
    </div>
  );
}

function WorkerStatus({ online }: { online: boolean }) {
  return (
    <Card className="absolute inset-x-4 bottom-5 border-sidebar-border bg-sidebar-accent shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs font-medium">
          <span>Worker 队列</span>
          <span className={online ? "flex items-center gap-1.5 text-emerald-600" : "flex items-center gap-1.5 text-amber-600"}>
            <span className={online ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-amber-500"} />
            {online ? "运行中" : "离线"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {online ? "Worker 会轮询并执行证书同步与部署任务。" : "任务暂不会执行，启动 Worker 后会自动继续。"}
        </p>
      </CardContent>
    </Card>
  );
}
