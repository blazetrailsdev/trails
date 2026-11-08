import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { Generators } from "../lib/generators.js";

const GENERATORS_PATH = nodePath.join(
  decodeURIComponent(new URL(".", import.meta.url).pathname),
  "generators",
);

beforeAll(async () => {
  await Generators.lookupBang();
});

async function help(): Promise<string> {
  const lines: string[] = [];
  await Generators.printGenerators((m) => lines.push(m));
  return lines.join("\n");
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
    let output = "";
    await expect(
      Generators.invoke(name, [], { destinationRoot: "/tmp" }).catch((e: Error) => {
        output = e.message;
        throw e;
      }),
    ).rejects.toThrow();
    const notFound = `Could not find generator '${name}'.`;
    const helpHint = "`bin/trails generate --help`";
    const didYouMean = "Did you mean";
    expect(output).toMatch(notFound);
    expect(output).toMatch(helpHint);
    expect(output).not.toMatch(didYouMean);
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
