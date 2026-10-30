import { describe, expect, it } from "vitest";
import {
  Response,
  SMTPAuthenticationError,
  SMTPFatalError,
  SMTPServerBusy,
  SMTPSyntaxError,
  SMTPUnknownError,
} from "./smtp.js";

describe("TestResponse", () => {
  const multi = "250-ubuntu-desktop\n250-SIZE 1 2 3\n250 DSN\n";

  it("capabilities", () => {
    const res = Response.parse(
      "250-ubuntu-desktop\n250-PIPELINING\n250-SIZE 10240000\n250-VRFY\n250-ETRN\n250-STARTTLS\n250-ENHANCEDSTATUSCODES\n250 DSN\n",
    );
    const capabilities = res.capabilities;
    for (const str of ["PIPELINING", "SIZE", "VRFY", "STARTTLS", "ENHANCEDSTATUSCODES", "DSN"]) {
      expect(capabilities).toHaveProperty(str);
    }
  });

  it("capabilities default", () => {
    const res = Response.parse("250-ubuntu-desktop\n250-PIPELINING\n250 DSN\n");
    expect(res.capabilities["PIPELINING"]).toEqual([]);
  });

  it("capabilities value", () => {
    const res = Response.parse("250-ubuntu-desktop\n250-SIZE 1234\n250 DSN\n");
    expect(res.capabilities["SIZE"]).toEqual(["1234"]);
  });

  it("capabilities multi", () => {
    expect(Response.parse(multi).capabilities["SIZE"]).toEqual(["1", "2", "3"]);
  });

  it("bad string", () => {
    expect(Response.parse("badstring").capabilities).toEqual({});
  });

  it("success?", () => {
    const res = Response.parse(multi);
    expect(res.isSuccess()).toBe(true);
    expect(res.isContinue()).toBe(false);
  });

  it("continue?", () => {
    const res = Response.parse("3yz-ubuntu-desktop\n250-SIZE 1 2 3\n250 DSN\n");
    expect(res.isSuccess()).toBe(false);
    expect(res.isContinue()).toBe(true);
  });

  it("status type char", () => {
    expect(Response.parse("3yz-ubuntu-desktop\n").statusTypeChar()).toBe("3");
    expect(Response.parse(multi).statusTypeChar()).toBe("2");
  });

  it("message", () => {
    expect(Response.parse(multi).message).toBe("250-ubuntu-desktop\n");
  });

  it("server busy exception", () => {
    expect(Response.parse("400 omg busy").exceptionClass).toBe(SMTPServerBusy);
    expect(Response.parse("410 omg busy").exceptionClass).toBe(SMTPServerBusy);
  });

  it("syntax error exception", () => {
    expect(Response.parse("500 omg syntax error").exceptionClass).toBe(SMTPSyntaxError);
    expect(Response.parse("501 omg syntax error").exceptionClass).toBe(SMTPSyntaxError);
  });

  it("authentication exception", () => {
    expect(Response.parse("530 omg auth error").exceptionClass).toBe(SMTPAuthenticationError);
    expect(Response.parse("531 omg auth error").exceptionClass).toBe(SMTPAuthenticationError);
  });

  it("fatal error", () => {
    expect(Response.parse("510 omg fatal error").exceptionClass).toBe(SMTPFatalError);
    expect(Response.parse("511 omg fatal error").exceptionClass).toBe(SMTPFatalError);
  });

  it("default exception", () => {
    expect(Response.parse("250 omg fatal error").exceptionClass).toBe(SMTPUnknownError);
  });
});
