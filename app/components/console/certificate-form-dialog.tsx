"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import type { Certificate } from "./types";

const certificateSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  domain: z.string().min(1, "请输入域名"),
  ohttpsCertificateId: z.string().min(1, "请输入证书 ID"),
  renewBeforeDays: z.coerce.number().int().min(1).max(365),
});

type CertificateForm = z.infer<typeof certificateSchema>;

type CertificateFormDialogProps = {
  certificate: Certificate | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: CertificateForm, certificate: Certificate | null) => Promise<boolean>;
};

export function CertificateFormDialog({
  certificate,
  open,
  busy,
  onOpenChange,
  onSave,
}: CertificateFormDialogProps) {
  const form = useForm<CertificateForm>({
    resolver: zodResolver(certificateSchema),
    defaultValues: emptyCertificateForm,
  });

  useEffect(() => {
    form.reset(certificate ? toFormValues(certificate) : emptyCertificateForm);
  }, [certificate, form, open]);

  async function submit(values: CertificateForm) {
    if (await onSave(values, certificate)) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{certificate ? "编辑证书" : "添加证书"}</DialogTitle>
          <DialogDescription>
            {certificate ? "修改证书配置，不会覆盖已缓存的证书版本。" : "接入 ohttps 证书并设置续期提醒"}
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
  control: ReturnType<typeof useForm<CertificateForm>>["control"];
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
};

function toFormValues(certificate: Certificate): CertificateForm {
  return {
    name: certificate.name,
    domain: certificate.domain,
    ohttpsCertificateId: certificate.ohttpsCertificateId,
    renewBeforeDays: certificate.renewBeforeDays,
  };
}
