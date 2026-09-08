import type { NextConfig } from "next";
import pkg from "./package.json";

const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION || pkg.version;
const appVersion = rawVersion
  ? rawVersion.startsWith("v")
    ? rawVersion
    : `v${rawVersion}`
  : "v0.0.0";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ssh2"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;
