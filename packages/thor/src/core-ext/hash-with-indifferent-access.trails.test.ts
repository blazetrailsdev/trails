import { describe, expect, it } from "vitest";
import { FrozenError, Hash, dup } from "@blazetrails/ruby-compat";
import { HashWithIndifferentAccess, type ThorOptions } from "./hash-with-indifferent-access.js";

describe("Thor::CoreExt::HashWithIndifferentAccess (trails)", () => {
  function options<T extends object>(hash: T): ThorOptions<T> {
    return new HashWithIndifferentAccess(hash as Record<string, unknown>) as ThorOptions<T>;
  }

  it("answers a predicate with Ruby truthiness, so only nil and false are false", () => {
    const hash = options({ skipGit: "", force: 0, quiet: false, pretend: null });

    expect(hash.isSkipGit).toBe(true);
    expect(hash.isForce).toBe(true);
    expect(hash.isQuiet).toBe(false);
    expect(hash.isPretend).toBe(false);
  });

  it("reads a camelCase option by name and finds a defined method before a key", () => {
    const hash = options({ skipGit: true, size: 3 });

    expect(hash.skipGit).toBe(true);
    expect(hash.size).toBe(2);
    expect((hash as { missing?: unknown }).missing).toBeUndefined();
  });

  it("stays a Hash behind the method_missing link", () => {
    const hash = options({ skipGit: true });

    expect(hash).toBeInstanceOf(Hash);
    expect(dup(hash)).toBeInstanceOf(HashWithIndifferentAccess);
    expect([...hash.keys()]).toEqual(["skipGit"]);
  });

  it("stores an assignment through []=, which raises FrozenError once the hash is frozen", () => {
    const hash = options<{ skipGit: boolean; force?: boolean; quiet?: boolean }>({ skipGit: true });
    (hash as { quiet?: boolean }).quiet = true;
    expect([hash.get("quiet"), Object.keys(hash)]).toEqual([true, []]);

    hash.freeze();
    expect(() => hash.set("force", true)).toThrow(FrozenError);
    expect(() => {
      (hash as { force?: boolean }).force = true;
    }).toThrow(FrozenError);
    expect(hash.hasKey("force")).toBe(false);
  });
});
