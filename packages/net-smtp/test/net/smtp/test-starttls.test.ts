import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { SMTP } from "../../../lib/smtp.js";

describe("TestStarttls", () => {
  it("enable tls and enable starttls", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableTls();
    expect(() => smtp.enableStarttls()).toThrow(ArgumentError);
  });

  it("enable tls and enable starttls auto", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableTls();
    expect(() => smtp.enableStarttlsAuto()).toThrow(ArgumentError);
  });

  it("enable starttls and enable starttls auto", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableStarttls();
    expect(smtp.isStarttlsAlways()).toBe(true);
    smtp.enableStarttlsAuto();
    expect(smtp.isStarttlsAuto()).toBe(true);
  });

  it("disable starttls", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.disableStarttls();
    expect(smtp.isStarttls()).toBe(false);
  });
});
