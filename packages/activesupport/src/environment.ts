/**
 * Environment variable accessor — browser-safe wrapper around process.env.
 *
 * Direct `process.env` reads throw in environments that lack `process`
 * (browsers, Deno edge runtimes). All env reads in the framework go through
 * `getEnv()` instead, which falls back gracefully to `undefined`.
 */

function readRaw(key: string): string | undefined {
  if (typeof globalThis.process === "undefined") return undefined;
  return globalThis.process.env[key];
}

/**
 * Read an environment variable. Returns `defaultValue` when the variable is
 * unset or the environment has no `process.env`.
 */
export function getEnv(key: string, defaultValue: string): string;
export function getEnv(key: string): string | undefined;
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return readRaw(key) ?? defaultValue;
}
