import { describe, it, expect } from "vitest";
import { NullStore } from "../null-store.js";

describe("NullStoreTest", () => {
  it("cleanup", () => {
    const store = new NullStore();
    store.write("name", "value");
    store.cleanup();
    expect(store.read("name")).toBeNull();
  });

  it("write", () => {
    const store = new NullStore();
    expect(store.write("name", "value")).toEqual(true);
  });

  it("read", () => {
    const store = new NullStore();
    expect(store.read("anything")).toBeNull();
  });

  it("delete", () => {
    const store = new NullStore();
    store.write("name", "value");
    expect(store.delete("name")).toEqual(false);
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
    store.write("name", "value");
    store.deleteMatched(/name/);
    expect(store.read("name")).toBeNull();
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
