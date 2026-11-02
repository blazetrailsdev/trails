import { describe, expect, it } from "vitest";
import { Mail } from "../mail.js";
import type { Message } from "../message.js";
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
  it("should set the return path", () => {
    const mail = Mail.new(function (this: Message) {
      this.to("to@someemail.com");
      this.from("from@someemail.com");
      this.subject("Can't set the return-path");
      this.returnPath("bounce@someemail.com");
      this.messageId("<1234@someemail.com>");
      this.body("body");
    });
    expect(mail.returnPath()).toEqual("bounce@someemail.com");
  });
  it("should set the return path", () => {
    const mail = Mail.new(function (this: Message) {
      this.to("to@someemail.com");
      this.from("from@someemail.com");
      this.subject("Can't set the return-path");
      this.returnPath("bounce@someemail.com");
      this.messageId("<1234@someemail.com>");
      this.body("body");
    });
    const encodedMail = Mail.new(mail.encoded());
    expect(encodedMail.returnPath()).toEqual("bounce@someemail.com");
  });
  it("should wrap the return path addr_spec in <>", () => {
    const mail = Mail.new(function (this: Message) {
      this.to("to@someemail.com");
      this.from("from@someemail.com");
      this.subject("Can't set the return-path");
      this.returnPath("bounce@someemail.com");
      this.messageId("<1234@someemail.com>");
      this.body("body");
    });
    expect(mail.encoded()).toMatch(/<bounce@someemail\.com>/);
  });
});
