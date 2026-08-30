/** @internal */

import { regexpEscape } from "@blazetrails/ruby-compat";

export const RUN_TOKEN_ENV = "AR_TEST_RUN_TOKEN";

export const STALE_DB_AGE_MS = 6 * 60 * 60 * 1000;

const RANDOM_LENGTH = 6;
const TOKEN_PATTERN = "r[0-9a-z]+";

export function newRunToken(): string {
  const random = Math.floor(Math.random() * 36 ** RANDOM_LENGTH)
    .toString(36)
    .padStart(RANDOM_LENGTH, "0");
  return `r${Date.now().toString(36)}${random}`;
}

export function runTokenStartedAt(runToken: string): number | null {
  if (!runToken.startsWith("r") || runToken.length <= RANDOM_LENGTH + 1) return null;
  const millis = parseInt(runToken.slice(1, -RANDOM_LENGTH), 36);
  return Number.isFinite(millis) && millis > 0 ? millis : null;
}

export function runDatabasePrefix(base: string, runToken: string): string {
  return `${base}_${runToken}_`;
}

export function slotDatabaseName(base: string, runToken: string, slot: number): string {
  return `${runDatabasePrefix(base, runToken)}${slot}`;
}

export function splitRunDatabaseName(name: string): { base: string; suffix: string } {
  const suffix = new RegExp(`(_${TOKEN_PATTERN})?(_\\d+)?$`).exec(name)?.[0] ?? "";
  return { base: suffix === "" ? name : name.slice(0, -suffix.length), suffix };
}

export function runTokenOfDatabase(base: string, name: string): string | null {
  const match = new RegExp(`^${regexpEscape(base)}2?_(${TOKEN_PATTERN})_`).exec(name);
  return match?.[1] ?? null;
}

export function ownRunDatabases(base: string, runToken: string, names: string[]): string[] {
  return names.filter((name) => runTokenOfDatabase(base, name) === runToken);
}

export function staleRunDatabases(
  base: string,
  runToken: string,
  names: string[],
  now: number = Date.now(),
): string[] {
  return names.filter((name) => {
    const token = runTokenOfDatabase(base, name);
    if (token === null || token === runToken) return false;
    const startedAt = runTokenStartedAt(token);
    return startedAt !== null && now - startedAt >= STALE_DB_AGE_MS;
  });
}

export function pgAdvisoryLockKey(runToken: string, slot: number): [number, number] {
  let hash = 0;
  for (let i = 0; i < runToken.length; i++) {
    hash = (Math.imul(hash, 31) + runToken.charCodeAt(i)) | 0;
  }
  return [hash, slot];
}

export function mysqlAdvisoryLockName(runToken: string, slot: number): string {
  return `ar_test_slot_${runToken}_${slot}`;
}
