import { Dir, File, FileUtils, Open3, getProcessAdapter } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

const record = "(globalThis.__stacks ??= []).push(new Error().stack);\nexport {};\n";

async function bootFixture(ext: "js" | "ts", { stale = false } = {}) {
  const here = decodeURIComponent(new URL("./fixtures/boot-file-map", import.meta.url).pathname);
  const base = File.realpath(Dir.mktmpdir("compiled", here));
  const root = `${base}/app`;
  const write = (path: string, source: string) => {
    FileUtils.mkdirP(File.dirname(path));
    File.write(path, source);
  };
  try {
    write(`${root}/config.${ext}`, "export {};\n");
    write(
      `${root}/config/application.${ext}`,
      `import { Application } from "@blazetrails/trailties";

export class CompiledRoot extends Application {}
Application.register(CompiledRoot, import.meta.dirname);
CompiledRoot.config.loadDefaults("8.0");
`,
    );
    write(
      `${root}/config/environment.${ext}`,
      `import { Trails } from "@blazetrails/trailties";

await import("./application.${ext}");

await Trails.application.initializeBang();
export default Trails.application;
`,
    );
    write(
      `${root}/config/routes.${ext}`,
      `import { Trails } from "@blazetrails/trailties";
${record.split("\n")[0]}
Trails.application.routes().draw(function () {
  this.get("/up", { to: "pings#show" });
});
`,
    );
    write(`${root}/config/initializers/inflections.${ext}`, record);
    write(
      `${root}/boot.mjs`,
      `await import("./config/environment.${ext}");
console.log(JSON.stringify(globalThis.__stacks ?? []));
`,
    );
    const env = { TRAILS_ENV: "production" };
    const node = getProcessAdapter().execPath!();
    const cli = decodeURIComponent(
      new URL("../../trails-tsc/bin/trails-tsc-views.js", import.meta.url).pathname,
    );
    const [, buildErr, build] = await Open3.capture3(
      env,
      node,
      cli,
      "build-autoload",
      "--cwd",
      root,
    );
    expect(buildErr).toBe("");
    expect(build.isSuccess()).toBe(true);
    if (stale) expect(File.isExist(`${root}/.trails/entry.generated.js`)).toBe(true);

    const flags = ext === "js" ? ["--no-experimental-strip-types"] : [];
    const [stdout, stderr] = await Open3.capture3(env, node, ...flags, `${root}/boot.mjs`);
    expect(stderr).toBe("");
    const stacks: string[] = JSON.parse(String(stdout).trim().split("\n").at(-1)!);
    return { root, stacks, cleanup: () => FileUtils.rmRf(base) };
  } catch (error) {
    FileUtils.rmRf(base);
    throw error;
  }
}

describe("a compiled root boots from trails build's entry", () => {
  it("loads config files through .trails/compiled when config.js has no config.ts", async () => {
    const { root, stacks, cleanup } = await bootFixture("js");
    try {
      expect(File.read(`${root}/.trails/boot.generated.js`)).toContain('"config/routes.js"');
      expect(stacks.length).toBe(2);
      expect(stacks.every((stack) => stack.includes("/.trails/compiled/config/"))).toBe(true);
    } finally {
      cleanup();
    }
  }, 120_000);

  it("ignores a stale entry beside a source tree and boots through the autoloader", async () => {
    const { stacks, cleanup } = await bootFixture("ts", { stale: true });
    try {
      expect(stacks.length).toBe(2);
      expect(stacks.some((stack) => stack.includes("/.trails/compiled/"))).toBe(false);
    } finally {
      cleanup();
    }
  }, 120_000);
});
