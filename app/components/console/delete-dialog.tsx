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
  onConfirm: (force?: boolean) => void;
};

export function DeleteDialog({ target, busy, onOpenChange, onConfirm }: DeleteDialogProps) {
  const [force, setForce] = useState(false);

  useEffect(() => {
    setForce(false);
  }, [target]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            将删除“{target?.name}”及其未使用的策略映射。
          </DialogDescription>
        </DialogHeader>

        {target?.type === "server" && (
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
              <span className="font-semibold">强制删除</span>
              <p className="mt-1 text-xs text-muted-foreground">
                同时清理该服务器关联的所有历史部署记录和执行日志。若不勾选且存在历史记录，删除将被系统拒绝。
              </p>
            </Label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(force)}>
            {force ? "强制删除" : "确认删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

