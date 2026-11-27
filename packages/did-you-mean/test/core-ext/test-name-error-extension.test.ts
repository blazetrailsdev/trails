import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NameError, hashAref } from "@blazetrails/ruby-compat";
import { correctError, spellCheckers } from "../../lib/did-you-mean.js";

describe("NameErrorExtensionTest", () => {
  class TestSpellChecker {
    constructor(..._args: unknown[]) {}
    get corrections(): string[] {
      return ["does_exist"];
    }
  }

  let originalSpellChecker: unknown;
  let error: NameError;

  beforeEach(() => {
    originalSpellChecker = hashAref(spellCheckers(), "NameError");
    correctError(NameError, TestSpellChecker);

    error = new NameError("undefined local variable or method 'doesnt_exist' for main");
  });

  afterEach(() => {
    correctError(NameError, originalSpellChecker);
  });

  function getMessage(err: NameError): string {
    if ("detailedMessage" in err) {
      return err.detailedMessage({ highlight: false });
    } else {
      return String(err);
    }
  }

  it("message", () => {
    expect(error.detailedMessage()).toMatch(/Did you mean\? {2}does_exist/);
  });

  it("to s does not make disruptive changes to error message", () => {
    let error!: NameError;
    expect(() => {
      try {
        throw new NameError("uninitialized constant Object");
      } catch (e) {
        error = e as NameError;
        throw e;
      }
    }).toThrow(NameError);

    getMessage(error);
    expect(getMessage(error).match(/Did you mean\?/g)!.length).toBe(1);
  });
});
