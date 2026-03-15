import { describe, it, expect } from "vitest";
import { NullStore } from "../stores.js";

describe("NullStoreTest", () => {
  it("cleanup", () => {
    const store = new NullStore();
    // cleanup is a no-op for NullStore; just verify no errors
    expect(() => store.clear()).not.toThrow();
  });

  it("write", () => {
    const store = new NullStore();
    store.write("key", "value");
    // NullStore doesn't persist
    expect(store.read("key")).toBeNull();
  });

  it("read", () => {
    const store = new NullStore();
    expect(store.read("anything")).toBeNull();
  });

  it("delete", () => {
    const store = new NullStore();
    store.write("key", "value");
    store.delete("key");
    expect(store.read("key")).toBeNull();
  });

  it("increment", () => {
    const store = new NullStore();
    // NullStore increment always returns null/0
    expect(store.increment("counter")).toBeNull();
  });

  it("increment with options", () => {
    const store = new NullStore();
    expect(store.increment("counter", 5)).toBeNull();
  });

  it("decrement", () => {
    const store = new NullStore();
    expect(store.decrement("counter")).toBeNull();
  });

  it("decrement with options", () => {
    const store = new NullStore();
    expect(store.decrement("counter", 5)).toBeNull();
  });

  it("delete matched", () => {
    const store = new NullStore();
    // deleteMatched is a no-op for NullStore
    expect(() => store.deleteMatched(/key/)).not.toThrow();
  });

  it("local store strategy", () => {
    const store = new NullStore();
    expect(store.read("x")).toBeNull();
  });

  it("local store repeated reads", () => {
    const store = new NullStore();
    expect(store.read("x")).toBeNull();
    expect(store.read("x")).toBeNull();
  });

  it("clear", () => {
    const store = new NullStore();
    store.write("name", "value");
    store.clear();
    expect(store.read("name")).toBeNull();
  });
});
