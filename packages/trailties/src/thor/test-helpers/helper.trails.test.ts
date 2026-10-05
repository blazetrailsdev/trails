import { describe, expect, it } from "vitest";
import { env, File, puts, rbArgv, rbProgname, stdout as $stdout } from "@blazetrails/ruby-compat";
import { thorRunner } from "../base.js";
import { Base } from "../shell.js";
import { Basic } from "../shell/basic.js";
import type { ThorClass } from "../thor.js";
import { Amazing } from "./fixtures/command.js";
import { Enum } from "./fixtures/enum.js";
import * as Script from "./fixtures/script.js";
import { TestSubcommands } from "./fixtures/subcommand.js";
import { capture, destinationRoot, silence, sourceRoot } from "./helper.js";

const namespaces = (...klasses: unknown[]) => klasses.map((k) => (k as ThorClass).namespace());
const commands = (klass: unknown) => Object.keys((klass as ThorClass).commands());
const start = (klass: unknown, args: string[]) => (klass as ThorClass).start(args);

describe("Thor spec helper", () => {
  it("applies helper.rb's globals", () => {
    expect(env["THOR_COLUMNS"]).toBe("10000");
    expect(rbProgname()).toBe("thor");
    expect(thorRunner).toBe(true);
    expect(rbArgv()).toEqual([]);
    expect(Base.shell).toBe(Basic);
    expect(File.isExist(File.join(sourceRoot(), "doc", "%file_name%.rb.tt"))).toBe(true);
    expect(File.basename(destinationRoot())).toBe("sandbox");
  });

  it("capture swaps the stdout seat and restores it when the block settles", async () => {
    const write = $stdout.write;
    expect(await capture(":stdout", () => puts.call($stdout, "moo"))).toBe("moo\n");
    await expect(silence(":stdout", () => Promise.reject(new Error("boom")))).rejects.toThrow();
    expect($stdout.write).toBe(write);
  });

  it("each fixture class answers its Ruby namespace", () => {
    const { Scripts } = Script;
    expect(namespaces(Script.MyScript, Script.AnotherScript, Script.MyChildScript).join(" ")).toBe(
      "my_script my_script:another_script my_child_script",
    );
    expect(namespaces(Scripts.MyScript, Scripts.MyDefaults, Scripts.ChildDefault).join(" ")).toBe(
      "scripts:my_script default default:child",
    );
    expect(namespaces(Scripts.Arities, Script.Apple, Script.Pear).join(" ")).toBe(
      "scripts:arities fruits fruits",
    );
    expect(namespaces(Enum, Amazing, TestSubcommands.Parent).join(" ")).toBe(
      "enum amazing test_subcommands:parent",
    );
  });

  it("registers commands in declaration order and runs them through start", async () => {
    expect(commands(Script.MyChildScript)).toEqual(["zoo", "animal"]);
    expect(commands(Script.MyScript)).not.toContain("neither_is_this");
    expect(commands(Script.Scripts.MyDefaults)).toEqual(["cow", "command_conflict", "barn"]);
    expect(await start(Script.MyScript, ["animal", "horse"])).toEqual(["horse"]);
    expect(await capture(":stdout", () => start(Script.Barn, ["paint", "blue"]))).toBe(
      "2 coats of blue paint\n",
    );
    const sub = ["sub", "print_opt", "--opt", "x"];
    expect(await capture(":stdout", () => start(TestSubcommands.Parent, sub))).toBe("x");
  });
});
