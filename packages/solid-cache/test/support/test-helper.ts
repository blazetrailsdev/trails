import { ActiveRecord } from "@blazetrails/activerecord";
import { EnvironmentInquirer, TopLevel } from "@blazetrails/activesupport";
import { regexpEscape } from "@blazetrails/ruby-compat";
import type { StoreOptions } from "@blazetrails/activesupport/cache";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { Entry, Record, Store } from "../../lib/index.js";
import { loadCacheSchema } from "./cache-schema.js";

export function useSolidCache(): {
  lookupStore(options?: StoreOptions): Store;
  keyPattern(key: string, options?: { namespace?: string | null }): RegExp;
} {
  const state = { namespace: "" };
  let old: typeof TopLevel.Trails;

  beforeAll(async () => {
    old = TopLevel.Trails;
    TopLevel.Trails = {
      ...old,
      env: old?.env ?? new EnvironmentInquirer(ActiveRecord.ConnectionHandling.DEFAULT_ENV()),
    } as unknown as typeof TopLevel.Trails;
    await loadCacheSchema();
  });

  afterAll(() => {
    TopLevel.Trails = old;
  });

  beforeEach(async () => {
    state.namespace = `test-${crypto.randomUUID().replaceAll("-", "")}`;
    await Record.eachShard(() => Entry.deleteAll());
  });

  return {
    lookupStore(options: StoreOptions = {}): Store {
      return new Store({ namespace: state.namespace, ...options });
    },

    keyPattern(key: string, { namespace = state.namespace }: { namespace?: string | null } = {}) {
      return new RegExp(
        `${regexpEscape(namespace ?? "")}${namespace != null ? ":" : ""}${regexpEscape(key)}`,
      );
    },
  };
}
