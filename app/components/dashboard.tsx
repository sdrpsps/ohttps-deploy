"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Activity, Bell, LayoutDashboard, Server, Settings2, ShieldCheck, KeyRound, Key, Workflow } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActivityPanel } from "@/components/activity-panel";
import { NotificationPanel } from "@/components/notification-panel";
import { PoliciesPanel } from "@/components/policies-panel";
import { CertificateFormDialog } from "@/components/console/certificate-form-dialog";
import { ChangePasswordDialog } from "@/components/console/change-password-dialog";
import { CertificatePanel } from "@/components/console/certificate-panel";
import { ConsoleLayout } from "@/components/console/console-layout";
import { DeleteDialog } from "@/components/console/delete-dialog";
import { OverviewPanel } from "@/components/console/overview-panel";
import { ServerFormDialog } from "@/components/console/server-form-dialog";
import { ServerPanel } from "@/components/console/server-panel";
import { SettingsDialog, type SettingsSummary } from "@/components/console/settings-dialog";
import { SshKeyDialog } from "@/components/console/ssh-key-dialog";
import { SyncTaskSheet } from "@/components/console/sync-task-sheet";
import { OnboardingWizard } from "@/components/console/onboarding-wizard";
import { daysUntil } from "@/lib/utils";
import { getApiData, queryKeys } from "@/lib/api";
import type {
  Certificate,
  DashboardSection,
  DeleteTarget,
  ManagedServer,
  NavigationItem,
} from "@/components/console/types";

export type { DashboardSection } from "@/components/console/types";

type SyncJob = {
  id: string;
  certificateId: string;
  certificateName: string;
  trigger: string;
  status: string;
  errorSummary: string | null;
  createdAt: string;
};
type PoliciesData = { policies: Array<{ certificateId: string }>; configuredCertificateIds: string[] };

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
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [editingServer, setEditingServer] = useState<ManagedServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [syncTaskId, setSyncTaskId] = useState<string | null>(null);

  const [certificatesQuery, serversQuery, settingsQuery, policiesQuery, healthQuery, deploymentsQuery, syncJobsQuery] = useQueries({ queries: [
    { queryKey: queryKeys.certificates, queryFn: () => getApiData<Certificate[]>("/api/certificates"), enabled: ["overview", "certificates", "policies", "activity"].includes(section) },
    { queryKey: queryKeys.servers, queryFn: () => getApiData<ManagedServer[]>("/api/servers"), enabled: ["overview", "servers", "policies", "activity"].includes(section) },
    { queryKey: queryKeys.settings, queryFn: () => getApiData<SettingsSummary>("/api/settings") },
    { queryKey: queryKeys.policies, queryFn: () => getApiData<PoliciesData>("/api/deployment-policies"), enabled: ["overview", "certificates", "policies"].includes(section) },
    { queryKey: queryKeys.health, queryFn: () => getApiData<{ worker: boolean }>("/api/health") },
    { queryKey: queryKeys.deployments, queryFn: () => getApiData<Array<{ id: string; certificateId: string; status: string }>>("/api/deployments"), enabled: ["overview", "activity"].includes(section) },
    { queryKey: queryKeys.syncJobs, queryFn: () => getApiData<SyncJob[]>("/api/certificate-sync-jobs"), enabled: ["overview", "certificates"].includes(section) },
  ] });
  const certificates = certificatesQuery.data ?? [];
  const servers = serversQuery.data ?? [];
  const settings = settingsQuery.data ?? null;
  const policyCount = policiesQuery.data?.policies.length ?? 0;
  const workerOnline = Boolean(healthQuery.data?.worker);

  const latestDeploymentByCert = useMemo(() => {
    const map = new Map<string, { id: string; certificateId: string; status: string }>();
    for (const dep of deploymentsQuery.data ?? []) {
      if (!map.has(dep.certificateId)) {
        map.set(dep.certificateId, dep);
      }
    }
    return map;
  }, [deploymentsQuery.data]);

  const failedDeploymentItems = useMemo(() => {
    return Array.from(latestDeploymentByCert.values()).filter(
      (item) => item.status === "failed" || item.status === "partial"
    );
  }, [latestDeploymentByCert]);

  const failedDeployments = failedDeploymentItems.length;
  const latestFailedDeploymentId = failedDeploymentItems[0]?.id;

  const syncJobs = syncJobsQuery.data ?? [];
  const latestSyncJobByCert = useMemo(() => {
    const map = new Map<string, SyncJob>();
    for (const job of syncJobs) {
      if (!map.has(job.certificateId)) {
        map.set(job.certificateId, job);
      }
    }
    return map;
  }, [syncJobs]);

  const failedSyncJobItems = useMemo(() => {
    return Array.from(latestSyncJobByCert.values()).filter(
      (job) => job.status === "failed"
    );
  }, [latestSyncJobByCert]);

  const failedSyncJobs = failedSyncJobItems.length;
  const latestFailedSyncJobId = failedSyncJobItems[0]?.id;

  const loading = [certificatesQuery, serversQuery, settingsQuery, policiesQuery, healthQuery, deploymentsQuery, syncJobsQuery].some((query) => query.isLoading);
  const loadError = [certificatesQuery, serversQuery, settingsQuery, policiesQuery, healthQuery, deploymentsQuery, syncJobsQuery].find((query) => query.error)?.error;

  useEffect(() => {
    if (loadError instanceof Error) toast.error(loadError.message);
  }, [loadError]);

  useEffect(() => { setSyncTaskId(new URLSearchParams(window.location.search).get("syncTaskId")); }, []);

  async function reload() {
    await queryClient.invalidateQueries();
  }

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
      await reload();
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
      if (method === "DELETE") await reload();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作未完成");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(value: { currentPassword: string; newPassword: string }) {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
      if (!response.ok) {
        toast.error((await response.json().catch(() => null))?.error?.message ?? "当前密码错误或新密码不符合要求");
        return false;
      }
      toast.success("管理员密码已修改");
      return true;
    } catch {
      toast.error("密码修改失败，请稍后重试");
      return false;
    } finally { setBusy(false); }
  }

  async function refreshCertificate(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/certificates/${id}/refresh`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toast.error(body?.error?.message ?? "同步未创建"); return; }
      toast.success("同步任务已创建");
      openSyncTask(body?.data?.taskId ?? "");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "同步未创建"); }
    finally { setBusy(false); }
  }

  async function deployCertificate(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/deployments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId: id }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { toast.error(body?.error?.message ?? "部署任务未创建"); return; }
      toast.success(`已创建 ${body.data.targetCount} 台服务器的部署任务`);
      router.push(`/deployments?deploymentId=${body.data.id}`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "部署任务未创建"); }
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

  const handleFailedDeployments = () => {
    if (latestFailedDeploymentId) {
      router.push(`/deployments?deploymentId=${latestFailedDeploymentId}&status=failed`);
    } else {
      router.push("/deployments?status=failed");
    }
  };

  const handleFailedSyncJobs = () => {
    if (latestFailedSyncJobId) {
      openSyncTask(latestFailedSyncJobId);
    } else {
      navigate("certificates");
    }
  };

  const openSyncTask = (id: string) => {
    if (!id) return;
    const params = new URLSearchParams(window.location.search);
    params.set("syncTaskId", id);
    setSyncTaskId(id);
    router.push(`${pathname}?${params.toString()}`);
  };

  const closeSyncTask = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("syncTaskId");
    setSyncTaskId(null);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
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
        onHandleFailedDeployments={handleFailedDeployments}
        onHandleFailedSyncJobs={handleFailedSyncJobs}
        onCreateCertificate={() => openCertificateDialog()}
        onNavigate={navigate}
      />
    ),
    certificates: (
      <CertificatePanel
        certificates={certificates}
        jobs={syncJobs}
        loading={loading}
        busy={busy}
        onCreate={() => openCertificateDialog()}
        onEdit={openCertificateDialog}
        onRefresh={(id) => void refreshCertificate(id)}
        onDeploy={(id) => void deployCertificate(id)}
        onDelete={setDeleteTarget}
        ohttpsConfigured={settings?.ohttpsConfigured ?? false}
        onViewSyncJob={openSyncTask}
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
        workerOnline={workerOnline}
        onSettings={() => setSettingsDialogOpen(true)}
      >
        <div className="space-y-8">
          {section === "overview" && settings && (
            <OnboardingWizard steps={[
              { label: "配置 ohttps 凭据", done: settings.ohttpsConfigured, action: "去配置", onAction: () => setSettingsDialogOpen(true), icon: KeyRound },
              { label: "配置 SSH 私钥", done: settings.sharedSshPrivateKeyConfigured, action: "去配置", onAction: () => setKeyDialogOpen(true), icon: Key },
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

      <SettingsDialog
        open={settingsDialogOpen}
        busy={busy}
        settings={settings}
        onOpenChange={setSettingsDialogOpen}
        onSave={(value) => save("/api/settings", value, "系统设置已保存")}
        onConfigureSshKey={() => {
          setKeyDialogOpen(true);
        }}
        onChangePassword={() => setChangePasswordDialogOpen(true)}
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

      <ChangePasswordDialog open={changePasswordDialogOpen} busy={busy} onOpenChange={setChangePasswordDialogOpen} onSave={changePassword} />

      <DeleteDialog
        target={deleteTarget}
        busy={busy}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={deleteSelected}
      />

      <SyncTaskSheet taskId={syncTaskId} onOpenChange={(open) => !open && closeSyncTask()} />
    </>
  );
}
