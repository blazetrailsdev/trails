import { describe, it, expect } from "vitest";
import { Dir, File, FileUtils, SecureRandom } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "./base.js";
import { Generators } from "../generators.js";

class Host extends GeneratorBase {}

describe("GeneratorBase#relativeToOriginalDestinationRoot", () => {
  const base = new Host({ cwd: "/app", output: () => {} });

  it("strips the destination root and its leading dot", () => {
    expect(base.relativeToOriginalDestinationRoot("/app/db/migrate/1_x.ts")).toBe(
      "db/migrate/1_x.ts",
    );
  });

  it("keeps the dot when removeDot is false", () => {
    expect(base.relativeToOriginalDestinationRoot("/app/config", false)).toBe("./config");
  });

  it("answers an empty string for the root itself", () => {
    expect(base.relativeToOriginalDestinationRoot("/app")).toBe("");
    expect(base.relativeToOriginalDestinationRoot("/app", false)).toBe(".");
  });

  it("leaves a sibling path that only shares the prefix untouched", () => {
    expect(base.relativeToOriginalDestinationRoot("/application/x")).toBe("/application/x");
  });
});

describe("GeneratorBase.classOption defaults from Generators.options / Generators.aliases", () => {
  it("fills :default and :aliases from the :rails namespace", () => {
    class WidgetGenerator extends GeneratorBase {
      static {
        this.classOption("templateEngine", { type: "string" });
      }
    }
    expect(WidgetGenerator.classOptions()["templateEngine"]).toMatchObject({
      default: "tse",
      aliases: "-e",
    });
  });

  it("prefers the generator's own namespace over :rails, and an explicit default when unset", () => {
    const options = Generators.options();
    options["gadget"] = { orm: "active_record" };
    try {
      class GadgetGenerator extends GeneratorBase {
        static {
          this.classOption("orm", { type: "string" });
          this.classOption("widgets", { type: "boolean", default: true });
        }
      }
      expect(GadgetGenerator.classOptions()["orm"].default).toBe("active_record");
      expect(GadgetGenerator.classOptions()["widgets"].default).toBe(true);
    } finally {
      delete options["gadget"];
    }
  });
});

describe("GeneratorBase runtime options (Thor's add_runtime_options!)", () => {
  it("parses --pretend / -f / -q / -s as options, not attributes", async () => {
    let seen: { options: Record<string, unknown>; attributes: string[] } | undefined;
    class RecordingGenerator extends GeneratorBase {
      run(_name: string, attributes: string[]): void {
        seen = { options: { ...this.options }, attributes };
      }
    }
    await RecordingGenerator.start(["post", "title:string", "--pretend", "-f", "-q", "-s"], {
      cwd: "/app",
      output: () => {},
    });
    expect(seen!.attributes).toEqual(["title:string"]);
    expect(seen!.options).toMatchObject({ pretend: true, force: true, quiet: true, skip: true });
  });
});

describe("GeneratorBase#createFile conflict behavior (Thor's CreateFile#invoke!)", () => {
  class Writer extends GeneratorBase {
    write(content: string): void {
      this.createFile("app/x.ts", content);
    }
  }

  it("keeps a changed file under behavior: :skip, reports identical files, and forces through a conflict", () => {
    const cwd = File.join(Dir.tmpdir(), `trails-create-file-${SecureRandom.hex(8)}`);
    const lines: string[] = [];
    const make = (opts: Partial<GeneratorOptions> = {}) =>
      new Writer({ cwd, output: (m) => lines.push(m), ...opts });
    try {
      make().write("one ✓\n");
      make({ behavior: "skip" }).write("two\n");
      make({ behavior: "skip" }).write("one ✓\n");
      expect(File.read(File.join(cwd, "app/x.ts"))).toBe("one ✓\n");
      make({ behavior: "force" }).write("two\n");
      make().write("three\n");
      expect(File.read(File.join(cwd, "app/x.ts"))).toBe("three\n");
      expect(lines.map((l) => l.trim())).toEqual([
        "create  app/x.ts",
        "skip  app/x.ts",
        "identical  app/x.ts",
        "force  app/x.ts",
        "conflict  app/x.ts",
        "force  app/x.ts",
      ]);
    } finally {
      FileUtils.rmRf(cwd);
    }
  });
});
