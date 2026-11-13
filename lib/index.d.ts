export const name: string;
export const inject: string[];
export interface AsOnePluginConfig {
  gatewayPort?: number;
  dataDir?: string;
  configDir?: string;
  dbPath?: string;
}
export function resolveDirs(ctx: unknown, config?: AsOnePluginConfig): {
  dataDir: string;
  configDir: string;
  dbPath: string;
};
export function apply(ctx: unknown, config?: AsOnePluginConfig): void;
