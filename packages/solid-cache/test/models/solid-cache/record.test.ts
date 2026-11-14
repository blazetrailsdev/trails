import { ActiveRecord } from "@blazetrails/activerecord";
import { env, RuntimeError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Record } from "../../../lib/index.js";
import { useSolidCache } from "../../support/test-helper.js";

const SINGLE_DB_CONFIGS: (string | undefined)[] = [
  "config/cache_database.yml",
  "config/cache_unprepared_statements.yml",
];
const MULTI_DB_CONFIGS: (string | undefined)[] = [
  "config/cache_connects_to.yml",
  "config/cache_encrypted.yml",
  "config/cache_encrypted_custom.yml",
  "config/cache_shards.yml",
  undefined,
];

describe("RecordTest", () => {
  useSolidCache();

  it("each_shard", async () => {
    const shards: unknown[] = [];
    await Record.eachShard(() => shards.push(Record.currentShard()));
    verifyShards(shards);
  });

  it("each_shard uses the default role", async () => {
    const role = await ActiveRecord.Base.connectedTo({ role: "reading" }, async () => {
      const roles: unknown[] = [];
      await Record.eachShard(() => roles.push(Record.currentRole()));
      return roles;
    });
    verifyRoles(role);
  });

  function verifyShards(shards: unknown[]): void {
    const config = env["SOLID_CACHE_CONFIG"];
    if (config === "config/cache_no_database.yml") {
      expect(shards).toEqual(["default"]);
    } else if (config === "config/cache_database.yml") {
      expect(shards).toEqual(["primary"]);
    } else if (config === "config/cache_unprepared_statements.yml") {
      expect(shards).toEqual(["primary_unprepared_statements"]);
    } else if (MULTI_DB_CONFIGS.includes(config)) {
      expect(shards).toEqual([
        "primary_shard_one",
        "primary_shard_two",
        "secondary_shard_one",
        "secondary_shard_two",
      ]);
    } else {
      throw new RuntimeError(`Unknown SOLID_CACHE_CONFIG: ${config}`);
    }
  }

  function verifyRoles(role: unknown[]): void {
    const config = env["SOLID_CACHE_CONFIG"];
    if (config === "config/cache_no_database.yml") {
      expect(role).toEqual(["reading"]);
    } else if (SINGLE_DB_CONFIGS.includes(config)) {
      expect(role).toEqual(["writing"]);
    } else if (MULTI_DB_CONFIGS.includes(config)) {
      expect(role).toEqual(["writing", "writing", "writing", "writing"]);
    } else {
      throw new RuntimeError(`Unknown SOLID_CACHE_CONFIG: ${config}`);
    }
  }
});
