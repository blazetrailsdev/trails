import { describe, it, expect } from "vitest";
import { Parameters, UnfilteredParameters } from "../../metal/strong-parameters.js";

describe("ParametersMutatorsTest", () => {
  it("delete retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    params.delete("a");
    expect(params.permitted).toBe(true);
  });

  it("delete retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.delete("a");
    expect(params.permitted).toBe(false);
  });

  it("delete returns the value when the key is present", () => {
    const params = new Parameters({ a: "1" });
    expect(params.delete("a")).toBe("1");
  });

  it("delete removes the entry when the key present", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.delete("a");
    expect(params.has("a")).toBe(false);
  });

  it("delete returns nil when the key is not present", () => {
    const params = new Parameters({ a: "1" });
    expect(params.delete("missing")).toBeUndefined();
  });

  it("delete returns the value of the given block when the key is not present", () => {
    const params = new Parameters({ a: "1" });
    expect(params.delete("missing", () => "fallback")).toBe("fallback");
  });

  it("delete yields the key to the given block when the key is not present", () => {
    const params = new Parameters({ a: "1" });
    expect(params.delete("missing", (k: string) => `key was ${k}`)).toBe("key was missing");
  });

  it("delete_if retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    params.deleteIf((k) => k === "a");
    expect(params.permitted).toBe(true);
  });

  it("delete_if retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.deleteIf((k) => k === "a");
    expect(params.permitted).toBe(false);
  });

  it("extract! retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    const extracted = params.extractBang("a");
    expect(extracted.permitted).toBe(true);
  });

  it("extract! retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const extracted = params.extractBang("a");
    expect(extracted.permitted).toBe(false);
  });

  it("keep_if retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    params.keepIf((k) => k === "a");
    expect(params.permitted).toBe(true);
  });

  it("keep_if retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.keepIf((k) => k === "a");
    expect(params.permitted).toBe(false);
  });

  it("reject! retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    params.rejectBang((k) => k === "a");
    expect(params.permitted).toBe(true);
  });

  it("reject! retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.rejectBang((k) => k === "a");
    expect(params.permitted).toBe(false);
  });

  it("select! retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    params.selectBang((k) => k === "a");
    expect(params.permitted).toBe(true);
  });

  it("select! retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.selectBang((k) => k === "a");
    expect(params.permitted).toBe(false);
  });

  it("slice! retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    params.sliceBang("a");
    expect(params.permitted).toBe(true);
  });

  it("slice! retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.sliceBang("a");
    expect(params.permitted).toBe(false);
  });

  it("transform_keys! retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    params.transformKeysBang((k) => k.toUpperCase());
    expect(params.permitted).toBe(true);
  });

  it("transform_keys! retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    params.transformKeysBang((k) => k.toUpperCase());
    expect(params.permitted).toBe(false);
  });

  it("transform_values! retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    params.transformValuesBang((v) => v);
    expect(params.permitted).toBe(true);
  });

  it("transform_values! retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    params.transformValuesBang((v) => v);
    expect(params.permitted).toBe(false);
  });

  it("deep_transform_keys! retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    params.deepTransformKeysBang((k) => k.toUpperCase());
    expect(params.permitted).toBe(true);
  });

  it("deep_transform_keys! transforms nested keys", () => {
    const inner = new Parameters({ x: "1" });
    const params = new Parameters({ a: inner });
    params.deepTransformKeysBang((k) => k.toUpperCase());
    expect(params.has("A")).toBe(true);
    const nested = params.get("A");
    expect(nested).toBeInstanceOf(Parameters);
    expect((nested as Parameters).has("X")).toBe(true);
  });

  it("deep_transform_keys transforms nested keys", () => {
    const inner = new Parameters({ x: "1" });
    const params = new Parameters({ a: inner });
    const result = params.deepTransformKeys((k) => k.toUpperCase());
    expect(result.has("A")).toBe(true);
    const nested = result.get("A");
    expect(nested).toBeInstanceOf(Parameters);
    expect((nested as Parameters).has("X")).toBe(true);
  });

  it("deep_transform_keys! retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    params.deepTransformKeysBang((k) => k.toUpperCase());
    expect(params.permitted).toBe(false);
  });

  it("compact retains permitted status", () => {
    const params = new Parameters({ a: "1", b: null }).permitAll();
    expect(params.compact().permitted).toBe(true);
  });

  it("compact retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: null });
    expect(params.compact().permitted).toBe(false);
  });

  it("compact! returns nil when no values are nil", () => {
    const params = new Parameters({ a: "1" });
    expect(params.compactBang()).toBeNull();
  });

  it("compact! retains permitted status", () => {
    const params = new Parameters({ a: "1", b: null }).permitAll();
    params.compactBang();
    expect(params.permitted).toBe(true);
  });

  it("compact! retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: null });
    params.compactBang();
    expect(params.permitted).toBe(false);
  });

  it("compact_blank retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "" }).permitAll();
    expect(params.compactBlank().permitted).toBe(true);
  });

  it("compact_blank retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "" });
    expect(params.compactBlank().permitted).toBe(false);
  });

  it("compact_blank! retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "" }).permitAll();
    params.compactBlankBang();
    expect(params.permitted).toBe(true);
  });

  it("compact_blank! retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "" });
    params.compactBlankBang();
    expect(params.permitted).toBe(false);
  });

  it("to_h returns a ActiveSupport::HashWithIndifferentAccess", () => {
    const params = new Parameters({ name: "John" }).permitAll();
    const hash = params.toH();
    expect(typeof hash).toBe("object");
    expect(hash.name).toBe("John");
  });

  it("to_h receives a block and transforms keys", () => {
    const params = new Parameters({ name: "John" }).permitAll();
    const hash = params.toH((k, v) => [k.toUpperCase(), v]);
    expect(hash.NAME).toBe("John");
  });

  it("to_h receives a block and transforms values", () => {
    const params = new Parameters({ count: "5" }).permitAll();
    const hash = params.toH((k, v) => [k, Number(v) * 2]);
    expect(hash.count).toBe(10);
  });

  it("to_h does not include unpermitted params", () => {
    const params = new Parameters({ name: "John" });
    expect(() => params.toH()).toThrow(UnfilteredParameters);
  });
});
