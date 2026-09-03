"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Control, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { Certificate, ManagedServer } from "./types";

const certificateSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  domain: z.string().regex(/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i, "请输入有效域名"),
  ohttpsCertificateId: z.string().min(1, "请输入证书 ID"),
  renewBeforeDays: z.coerce.number().int().min(1).max(365),
  serverIds: z.array(z.string()),
});

type CertificateForm = z.infer<typeof certificateSchema>;

type CertificateFormDialogProps = {
  certificate: Certificate | null;
  open: boolean;
  busy: boolean;
  servers?: ManagedServer[];
  existingServerIds?: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (values: CertificateForm, certificate: Certificate | null) => Promise<boolean>;
};

export function CertificateFormDialog({
  certificate,
  open,
  busy,
  servers = [],
  existingServerIds = [],
  onOpenChange,
  onSave,
}: CertificateFormDialogProps) {
  const form = useForm<CertificateForm>({
    resolver: zodResolver(certificateSchema),
    defaultValues: emptyCertificateForm,
  });

  useEffect(() => {
    form.reset(certificate ? toFormValues(certificate, existingServerIds) : { ...emptyCertificateForm, serverIds: existingServerIds });
  }, [certificate, existingServerIds, form, open]);

  async function submit(values: CertificateForm) {
    if (await onSave(values, certificate)) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{certificate ? "编辑证书" : "添加证书"}</DialogTitle>
          <DialogDescription>
            {certificate ? "修改证书配置与自动部署目标服务器。" : "接入 ohttps 证书并绑定自动部署的目标服务器"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <TextField control={form.control} name="name" label="名称" placeholder="生产环境主站" />
            <TextField control={form.control} name="domain" label="域名" placeholder="example.com" />
            <TextField control={form.control} name="ohttpsCertificateId" label="ohttps 证书 ID" placeholder="cert_xxxxxxxxx" />
            <FormField
              control={form.control}
              name="renewBeforeDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>提前续期天数</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      {...field}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {servers.length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <FormLabel className="text-sm font-medium">自动部署目标服务器（可选）</FormLabel>
                    <p className="text-xs text-muted-foreground">新证书获取后将自动推送至已勾选的服务器并执行重载。</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => form.setValue("serverIds", [], { shouldDirty: true })}
                    >
                      取消全选
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-1.5 text-xs"
                      onClick={() =>
                        form.setValue(
                          "serverIds",
                          servers.filter((s) => s.enabled).map((s) => s.id),
                          { shouldDirty: true }
                        )
                      }
                    >
                      全选已启用
                    </Button>
                  </div>
                </div>
                <div className="max-h-36 space-y-2 overflow-y-auto pt-1">
                  {servers.map((server) => {
                    const checked = (form.watch("serverIds") || []).includes(server.id);
                    return (
                      <div key={server.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`cert-server-${server.id}`}
                          checked={checked}
                          disabled={!server.enabled}
                          onCheckedChange={(isChecked) => {
                            const cur = form.getValues("serverIds") || [];
                            const next = isChecked ? [...cur, server.id] : cur.filter((id) => id !== server.id);
                            form.setValue("serverIds", next, { shouldDirty: true });
                          }}
                        />
                        <label
                          htmlFor={`cert-server-${server.id}`}
                          className={`text-xs cursor-pointer ${!server.enabled ? "text-muted-foreground line-through" : ""}`}
                        >
                          <span className="font-medium">{server.name}</span>
                          <span className="ml-1.5 font-mono text-muted-foreground">({server.host}:{server.port})</span>
                          {!server.enabled && " [已停用]"}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                暂无部署服务器。保存证书后可在「服务器」中添加目标主机，或在「部署策略」中随时关联。
              </div>
            )}

            <Button className="w-full" disabled={busy}>
              {busy ? "保存中..." : certificate ? "保存修改" : "创建证书"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<CertificateForm>;
  name: "name" | "domain" | "ohttpsCertificateId";
  label: string;
  placeholder: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const emptyCertificateForm: CertificateForm = {
  name: "",
  domain: "",
  ohttpsCertificateId: "",
  renewBeforeDays: 20,
  serverIds: [],
};

function toFormValues(certificate: Certificate, serverIds: string[] = []): CertificateForm {
  return {
    name: certificate.name,
    domain: certificate.domain,
    ohttpsCertificateId: certificate.ohttpsCertificateId,
    renewBeforeDays: certificate.renewBeforeDays,
    serverIds,
  };
}
