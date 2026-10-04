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

  it("does not make a re-raised exception its own cause", () => {
    const mesg = new Error("same");
    excSetupMessage(mesg, mesg);
    expect(mesg.cause).toBeUndefined();
  });
});
