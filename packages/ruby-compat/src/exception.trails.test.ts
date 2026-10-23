import { describe, expect, it } from "vitest";
import { Exception, excSetupMessage } from "./exception.js";
import { StandardError, rbModConstSet } from "./index.js";

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
    rbModConstSet(Outer, "Inner", Inner);
    expect(new Inner().message).toBe("Outer::Inner");
  });
});
