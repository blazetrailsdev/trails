import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "../lib/loader.js";
import { get, newLoader, teardown, withSetup } from "./support/loader-test.js";

import { NameError } from "@blazetrails/ruby-compat";
import { Cref } from "../lib/cref.js";

const g = globalThis as Record<string, unknown>;

describe("TestNestedRootDirectories", () => {
  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("nested root directories do not autovivify modules", async () => {
    const files: [string, string][] = [["concerns/pricing.ts", "export class Pricing {}"]];
    await withSetup(loader, files, { dirs: [".", "concerns"] }, () => {
      expect(() => new Cref(Object, "Concerns").get()).toThrow(NameError);
    });
  });

  it("nested root directories are ignored even if there is a matching file", async () => {
    const files: [string, string][] = [
      ["hotel.ts", "export class Hotel {}"],
      ["concerns/geo-loc.ts", "export class GeoLoc {}"],
      ["concerns.ts", "export class Concerns {}"],
    ];
    await withSetup(loader, files, { dirs: [".", "concerns"] }, async () => {
      expect(await get(Object, "Concerns")).toBeTruthy();
      expect(await get(Object, "Hotel")).toBeTruthy();
    });
  });

  it("eager loading handles nested root directories correctly", async () => {
    const files: [string, string][] = [
      ["airplane.ts", "globalThis.$airplane = true; export class Airplane {}"],
      ["concerns/locatable.ts", "globalThis.$locatable = true; export class Locatable {}"],
    ];
    await withSetup(loader, files, { dirs: [".", "concerns"] }, async () => {
      await loader.eagerLoad();
      expect(g.$airplane).toBeTruthy();
      expect(g.$locatable).toBeTruthy();
    });
  });
});
