export interface DeploymentMaterial { certificatePath: string; privateKeyPath: string; }
export interface DeployTarget { id: string; host: string; port: number; username: string; hostFingerprint?: string | null; certPath: string; privateKeyPath: string; reloadCommand: string; healthCheckCommand?: string | null; timeoutSeconds: number; }
export interface DeploymentResult { targetId: string; ok: boolean; exitCode?: number; error?: string; }

export interface Deployer { deploy(target: DeployTarget, material: DeploymentMaterial, options?: { dryRun?: boolean; signal?: AbortSignal }): Promise<DeploymentResult>; }

export function validateCommand(command: string): void {
  if (!command.trim() || /[\r\n]/.test(command) || /[;&`|<>]/.test(command)) throw new Error("command contains unsupported shell metacharacters");
}

