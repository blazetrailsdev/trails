import { describe, expect, it } from "vitest";
import { NameError, NotImplementedError } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { QueueAdapters } from "./namespaces.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import "./test-helpers/helper.js";
import { isAdapterIs } from "./test-helpers/helper.js";

describe("QueueAdapters", () => {
  it("looks up an in-process adapter by name", () => {
    expect(QueueAdapters.lookup("inline")).toBe(InlineAdapter);
  });

  it("raises NameError for an adapter whose gem is not loaded", () => {
    expect(() => QueueAdapters.lookup("sidekiq")).toThrow(NameError);
  });

  it.skipIf(!isAdapterIs("inline"))("runs the inline lane", () => {
    expect(isAdapterIs("inline")).toBe(true);
    expect(new Base().queueAdapter).toBeInstanceOf(InlineAdapter);
  });

  it("refuses to schedule on the inline adapter", () => {
    expect(() => new InlineAdapter().enqueueAt(new Base(), 0)).toThrow(NotImplementedError);
  });
});
