"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  LoaderCircle,
  Search,
  Server,
  SlidersHorizontal,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardSkeleton } from "@/components/console/dashboard-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Certificate, ManagedServer } from "@/components/console/types";
import { getApiData, queryKeys } from "@/lib/api";

type Policy = { certificateId: string; serverId: string; autoDeploy: boolean };
type PolicyData = { policies: Policy[]; configuredCertificateIds: string[] };
const emptyPolicyData: PolicyData = { policies: [], configuredCertificateIds: [] };

type PoliciesPanelProps = { certificates: Certificate[]; servers: ManagedServer[] };

export function PoliciesPanel({ certificates, servers }: PoliciesPanelProps) {
  const queryClient = useQueryClient();
  const { data = emptyPolicyData, isLoading } = useQuery({
    queryKey: queryKeys.policies,
    queryFn: () => getApiData<PolicyData>("/api/deployment-policies"),
  });

  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(new Set());
  const [modalSearch, setModalSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const enabledServers = useMemo(() => servers.filter((server) => server.enabled), [servers]);

  function currentSelection(certificateId: string) {
    const existing = data.policies.filter((policy) => policy.certificateId === certificateId);
    return new Set(
      existing
        .filter((policy) => policy.autoDeploy && enabledServers.some((server) => server.id === policy.serverId))
        .map((policy) => policy.serverId)
    );
  }

  const activeMappingCount = useMemo(() => {
    return certificates.reduce((sum, cert) => sum + currentSelection(cert.id).size, 0);
  }, [certificates, data, enabledServers]);

  const configuredCertCount = useMemo(() => {
    return certificates.filter((cert) => currentSelection(cert.id).size > 0).length;
  }, [certificates, data, enabledServers]);

  function openEditor(certificate: Certificate) {
    setSelectedCertificate(certificate);
    setModalSearch("");
    const existing = currentSelection(certificate.id);
    if (!existing.size && !data.configuredCertificateIds.includes(certificate.id)) {
      setSelectedServerIds(new Set(enabledServers.map((server) => server.id)));
    } else {
      setSelectedServerIds(existing);
    }
  }

  function toggleServer(serverId: string, checked: boolean) {
    setSelectedServerIds((ids) => {
      const next = new Set(ids);
      if (checked) next.add(serverId);
      else next.delete(serverId);
      return next;
    });
  }

  async function save() {
    if (!selectedCertificate) return;
    setSaving(true);
    try {
      const response = await fetch("/api/deployment-policies", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          certificateId: selectedCertificate.id,
          serverIds: [...selectedServerIds],
        }),
      });
      if (!response.ok) {
        throw new Error((await response.json().catch(() => null))?.error?.message ?? "保存部署策略失败");
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.policies });
      setSelectedCertificate(null);
      toast.success("部署策略已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存部署策略失败");
    } finally {
      setSaving(false);
    }
  }

  const filteredCertificates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return certificates;
    return certificates.filter(
      (c) => c.name.toLowerCase().includes(query) || c.domain.toLowerCase().includes(query)
    );
  }, [certificates, searchQuery]);

  const modalFilteredServers = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q)
    );
  }, [servers, modalSearch]);

  if (isLoading) return <DashboardSkeleton section="policies" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="按名称或域名筛选…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              已覆盖证书 <strong className="font-mono text-foreground">{configuredCertCount}/{certificates.length}</strong>
            </span>
            <span className="text-border">|</span>
            <span>
              生效映射 <strong className="font-mono text-foreground">{activeMappingCount}</strong>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table className="min-w-[700px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[30%] text-xs font-semibold">证书 / 远程路径</TableHead>
                <TableHead className="w-[45%] text-xs font-semibold">部署目标服务器</TableHead>
                <TableHead className="w-[12%] text-xs font-semibold">状态</TableHead>
                <TableHead className="w-[13%] text-right text-xs font-semibold">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCertificates.map((certificate) => {
                const selectedSet = currentSelection(certificate.id);
                const selectedList = servers.filter((s) => selectedSet.has(s.id));
                const count = selectedSet.size;
                const isAllEnabled = count > 0 && count === enabledServers.length;

                return (
                  <TableRow key={certificate.id} className="transition-colors hover:bg-muted/30">
                    {/* 1. Certificate info and path */}
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{certificate.name}</span>
                          <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                            <Globe className="size-3 text-muted-foreground/70" />
                            {certificate.domain}
                          </span>
                        </div>
                        <div className="w-fit rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
                          /etc/nginx/ssl/{certificate.domain}/
                        </div>
                      </div>
                    </TableCell>

                    {/* 2. Mapped Servers (clickable) */}
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openEditor(certificate)}
                        className="group space-y-1.5 text-left"
                        title="点击配置部署服务器"
                      >
                        {count > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isAllEnabled && (
                              <Badge variant="outline" className="h-5 border-emerald-500/40 bg-emerald-500/10 py-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                全部节点 ({count})
                              </Badge>
                            )}
                            {selectedList.slice(0, 4).map((server) => (
                              <span
                                key={server.id}
                                className="inline-flex items-center gap-1 rounded border border-border/80 bg-muted/30 px-1.5 py-0.5 text-[11px] font-medium text-foreground transition-colors group-hover:border-primary/40"
                              >
                                <Server className="size-2.5 text-primary" />
                                <span className="max-w-[120px] truncate">{server.name}</span>
                              </span>
                            ))}
                            {selectedList.length > 4 && (
                              <span className="inline-flex items-center rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                +{selectedList.length - 4}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="h-5 border-dashed border-amber-500/40 bg-amber-500/5 py-0 text-[10px] text-amber-600 transition-colors group-hover:border-amber-500 dark:text-amber-400">
                            未绑定节点 · 点击配置
                          </Badge>
                        )}
                      </button>
                    </TableCell>

                    {/* 3. Status */}
                    <TableCell className="whitespace-nowrap">
                      {count > 0 ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                          自动推送
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="size-1.5 shrink-0 rounded-full bg-neutral-400" />
                          仅本地
                        </span>
                      )}
                    </TableCell>

                    {/* 4. Action */}
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isLoading}
                        onClick={() => openEditor(certificate)}
                        className="h-7 gap-1 px-2.5 text-xs"
                      >
                        <SlidersHorizontal className="size-3" />
                        <span>配置目标</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {certificates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-44 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                        <Workflow className="size-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">暂无可配置的证书策略</p>
                      <p className="text-xs text-muted-foreground">请先在「证书」中添加证书。</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {certificates.length > 0 && filteredCertificates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                    未找到符合筛选条件的证书策略
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Policy Edit Dialog */}
      <Dialog
        open={Boolean(selectedCertificate)}
        onOpenChange={(open) => !open && setSelectedCertificate(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="size-4 text-primary" />
              <span>配置部署目标服务器</span>
            </DialogTitle>
            <DialogDescription className="space-y-1 pt-1 text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <span>{selectedCertificate?.name}</span>
                <span className="font-mono text-muted-foreground">({selectedCertificate?.domain})</span>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                目标目录：/etc/nginx/ssl/{selectedCertificate?.domain}/
              </p>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="过滤服务器..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
              </div>

              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedServerIds(new Set())}
                >
                  取消全选
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSelectedServerIds(new Set(enabledServers.map((server) => server.id)))}
                >
                  全选已启用
                </Button>
              </div>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {modalFilteredServers.map((server) => {
                const id = `policy-${selectedCertificate?.id}-${server.id}`;
                const checked = selectedServerIds.has(server.id);

                return (
                  <div
                    key={server.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      !server.enabled
                        ? "border-border/50 bg-muted/20 opacity-60"
                        : checked
                        ? "border-primary/40 bg-primary/[0.02]"
                        : "border-border/80 hover:bg-muted/30"
                    }`}
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      disabled={!server.enabled}
                      onCheckedChange={(c) => toggleServer(server.id, c === true)}
                    />
                    <Label htmlFor={id} className="flex-1 cursor-pointer select-none space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{server.name}</span>
                        {!server.enabled && (
                          <Badge variant="secondary" className="h-4 py-0 text-[10px]">
                            已停用
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <span>{server.username}@{server.host}:{server.port}</span>
                        {server.hostFingerprint && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">· 指纹已录入</span>
                        )}
                      </div>
                    </Label>
                  </div>
                );
              })}

              {servers.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  尚未添加任何服务器。请前往「服务器」添加后再来配置策略。
                </div>
              ) : modalFilteredServers.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  未搜索到匹配的服务器节点。
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setSelectedCertificate(null)}>
              取消
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void save()} className="gap-1.5">
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              <span>{saving ? "保存中..." : "保存策略"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
