import { describe, it, expect } from "vitest";
import { NullStore } from "../null-store.js";
import { assertNil } from "../../testing/assertions.js";

describe("NullStoreTest", () => {
  it("cleanup", async () => {
    const store = new NullStore();
    await store.write("name", "value");
    await store.cleanup();
    assertNil(await store.read("name"));
  });

  it("write", async () => {
    const store = new NullStore();
    expect(await store.write("name", "value")).toEqual(true);
  });

  it("read", async () => {
    const store = new NullStore();
    assertNil(await store.read("anything"));
  });

  it("delete", async () => {
    const store = new NullStore();
    await store.write("name", "value");
    expect(await store.delete("name")).toEqual(false);
  });

  it("increment", async () => {
    const store = new NullStore();
    assertNil(await store.increment("counter"));
  });

  it("increment with options", async () => {
    const store = new NullStore();
    assertNil(await store.increment("counter", 5));
  });

  it("decrement", async () => {
    const store = new NullStore();
    assertNil(await store.decrement("counter"));
  });

  it("decrement with options", async () => {
    const store = new NullStore();
    assertNil(await store.decrement("counter", 5));
  });

  it("delete matched", async () => {
    const store = new NullStore();
    await store.write("name", "value");
    await store.deleteMatched(/name/);
    assertNil(await store.read("name"));
  });

  it.skip("local store strategy", () => {
    // BLOCKED: port-cache-strategy-local-cache
  });

  it.skip("local store repeated reads", () => {
    // BLOCKED: port-cache-strategy-local-cache
  });

  it("clear", async () => {
    const store = new NullStore();
    await store.write("name", "value");
    await store.clear();
    assertNil(await store.read("name"));
  });
});
