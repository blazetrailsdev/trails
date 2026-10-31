import { describe, expect, it } from "vitest";
import { formatter, Formatter, setFormatter } from "@blazetrails/did-you-mean";
import {
  AmbiguousCommandError,
  AtLeastOneRequiredArgumentError,
  ExclusiveArgumentError,
  InvocationError,
  MalformattedArgumentError,
  RequiredArgumentMissingError,
  Error as ThorError,
  AmbiguousTaskError,
  UndefinedCommandError,
  UndefinedTaskError,
  UnknownArgumentError,
} from "./error.js";

describe("Thor::Error", () => {
  it("appends the corrections to an undefined command's message", () => {
    const error = new UndefinedCommandError("instal", ["install", "list"], "app");
    expect(error.corrections()).toEqual(['"install"']);
    expect(error.message).toBe(
      'Could not find command "instal" in "app" namespace.\nDid you mean?  "install"',
    );
    expect(new UndefinedCommandError("zzz", ["install"], null).message).toBe(
      'Could not find command "zzz".',
    );
  });

  it("appends the corrections to an unknown switch's message", () => {
    const error = new UnknownArgumentError(["--force", "--quiet"], ["--forc", "--quie"]);
    expect(error.message).toBe(
      'Unknown switches "--forc", "--quie"\nDid you mean?  "--force"\n               "--quiet"',
    );
  });

  it("formats the corrections with the formatter DidYouMean currently holds", () => {
    const parens = { messageFor: (corrections: string[]) => ` (${corrections.join(", ")}?)` };
    expect(setFormatter(parens)).toBe(parens);
    expect(formatter()).toBe(parens);
    try {
      expect(new UndefinedCommandError("instal", ["install"], null).message).toBe(
        'Could not find command "instal". ("install"?)',
      );
    } finally {
      setFormatter(null);
    }
    expect(formatter()).toBe(Formatter);
  });

  it("answers the message it was built with through to_s", () => {
    expect(new ThorError("boom").message).toBe("boom");
    expect(typeof new ThorError().message).toBe("string");
  });

  it("aliases the task errors to the command errors", () => {
    expect(UndefinedTaskError).toBe(UndefinedCommandError);
    expect(AmbiguousTaskError).toBe(AmbiguousCommandError);
  });

  it("answers its Ruby class name", () => {
    expect(new ThorError("x").name).toBe("Thor::Error");
    expect(new ThorError().message).toBe("Thor::Error");
    expect(new UndefinedCommandError("x", [], null).name).toBe("Thor::UndefinedCommandError");
    expect(new AmbiguousCommandError("x").name).toBe("Thor::AmbiguousCommandError");
    expect(new InvocationError("x").name).toBe("Thor::InvocationError");
    expect(new UnknownArgumentError([], ["x"]).name).toBe("Thor::UnknownArgumentError");
    expect(new RequiredArgumentMissingError("x").name).toBe("Thor::RequiredArgumentMissingError");
    expect(new MalformattedArgumentError("x").name).toBe("Thor::MalformattedArgumentError");
    expect(new ExclusiveArgumentError("x").name).toBe("Thor::ExclusiveArgumentError");
    expect(new AtLeastOneRequiredArgumentError("x").name).toBe(
      "Thor::AtLeastOneRequiredArgumentError",
    );
  });
});
