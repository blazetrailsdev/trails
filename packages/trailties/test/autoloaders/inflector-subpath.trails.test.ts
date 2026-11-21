import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("trailties subpath exports", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));

  it.skipIf(!existsSync(`${root}dist/autoloaders/inflector.js`))(
    "the inflector subpath imported alone answers its Rails path",
    () => {
      const out = execFileSync(
        "node",
        [
          "--input-type=module",
          "-e",
          `const { Inflector } = await import("./dist/autoloaders/inflector.js");
const { rbModName } = await import("@blazetrails/ruby-compat");
console.log(rbModName(Inflector));`,
        ],
        { cwd: root, encoding: "utf8" },
      );
      expect(out.trim()).toBe("Trails::Autoloaders::Inflector");
    },
  );
});
