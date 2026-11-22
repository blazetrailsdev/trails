import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StringIO } from "@blazetrails/ruby-compat";
import { EntityStore, type Disk } from "../lib/entity-store.js";
import { createTempDirectory, removeEntrySecure } from "./support/test-helper.js";

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
