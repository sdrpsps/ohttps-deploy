"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z.string().min(8, "新密码至少需要 8 个字符").max(200),
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="size-5 text-primary" />
            <span>修改管理员密码</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            新密码至少 8 个字符。修改成功后当前会话保持有效，下次请使用新密码登录。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4 pt-1" onSubmit={form.handleSubmit(submit)}>
            <PasswordField control={form.control} name="currentPassword" label="当前密码" autoComplete="current-password" />
            <PasswordField control={form.control} name="newPassword" label="新密码" autoComplete="new-password" />
            <PasswordField control={form.control} name="confirmPassword" label="确认新密码" autoComplete="new-password" />
            <Button className="w-full gap-1.5 shadow-sm" disabled={busy}>
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              <span>{busy ? "修改中..." : "确认修改密码"}</span>
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordField({
  control,
  name,
  label,
  autoComplete,
}: {
  control: ReturnType<typeof useForm<PasswordForm>>["control"];
  name: keyof PasswordForm;
  label: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs">{label}</FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                type={show ? "text" : "password"}
                autoComplete={autoComplete}
                className="pr-9 text-sm"
                {...field}
              />
            </FormControl>
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={show ? "隐藏密码" : "显示密码"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FormMessage className="text-[11px]" />
        </FormItem>
      )}
    />
  );
}
