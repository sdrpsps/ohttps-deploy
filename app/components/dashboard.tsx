"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Bell, LayoutDashboard, Server, Settings2, ShieldCheck, KeyRound, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActivityPanel } from "@/components/activity-panel";
import { NotificationPanel } from "@/components/notification-panel";
import { PoliciesPanel } from "@/components/policies-panel";
import { CertificateFormDialog } from "@/components/console/certificate-form-dialog";
import { CertificatePanel } from "@/components/console/certificate-panel";
import { ConsoleLayout } from "@/components/console/console-layout";
import { DeleteDialog } from "@/components/console/delete-dialog";
import { OverviewPanel } from "@/components/console/overview-panel";
import { ServerFormDialog } from "@/components/console/server-form-dialog";
import { ServerPanel } from "@/components/console/server-panel";
import { SettingsDialog, type SettingsSummary } from "@/components/console/settings-dialog";
import { SshKeyDialog } from "@/components/console/ssh-key-dialog";
import { OnboardingWizard } from "@/components/console/onboarding-wizard";
import { daysUntil } from "@/lib/utils";
import type {
  Certificate,
  DashboardSection,
  DeleteTarget,
  ManagedServer,
  NavigationItem,
} from "@/components/console/types";

export type { DashboardSection } from "@/components/console/types";

const navigation: NavigationItem[] = [
  { value: "overview", label: "总览", description: "证书与部署状态概览", href: "/", icon: LayoutDashboard },
  { value: "certificates", label: "证书", description: "管理证书、续期阈值与当前状态", href: "/certificates", icon: ShieldCheck },
  { value: "servers", label: "服务器", description: "管理部署目标与 SSH 连接配置", href: "/servers", icon: Server },
  { value: "policies", label: "部署策略", description: "配置证书到服务器的自动部署映射", href: "/deployment-policies", icon: Settings2 },
  { value: "activity", label: "任务日志", description: "查看部署任务、实时日志与审计记录", href: "/deployments", icon: Activity },
  { value: "notifications", label: "通知", description: "查看 Webhook 投递状态并手动重试", href: "/notifications", icon: Bell },
];

export default function Dashboard({ section = "overview" }: { section?: DashboardSection }) {
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [servers, setServers] = useState<ManagedServer[]>([]);
  const [settings, setSettings] = useState<SettingsSummary | null>(null);
  const [policyCount, setPolicyCount] = useState(0);
  const [workerOnline, setWorkerOnline] = useState(false);
  const [failedDeployments, setFailedDeployments] = useState(0);
  const [failedSyncJobs, setFailedSyncJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [editingServer, setEditingServer] = useState<ManagedServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [certificateResponse, serverResponse, settingsResponse, policyResponse, healthResponse, deploymentResponse, syncResponse] = await Promise.all([
        fetch("/api/certificates", { cache: "no-store" }),
        fetch("/api/servers", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/deployment-policies", { cache: "no-store" }),
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/deployments", { cache: "no-store" }),
        fetch("/api/certificate-sync-jobs", { cache: "no-store" }),
      ]);
      if (!certificateResponse.ok || !serverResponse.ok || !settingsResponse.ok || !policyResponse.ok || !healthResponse.ok || !deploymentResponse.ok || !syncResponse.ok) {
        throw new Error("无法加载控制台数据");
      }
      setCertificates((await certificateResponse.json()).data);
      setServers((await serverResponse.json()).data);
      setSettings((await settingsResponse.json()).data);
      setPolicyCount(((await policyResponse.json()).data ?? []).length);
      setWorkerOnline(Boolean((await healthResponse.json()).worker));
      setFailedDeployments(((await deploymentResponse.json()).data ?? []).filter((item: { status: string }) => item.status === "failed").length);
      setFailedSyncJobs(((await syncResponse.json()).data ?? []).filter((item: { status: string }) => item.status === "failed").length);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((cause) => toast.error(cause.message));
  }, []);

  async function save(endpoint: string, data: Record<string, unknown>, message: string, method = "POST") {
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        toast.error((await response.json().catch(() => null))?.error?.message ?? "保存失败，请检查输入");
        return false;
      }
      toast.success(message);
      await load();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runAction(endpoint: string, method: "POST" | "DELETE", successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error?.message ?? body?.data?.error ?? "操作未完成");
        return false;
      }
      toast.success(successMessage);
      if (method === "DELETE") await load();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作未完成");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function refreshCertificate(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/certificates/${id}/refresh`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toast.error(body?.error?.message ?? "同步未创建"); return; }
      toast.success("同步任务已创建");
      router.push(`/deployments?taskId=${body?.data?.taskId ?? ""}`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "同步未创建"); }
    finally { setBusy(false); }
  }

  async function deleteSelected() {
    if (!deleteTarget) return;
    const deleted = await runAction(
      `/api/${deleteTarget.type === "certificate" ? "certificates" : "servers"}/${deleteTarget.id}`,
      "DELETE",
      `${deleteTarget.name} 已删除`,
    );
    if (deleted) setDeleteTarget(null);
  }

  function openCertificateDialog(certificate: Certificate | null = null) {
    setEditingCertificate(certificate);
    setCertificateDialogOpen(true);
  }

  function openServerDialog(server: ManagedServer | null = null) {
    setEditingServer(server);
    setServerDialogOpen(true);
  }

  const expiringCount = useMemo(() => certificates.filter((certificate) => {
    const days = daysUntil(certificate.expiresAt);
    return days !== null && days <= certificate.renewBeforeDays;
  }).length, [certificates]);

  const navigate = (target: DashboardSection) => {
    const item = navigation.find((entry) => entry.value === target);
    if (item) router.push(item.href);
  };

  const content = {
    overview: (
      <OverviewPanel
        certificates={certificates}
        servers={servers}
        expiringCount={expiringCount}
        workerOnline={workerOnline}
        failedDeployments={failedDeployments}
        failedSyncJobs={failedSyncJobs}
        ohttpsConfigured={settings?.ohttpsConfigured ?? false}
        policyCount={policyCount}
        onCreateCertificate={() => openCertificateDialog()}
        onNavigate={navigate}
        onSettings={() => setSettingsDialogOpen(true)}
      />
    ),
    certificates: (
      <CertificatePanel
        certificates={certificates}
        loading={loading}
        busy={busy}
        onCreate={() => openCertificateDialog()}
        onEdit={openCertificateDialog}
        onRefresh={(id) => void refreshCertificate(id)}
        onDelete={setDeleteTarget}
        ohttpsConfigured={settings?.ohttpsConfigured ?? false}
        deploymentTargetCount={policyCount}
        onNavigate={(target) => navigate(target)}
        onConfigureSettings={() => setSettingsDialogOpen(true)}
      />
    ),
    servers: (
      <ServerPanel
        servers={servers}
        loading={loading}
        busy={busy}
        onCreate={() => openServerDialog()}
        onEdit={openServerDialog}
        onTest={(server) => void runAction(`/api/servers/${server.id}/test-connection`, "POST", `${server.name} 连接成功，主机指纹已校验。`)}
        onDelete={setDeleteTarget}
      />
    ),
    policies: <PoliciesPanel certificates={certificates} servers={servers} />,
    activity: <ActivityPanel certificates={certificates} servers={servers} />,
    notifications: <NotificationPanel />,
  } satisfies Record<DashboardSection, React.ReactNode>;

  return (
    <>
      <ConsoleLayout
        section={section}
        navigation={navigation}
        loading={loading}
        workerOnline={workerOnline}
        onReload={() => load().catch((cause) => toast.error(cause.message))}
        onSettings={() => setSettingsDialogOpen(true)}
      >
        <div className="space-y-8">
          {section === "overview" && settings && (
            <OnboardingWizard steps={[
              { label: "配置 ohttps 凭据", done: settings.ohttpsConfigured, action: "去配置", onAction: () => setSettingsDialogOpen(true), icon: KeyRound },
              { label: "添加第一张证书", done: certificates.length > 0, action: "添加证书", onAction: () => openCertificateDialog(), icon: ShieldCheck },
              { label: "添加部署服务器", done: servers.length > 0, action: "添加服务器", onAction: () => openServerDialog(), icon: Server },
              { label: "创建部署策略", done: policyCount > 0, action: "配置策略", onAction: () => navigate("policies"), icon: Workflow },
              { label: "检查 Worker 状态", done: workerOnline, icon: Activity },
            ]} />
          )}
          {content[section]}
        </div>
      </ConsoleLayout>

      <CertificateFormDialog
        certificate={editingCertificate}
        open={certificateDialogOpen}
        busy={busy}
        onOpenChange={(open) => {
          setCertificateDialogOpen(open);
          if (!open) setEditingCertificate(null);
        }}
        onSave={(values, certificate) => save(
          certificate ? `/api/certificates/${certificate.id}` : "/api/certificates",
          values,
          certificate ? "证书已更新" : "证书已创建",
          certificate ? "PATCH" : "POST",
        )}
      />

      <ServerFormDialog
        server={editingServer}
        open={serverDialogOpen}
        busy={busy}
        onOpenChange={(open) => {
          setServerDialogOpen(open);
          if (!open) setEditingServer(null);
        }}
        onSave={(values, server) => save(
          server ? `/api/servers/${server.id}` : "/api/servers",
          values,
          server ? "服务器已更新" : "服务器已保存",
          server ? "PATCH" : "POST",
        )}
      />

      <SshKeyDialog
        open={keyDialogOpen}
        configured={settings?.sharedSshPrivateKeyConfigured ?? false}
        busy={busy}
        onOpenChange={setKeyDialogOpen}
        onSave={async (privateKey) => {
          const saved = await save("/api/settings/ssh-private-key", { privateKey }, "SSH 私钥已保存");
          return saved;
        }}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        busy={busy}
        settings={settings}
        onOpenChange={setSettingsDialogOpen}
        onSave={(value) => save("/api/settings", value, "系统设置已保存")}
        onConfigureSshKey={() => {
          setSettingsDialogOpen(false);
          setKeyDialogOpen(true);
        }}
      />

      <DeleteDialog
        target={deleteTarget}
        busy={busy}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={deleteSelected}
      />
    </>
  );
}
