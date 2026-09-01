import type { LucideIcon } from "lucide-react";

export type Certificate = {
  id: string;
  name: string;
  domain: string;
  ohttpsCertificateId: string;
  status: "active" | "disabled";
  expiresAt: string | null;
  renewBeforeDays: number;
};

export type ManagedServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  enabled: boolean;
  hostFingerprint: string | null;
  certPath: string;
  privateKeyPath: string;
  reloadCommand: string;
  healthCheckCommand: string | null;
  timeoutSeconds: number;
};

export type DashboardSection = "overview" | "certificates" | "servers" | "policies" | "activity" | "notifications";

export type NavigationItem = {
  value: DashboardSection;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export type DeleteTarget = {
  type: "certificate" | "server";
  id: string;
  name: string;
};
