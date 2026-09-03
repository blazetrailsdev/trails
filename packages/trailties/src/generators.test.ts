import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { Generators } from "./generators.js";

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
      fs.existsSync(nodePath.join(GENERATORS_PATH, "rails", "helper", "helper-generator.ts")),
    ).toBeTruthy();
    const klass = (await Generators.findByNamespace("rails:helper"))!;
    const config = { cwd: "/tmp", output: () => {} };
    const start = vi.spyOn(klass, "start").mockResolvedValue([]);
    await Generators.invoke("rails:helper", ["Account"], config);
    expect(start).toHaveBeenCalledWith(["Account"], config);
    start.mockRestore();
  });

  it("invoke when generator is not found", async () => {
    const name = "unknown";
    let output = "";
    await expect(
      Generators.invoke(name, [], { cwd: "/tmp", output: () => {} }).catch((e: Error) => {
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
    const klass = await Generators.findByNamespace("rails:model");
    expect(klass).toBeTruthy();
    expect(klass!.namespace).toEqual("rails:model");
  });

  it("find by namespace with base", async () => {
    const klass = await Generators.findByNamespace("model", "rails");
    expect(klass).toBeTruthy();
    expect(klass!.namespace).toEqual("rails:model");
  });

  it("rails generators help with builtin information", async () => {
    const output = await help();
    /* eslint-disable no-regex-spaces -- the indent width is `print_list`'s, verbatim from generators_test.rb:141-144 */
    expect(output).toMatch(/Rails:/);
    expect(output).toMatch(/^  model$/m);
    expect(output).toMatch(/^  scaffold_controller$/m);
    expect(output).not.toMatch(/^  app$/m);
    /* eslint-enable no-regex-spaces */
  });

  it("rails generators help does not include app nor plugin new", async () => {
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
