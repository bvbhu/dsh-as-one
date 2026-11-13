export const name: string;
export const inject: string[];
export interface AsOneRerouteSettings {
  compact?: string;
  vision?: string;
  sessionTitle?: string;
}
export interface AsOnePluginConfig {
  gatewayPort?: number;
  dataDir?: string;
  configDir?: string;
  dbPath?: string;
  routes?: AsOneRerouteSettings;
}
export function resolveDirs(ctx: unknown, config?: AsOnePluginConfig): {
  dataDir: string;
  configDir: string;
  dbPath: string;
};
export function apply(ctx: unknown, config?: AsOnePluginConfig): void;
