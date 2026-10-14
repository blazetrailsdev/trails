import { describe, expect, it } from "vitest";
import { excSetupMessage } from "./exception.js";

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
