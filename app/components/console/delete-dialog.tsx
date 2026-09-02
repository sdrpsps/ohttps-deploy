"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            {isServer
              ? `将删除服务器“${target?.name}”及其关联的策略映射。请确认后勾选强制删除。`
              : `将删除证书“${target?.name}”及其未使用的策略映射。`}
          </DialogDescription>
        </DialogHeader>

        {isServer && (
          <div className="flex items-start space-x-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <Checkbox
              id="force-delete-server"
              checked={force}
              onCheckedChange={(checked) => setForce(checked === true)}
            />
            <Label
              htmlFor="force-delete-server"
              className="cursor-pointer font-normal text-destructive leading-snug"
            >
              <span className="font-semibold">我已知晓风险，强制删除此服务器</span>
              <p className="mt-1 text-xs text-muted-foreground">
                将同时清理该服务器关联的所有历史部署记录和执行日志。必须勾选此项方可执行删除。
              </p>
            </Label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            variant="destructive"
            disabled={isDeleteDisabled}
            onClick={onConfirm}
          >
            {isServer ? "强制删除" : "确认删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

