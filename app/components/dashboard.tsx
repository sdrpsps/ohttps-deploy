"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, LayoutDashboard, Server, Settings2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ActivityPanel } from "@/components/activity-panel";
import { PoliciesPanel } from "@/components/policies-panel";
import { CertificateFormDialog } from "@/components/console/certificate-form-dialog";
import { CertificatePanel } from "@/components/console/certificate-panel";
import { ConsoleLayout } from "@/components/console/console-layout";
import { DeleteDialog } from "@/components/console/delete-dialog";
import { OverviewPanel } from "@/components/console/overview-panel";
import { ServerFormDialog } from "@/components/console/server-form-dialog";
import { ServerPanel } from "@/components/console/server-panel";
import { SshKeyDialog } from "@/components/console/ssh-key-dialog";
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
];

export default function Dashboard({ section = "overview" }: { section?: DashboardSection }) {
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [servers, setServers] = useState<ManagedServer[]>([]);
  const [sharedKeyConfigured, setSharedKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [editingServer, setEditingServer] = useState<ManagedServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [certificateResponse, serverResponse, keyResponse] = await Promise.all([
        fetch("/api/certificates", { cache: "no-store" }),
        fetch("/api/servers", { cache: "no-store" }),
        fetch("/api/settings/ssh-private-key", { cache: "no-store" }),
      ]);
      if (!certificateResponse.ok || !serverResponse.ok || !keyResponse.ok) {
        throw new Error("无法加载控制台数据");
      }
      setCertificates((await certificateResponse.json()).data);
      setServers((await serverResponse.json()).data);
      setSharedKeyConfigured((await keyResponse.json()).data.configured);
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
        onCreateCertificate={() => openCertificateDialog()}
        onNavigate={navigate}
      />
    ),
    certificates: (
      <CertificatePanel
        certificates={certificates}
        loading={loading}
        busy={busy}
        onCreate={() => openCertificateDialog()}
        onEdit={openCertificateDialog}
        onRefresh={(id) => void runAction(`/api/certificates/${id}/refresh`, "POST", "刷新任务已创建")}
        onDelete={setDeleteTarget}
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
  } satisfies Record<DashboardSection, React.ReactNode>;

  return (
    <>
      <ConsoleLayout
        section={section}
        navigation={navigation}
        loading={loading}
        onReload={() => load().catch((cause) => toast.error(cause.message))}
        onSettings={() => setKeyDialogOpen(true)}
      >
        {content[section]}
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
        configured={sharedKeyConfigured}
        busy={busy}
        onOpenChange={setKeyDialogOpen}
        onSave={async (privateKey) => {
          const saved = await save("/api/settings/ssh-private-key", { privateKey }, "SSH 私钥已保存");
          if (saved) setSharedKeyConfigured(true);
          return saved;
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
