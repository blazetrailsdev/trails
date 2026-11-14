import { describe, expect, it, vi } from "vitest";
import { ViteRuby } from "../lib/vite-ruby.js";
import { refreshConfig } from "./support/test-helper.js";

describe("Manifest#reactRefreshPreamble", () => {
  it("interpolates the preamble code without re-indenting it, as a squiggly heredoc does", async () => {
    await refreshConfig({ mode: "development" });
    vi.spyOn(ViteRuby.instance(), "isDevServerRunning").mockResolvedValue(true);
    const manifest = ViteRuby.instance().manifest();
    const code = await manifest.reactPreambleCode();
    expect(await manifest.reactRefreshPreamble()).toBe(
      `<script type="module">\n  ${code}\n</script>\n`,
    );
    expect(code!.split("\n")[1]).toBe("RefreshRuntime.injectIntoGlobalHook(window)");
  });
});
