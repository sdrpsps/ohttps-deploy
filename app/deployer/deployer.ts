export interface DeploymentMaterial {
  certificatePath: string;
  privateKeyPath: string;
  domain?: string;
  certPath?: string;
  privateKeyPathRemote?: string;
}
export interface DeployTarget { id: string; host: string; port: number; username: string; hostFingerprint?: string | null; certPath: string; privateKeyPath: string; validationCommand: string; reloadCommand: string; healthCheckCommand?: string | null; timeoutSeconds: number; }
export interface DeploymentResult { targetId: string; ok: boolean; exitCode?: number; error?: string; }

export type DeploymentProgressCallback = (phase: string, message: string, level?: "info" | "warn" | "error") => Promise<void> | void;

export interface DeployOptions {
  dryRun?: boolean;
  signal?: AbortSignal;
  onProgress?: DeploymentProgressCallback;
}

export interface Deployer { deploy(target: DeployTarget, material: DeploymentMaterial | DeploymentMaterial[], options?: DeployOptions): Promise<DeploymentResult>; }

export function validateCommand(command: string): void {
  if (!command.trim() || /[\r\n]/.test(command) || /[;&`|<>$()]/.test(command)) throw new Error("command contains unsupported shell metacharacters");
}

