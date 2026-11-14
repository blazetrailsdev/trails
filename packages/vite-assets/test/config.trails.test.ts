import { File } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

const vendorCandidate = new URL("../../../vendor/vite_ruby/v3.11.1", import.meta.url).pathname;
const vendorRoot = (await File.isExistAsync(vendorCandidate)) ? vendorCandidate : null;

describe("Config (trails)", () => {
  it.skipIf(!vendorRoot)("ships the vendored default.vite.json verbatim", async () => {
    expect(await File.readAsync(new URL("../default.vite.json", import.meta.url).pathname)).toBe(
      await File.readAsync(`${vendorRoot}/vite_ruby/default.vite.json`),
    );
  });
});
