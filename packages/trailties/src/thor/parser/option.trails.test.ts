import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError, env, setEnv, stderr } from "@blazetrails/ruby-compat";
import { HashWithIndifferentAccess } from "../core-ext/hash-with-indifferent-access.js";
import { Option } from "./option.js";

describe("Thor::Option", () => {
  const silence = env["THOR_SILENCE_DEPRECATION"];
  afterEach(() => {
    setEnv("THOR_SILENCE_DEPRECATION", silence);
    vi.restoreAllMocks();
  });

  it("dasherizes a camelCase Symbol name into its switch, and its usage suffixes with it", () => {
    const option = new Option("dryRun", { type: "boolean" });
    expect(option.switchName).toBe("--dry-run");
    expect(option.humanName).toBe("dryRun");
    expect(option.usage()).toBe("[--dry-run], [--no-dry-run], [--skip-dry-run]");
    expect(new Option("f").switchName).toBe("-f");
    expect(new Option("X").switchName).toBe("-X");
    expect(new Option("FOO_bar").switchName).toBe("--FOO-bar");
  });

  it("names the key the parsed options hash is read by, while the switch stays --skip-git", () => {
    const option = new Option("skipGit", { type: "boolean" });
    const options = new HashWithIndifferentAccess({ [option.humanName]: true }) as {
      skipGit?: boolean;
      isSkipGit?: boolean;
    };
    expect(option.switchName).toBe("--skip-git");
    expect(options.skipGit).toBe(true);
    expect(options.isSkipGit).toBe(true);
  });

  it("documents no negative switch for a camelCase no / skip name, as Thor does for :skip_git", () => {
    expect(new Option("skipGit", { type: "boolean" }).usage()).toBe("[--skip-git]");
    expect(new Option("noFoo", { type: "boolean" }).usage()).toBe("[--no-foo]");
    expect(new Option("force", { type: "boolean" }).usage()).toBe("[--force]");
    expect(new Option("skipper", { type: "boolean" }).usage()).toBe(
      "[--skipper], [--no-skipper], [--skip-skipper]",
    );
  });

  it("keeps a dasherized name as its switch and undasherizes it for the human name", () => {
    const option = new Option("--foo-bar");
    expect(option.switchName).toBe("--foo-bar");
    expect(option.humanName).toBe("foo-bar");
    expect(new Option("-f").humanName).toBe("f");
  });

  it("names itself an Option in Argument's errors", () => {
    expect(() => new Option(null)).toThrow(new ArgumentError("Option name can't be nil."));
    expect(() => new Option("foo", { type: "zzz" })).toThrow(
      new ArgumentError("Type :zzz is not valid for options."),
    );
  });

  it("is optional unless the options carry :required, and writes that into the options", () => {
    const options = {};
    expect(new Option("foo", options).required).toBe(false);
    expect(options).toEqual({ required: false });
    expect(Option.parse("foo", ":bar").required).toBe(false);
    expect(Option.parse("foo", ":string").required).toBe(null);
    expect(Option.parse("foo", ":required").required).toBe(true);
  });

  it("reads lazy_default, group, aliases, hide and repeatable", () => {
    const option = new Option("foo", { group: "runTIME", aliases: "f", lazyDefault: "x" });
    expect(option.group).toBe("Runtime");
    expect(option.aliases).toEqual(["-f"]);
    expect(option.lazyDefault).toBe("x");
    expect(option.hide).toBe(null);
    expect(option.repeatable).toBe(false);
    expect(new Option("foo").group).toBe(null);
    expect(new Option("foo", { aliases: ["-f", "g"] }).usage(10)).toBe("-f, -g,   [--foo=FOO]");
  });

  it("shows a boolean default, and otherwise what Argument shows", () => {
    expect(new Option("foo", { type: "boolean", default: false }).isShowDefault()).toBe(true);
    expect(new Option("foo", { default: "" }).isShowDefault()).toBe(false);
    expect(new Option("foo").isShowDefault()).toBe(null);
  });

  it("answers the hash and array predicates", () => {
    expect(Option.parse("foo", ":hash").isHash()).toBe(true);
    expect(Option.parse("foo", ":array").isArray()).toBe(true);
    expect(Option.parse("foo", ":array").isHash()).toBe(false);
  });

  it("warns for an inconsistent default when check_default_type is nil, and is silent when false", () => {
    setEnv("THOR_SILENCE_DEPRECATION", undefined);
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    new Option("foo", { type: "string", default: 3, checkDefaultType: false });
    expect(write).not.toHaveBeenCalled();
    new Option("foo", { type: "string", default: 3 });
    expect(write).toHaveBeenCalledWith(
      "Deprecation warning: Expected string default value for '--foo'; got 3 (numeric).\n" +
        "This will be rejected in the future unless you explicitly pass the options `check_default_type: false`" +
        " or call `allow_incompatible_default_type!` in your code\n" +
        "You can silence deprecations warning by setting the environment variable THOR_SILENCE_DEPRECATION.\n",
    );
  });

  it("silences the deprecation warning under THOR_SILENCE_DEPRECATION", () => {
    setEnv("THOR_SILENCE_DEPRECATION", "");
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    new Option("foo", { type: "string", default: 3 });
    expect(write).not.toHaveBeenCalled();
  });

  it("names the nil default type as empty when the default is of no option type", () => {
    expect(
      () => new Option("foo", { type: "string", default: new Date(0), checkDefaultType: true }),
    ).toThrow(/^Expected string default value for '--foo'; got .* \(\)$/);
  });
});
