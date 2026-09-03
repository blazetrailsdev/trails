function readRaw(key: string): string | undefined {
  if (typeof globalThis.process === "undefined") return undefined;
  return globalThis.process.env[key];
}

export function getEnv(key: string, defaultValue: string): string;
export function getEnv(key: string): string | undefined;
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return readRaw(key) ?? defaultValue;
}
