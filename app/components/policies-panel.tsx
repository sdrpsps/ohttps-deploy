"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FolderLock,
  Globe,
  LoaderCircle,
  Network,
  Search,
  Server,
  ShieldCheck,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

  return (
    <div className="space-y-6">
      {/* 1. Header Policy Info Card */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/[0.04] via-card to-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <Workflow className="size-5 text-primary" />
              <h2 className="text-base font-semibold">自动化部署策略</h2>
              <Badge variant="outline" className="border-primary/30 text-[11px] font-mono text-primary">
                自动路由规则
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              为每张证书指定自动推送的目标服务器。当新证书从 ohttps 同步并验证成功后，系统将自动发起 SSH 部署并执行 Nginx 测试与热重载。
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-lg border bg-card p-2.5 text-center min-w-24 shadow-sm">
              <span className="block text-[11px] text-muted-foreground">生效映射</span>
              <span className="font-mono text-lg font-bold text-foreground">{activeMappingCount}</span>
            </div>
            <div className="rounded-lg border bg-card p-2.5 text-center min-w-24 shadow-sm">
              <span className="block text-[11px] text-muted-foreground">覆盖证书</span>
              <span className="font-mono text-lg font-bold text-foreground">
                {configuredCertCount}/{certificates.length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Policies Table Card */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">证书部署映射清单</CardTitle>
            <CardDescription className="text-xs">
              每张证书的独立推送配置；未绑定的证书将仅在本地安全留存，不推送至远程节点
            </CardDescription>
          </div>

          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="按名称或域名筛选..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-lg border border-border/80 overflow-hidden">
            <Table className="min-w-[700px]">
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[30%] text-xs font-semibold">证书与远程目标路径</TableHead>
                  <TableHead className="w-[45%] text-xs font-semibold">绑定的部署服务器节点</TableHead>
                  <TableHead className="w-[12%] text-xs font-semibold">策略状态</TableHead>
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
                        <div className="space-y-1.5">
                          <div>
                            <span className="font-semibold text-xs text-foreground">{certificate.name}</span>
                            <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground mt-0.5">
                              <Globe className="size-3 text-muted-foreground/70" />
                              <span>{certificate.domain}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/80 bg-muted/40 px-2 py-0.5 rounded max-w-fit">
                            <span>路径:</span>
                            <span className="text-foreground/80">/etc/nginx/ssl/{certificate.domain}/</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Mapped Servers */}
                      <TableCell>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            {isAllEnabled ? (
                              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] py-0 h-5 font-medium">
                                全部已启用节点 ({count})
                              </Badge>
                            ) : count > 0 ? (
                              <Badge variant="secondary" className="text-[10px] py-0 h-5 font-medium">
                                已选 {count} / {enabledServers.length} 个节点
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] py-0 h-5">
                                未绑定部署节点
                              </Badge>
                            )}
                          </div>

                          {/* Server Chips */}
                          {count > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {selectedList.slice(0, 4).map((server) => (
                                <span
                                  key={server.id}
                                  className="inline-flex items-center gap-1 rounded border border-border/80 bg-muted/30 px-1.5 py-0.5 text-[11px] text-foreground font-medium"
                                >
                                  <Server className="size-2.5 text-primary" />
                                  <span className="truncate max-w-[120px]">{server.name}</span>
                                </span>
                              ))}
                              {selectedList.length > 4 && (
                                <span className="inline-flex items-center rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  +{selectedList.length - 4} 更多
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* 3. Status */}
                      <TableCell>
                        {count > 0 ? (
                          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            自动推送
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-neutral-400" />
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
                          className="h-7 px-2.5 text-xs gap-1 shadow-sm"
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
                        <p className="text-xs text-muted-foreground">请先在「证书」中接入证书资产，即可在此页面配置自动部署目标。</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {certificates.length > 0 && filteredCertificates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                      未找到符合筛选条件的证书策略。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 3. Policy Edit Dialog */}
      <Dialog
        open={Boolean(selectedCertificate)}
        onOpenChange={(open) => !open && setSelectedCertificate(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-primary" />
              <span>配置部署目标服务器</span>
            </DialogTitle>
            <DialogDescription className="space-y-1.5 pt-1 text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <span>证书：{selectedCertificate?.name}</span>
                <span className="font-mono text-muted-foreground">({selectedCertificate?.domain})</span>
              </div>
              <p className="text-muted-foreground">
                新证书生成或续期后，将自动通过 SSH 推送至已勾选的节点，写入{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                  /etc/nginx/ssl/{selectedCertificate?.domain}/
                </code>
              </p>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Quick Actions & Search inside Dialog */}
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

              <div className="flex gap-1 shrink-0">
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

            {/* Server Checklist */}
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {modalFilteredServers.map((server) => {
                const id = `policy-${selectedCertificate?.id}-${server.id}`;
                const checked = selectedServerIds.has(server.id);

                return (
                  <div
                    key={server.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      !server.enabled
                        ? "bg-muted/20 border-border/50 opacity-60"
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
                          <Badge variant="secondary" className="text-[10px] py-0 h-4">
                            已停用
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <span>{server.username}@{server.host}:{server.port}</span>
                        {server.hostFingerprint && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">· 指纹正常</span>
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

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" onClick={() => setSelectedCertificate(null)}>
              取消
            </Button>
            <Button disabled={saving} onClick={() => void save()} className="gap-1.5 shadow-sm">
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              <span>{saving ? "保存中..." : "保存策略"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
