import { Dir, File, FileUtils, Open3, getPath, getProcessAdapter } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

const record = "(globalThis.__loaded ??= []).push(import.meta.url);\nexport {};\n";

describe("trails build's boot file map", () => {
  it("boots .trails/entry.generated.js under plain node through the registered thunks", async () => {
    const here = decodeURIComponent(
      new URL("./__fixtures__/boot-file-map", import.meta.url).pathname,
    );
    FileUtils.mkdirP(here);
    const base = File.realpath(Dir.mktmpdir("build", here));
    const root = `${base}/app`;
    const engineRoot = `${base}/blog`;
    const write = (path: string, source: string) => {
      FileUtils.mkdirP(File.dirname(path));
      File.write(path, source);
    };
    try {
      write(`${root}/config.ts`, "export {};\n");
      write(
        `${root}/config/application.ts`,
        `import { Application, Engine } from "@blazetrails/trailties";

export class Blog extends Engine {}
Engine.register(Blog, ${JSON.stringify(engineRoot)});

export class BootFileMap extends Application {}
Application.register(BootFileMap, import.meta.dirname);
`,
      );
      write(
        `${root}/config/environment.ts`,
        `import { Trails } from "@blazetrails/trailties";

await import("./application.ts");

await Trails.application.initializeBang();
export default Trails.application;
`,
      );
      write(
        `${root}/config/routes.ts`,
        `import { Trails } from "@blazetrails/trailties";
${record.split("\n")[0]}
Trails.application.routes().draw(function () {
  this.get("/up", { to: "pings#show" });
});
`,
      );
      write(`${root}/config/environments/production.ts`, record);
      write(`${root}/config/initializers/inflections.ts`, record);
      write(`${root}/db/seeds.ts`, record);
      write(`${engineRoot}/lib/.keep`, "");
      write(`${engineRoot}/config/routes.ts`, record);
      write(`${engineRoot}/config/initializers/blog.ts`, record);
      write(
        `${root}/boot.mjs`,
        `const { default: app } = await import("./.trails/entry.generated.js");
const drawn = [...globalThis.__loaded];
await app.loadSeed();
console.log(JSON.stringify({ drawn, loaded: globalThis.__loaded }));
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

      const boot = File.read(`${root}/.trails/boot.generated.js`);
      for (const rel of ["../blog/config/routes.ts", "../blog/config/initializers/blog.ts"]) {
        expect(boot).toContain(`${JSON.stringify(rel)}: () => import("../${rel}"),`);
      }

      const [stdout, stderr] = await Open3.capture3(env, node, `${root}/boot.mjs`);
      expect(stderr).toBe("");
      const { drawn, loaded } = JSON.parse(String(stdout).trim().split("\n").at(-1)!);
      const files = (urls: string[]) =>
        urls.map((url) => getPath().relative!(root, decodeURIComponent(new URL(url).pathname)));
      expect(loaded.every((url: string) => !url.includes("?"))).toBe(true);
      expect(files(drawn).sort()).toEqual(
        [
          "../blog/config/initializers/blog.ts",
          "../blog/config/routes.ts",
          "config/environments/production.ts",
          "config/initializers/inflections.ts",
          "config/routes.ts",
        ].sort(),
      );
      expect(files(loaded).at(-1)).toBe("db/seeds.ts");
    } finally {
      FileUtils.rmRf(base);
    }
  }, 120_000);
});
