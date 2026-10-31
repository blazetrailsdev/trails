import { describe, expect, it } from "vitest";
import { ReturnPathField } from "./return-path-field.js";

describe("Mail::ReturnPathField", () => {
  it("should allow you to specify a field", () => {
    const rp = new ReturnPathField("mikel@test.lindsaar.net");
    expect(rp.address()).toEqual("mikel@test.lindsaar.net");
  });
  it("should encode the addr_spec in <>", () => {
    const rp = new ReturnPathField("mikel@test.lindsaar.net");
    expect(rp.encoded()).toEqual("Return-Path: <mikel@test.lindsaar.net>\r\n");
  });
  it("should accept <>", () => {
    const rp = new ReturnPathField("<>");
    expect(rp.encoded()).toEqual("Return-Path: <>\r\n");
  });
});
