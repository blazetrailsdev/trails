import type {} from "@blazetrails/vitest-matchers";
import { File, update, rbObjClone } from "@blazetrails/ruby-compat";
import { rbBinop } from "./codegen-runtime.js";
import { MiniMagick } from "./mini-magick.js";
import { Shell } from "./shell.js";
import "./test-helpers/spec-helper.js";
import { imagePath } from "./test-helpers/support/helpers.js";
import { Tool } from "./tool.js";
import { beforeEach, expect, it, vi, describe, afterEach } from "vitest";

describe("MiniMagick::Tool", () => {
  let subject: unknown;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    subject = await MiniMagick.identify();
  });

  describe("#call", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("calls the shell to run the command", async () => {
      subject.append(imagePath("gif"));
      const output = await subject();
      expect(output).toMatch("GIF");
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("strips the output", async () => {
      subject.append(imagePath());
      const output = await subject();
      expect(output).not.toEndWith("\n");
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("accepts a block, and yields stdin, stdout and exit status", async () => {
      vi.spyOn(Shell.prototype, "execute").mockReturnValue(["stdout", "stderr", 0]);
      await expect(async (block: unknown) => await subject(block)).toYieldWithArgs(
        "stdout",
        "stderr",
        0,
      );
      expect(await subject(() => {})).toEqual("stdout");
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("accepts stdin", async () => {
      subject.append("-");
      const output = await subject({ stdin: File.read(imagePath() as string) });
      expect(output).toMatch(/JPEG/);
    });
  });

  describe(".new", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("accepts a block, and immediately executes the command", async () => {
      const output = new Tool(
        "identify",
        async (builder) =>
          await (typeof builder === "string"
            ? builder + imagePath("gif")
            : Array.isArray(builder)
              ? (builder.push(imagePath("gif")), builder)
              : builder instanceof globalThis.Set
                ? builder.add(imagePath("gif"))
                : builder.append(imagePath("gif"))),
      );
      expect(output).toMatch("GIF");
    });
  });

  describe("#command", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("includes the executable and the arguments", async () => {
      vi.spyOn(subject, "args").mockReturnValue(["-list", "Command"]);
      expect(await subject.command()).toInclude(...["identify", "-list", "Command"]);
    });
  });

  describe("#executable", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("prepends 'magick' to the command when using ImageMagick 7", async () => {
      vi.spyOn(MiniMagick, "isImagemagick7").mockReturnValue(true);
      expect(await subject.executable()).toEqual(["magick", "identify"]);
      expect(await (await MiniMagick.convert()).executable()).toEqual(["magick"]);
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("prepends 'gm' to the command when using GraphicsMagick", async () => {
      vi.spyOn(MiniMagick, "graphicsmagick").mockReturnValue(true);
      expect(await subject.executable()).toEqual(["gm", "identify"]);
      expect(await (await MiniMagick.convert()).executable()).toEqual(["gm", "convert"]);
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("respects #cli_prefix as a string", async () => {
      vi.spyOn(MiniMagick, "isImagemagick7").mockReturnValue(false);
      vi.spyOn(MiniMagick, "cliPrefix").mockReturnValue("firejail");
      expect(await subject.executable()).toEqual(["firejail", "identify"]);
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("respects #cli_prefix as an array", async () => {
      vi.spyOn(MiniMagick, "isImagemagick7").mockReturnValue(false);
      vi.spyOn(MiniMagick, "cliPrefix").mockReturnValue(["firejail", "--force"]);
      expect(await subject.executable()).toEqual(["firejail", "--force", "identify"]);
    });
  });

  describe("#<<", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("adds argument to the args list", async () => {
      await ((x) =>
        typeof x === "string"
          ? x + 123
          : Array.isArray(x)
            ? (x.push(123), x)
            : x instanceof globalThis.Set
              ? x.add(123)
              : x.append(123))(
        await ((x) =>
          typeof x === "string"
            ? x + "bar"
            : Array.isArray(x)
              ? (x.push("bar"), x)
              : x instanceof globalThis.Set
                ? x.add("bar")
                : x.append("bar"))(
          await (typeof subject === "string"
            ? subject + "foo"
            : Array.isArray(subject)
              ? (subject.push("foo"), subject)
              : subject instanceof globalThis.Set
                ? subject.add("foo")
                : subject.append("foo")),
        ),
      );
      expect(await subject.args).toEqual(["foo", "bar", "123"]);
    });
  });

  describe("#merge!", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("adds arguments to the args list", async () => {
      subject.append("pre-existing");
      await update(subject, ["foo", 123]);
      expect(await subject.args).toEqual(["pre-existing", "foo", "123"]);
    });
  });

  describe("#+", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("switches the last option to + form", async () => {
      await subject.help();
      await rbBinop(await subject.help(), "+", undefined);
      await rbBinop(await subject.debug(), "+", "foo");
      await rbBinop(await subject.debug(), "+", 8);
      expect(await subject.args).toEqual(["-help", "+help", "+debug", "foo", "+debug", "8", "bar"]);
    });
  });

  describe("#stdin", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("appends the '-' pseudo-filename", async () => {
      await subject.stdin;
      expect(await subject.args).toEqual(["-"]);
    });
  });

  describe("#stdout", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("appends the '-' pseudo-filename", async () => {
      await subject.stdout;
      expect(await subject.args).toEqual(["-"]);
    });
  });

  describe("#stack", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("it surrounds added arguments with parentheses", async () => {
      await subject.stack(async (stack) => {
        if (Array.isArray(stack)) stack.push("foo");
        else if (stack instanceof globalThis.Set) stack.add("foo");
        else stack.append("foo");
        return await (typeof stack === "string"
          ? stack + "bar"
          : Array.isArray(stack)
            ? (stack.push("bar"), stack)
            : stack instanceof globalThis.Set
              ? stack.add("bar")
              : stack.append("bar"));
      });
      expect(await subject.args).toEqual(["(", "foo", "bar", ")"]);
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("accepts hash of options", async () => {
      await subject.stack({ foo: "bar", a: ["b", "c"] }, "foo.gif");
      expect(await subject.args).toEqual(["(", "-foo", "bar", "-a", "b", "c", "foo.gif", ")"]);
    });
  });

  describe("#clone", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("adds an option instead of the default behaviour", async () => {
      await rbObjClone(subject);
      expect(await subject.args).toEqual(["-clone"]);
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("accepts arguments", async () => {
      await rbObjClone(subject);
      expect(await subject.args).toEqual(["-clone", "0"]);
    });

    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("is convertible to plus version", async () => {
      await rbBinop(await rbObjClone(subject), "+", undefined);
      expect(await subject.args).toEqual(["+clone"]);
    });
  });

  describe("#method_missing", () => {
    // BLOCKED: mini-magick-cli-tool-shortcuts
    it.fails("adds CLI options", async () => {
      await subject.fooBar("baz");
      expect(await subject.args).toEqual(["-foo-bar", "baz"]);
    });
  });

  // BLOCKED: mini-magick-cli-tool-shortcuts
  it.fails("defines creation operator methods", async () => {
    await (await subject.radialGradient()).canvas("khaki");
    expect(await subject.args).toEqual(["radial-gradient:", "canvas:khaki"]);
  });
});
