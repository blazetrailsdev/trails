import { describe, expect, it } from "vitest";
import { Formatter, setFormatter } from "@blazetrails/did-you-mean";
import {
  AmbiguousCommandError,
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
    setFormatter({ messageFor: (corrections) => ` (${corrections.join(", ")}?)` });
    try {
      expect(new UndefinedCommandError("instal", ["install"], null).message).toBe(
        'Could not find command "instal". ("install"?)',
      );
    } finally {
      setFormatter(null);
    }
    expect(Formatter.messageFor([])).toBe("");
  });

  it("keeps an empty message for an error built without one", () => {
    expect(new ThorError().message).toBe("");
    expect(new ThorError("boom").message).toBe("boom");
  });

  it("aliases the task errors to the command errors", () => {
    expect(UndefinedTaskError).toBe(UndefinedCommandError);
    expect(AmbiguousTaskError).toBe(AmbiguousCommandError);
  });
});
