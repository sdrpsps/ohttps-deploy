import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardSection } from "./types";

type DashboardSkeletonProps = {
  section: DashboardSection;
};

const rows = Array.from({ length: 5 });

export function DashboardSkeleton({ section }: DashboardSkeletonProps) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="正在加载页面内容">
      <span className="sr-only">正在加载页面内容</span>
      {section === "overview" ? <OverviewSkeleton /> : null}
      {section === "certificates" || section === "servers" ? <AssetTableSkeleton /> : null}
      {section === "policies" ? <PolicySkeleton /> : null}
      {section === "activity" ? <ActivitySkeleton /> : null}
      {section === "notifications" ? <NotificationSkeleton /> : null}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ListCardSkeleton />
        <ListCardSkeleton />
      </div>
    </>
  );
}

function AssetTableSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-7 w-52" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <TableSkeleton />
    </div>
  );
}

function PolicySkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-44" />
      </div>
      <TableSkeleton />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
      </div>
      <Skeleton className="h-9 w-full sm:w-96" />
      <div className="rounded-xl border bg-card p-6">
        <Skeleton className="h-8 w-full max-w-lg" />
        <TableSkeleton />
      </div>
    </>
  );
}

function NotificationSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-8 w-36" />
      </div>
      <TableSkeleton />
    </div>
  );
}

function ListCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="mt-2 h-4 w-52" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14" />)}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border">
      <Skeleton className="h-10 rounded-none bg-muted/70" />
      <div className="space-y-3 p-4">
        {rows.map((_, index) => <Skeleton key={index} className="h-10" />)}
      </div>
    </div>
  );
}
