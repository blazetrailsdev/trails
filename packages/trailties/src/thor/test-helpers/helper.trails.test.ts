import { describe, expect, it } from "vitest";
import {
  env,
  File,
  puts,
  rbArgv,
  rbGvGet,
  rbProgname,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import { Base } from "../shell.js";
import { Basic } from "../shell/basic.js";
import type { ThorClass } from "../thor.js";
import { Amazing } from "./fixtures/command.js";
import { Enum } from "./fixtures/enum.js";
import * as Script from "./fixtures/script.js";
import { capture, destinationRoot, silence, sourceRoot } from "./helper.js";

const ns = (...klasses: unknown[]) => klasses.map((k) => (k as ThorClass).namespace()).join(" ");

describe("Thor spec helper", () => {
  it("applies helper.rb's globals", () => {
    expect(env["THOR_COLUMNS"]).toBe("10000");
    expect([rbProgname(), rbGvGet("$thor_runner"), rbArgv()]).toEqual(["thor", true, []]);
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
    const { Scripts: S, ...T } = Script;
    const top = ns(T.MyScript, T.AnotherScript, T.MyChildScript, T.Apple, T.Pear, Enum, Amazing);
    expect(top).toBe(
      "my_script my_script:another_script my_child_script fruits fruits enum amazing",
    );
    const nested = ns(S.MyScript, S.MyDefaults, S.ChildDefault, S.Arities);
    expect(nested).toBe("scripts:my_script default default:child scripts:arities");
  });

  it("runs a fixture command through start", async () => {
    const barn = Script.Barn as unknown as ThorClass;
    expect(await capture(":stdout", () => barn.start(["paint"]))).toBe("2 coats of red paint\n");
  });
});
