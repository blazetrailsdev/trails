import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { SMTP } from "../../../lib/smtp.js";

describe("TestStarttls", () => {
  it("enable tls and enable starttls", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableTls();
    let err: Error | undefined;
    expect(() => {
      try {
        smtp.enableStarttls();
      } catch (e) {
        err = e as Error;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(err!.message).toEqual("SMTPS and STARTTLS is exclusive");
  });

  it("enable tls and enable starttls auto", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableTls();
    let err: Error | undefined;
    expect(() => {
      try {
        smtp.enableStarttlsAuto();
      } catch (e) {
        err = e as Error;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(err!.message).toEqual("SMTPS and STARTTLS is exclusive");
  });

  it("enable starttls and enable starttls auto", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.enableStarttls();
    expect(() => smtp.enableStarttlsAuto()).not.toThrow();
  });

  it("disable starttls", () => {
    const smtp = new SMTP("localhost", 25);
    smtp.disableStarttls();
    expect(!smtp.isStarttls()).toBeTruthy();
  });
});
