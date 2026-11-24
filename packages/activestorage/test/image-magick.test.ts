import { describe, expect, it, type TestContext } from "vitest";
import { assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { MiniMagick, Error as MiniMagickError } from "@blazetrails/mini-magick";
import type { CliTool } from "@blazetrails/mini-magick/tool";
import { block, Dir, File, Tempfile, TopLevel } from "@blazetrails/ruby-compat";
import "./support/database/setup.js";
import { ActiveStorage } from "../lib/active-storage.js";
import { ImageMagick } from "../lib/image-magick.js";
import { ImageMagick as ImageMagickAnalyzer } from "../lib/analyzer/image-analyzer/image-magick.js";
import { ImageProcessingTransformer } from "../lib/transformers/image-processing-transformer.js";
import { createFileBlob, fileFixture } from "./support/test-helper.js";

type Tool = { append(arg: unknown): Tool; list(name: string): Tool };
type CliEnv = Record<string, string>;

const SHIPPED_POLICY = File.read(File.join(ImageMagick.POLICY_DIRECTORY, "policy.xml"));
const SHIPPED_RULES = [
  ...SHIPPED_POLICY.matchAll(/<policy domain="(\w+)"[^>]*pattern="([^"]+)"/g),
].map((match) => [match[1], match[2]] as const);
const DENIED_CODERS = Object.freeze([
  "MSL",
  "EPHEMERAL",
  "TEXT",
  "MPC",
  "SHOW",
  "WIN",
  "PLT",
  "URL",
  "HTTP",
  "HTTPS",
  "FTP",
  "FILE",
  "PS",
  "PS2",
  "PS3",
  "EPS",
  "EPS2",
  "EPS3",
  "EPI",
  "EPSF",
  "EPSI",
  "EPT",
  "EPT2",
  "EPT3",
  "PDF",
  "AI",
  "EPDF",
  "PDFA",
  "POCKETMOD",
  "XPS",
  "PCL",
]);
const GHOSTSCRIPT_MODULES = Object.freeze(["PS", "PS2", "PS3", "EPT", "PDF"]);

const VARIABLE_FIXTURES: Readonly<Record<string, string>> = Object.freeze({
  "image/png": "racecar.png",
  "image/gif": "image.gif",
  "image/jpeg": "racecar.jpg",
  "image/tiff": "racecar.tif",
  "image/bmp": "colors.bmp",
  "image/vnd.adobe.photoshop": "icon.psd",
  "image/vnd.microsoft.icon": "favicon.ico",
  "image/webp": "valley.webp",
  "image/avif": "racecar.avif",
  "image/heic": "racecar.heic",
  "image/heif": "racecar.heif",
});

const identify = (fn: (identify: Tool) => void) =>
  MiniMagick.identify(block(fn as unknown as (tool: CliTool) => unknown)) as Promise<string>;
const convert = (fn: (convert: Tool) => void) =>
  MiniMagick.convert(block(fn as unknown as (tool: CliTool) => unknown)) as Promise<string>;

async function policyListing(): Promise<string> {
  return await identify((identify) => {
    identify.list("policy");
  });
}

let _registeredFormats: [string, string, string][] | undefined;
async function registeredFormats(): Promise<[string, string, string][]> {
  return (_registeredFormats ??= [
    ...(
      await identify((identify) => {
        identify.list("format");
      })
    ).matchAll(/^\s*(\w+)\*?\s+(\w+)\s+([rw+-]{3})/gm),
  ]
    .map((match) => [match[1], match[2], match[3]] as [string, string, string])
    .filter(([, , rights]) => /[rw]/.test(rights)));
}

async function registeredCoders(): Promise<string[]> {
  return (await registeredFormats()).map(([token]) => token);
}

async function gsBackedCoders(): Promise<string[]> {
  return (await registeredFormats())
    .filter(([, mod]) => GHOSTSCRIPT_MODULES.includes(mod))
    .map(([token]) => token);
}

async function withMiniMagick<T>(fn: () => Promise<T>): Promise<T> {
  const previousProcessor = ActiveStorage.variantProcessor;
  ActiveStorage.variantProcessor = "mini_magick";
  try {
    return await fn();
  } finally {
    ActiveStorage.variantProcessor = previousProcessor;
  }
}

async function isCoderRegistered(coder: string): Promise<boolean> {
  return (await registeredCoders()).includes(coder);
}

function coderFor(fixture: string): string {
  const extension = File.extname(fixture).replaceAll(".", "");
  const table: Record<string, string> = { jpg: "JPEG", tif: "TIFF", ico: "ICO" };
  return Object.hasOwn(table, extension) ? table[extension] : extension.toUpperCase();
}

async function invokeCoder(coder: string): Promise<unknown> {
  switch (coder) {
    case "MSL":
      return await withTempfile(
        "script.msl",
        `<image><read filename="${fileFixture("racecar.jpg")}"/></image>`,
        (path) => identify((identify) => void identify.append(`msl:${path}`)),
      );
    case "PS":
    case "EPS":
    case "EPI":
    case "EPSF":
    case "EPSI":
    case "EPT":
    case "EPT2":
    case "EPT3":
      return await withTempfile("page.ps", "%!PS\nshowpage\n", (path) =>
        identify((identify) => void identify.append(`${coder.toLowerCase()}:${path}`)),
      );
    case "PDF":
    case "AI":
    case "EPDF":
    case "PDFA":
    case "POCKETMOD":
      return await identify(
        (identify) => void identify.append(`${coder.toLowerCase()}:${fileFixture("cropped.pdf")}`),
      );
    case "XPS":
    case "PCL":
      return await withTempfile("page.ps", "%!PS\nshowpage\n", (path) =>
        identify((identify) => void identify.append(`${coder.toLowerCase()}:${path}`)),
      );
    case "MPC":
      return await identify(
        (identify) => void identify.append(`mpc:${fileFixture("racecar.jpg")}`),
      );
    case "FILE":
      return await identify(
        (identify) => void identify.append(`file://${fileFixture("racecar.jpg")}`),
      );
    case "TEXT":
    case "EPHEMERAL":
      return await identify(
        (identify) => void identify.append(`${coder.toLowerCase()}:${fileFixture("racecar.jpg")}`),
      );
    case "LABEL":
      return await identify((identify) => void identify.append("label:hello"));
    case "PS2":
    case "PS3":
    case "EPS2":
    case "EPS3":
      return await Tempfile.create(["page", `.${coder.toLowerCase()}`], undefined, (file) =>
        convert(
          (convert) =>
            void convert
              .append(fileFixture("racecar.jpg").toString())
              .append(`${coder.toLowerCase()}:${file.path()}`),
        ),
      );
    case "URL":
    case "HTTP":
    case "HTTPS":
    case "FTP":
      return await identify(
        (identify) => void identify.append(`${coder.toLowerCase()}://127.0.0.1:1/racecar.jpg`),
      );
    case "SHOW":
    case "WIN":
    case "PLT":
      return await withDisplayDisabled(() =>
        convert(
          (convert) =>
            void convert
              .append(fileFixture("racecar.jpg").toString())
              .append(`${coder.toLowerCase()}:`),
        ),
      );
    default:
      expect.fail(`no invocation defined for the ${coder} coder; add one to invoke_coder`);
  }
}

async function coderErrorMessage(coder: string): Promise<string> {
  try {
    await invokeCoder(coder);
    return "";
  } catch (error) {
    if (!(error instanceof MiniMagickError)) throw error;
    return error.message;
  }
}

async function withTempfile<T>(
  name: string,
  contents: string,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const [base, ext] = name.split(".");
  return await Tempfile.create([base, `.${ext}`], undefined, async (file) => {
    file.write(contents);
    file.flush();
    return await fn(file.path()!);
  });
}

async function withDisplayDisabled<T>(fn: () => Promise<T>): Promise<T> {
  return await withCliEnv({ DISPLAY: "", WAYLAND_DISPLAY: "" }, fn);
}

async function withOperatorPolicy<T>(rules: string, fn: () => Promise<T>): Promise<T> {
  return await Dir.mktmpdir(null, null, {}, async (directory) => {
    File.write(File.join(directory, "policy.xml"), `<policymap>${rules}</policymap>`);
    return await withCliEnv({ MAGICK_CONFIGURE_PATH: ImageMagick.configurePath(directory) }, fn);
  });
}

async function withEnv<T>(overrides: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const env = TopLevel.ENV as Record<string, string | undefined>;
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, env[key]]));
  Object.assign(env, overrides);
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) env[key] = previous[key];
  }
}

async function withCliEnv<T>(overrides: CliEnv, fn: () => Promise<T>): Promise<T> {
  const previous = MiniMagick.cliEnv;
  MiniMagick.cliEnv = { ...(MiniMagick.cliEnv as CliEnv), ...overrides };
  try {
    return await fn();
  } finally {
    MiniMagick.cliEnv = previous;
  }
}

describe("ActiveStorage::ImageMagickTest", { timeout: 60_000 }, () => {
  it("every rule in the shipped policy is loaded", async () => {
    const loaded = (await policyListing())
      .split(/^Path: /m)
      .find((section) => section.startsWith(ImageMagick.POLICY_DIRECTORY));

    expect(loaded).not.toBeUndefined();
    expect(loaded!.match(/^ {2}Policy: /gm)?.length ?? 0).toBe(SHIPPED_RULES.length);
  });

  it("the shipped policy denies exactly the expected coders, the Ghostscript delegate, and @filename indirection", () => {
    expect(
      SHIPPED_RULES.filter(([domain]) => domain === "coder").map(([, pattern]) => pattern),
    ).toEqual(DENIED_CODERS);
    expect(SHIPPED_RULES.filter(([domain]) => domain !== "coder")).toEqual([
      ["delegate", "gs"],
      ["path", "@*"],
    ]);
  });

  it("every Ghostscript-backed coder is denied by coder", async () => {
    expect((await gsBackedCoders()).filter((coder) => !DENIED_CODERS.includes(coder))).toBeEmpty();
  });

  for (const coder of DENIED_CODERS) {
    it(`the shipped policy denies the ${coder} coder`, async (ctx: TestContext) => {
      ctx.skip(!(await isCoderRegistered(coder)), `this ImageMagick has no ${coder} coder`);

      const error = await assertRaises([MiniMagickError], {}, () => invokeCoder(coder));
      expect(error.message).toMatch(/security policy/);
    });
  }

  it("the shipped policy refuses @filename indirection", async () => {
    const error = await assertRaises([MiniMagickError], {}, () =>
      identify((identify) => void identify.append(`@${fileFixture("racecar.jpg")}`)),
    );
    expect(error.message).toMatch(/security policy .@/);
  });

  it("the variable content types are all covered by a fixture", () => {
    expect([...ActiveStorage.variableContentTypes].sort()).toEqual(
      Object.keys(VARIABLE_FIXTURES).sort(),
    );
  });

  for (const [contentType, fixture] of Object.entries(VARIABLE_FIXTURES)) {
    it(`${contentType} still analyzes and transforms under the shipped policy`, async (ctx: TestContext) => {
      const coder = coderFor(fixture);
      ctx.skip(
        !(await isCoderRegistered(coder)),
        `${contentType}: this ImageMagick has no ${coder} coder`,
      );

      const blob = await createFileBlob({ filename: fixture, contentType });
      const metadata = (await new ImageMagickAnalyzer(blob).metadata()) as Record<string, number>;
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);

      await withMiniMagick(async () => {
        const transformer = new ImageProcessingTransformer({ resizeToLimit: [8, 8] });
        await transformer.transform(
          fileFixture(fixture).toString(),
          { format: "png" },
          (output) => {
            expect(output.size()).toBeGreaterThan(0);
          },
        );
      });
    });
  }

  it("image/svg+xml still analyzes under the shipped policy", async (ctx: TestContext) => {
    ctx.skip(!(await isCoderRegistered("SVG")), "this ImageMagick has no SVG coder");

    const blob = await createFileBlob({ filename: "icon.svg", contentType: "image/svg+xml" });
    const metadata = (await new ImageMagickAnalyzer(blob).metadata()) as Record<string, number>;

    expect(metadata.width).toBe(792);
    expect(metadata.height).toBe(584);
  });

  it("the shipped policy directory is added to the search path, not substituted for it", async () => {
    const paths = [...(await policyListing()).matchAll(/^Path: (.+)$/gm)].map((match) => match[1]);

    expect(paths).toContain(`${ImageMagick.POLICY_DIRECTORY}${File.SEPARATOR}policy.xml`);
    expect(paths).toContain("[built-in]");
  });

  it("the shipped policy directory comes before an operator's own", () => {
    expect(ImageMagick.configurePath(null)).toBe(ImageMagick.POLICY_DIRECTORY);
    expect(ImageMagick.configurePath("")).toBe(ImageMagick.POLICY_DIRECTORY);
    expect(ImageMagick.configurePath("/etc/magick")).toBe(
      `${ImageMagick.POLICY_DIRECTORY}${File.PATH_SEPARATOR}/etc/magick`,
    );
  });

  it("applying the policy again keeps the shipped directory first, once", async () => {
    await withCliEnv(
      { MAGICK_CONFIGURE_PATH: ImageMagick.configurePath("/etc/magick") },
      async () => {
        ImageMagick.applyPolicy();

        expect((MiniMagick.cliEnv as CliEnv)["MAGICK_CONFIGURE_PATH"]).toBe(
          ImageMagick.configurePath("/etc/magick"),
        );
      },
    );
  });

  it("applying the policy after initialization picks up a MAGICK_CONFIGURE_PATH set after Active Storage loaded", async () => {
    await withCliEnv({ MAGICK_CONFIGURE_PATH: ImageMagick.POLICY_DIRECTORY }, async () => {
      await withEnv({ MAGICK_CONFIGURE_PATH: "/etc/magick" }, async () => {
        ImageMagick.applyPolicy();

        expect((MiniMagick.cliEnv as CliEnv)["MAGICK_CONFIGURE_PATH"]).toBe(
          ImageMagick.configurePath("/etc/magick"),
        );
      });
    });
  });

  it("applying the policy after initialization restores it to a MiniMagick.cli_env an initializer replaced", () => {
    const previous = MiniMagick.cliEnv;
    MiniMagick.cliEnv = { OMP_NUM_THREADS: "1" };
    try {
      ImageMagick.applyPolicy();

      expect(MiniMagick.cliEnv).toEqual({
        OMP_NUM_THREADS: "1",
        MAGICK_CONFIGURE_PATH: ImageMagick.POLICY_DIRECTORY,
      });
    } finally {
      MiniMagick.cliEnv = previous;
    }
  });

  it("an operator's policy after the shipped one can allow a coder we deny", async () => {
    await withOperatorPolicy(
      `<policy domain="coder" rights="read|write" pattern="TEXT"/>`,
      async () => {
        expect(await coderErrorMessage("TEXT")).not.toMatch(/security policy/);
      },
    );
  }, 300_000);

  it("the shipped policy allows label: text rendering", async (ctx: TestContext) => {
    ctx.skip(!(await isCoderRegistered("LABEL")), "this ImageMagick has no LABEL coder");

    expect(await coderErrorMessage("LABEL")).not.toMatch(/security policy/);
  });

  it("an operator's policy after the shipped one can deny a coder we allow", async () => {
    await withOperatorPolicy(`<policy domain="coder" rights="none" pattern="JPEG"/>`, async () => {
      const error = await assertRaises([MiniMagickError], {}, () =>
        identify((identify) => void identify.append(fileFixture("racecar.jpg").toString())),
      );
      expect(error.message).toMatch(/security policy/);
    });
  });
});
