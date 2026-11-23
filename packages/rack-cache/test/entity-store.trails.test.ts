import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Digest, StringIO, URI } from "@blazetrails/ruby-compat";
import type { Client } from "memjs";
import { EntityStore, type Dalli, type Disk } from "../lib/entity-store.js";
import { MetaStore, type Dalli as MetaDalli } from "../lib/meta-store.js";
import {
  MEMCACHED,
  createTempDirectory,
  dalli,
  haveDalli,
  removeEntrySecure,
} from "./support/test-helper.js";

describe("Rack::Cache::EntityStore::Disk", () => {
  let tempDir: string;
  let store: Disk;
  beforeEach(async () => {
    tempDir = await createTempDirectory();
    store = await EntityStore.Disk.new(tempDir);
  });
  afterEach(async () => {
    await removeEntrySecure(tempDir);
  });

  it("writes a body opened from a Disk store", async () => {
    const data = "x".repeat(20000);
    const [key] = await store.write([data]);
    const other = await EntityStore.Disk.new(`${tempDir}/other`);
    const [copied, size] = await other.write((await store.open(key))!);
    expect(copied).toBe(key);
    expect(size).toBe(20000);
    expect(new TextDecoder().decode((await other.read(copied)) as Uint8Array)).toBe(data);
  });

  it("writes a body that answers each", async () => {
    const [key, size] = await store.write(new StringIO("line one\nline two\n"));
    expect(size).toBe(18);
    expect(new TextDecoder().decode((await store.read(key)) as Uint8Array)).toBe(
      "line one\nline two\n",
    );
  });
});

const HAVE_DALLI = await haveDalli();

describe.runIf(HAVE_DALLI)("Rack::Cache::Dalli namespace", () => {
  beforeEach(async () => {
    await (dalli as Client).flush();
  });

  it("prefixes entity store keys with the URI namespace", async () => {
    const store = (await EntityStore.Dalli.resolve(
      URI.parse(`memcached://${MEMCACHED}/obj_ns1`),
    )) as Dalli;
    const [key] = (await store.write(["Hello"]))!;
    expect((await (dalli as Client).get(`obj_ns1:${key}`)).value).not.toBeNull();
    expect((await (dalli as Client).get(key)).value).toBeNull();
  });

  it("prefixes meta store keys with the URI namespace", async () => {
    const store = (await MetaStore.Dalli.resolve(
      URI.parse(`memcached://${MEMCACHED}/meta_ns1`),
    )) as MetaDalli;
    await store.write("/key", []);
    const digest = Digest.SHA1.hexdigest("/key");
    expect((await (dalli as Client).get(`meta_ns1:${digest}`)).value).not.toBeNull();
    expect((await (dalli as Client).get(digest)).value).toBeNull();
  });
});
