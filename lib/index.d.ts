export const name: string;
export const inject: string[];
export function resolveDirs(): {
  dataDir: string;
  dbPath: string;
  logDir: string;
};
export function apply(ctx: unknown): void;
