"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  PoliciesData,
  SyncJob,
} from "@/components/console/types";

export type { DashboardSection } from "@/components/console/types";

const navigation: NavigationItem[] = [
  { value: "overview", label: "概览", description: "系统全局状态与关键指标", href: "/overview", icon: LayoutDashboard },
  { value: "certificates", label: "证书", description: "管理证书资产与同步任务", href: "/certificates", icon: ShieldCheck },
  { value: "servers", label: "服务器", description: "管理部署目标与 SSH 连接配置", href: "/servers", icon: Server },
  { value: "policies", label: "部署策略", description: "按证书配置目标服务器", href: "/policies", icon: Workflow },
  { value: "activity", label: "活动与日志", description: "部署记录与系统执行日志", href: "/activity", icon: Activity },
  { value: "notifications", label: "系统通知", description: "任务通知与失败告警历史", href: "/notifications", icon: Bell },
];

export default function Dashboard({ section = "overview" }: { section?: DashboardSection }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [editingServer, setEditingServer] = useState<ManagedServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [syncTaskId, setSyncTaskId] = useState<string | null>(null);

  const certificatesQuery = useQuery({ queryKey: queryKeys.certificates, queryFn: () => getApiData<Certificate[]>("/api/certificates"), enabled: ["overview", "certificates", "policies", "activity"].includes(section) });
  const serversQuery = useQuery({ queryKey: queryKeys.servers, queryFn: () => getApiData<ManagedServer[]>("/api/servers"), enabled: ["overview", "servers", "policies", "activity"].includes(section) });
  const settingsQuery = useQuery({ queryKey: queryKeys.settings, queryFn: () => getApiData<SettingsSummary>("/api/settings") });
  const policiesQuery = useQuery({ queryKey: queryKeys.policies, queryFn: () => getApiData<PoliciesData>("/api/deployment-policies"), enabled: ["overview", "certificates", "policies"].includes(section) });
  const healthQuery = useQuery({ queryKey: queryKeys.health, queryFn: () => getApiData<{ worker: boolean }>("/api/health") });
  const deploymentsQuery = useQuery({
    queryKey: queryKeys.deployments,
    queryFn: () => getApiData<Array<{ id: string; certificateId: string; status: string }>>("/api/deployments"),
    enabled: ["overview", "activity"].includes(section),
    refetchInterval: (query) => {
      const deps = query.state.data;
      return deps?.some((d) => d.status === "queued" || d.status === "running") ? 3_000 : false;
    },
  });
  const syncJobsQuery = useQuery({
    queryKey: queryKeys.syncJobs,
    queryFn: () => getApiData<SyncJob[]>("/api/certificate-sync-jobs"),
    enabled: ["overview", "certificates"].includes(section),
    refetchInterval: (query) => {
      const jobs = query.state.data;
      return jobs?.some((j) => j.status === "queued" || j.status === "running") ? 3_000 : false;
    },
  });

  const certificates = certificatesQuery.data ?? [];
  const servers = serversQuery.data ?? [];
  const settings = settingsQuery.data ?? null;
  const policyCount = useMemo(() => {
    const enabledServerIds = new Set(servers.filter((s) => s.enabled).map((s) => s.id));
    const configuredSet = new Set(policiesQuery.data?.configuredCertificateIds ?? []);
    const policies = policiesQuery.data?.policies ?? [];
    return certificates.reduce((sum, cert) => {
      const existing = policies.filter((p) => p.certificateId === cert.id);
      if (!existing.length && !configuredSet.has(cert.id)) {
        return sum + enabledServerIds.size;
      }
      return sum + existing.filter((p) => p.autoDeploy && enabledServerIds.has(p.serverId)).length;
    }, 0);
  }, [certificates, servers, policiesQuery.data]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.syncJobs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.certificates }),
      ]);
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

  async function deleteSelected(force?: boolean) {
    if (!deleteTarget) return;
    const path = `/api/${deleteTarget.type === "certificate" ? "certificates" : "servers"}/${deleteTarget.id}${deleteTarget.type === "server" && force ? "?force=true" : ""}`;
    const deleted = await runAction(
      path,
      "DELETE",
      `${deleteTarget.name} 已删除`,
    );
    if (deleted) setDeleteTarget(null);
  }

  async function toggleServerEnabled(server: ManagedServer) {
    const nextEnabled = !server.enabled;
    const updated = await save(
      `/api/servers/${server.id}`,
      { enabled: nextEnabled },
      `已${nextEnabled ? "启用" : "停用"}服务器 ${server.name}`,
      "PATCH"
    );
    if (updated) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.policies }),
      ]);
    }
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
    void reload();
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
        onToggleEnabled={(server) => void toggleServerEnabled(server)}
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
