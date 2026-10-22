import type {} from "@blazetrails/vitest-matchers";
import { Logger } from "@blazetrails/activesupport";
import {
  rbCheckArrayType,
  StringIO,
  setEnv,
  Dir,
  aryDelete,
  hashDelete,
} from "@blazetrails/ruby-compat";
import { Error, TimeoutError } from "./mini-magick.js";
import { MiniMagick } from "./namespaces.js";
import { Shell } from "./shell.js";
import "./test-helpers/spec-helper.js";
import { imagePath } from "./test-helpers/support/helpers.js";
import { beforeEach, vi, expect, it, describe, afterEach } from "vitest";

describe("MiniMagick::Shell", () => {
  let subject: unknown;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    subject = new Shell();
  });

  describe("#run", () => {
    it("calls #execute with the command", async () => {
      const spy = vi.spyOn(subject, "execute");
      await subject.run(["identify", `${imagePath() ?? ""}`]);
      expect(spy).toHaveBeenCalled();
    });

    it("returns stdout, stderr and status", async () => {
      vi.spyOn(subject, "execute").mockReturnValue(["stdout", "stderr", 0]);
      const output = await subject.run(["foo"], { warnings: false });
      expect(output).toEqual(["stdout", "stderr", 0]);
    });

    it("uses stderr and status for error messages", async () => {
      vi.spyOn(subject, "execute").mockReturnValue(["", "stderr", 1]);
      const expectedMsg = "`foo` failed with status: 1 and error:\nstderr";
      await expect((async () => await subject.run(["foo"]))()).rejects.toSatisfy(
        (e: Error) => e instanceof Error && e.message === expectedMsg,
      );
    });

    it("raises an error when executable wasn't found", async () => {
      vi.spyOn(subject, "execute").mockReturnValue(["", "not found", 127]);
      await expect((async () => await subject.run(["foo"]))()).rejects.toSatisfy(
        (e: Error) => e instanceof Error && /not found/.test(e.message),
      );
    });

    it("raises errors only in error mode", async () => {
      vi.spyOn(subject, "execute").mockReturnValue(["stdout", "", 127]);
      await (async () => await subject.run(["foo"], { errors: false }))();
    });

    it("prints to stderr output to $stderr in non-error mode", async () => {
      vi.spyOn(subject, "execute").mockReturnValue(["", "stderr", 1]);
      await expect(async () => await subject.run(["foo"], { errors: false })).toOutput(
        "stderr",
        "stderr",
      );
    });

    it("terminate long running commands if timeout is set", async () => {
      await expect(
        (async () =>
          await subject.run(
            ["convert", `${imagePath() ?? ""}`, "-resize", "10000x10000", "-blur", "0x20", "null:"],
            { timeout: 1 },
          ))(),
      ).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe("#execute", () => {
    it("executes the command in the shell", async () => {
      let [stdout, stderr, status] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(["identify", `${imagePath("gif") ?? ""}`]),
      );
      expect(stdout).toMatch("GIF");
      expect(stderr).toEqual("");
      expect(status).toEqual(0);
      [stdout, stderr, status] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(["identify", "foo"]),
      );
      expect(stdout).toEqual("");
      expect(stderr).toMatch("unable to open image");
      expect(status).toEqual(1);
    });

    it("returns an appropriate response when command wasn't found", async () => {
      const [_stdout, _stderr, code] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(["unexisting", "command"]),
      );
      expect(code).toEqual(127);
    });

    it("logs the command and execution time in debug mode", async () => {
      let stream: unknown;
      MiniMagick.logger = new Logger((stream = new StringIO()));
      (await MiniMagick.logger).level = Logger.DEBUG;
      await subject.execute(["identify", `${imagePath("gif") ?? ""}`]);
      await stream.rewind();
      expect(await stream.read()).toMatch(
        new RegExp(`\\[\\d+.\\d+s\\] identify ${imagePath("gif")}`, ""),
      );
    });

    it("doesn't break on spaces", async () => {
      const [stdout] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(["identify", "-format", "%w %h", imagePath()]),
      );
      expect(stdout).toMatch(/\d+ \d+/);
    });

    it("executes the command with the environment variables from MiniMagick.cli_env", async () => {
      vi.spyOn(MiniMagick, "cliEnv").mockReturnValue({ MY_ENV: "my value" });
      const [stdout] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(["echo $MY_ENV"]),
      );
      expect(stdout).toMatch("my value");
    });

    it("executes the command with only the environment variables from MiniMagick.cli_env (plus some required env) when MiniMagick.restricted_env is true", async () => {
      vi.spyOn(MiniMagick, "restrictedEnv").mockReturnValue(true);
      vi.spyOn(MiniMagick, "cliEnv").mockReturnValue({ PATH: "/usr/bin" });
      setEnv("SOMETHING_SECRET", "abc123");
      const [stdout] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(['echo "SOMETHING_SECRET=$SOMETHING_SECRET HOME=$HOME PATH=$PATH"']),
      );
      expect(stdout).toEqualRuby(
        `SOMETHING_SECRET= HOME=${(await Dir.home()) ?? ""} PATH=/usr/bin\n`,
      );
    });

    afterEach(async () => {
      await (Array.isArray(process.env)
        ? aryDelete(process.env, "SOMETHING_SECRET")
        : hashDelete(process.env, "SOMETHING_SECRET"));
    });

    it("does not override the timeout if MAGICK_TIME_LIMIT is set in MiniMagick.cli_env", async () => {
      vi.spyOn(MiniMagick, "timeout").mockReturnValue(1);
      vi.spyOn(MiniMagick, "cliEnv").mockReturnValue({ MAGICK_TIME_LIMIT: "override" });
      const [stdout] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(["echo $MAGICK_TIME_LIMIT"]),
      );
      expect(stdout).toMatch("1");
    });

    it("allows setting MAGICK_TIME_LIMIT via MiniMagick.cli_env", async () => {
      vi.spyOn(MiniMagick, "cliEnv").mockReturnValue({ MAGICK_TIME_LIMIT: "1" });
      const [stdout] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        await subject.execute(["echo $MAGICK_TIME_LIMIT"]),
      );
      expect(stdout).toMatch("1");
    });
  });
});
