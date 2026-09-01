"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z.string().min(12, "新密码至少需要 12 个字符").max(200),
  confirmPassword: z.string(),
}).refine((value) => value.newPassword === value.confirmPassword, { path: ["confirmPassword"], message: "两次输入的新密码不一致" });

type PasswordForm = z.infer<typeof schema>;

type ChangePasswordDialogProps = {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: Pick<PasswordForm, "currentPassword" | "newPassword">) => Promise<boolean>;
};

export function ChangePasswordDialog({ open, busy, onOpenChange, onSave }: ChangePasswordDialogProps) {
  const form = useForm<PasswordForm>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });

  useEffect(() => { if (open) form.reset(); }, [form, open]);

  async function submit({ currentPassword, newPassword }: PasswordForm) {
    if (await onSave({ currentPassword, newPassword })) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改管理员密码</DialogTitle>
          <DialogDescription>新密码至少 12 个字符。修改成功后请使用新密码登录。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <PasswordField control={form.control} name="currentPassword" label="当前密码" autoComplete="current-password" />
            <PasswordField control={form.control} name="newPassword" label="新密码" autoComplete="new-password" />
            <PasswordField control={form.control} name="confirmPassword" label="确认新密码" autoComplete="new-password" />
            <Button className="w-full" disabled={busy}>{busy ? "修改中..." : "确认修改密码"}</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordField({ control, name, label, autoComplete }: { control: ReturnType<typeof useForm<PasswordForm>>["control"]; name: keyof PasswordForm; label: string; autoComplete: string }) {
  return <FormField control={control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input type="password" autoComplete={autoComplete} {...field} /></FormControl><FormMessage /></FormItem>} />;
}
