import "../sqlite/better-sqlite3.js";
import "../associations/collection-proxy.js";
import "../association-relation.js";
import "../associations/disable-joins-association-scope.js";
import { afterAll, afterEach, expect } from "vitest";
import { Base } from "../base.js";
import { I18n } from "@blazetrails/activemodel";
import { afterTeardown, zone as timeZone, setZone } from "@blazetrails/activesupport";
import { DelegateCache } from "../relation/delegation.js";
import { ActiveRecord } from "../ar-config.js";
import { registerFakeAdapter } from "../support/fake-adapter.js";
import { Configurable as EncryptionConfigurable } from "../encryption/configurable.js";
import { installExtendedQueriesIfConfigured } from "../encryption/install.js";
import {
  TEST_PRIMARY_KEY,
  TEST_DETERMINISTIC_KEY,
  TEST_KEY_DERIVATION_SALT,
} from "../encryption/test-keys.js";

registerFakeAdapter();

DelegateCache.delegateBaseMethods = false;

I18n.setEnforceAvailableLocales(false);

Base.automaticallyInvertPluralAssociations = true;

ActiveRecord.raiseOnAssignToAttrReadonly = true;

ActiveRecord.belongsToRequiredValidatesForeignKey = false;

EncryptionConfigurable.configure({
  primaryKey: TEST_PRIMARY_KEY,
  deterministicKey: TEST_DETERMINISTIC_KEY,
  keyDerivationSalt: TEST_KEY_DERIVATION_SALT,
});

EncryptionConfigurable.config.extendQueries = true;
installExtendedQueriesIfConfigured();

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
  zone: string | null,
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
