import { I18n } from "@blazetrails/activesupport";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { assertCalledWith } from "@blazetrails/activesupport/testing/method-call-assertions";
import { Base as ThorBase } from "@blazetrails/thor/shell";
import { Basic } from "@blazetrails/thor/shell/basic";
import { Color } from "@blazetrails/thor/shell/color";
import {
  Dir,
  File,
  FileUtils,
  LOAD_PATH,
  SystemExit,
  getProcessAdapter,
} from "@blazetrails/ruby-compat";
import { Base } from "../lib/generators/base.js";
import { ModelGenerator as TestUnitModelGenerator } from "../lib/generators/test-unit/model/model-generator.js";
import { Application } from "../lib/application.js";
import { Generators } from "../lib/generators.js";
import { Trails } from "../lib/trails.js";
import "../lib/trailties/active-record.js";
import { noColorBang } from "../lib/command/behavior.js";

let ModelGenerator: typeof import("../lib/generators/trails/model/model-generator.js").ModelGenerator;

const GENERATORS_PATH = nodePath.join(
  decodeURIComponent(new URL("../lib/", import.meta.url).pathname),
  "generators",
);

const FIXTURES = decodeURIComponent(new URL("./fixtures", import.meta.url).pathname);

class GeneratorsTestApp extends Application {}

const originalApplication = Trails.application;
const originalTemplatesPath = [...Generators.templatesPath()];
let fixturesLib: string;

beforeAll(async () => {
  Trails.application = GeneratorsTestApp.instance();
  Trails.application.config.setRoot(FIXTURES);
  Generators.templatesPath().push(File.join(FIXTURES, "lib", "templates"));
  fixturesLib = File.join(Trails.root()!, "lib");
  LOAD_PATH.unshift(fixturesLib);
  await GeneratorsTestApp.instance().loadGenerators();
  ({ ModelGenerator } = await import("../lib/generators/trails/model/model-generator.js"));
  await Generators.lookupBang();
});

afterAll(() => {
  LOAD_PATH.splice(LOAD_PATH.indexOf(fixturesLib), 1);
  Generators.templatesPath().splice(0, Infinity, ...originalTemplatesPath);
  Trails.application = originalApplication;
});

async function invokeExiting(name: string): Promise<string> {
  vi.spyOn(getProcessAdapter(), "exit").mockImplementation((code) => {
    throw new SystemExit(code ?? 0);
  });
  try {
    return await capture("stdout", () =>
      expect(Generators.invoke(name, [])).rejects.toThrow(SystemExit),
    );
  } finally {
    vi.restoreAllMocks();
  }
}

async function help(): Promise<string> {
  return capture("stdout", () => Generators.printGenerators());
}

describe("GeneratorsTest", () => {
  it("simple invoke", async () => {
    expect(
      fs.existsSync(nodePath.join(GENERATORS_PATH, "trails", "helper", "helper-generator.ts")),
    ).toBeTruthy();
    const klass = (await Generators.findByNamespace("trails:helper"))!;
    const config = { destinationRoot: "/tmp" };
    const start = vi.spyOn(klass, "start").mockResolvedValue([]);
    await Generators.invoke("trails:helper", ["Account"], config);
    expect(start).toHaveBeenCalledWith(["Account"], config);
    start.mockRestore();
  });

  it("invoke when generator is not found", async () => {
    const name = "unknown";
    const output = await invokeExiting(name);
    expect(output).toMatch(`Could not find generator '${name}'.`);
    expect(output).toMatch("`bin/trails generate --help`");
    expect(output).not.toMatch("Did you mean");
  });

  it("generator suggestions", async () => {
    const name = "migrationz";
    const output = await invokeExiting(name);
    expect(output).toMatch("Did you mean?  migration");
  });

  it("generator suggestions except en locale", async () => {
    const origAvailableLocales = I18n.availableLocales();
    const origDefaultLocale = I18n.defaultLocale();
    I18n.setAvailableLocales("ja");
    I18n.setDefaultLocale("ja");
    try {
      const name = "tas";
      const output = await invokeExiting(name);
      expect(output).toMatch("Did you mean?  task");
    } finally {
      I18n.setAvailableLocales(origAvailableLocales);
      I18n.setDefaultLocale(origDefaultLocale);
    }
  });

  it("help when a generator with required arguments is invoked without arguments", async () => {
    const output = await capture("stdout", () => Generators.invoke("model", []));
    expect(output).toMatch(/Description:/);
  });

  it("should give higher preference to trails generators", async () => {
    expect(fs.existsSync(File.join(fixturesLib, "generators", "model-generator.ts"))).toBeTruthy();
    await assertCalledWith(ModelGenerator, "start", [["Account"], {}], {}, async () => {
      const warnings = await capture("stderr", () => Generators.invoke("model", ["Account"]));
      expect(warnings).toBeEmpty();
    });
  });

  it("invoke with default values", async () => {
    await assertCalledWith(ModelGenerator, "start", [["Account"], {}], {}, () =>
      Generators.invoke("model", ["Account"]),
    );
  });

  it("invoke with config values", async () => {
    await assertCalledWith(ModelGenerator, "start", [["Account"], { behavior: "skip" }], {}, () =>
      Generators.invoke("model", ["Account"], { behavior: "skip" }),
    );
  });

  it("find by namespace", async () => {
    const klass = await Generators.findByNamespace("trails:model");
    expect(klass).toBeTruthy();
    expect(klass!.namespace()).toEqual("trails:model");
  });

  it("find by namespace with base", async () => {
    const klass = await Generators.findByNamespace("model", "trails");
    expect(klass).toBeTruthy();
    expect(klass!.namespace()).toEqual("trails:model");
  });

  it("find by namespace with context", async () => {
    const klass = await Generators.findByNamespace("test_unit", null, "model");
    expect(klass).toBeTruthy();
    expect(klass!.namespace()).toEqual("test-unit:model");
  });

  it("find by namespace with generator on root", async () => {
    const klass = await Generators.findByNamespace("fixjour");
    expect(klass).toBeTruthy();
    expect(klass!.namespace()).toBe("fixjour");
  });

  it("find by namespace without base or context looks into trails namespace", async () => {
    expect(await Generators.findByNamespace("model")).toBeTruthy();
  });

  it("invoke with nested namespaces", async () => {
    const start = vi.fn();
    const modelGenerator = { start, arguments: () => [] } as never;
    await assertCalledWith(
      Generators,
      "findByNamespace",
      ["namespace", "my:awesome"],
      { returns: modelGenerator },
      () => Generators.invoke("my:awesome:namespace", ["Account"]),
    );
    expect(start).toHaveBeenCalledWith(["Account"], {});
  });

  it("fallbacks for generators on find by namespace", async () => {
    Generators.fallbacks()["remarkable"] = "test_unit";
    try {
      const klass = await Generators.findByNamespace("plugin", "remarkable");
      expect(klass).toBeTruthy();
      expect(klass!.namespace()).toEqual("test-unit:plugin");
    } finally {
      delete Generators.fallbacks()["remarkable"];
    }
  });

  it("fallbacks for generators on find by namespace with context", async () => {
    Generators.fallbacks()["remarkable"] = "test_unit";
    try {
      const klass = await Generators.findByNamespace("remarkable", "trails", "plugin");
      expect(klass).toBeTruthy();
      expect(klass!.namespace()).toEqual("test-unit:plugin");
    } finally {
      delete Generators.fallbacks()["remarkable"];
    }
  });

  it("trails generators help with builtin information", async () => {
    const output = await help();
    /* eslint-disable no-regex-spaces -- the indent width is `print_list`'s, verbatim from generators_test.rb:141-144 */
    expect(output).toMatch(/Trails:/);
    expect(output).toMatch(/^  model$/m);
    expect(output).toMatch(/^  scaffold-controller$/m);
    expect(output).not.toMatch(/^  app$/m);
    /* eslint-enable no-regex-spaces */
  });

  it("trails generators help does not include app nor plugin new", async () => {
    const output = await help();
    expect(output).not.toMatch(/app\W/);
    expect(output).not.toMatch(/[^:]plugin/);
  });

  it("trails generators with others information", async () => {
    const output = await help();
    expect(output).toMatch(/Fixjour:/);
    expect(output).toMatch(/^ {2}fixjour$/m);
  });

  it("default banner should not show trails generator namespace", async () => {
    const klass = (await Generators.findByNamespace("model")) as unknown as { banner(): string };
    expect(klass.banner()).toMatch(/^bin\/trails generate model/);
  });

  it("no color sets proper shell", () => {
    try {
      noColorBang();
      expect(ThorBase.shell).toBe(Basic);
    } finally {
      ThorBase.shell = Color;
    }
  });

  it("fallbacks for generators on invoke", async () => {
    Generators.fallbacks()["shoulda"] = "test_unit";
    try {
      await assertCalledWith(TestUnitModelGenerator, "start", [["Account"], {}], {}, () =>
        Generators.invoke("shoulda:model", ["Account"]),
      );
    } finally {
      delete Generators.fallbacks()["shoulda"];
    }
  });

  it("nested fallbacks for generators", async () => {
    Generators.fallbacks()["shoulda"] = "test_unit";
    Generators.fallbacks()["super_shoulda"] = "shoulda";
    try {
      await assertCalledWith(TestUnitModelGenerator, "start", [["Account"], {}], {}, () =>
        Generators.invoke("super_shoulda:model", ["Account"]),
      );
    } finally {
      delete Generators.fallbacks()["shoulda"];
      delete Generators.fallbacks()["super_shoulda"];
    }
  });

  it("developer options are overwritten by user options", () => {
    Generators.options()["with_options"] = { generate: false };

    class WithOptionsGenerator extends Base {
      static {
        this.classOption("generate", { default: true, type: "boolean" });
      }
    }

    expect(WithOptionsGenerator.classOptions()["generate"].default).toBe(false);
  });

  it("source paths for not namespaced generators", async () => {
    const mspec = await Generators.findByNamespace("fixjour");
    expect(mspec!.sourcePaths()).toContain(
      File.join(Trails.root()!, "lib", "templates", "fixjour"),
    );
  });

  it("rails root templates", async () => {
    const template = File.join(
      Trails.root()!,
      "lib",
      "templates",
      "active_record",
      "model",
      "model.ts",
    );

    FileUtils.mkdirP(File.dirname(template));
    File.write(template, "empty");
    await buildTemplates([template]);

    const destinationRoot = Dir.mktmpdir();
    File.write(File.join(destinationRoot, "tsconfig.json"), "{}");
    try {
      await capture("stdout", () => Generators.invoke("model", ["user"], { destinationRoot }));

      const path = File.join(destinationRoot, "app/models/user.ts");
      expect(File.isExist(path)).toBe(true);
      expect(File.read(path)).toBe("empty");
    } finally {
      FileUtils.rmRf(File.dirname(template));
      FileUtils.rmRf(destinationRoot);
    }
  });

  it("usage with embedded ruby", async () => {
    await import("./fixtures/lib/generators/usage-template/usage-template-generator.js");
    const output = await capture("stdout", () => Generators.invoke("usage-template", ["--help"]));
    expect(output).toMatch(/:: 2 ::/);
  });

  it("hide namespace", () => {
    const hidden = Generators.hiddenNamespaces();
    try {
      expect(hidden).not.toContain("special:namespace");
      Generators.hideNamespaces("special:namespace");
      expect(hidden).toContain("special:namespace");
    } finally {
      hidden.splice(0, hidden.length, ...hidden.filter((n) => n !== "special:namespace"));
    }
  });
});
