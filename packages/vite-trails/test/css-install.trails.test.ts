import { Task } from "@blazetrails/rake";
import { File, FileUtils, Pathname, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => [] as string[]);
vi.mock("@blazetrails/ruby-compat/kernel-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat/kernel-system")>()),
  rbFSystem: async (command: string) => {
    commands.push(command);
    return true;
  },
}));

describe("css.rake", () => {
  let rootDir: Pathname;
  let savedTrails: unknown;

  beforeEach(async () => {
    commands.length = 0;
    rootDir = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
    await FileUtils.mkdirPAsync(rootDir.join("app/javascript/entrypoints").toString());
    await File.writeAsync(rootDir.join("app/javascript/entrypoints/application.js").toString(), "");
    await File.writeAsync(
      rootDir.join("vite.config.ts").toString(),
      "export default defineConfig({\n  plugins: [\n    RubyPlugin(),\n  ],\n})\n",
    );
    savedTrails = TopLevel.Trails;
    (TopLevel as Record<string, unknown>).Trails = { root: () => rootDir };
    await import("../lib/tasks/css.rake.js");
  });

  afterEach(async () => {
    (TopLevel as Record<string, unknown>).Trails = savedTrails;
    await FileUtils.rmRfAsync(rootDir.toString());
  });

  it("css:install:tailwind adds the Vite plugin and imports the stylesheet", async () => {
    await (await Task.get("css:install:tailwind")).invoke();
    await (await Task.get("css:install:tailwind")).execute();

    expect(commands).toEqual([
      "pnpm add -D tailwindcss @tailwindcss/vite",
      "pnpm add -D tailwindcss @tailwindcss/vite",
    ]);
    expect(
      (await File.readAsync(rootDir.join("vite.config.ts").toString())).match(/tailwindcss\(\)/g),
    ).toHaveLength(1);
    expect(await File.readAsync(rootDir.join("vite.config.ts").toString())).toContain(
      "    tailwindcss(),\n    RubyPlugin(),",
    );
    expect(
      await File.readAsync(rootDir.join("app/javascript/entrypoints/application.css").toString()),
    ).toBe(`@import "tailwindcss";\n`);
    expect(
      await File.readAsync(rootDir.join("app/javascript/entrypoints/application.js").toString()),
    ).toBe(`import "./application.css"\n`);
  });

  it("defines css:install for every CSS option", async () => {
    for (const css of ["tailwind", "bootstrap", "bulma", "postcss", "sass"]) {
      expect((await Task.get(`css:install:${css}`)).name).toBe(`css:install:${css}`);
    }
  });
});
