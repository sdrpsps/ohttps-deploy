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
      <Skeleton className="h-60 rounded-2xl bg-muted/70 sm:h-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ListCardSkeleton />
        <ListCardSkeleton />
      </div>
    </>
  );
}

function AssetTableSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Skeleton className="h-8 w-full sm:w-72" />
        <Skeleton className="h-7 w-56" />
      </div>
      <TableSkeleton />
    </div>
  );
}

function PolicySkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
      </div>
      <div className="rounded-xl border bg-card p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
        <Skeleton className="mt-6 h-8 w-full max-w-sm" />
        <TableSkeleton />
      </div>
    </>
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
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="mt-6 h-7 w-80 max-w-full" />
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
