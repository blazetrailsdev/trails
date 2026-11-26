import { describe, expect, it } from "vitest";
import { Exception, excSetupMessage } from "../lib/exception.js";
import { StandardError, constSet } from "../lib/index.js";

describe("excSetupMessage", () => {
  it("gives a raised exception the rescued one as its cause", () => {
    const errinfo = new Error("driver");
    const mesg = new Error("translated");
    expect(excSetupMessage(mesg, errinfo)).toBe(mesg);
    expect(mesg.cause).toBe(errinfo);
  });

  it("keeps a cause the exception already carries", () => {
    const cause = new Error("first");
    const mesg = new Error("translated", { cause });
    excSetupMessage(mesg, new Error("driver"));
    expect(mesg.cause).toBe(cause);
  });

  it("reads an own `cause: undefined` as a defined cause", () => {
    const mesg = Object.assign(new Error("translated"), { cause: undefined });
    excSetupMessage(mesg, new Error("driver"));
    expect(mesg.cause).toBeUndefined();
  });

  it("settles the rescued exception's unset cause as nil", () => {
    const errinfo = new Error("driver");
    excSetupMessage(new Error("translated"), errinfo);
    expect(errinfo.cause).toBeNull();
    excSetupMessage(errinfo, new Error("later"));
    expect(errinfo.cause).toBeNull();
  });

  it("does not make a re-raised exception its own cause", () => {
    const mesg = new Error("same");
    excSetupMessage(mesg, mesg);
    expect(mesg.cause).toBeUndefined();
  });
});

describe("Exception#message", () => {
  it("answers the class name for an exception raised with no message", () => {
    class DefaultsError extends StandardError {}
    expect(new DefaultsError().message).toBe("DefaultsError");
    expect(new DefaultsError().toS()).toBe("DefaultsError");
    expect(new DefaultsError("given").message).toBe("given");
    expect(new Exception().message).toBe("Exception");
    class Outer {}
    class Inner extends StandardError {}
    constSet(Outer, "Inner", Inner);
    expect(new Inner().message).toBe("Outer::Inner");
  });
});

describe("Exception#name", () => {
  it("answers the receiver's own class, not a name seated on an ancestor", () => {
    class SeatedError extends StandardError {}
    SeatedError.prototype.name = "Seated::Error";
    class ChildError extends SeatedError {}
    expect(new SeatedError().name).toBe("Seated::Error");
    expect(new ChildError().name).toBe("ChildError");
  });

  it("names a bodiless subclass by its own path", () => {
    class Outer {}
    class Bodiless extends StandardError {}
    constSet(Outer, "Bodiless", Bodiless);
    expect(new Bodiless("x").name).toBe("Outer::Bodiless");
    expect(new StandardError().name).toBe("StandardError");
  });
});

describe("Exception#message", () => {
  it("dispatches to a to_s override, as exc_message does", () => {
    class Suffixed extends StandardError {
      override toString(): string {
        return `${super.toString()}!`;
      }
    }
    const error = new Suffixed("boom");
    expect([error.message, error.toS(), String(error)]).toEqual(["boom!", "boom!", "boom!"]);
    expect(new Suffixed().message).toBe("Suffixed!");
  });
});

describe("SignalException.new", () => {
  it("names a signal number as esignal_init does", async () => {
    const { SignalException, ArgumentError } = await import("../lib/index.js");
    const term = new SignalException(15);
    expect([term.message, term.signo()]).toEqual(["SIGTERM", 15]);
    expect(new SignalException(15, "X").message).toBe("X");
    expect(new SignalException(64).message).toBe("SIG64");
    expect(() => new SignalException(99)).toThrow(ArgumentError);
    expect(new SignalException("SIGINT").message).toBe("SIGINT");
  });
});
