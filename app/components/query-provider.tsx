"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { queryDefaults } from "@/lib/query-config";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: queryDefaults,
    },
  }));

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
