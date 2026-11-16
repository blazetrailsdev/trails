import { ActiveRecord } from "@blazetrails/activerecord";
import { MessagePack } from "@blazetrails/activesupport/message-pack";
import { beforeEach, describe, expect, it } from "vitest";
import { Entry, type Store } from "../lib/index.js";
import { SOLID_CACHE_CONFIG, firstShardKey, useSolidCache } from "./support/test-helper.js";

describe("SolidCache::EncryptionTest", () => {
  const host = useSolidCache();
  let cache: Store;
  let shardKey: string;

  beforeEach(async () => {
    cache = host.lookupStore();
    shardKey = (await host.shardKeys(cache, firstShardKey()))[0];
  });

  it.skipIf(
    SOLID_CACHE_CONFIG != null && /config\/cache_encrypted.*\.yml/.test(SOLID_CACHE_CONFIG),
  )("not encrypted", async () => {
    await cache.write(shardKey, "value");
    expect(await firstValue()).not.toBeNull();
    expect(await rawFirstValue()).toEqual(await firstValue());
  });

  it.skipIf(SOLID_CACHE_CONFIG !== "config/cache_encrypted.yml")(
    "encrypted with defaults",
    async () => {
      await cache.write(shardKey, "value");
      expect(await firstValue()).not.toBeNull();
      expect(await rawFirstValue()).not.toEqual(await firstValue());
      const message = MessagePack.load(await rawFirstValue()) as Record<string, unknown>;
      expect(message["p"]).not.toBeNull();
      expect(message["h"]).not.toBeNull();
    },
  );

  it.skipIf(SOLID_CACHE_CONFIG !== "config/cache_encrypted_custom.yml")(
    "encrypted with custom settings",
    async () => {
      await cache.write(shardKey, "value");
      expect(await firstValue()).not.toBeNull();
      expect(await rawFirstValue()).not.toEqual(await firstValue());
      const message = JSON.parse(new TextDecoder().decode(await rawFirstValue()));
      expect(message["p"]).not.toBeNull();
      expect(message["h"]).not.toBeNull();
    },
  );

  async function rawFirstValue(): Promise<Uint8Array> {
    const raw = (
      await (
        await Entry.leaseConnection()
      ).selectAll("select * from solid_cache_entries order by id desc limit 1")
    ).first()!["value"] as string | Uint8Array;

    const connection = await ActiveRecord.Base.leaseConnection();
    if (connection.adapterName === "PostgreSQL") {
      return (
        connection as unknown as { unescapeBytea(value: string | Uint8Array): Promise<Uint8Array> }
      ).unescapeBytea(raw);
    } else {
      return Uint8Array.from(raw as Uint8Array);
    }
  }

  async function firstValue(): Promise<unknown> {
    return (await Entry.first())!.readAttribute("value");
  }
});
