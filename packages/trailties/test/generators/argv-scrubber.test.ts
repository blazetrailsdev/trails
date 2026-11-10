import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMatch } from "@blazetrails/activesupport/testing/assertions";
import { capture } from "@blazetrails/activesupport/testing/stream";
import {
  Dir,
  File,
  FileUtils,
  SystemExit,
  getProcessAdapter,
  include,
} from "@blazetrails/ruby-compat";
import { ARGVScrubber } from "../../lib/generators/trails/app/app-generator.js";
import { VERSION } from "../../lib/gem-version.js";
import { EnvHelpers } from "../support/env-helpers.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface ARGVScrubberTest extends EnvHelpers {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ARGVScrubberTest {}
include(ARGVScrubberTest, EnvHelpers);

async function tempfile(...lines: string[]): Promise<string> {
  const path = File.join(Dir.mktmpdir("myrcfile"), "myrcfile");
  await File.writeAsync(path, lines.map((line) => `${line}\n`).join(""));
  return path;
}

describe("ARGVScrubberTest", () => {
  afterEach(() => vi.restoreAllMocks());

  it("version", async () => {
    vi.spyOn(getProcessAdapter(), "exit").mockImplementation((code) => {
      throw new SystemExit(code ?? 0);
    });
    for (const str of ["-v", "--version"]) {
      const scrubber = new ARGVScrubber([str]);
      let exitCode: number | null = null;
      const output = await capture(":stdout", async () => {
        try {
          await scrubber.prepareBang();
        } catch (e) {
          if (!(e instanceof SystemExit)) throw e;
          exitCode = e.status;
        }
      });
      expect(output.trimEnd()).toBe(`Trails ${VERSION.STRING}`);
      expect(exitCode).toBe(0);
    }
  });

  it("default help", async () => {
    const argv = ["zomg", "how", "are", "you"];
    const scrubber = new ARGVScrubber(argv);
    const args = await scrubber.prepareBang();
    expect(args).toEqual(["--help", ...argv.slice(1)]);
  });

  it("prepare returns args", async () => {
    const scrubber = new ARGVScrubber(["hi mom"]);
    const args = await scrubber.prepareBang();
    expect(args[0]).toBe("--help");
  });

  it("no mutations", async () => {
    const scrubber = new ARGVScrubber(Object.freeze(["hi mom"]) as string[]);
    const args = await scrubber.prepareBang();
    expect(args[0]).toBe("--help");
  });

  it("new command no rc", async () => {
    const scrubber = new (class extends ARGVScrubber {
      static override async defaultRcFile(): Promise<string> {
        return File.join(Dir.tmpdir(), "whatever");
      }
    })(["new"]);
    const args = await scrubber.prepareBang();
    expect(args).toEqual([]);
  });

  it("default rc file with xdg config home", async () => {
    const dir = Dir.mktmpdir();
    const rcFile = File.join(dir, "trails/railsrc");
    FileUtils.mkdirP(File.dirname(rcFile));
    FileUtils.touch(rcFile);
    await new ARGVScrubberTest().switchEnv("XDG_CONFIG_HOME", dir, async () => {
      expect(await ARGVScrubber.defaultRcFile()).toBe(rcFile);
    });
    FileUtils.rmRf(dir);
  });

  it("new homedir rc", async () => {
    const file = await tempfile("--hello-world");
    const scrubber = new (class extends ARGVScrubber {
      static override async defaultRcFile(): Promise<string> {
        return file;
      }
    })(["new"]);
    let args: string[] = [];
    const message = await capture(":stdout", async () => {
      args = await scrubber.prepareBang();
    });
    expect(args).toEqual(["--hello-world"]);
    assertMatch("hello-world", message);
    assertMatch(file, message);
  });

  it("rc whitespace separated", async () => {
    const file = await tempfile("--hello --world");
    const scrubber = new ARGVScrubber(["new", `--rc=${file}`]);
    let args: string[] = [];
    await capture(":stdout", async () => {
      args = await scrubber.prepareBang();
    });
    expect(args).toEqual(["--hello", "--world"]);
  });

  it("rc lines with comments", async () => {
    const file = await tempfile("--hello # --world", "--love", "# --hate");
    const scrubber = new ARGVScrubber(["new", `--rc=${file}`]);
    let args: string[] = [];
    await capture(":stdout", async () => {
      args = await scrubber.prepareBang();
    });
    expect(args).toEqual(["--hello", "--love"]);
  });

  it("new rc option", async () => {
    const file = await tempfile("--hello-world");
    const scrubber = new ARGVScrubber(["new", `--rc=${file}`]);
    let args: string[] = [];
    const message = await capture(":stdout", async () => {
      args = await scrubber.prepareBang();
    });
    expect(args).toEqual(["--hello-world"]);
    assertMatch("hello-world", message);
    assertMatch(file, message);
  });

  it("new rc option and custom options", async () => {
    const file = await tempfile("--hello", "--world");
    const scrubber = new ARGVScrubber(["new", "tenderapp", "--love", `--rc=${file}`]);
    let args: string[] = [];
    await capture(":stdout", async () => {
      args = await scrubber.prepareBang();
    });
    expect(args).toEqual(["tenderapp", "--hello", "--world", "--love"]);
  });

  it("no rc", async () => {
    const scrubber = new ARGVScrubber(["new", "--no-rc"]);
    const args = await scrubber.prepareBang();
    expect(args).toEqual([]);
  });
});
