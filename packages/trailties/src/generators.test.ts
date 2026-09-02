// Mirrors railties/test/generators_test.rb.
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";
import { Generators } from "./generators.js";

beforeAll(async () => {
  await Generators.lookupBang();
});

describe("GeneratorsTest", () => {
  it("simple invoke", async () => {
    const tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "trails-generators-"));
    fs.writeFileSync(nodePath.join(tmpDir, "tsconfig.json"), "{}");
    try {
      const created = await Generators.invoke("rails:helper", ["Account"], {
        cwd: tmpDir,
        output: () => {},
      });
      expect(created).toContain("app/helpers/account-helper.ts");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("invoke when generator is not found", async () => {
    await expect(
      Generators.invoke("unknown", [], { cwd: "/tmp", output: () => {} }),
    ).rejects.toThrow("Could not find generator 'unknown'.");
  });

  it("find by namespace", async () => {
    const klass = await Generators.findByNamespace("rails:model");
    expect(klass).toBeTruthy();
    expect(klass!.namespace).toBe("rails:model");
  });

  it("find by namespace with base", async () => {
    const klass = await Generators.findByNamespace("model", "rails");
    expect(klass).toBeTruthy();
    expect(klass!.namespace).toBe("rails:model");
  });

  it("find by namespace in subfolder", async () => {
    const klass = await Generators.findByNamespace("change", "rails:db:system");
    expect(klass).toBeTruthy();
    expect(klass!.namespace).toBe("rails:db:system:change");
  });

  it("rails generators help with builtin information", async () => {
    const output: string[] = [];
    await Generators.printGenerators((m) => output.push(m));
    expect(output).toContain("Rails:");
    expect(output).toContain("  model");
    expect(output).toContain("  scaffold_controller");
    expect(output).not.toContain("  app");
  });

  it("rails generators help does not include app nor plugin new", async () => {
    const groups = await Generators.sortedGroups();
    const rails = groups.find(([base]) => base === "rails")![1];
    expect(rails).not.toContain("app");
    expect(rails).not.toContain("plugin");
    expect(rails).not.toContain("master_key");
    expect(rails).not.toContain("credentials");
  });
});
