import type { LucideIcon } from "lucide-react";

export type Certificate = {
  id: string;
  name: string;
  domain: string;
  currentVersionId: string | null;
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
  validationCommand: string;
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

export type PolicyItem = {
  certificateId: string;
  certificateName?: string;
  domain?: string;
  serverId: string;
  serverName?: string;
  host?: string;
  autoDeploy: boolean;
  updatedAt?: string;
};

export type PoliciesData = {
  policies: PolicyItem[];
  configuredCertificateIds: string[];
};

export type SyncJob = {
  id: string;
  certificateId: string;
  certificateName: string;
  trigger: string;
  status: string;
  errorSummary: string | null;
  createdAt: string;
};

