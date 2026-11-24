import { squish } from "@blazetrails/activesupport";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";

/** @missingRailsCall require — PERMANENT */
let Vips: { blockUntrusted?: (state: boolean) => void } | undefined;
try {
  ({ vips: Vips } = await import("@blazetrails/image-processing/vips"));
  ActiveStorage.VIPS_AVAILABLE = true;
} catch (error) {
  ActiveStorage.VIPS_AVAILABLE = false;
  if (!/wasm-vips|image-processing/.test(String((error as Error).message))) throw error;
}

if (ActiveStorage.VIPS_AVAILABLE) {
  if (typeof Vips!.blockUntrusted !== "function") {
    throw new RuntimeError(
      squish(`
        libvips's unfuzzed operations are not safe to use with untrusted content, and Active Storage
        cannot disable them. Disabling them requires libvips 8.13 or later and ruby-vips 2.2.1 or
        later. Please upgrade libvips and ruby-vips, or remove the ruby-vips gem from your Gemfile.
      `),
    );
  }

  Vips!.blockUntrusted(true);
}
