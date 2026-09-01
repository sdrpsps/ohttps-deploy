import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

export const metadata: Metadata = { title: "Deploy Console · OHTTPS", description: "证书管理与安全部署控制台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><QueryProvider>{children}</QueryProvider><Toaster richColors closeButton /></body></html>;
}
