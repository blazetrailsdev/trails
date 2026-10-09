import "../sqlite/better-sqlite3.js";
import "../associations/collection-proxy.js";
import "../association-relation.js";
import "../associations/disable-joins-association-scope.js";
import { afterAll, afterEach, expect } from "vitest";
import { Timeout, getOs } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import type { PoolManager } from "../connection-adapters/pool-manager.js";
import { I18n } from "@blazetrails/activemodel";
import { afterTeardown, zone as timeZone, setZone } from "@blazetrails/activesupport";
import { DelegateCache } from "../relation/delegation.js";
import { registerFakeAdapter } from "../support/fake-adapter.js";
import { DEFAULT_ENV } from "../connection-handling.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { Encryption } from "../encryption.js";
import { ExtendedDeterministicQueries } from "../encryption/extended-deterministic-queries.js";
import { ExtendedDeterministicUniquenessValidator } from "../encryption/extended-deterministic-uniqueness-validator.js";
import { setPermanentConnectionCheckout } from "../active-record.js";
import {
  setBelongsToRequiredValidatesForeignKey,
  setRaiseOnAssignToAttrReadonly,
} from "../active-record.js";

registerFakeAdapter();

DatabaseTasks.env = DEFAULT_ENV();
DatabaseTasks.root = getOs().cwd();
DatabaseTasks.dbDir = "db";

expect.addEqualityTesters([
  function recordEquals(a: unknown, b: unknown): boolean | undefined {
    if (!(a instanceof Base) || !(b instanceof Base)) return undefined;
    return a.equals(b);
  },
]);

DelegateCache.delegateBaseMethods = false;

I18n.setEnforceAvailableLocales(false);

Base.automaticallyInvertPluralAssociations = true;

setRaiseOnAssignToAttrReadonly(true);

setBelongsToRequiredValidatesForeignKey(false);

setPermanentConnectionCheckout("disallowed");

export const TEST_PRIMARY_KEY = "test master key";
export const TEST_DETERMINISTIC_KEY = "test deterministic key";
export const TEST_KEY_DERIVATION_SALT = "testing key derivation salt";

Encryption.configure({
  primaryKey: TEST_PRIMARY_KEY,
  deterministicKey: TEST_DETERMINISTIC_KEY,
  keyDerivationSalt: TEST_KEY_DERIVATION_SALT,
});

Encryption.config.extendQueries = true;
ExtendedDeterministicQueries.installSupport();
ExtendedDeterministicUniquenessValidator.installSupport();

function writingPoolCensus(): Map<string, Map<string, number>> {
  const census = new Map<string, Map<string, number>>();
  for (const pool of Base.connectionHandler.connectionPoolList("writing")) {
    if (pool.dbConfig?.adapter === "fake") continue;
    const name = String(pool.connectionDescriptor?.name);
    const signature = `${pool.dbConfig?.adapter}:${pool.dbConfig?.database}`;
    let bySignature = census.get(name);
    if (!bySignature) {
      bySignature = new Map<string, number>();
      census.set(name, bySignature);
    }
    bySignature.set(signature, (bySignature.get(signature) ?? 0) + 1);
  }
  return census;
}

let baselineWritingPools = new Map<string, Map<string, number>>();

export function captureWritingPoolBaseline(): void {
  baselineWritingPools = writingPoolCensus();
}

export function writingPoolsLeakedSinceBaseline(): string[] {
  const leaked: string[] = [];
  for (const [name, bySignature] of writingPoolCensus()) {
    const baseline = baselineWritingPools.get(name);
    for (const [signature, count] of bySignature) {
      const before = baseline?.get(signature) ?? 0;
      if (count <= before) continue;
      leaked.push(
        baseline === undefined
          ? name
          : before === 0
            ? `${name} (${signature})`
            : `${name} (${before} -> ${count})`,
      );
    }
  }
  return leaked;
}

afterEach(() => {
  afterTeardown();
});

afterAll(() => {
  expect(
    writingPoolsLeakedSinceBaseline(),
    "This file left connection pool(s) in the writing list. Remove them in " +
      "teardown (removeConnection() / connectionHandler.removeConnectionPool(name)): " +
      "the next file to run in this worker pins and verifies every writing pool, " +
      "and fails on yours instead of on this one.",
  ).toEqual([]);
});

export async function inTimeZone(
  zone: string | number | null,
  fn: () => Promise<void> | void,
): Promise<void> {
  const oldZone = timeZone();
  const oldAware = Base.timeZoneAwareAttributes;

  setZone(zone);
  Base.timeZoneAwareAttributes = zone != null;

  try {
    await fn();
  } finally {
    setZone(oldZone);
    Base.timeZoneAwareAttributes = oldAware;
  }
}

export async function waitForAsyncQuery(
  connection?: AbstractAdapter,
  { timeout = 5 }: { timeout?: number } = {},
): Promise<void> {
  connection ??= await Base.leaseConnection();
  if (!connection.asyncEnabled()) return;

  const executor = (connection.pool as ConnectionPool).asyncExecutor!;
  for (let i = 0; i < timeout * 100; i++) {
    if (!(executor.scheduledTaskCount > executor.completedTaskCount)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Timeout.Error(`The async executor wasn't drained after ${timeout} seconds`);
}

export function cleanUpConnectionHandler(): void {
  const handler = Base.connectionHandler as unknown as {
    _connectionNameToPoolManager: { eachPair(block: (k: string, v: PoolManager) => void): void };
  };
  handler._connectionNameToPoolManager.eachPair((owner, poolManager) => {
    for (const roleName of [...poolManager.roleNames]) {
      if (
        roleName === Base.defaultRole &&
        ["ActiveRecord::Base", "ARUnit2Model", "Contact", "ContactSti"].includes(owner)
      )
        continue;
      poolManager.removeRole(roleName);
    }
  });
}
