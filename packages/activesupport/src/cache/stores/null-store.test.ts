import { describe, it, expect } from "vitest";
import { NullStore } from "../null-store.js";
import { assertNil } from "../../testing/assertions.js";

describe("NullStoreTest", () => {
  it("cleanup", () => {
    const store = new NullStore();
    store.write("name", "value");
    store.cleanup();
    assertNil(store.read("name"));
  });

  it("write", () => {
    const store = new NullStore();
    expect(store.write("name", "value")).toEqual(true);
  });

  it("read", () => {
    const store = new NullStore();
    assertNil(store.read("anything"));
  });

  it("delete", () => {
    const store = new NullStore();
    store.write("name", "value");
    expect(store.delete("name")).toEqual(false);
  });

  it("increment", () => {
    const store = new NullStore();
    assertNil(store.increment("counter"));
  });

  it("increment with options", () => {
    const store = new NullStore();
    assertNil(store.increment("counter", 5));
  });

  it("decrement", () => {
    const store = new NullStore();
    assertNil(store.decrement("counter"));
  });

  it("decrement with options", () => {
    const store = new NullStore();
    assertNil(store.decrement("counter", 5));
  });

  it("delete matched", () => {
    const store = new NullStore();
    store.write("name", "value");
    store.deleteMatched(/name/);
    assertNil(store.read("name"));
  });

  it.skip("local store strategy", () => {
    // BLOCKED: port-cache-strategy-local-cache
  });

  it.skip("local store repeated reads", () => {
    // BLOCKED: port-cache-strategy-local-cache
  });

  it("clear", () => {
    const store = new NullStore();
    store.write("name", "value");
    store.clear();
    assertNil(store.read("name"));
  });
});
