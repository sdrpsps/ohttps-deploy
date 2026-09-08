"use client";

import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { DeleteTarget } from "./types";

type DeleteDialogProps = {
  target: DeleteTarget | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteDialog({ target, busy, onOpenChange, onConfirm }: DeleteDialogProps) {
  const [force, setForce] = useState(false);

  useEffect(() => {
    setForce(false);
  }, [target]);

  const isServer = target?.type === "server";
  const isDeleteDisabled = busy || (isServer && !force);

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="size-5" />
            <span>确认删除{isServer ? "目标服务器" : "证书资产"}</span>
          </DialogTitle>
          <DialogDescription className="text-xs pt-1">
            {isServer
              ? `将从控制台移除服务器“${target?.name}”及其关联的策略映射。`
              : `将从控制台移除证书“${target?.name}”及其未使用的策略映射。`}
          </DialogDescription>
        </DialogHeader>

        {isServer && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.04] p-3.5 text-xs">
            <Checkbox
              id="force-delete-server"
              checked={force}
              onCheckedChange={(checked) => setForce(checked === true)}
              className="mt-0.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
            />
            <Label
              htmlFor="force-delete-server"
              className="cursor-pointer font-normal text-foreground leading-snug space-y-1"
            >
              <span className="font-semibold text-destructive block">我已知晓风险，强制删除此服务器</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                此操作将清理该服务器关联的所有历史部署记录和执行日志。必须勾选此项确认后方可执行删除。
              </p>
            </Label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isDeleteDisabled}
            onClick={onConfirm}
            className="gap-1.5 shadow-sm"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            <span>{busy ? "删除中..." : isServer ? "强制删除服务器" : "确认删除证书"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

