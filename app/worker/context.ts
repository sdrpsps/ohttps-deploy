import { loadConfig } from "../lib/config";
import { runtimeDefaults, type RuntimeSettings } from "../lib/runtime-settings";
import { CertificateStore } from "../domain/certificate-store";
import { OHTTPSClient } from "../domain/ohttps-client";
import { SSHDeployer, type Deployer } from "../deployer";

export const workerConfig = loadConfig();
export const workerAdapters = {
  now: () => Date.now(),
  certificateStore: new CertificateStore(workerConfig.CERTIFICATE_STORAGE_DIR),
  ohttpsClient: (apiId: string, apiKey: string): Pick<OHTTPSClient, "getCertificate"> => new OHTTPSClient(apiId, apiKey),
  deployer: (privateKey: string): Deployer => new SSHDeployer({ privateKey }),
};

// Shared by the Worker modules; only the runtime refreshes settings and lease state.
export const workerContext: { runtimeSettings: RuntimeSettings; leaseSignal?: AbortSignal } = {
  runtimeSettings: { ...runtimeDefaults, ohttpsApiId: "", ohttpsApiKey: "", webhookUrl: "" },
};
