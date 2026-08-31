import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Deploy Console · OHTTPS", description: "证书管理与安全部署控制台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
