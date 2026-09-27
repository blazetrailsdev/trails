import { describe, it, expect } from "vitest";
import { GeneratorBase } from "./base.js";
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
