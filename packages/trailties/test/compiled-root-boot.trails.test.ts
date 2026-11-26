import { Dir, File, FileUtils, Open3, getProcessAdapter } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

const record = "(globalThis.__stacks ??= []).push(new Error().stack);\nexport {};\n";

async function bootFixture(ext: "js" | "ts", { stale = false, recompiled = false } = {}) {
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
    write(
      `${root}/config/environments/production.${ext}`,
      `import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  this.config.enableReloading = false;
});
`,
    );
    write(`${root}/config/initializers/inflections.${ext}`, record);
    write(
      `${root}/app/controllers/pings-controller.${ext}`,
      `import { ActionController } from "@blazetrails/actionpack";

export class PingsController extends ActionController.Base {
  async show() {
    await this.render({ plain: "pong" });
  }
}
`,
    );
    write(
      `${root}/app/jobs/ping-job.${ext}`,
      `import { ActiveJob } from "@blazetrails/activejob";

export class PingJob extends ActiveJob.Base {
  async perform(word) {
    return \`performed \${word}\`;
  }
}
`,
    );
    write(
      `${root}/boot.mjs`,
      `import { Dir, TopLevel } from "@blazetrails/ruby-compat";
const scanned = [];
for (const name of ["children", "childrenAsync", "glob", "globAsync"]) {
  const original = Dir[name];
  Dir[name] = function (path, ...rest) {
    if (String(path).includes(\`\${import.meta.dirname}/app/\`)) scanned.push(String(path));
    return original.call(this, path, ...rest);
  };
}
const { MockRequest } = await import("@blazetrails/rack");
const app = (await import("./config/environment.${ext}")).default;
const response = await new MockRequest(app).get("/up");
const performed = await new TopLevel.PingJob("ping").performNow();
console.log(JSON.stringify({ stacks: globalThis.__stacks ?? [], scanned, status: response.status, body: response.body, performed }));
`,
    );
    const env = { TRAILS_ENV: "production", SECRET_KEY_BASE: "compiled-root" };
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
    if (recompiled) {
      const old = new Date(Date.now() - 60_000);
      await File.utimeAsync(old, old, `${root}/.trails/entry.generated.js`);
    }

    const flags = ext === "js" ? ["--no-experimental-strip-types"] : [];
    const [stdout, stderr] = await Open3.capture3(env, node, ...flags, `${root}/boot.mjs`);
    expect(stderr).toBe("");
    const { stacks, scanned, status, body, performed } = JSON.parse(
      String(stdout).trim().split("\n").at(-1)!,
    );
    expect([status, body, performed]).toEqual([200, "pong", "performed ping"]);
    return {
      root,
      stacks: stacks as string[],
      scanned: scanned as string[],
      cleanup: () => FileUtils.rmRf(base),
    };
  } catch (error) {
    FileUtils.rmRf(base);
    throw error;
  }
}

describe("a compiled root boots from trails build's entry", () => {
  it("loads config files through .trails/compiled when config.js has no config.ts", async () => {
    const { root, stacks, scanned, cleanup } = await bootFixture("js");
    try {
      expect(scanned).toEqual([]);
      expect(File.read(`${root}/.trails/boot.generated.js`)).toContain('"config/routes.js"');
      expect(stacks.length).toBe(2);
      expect(stacks.every((stack) => stack.includes("/.trails/compiled/config/"))).toBe(true);
    } finally {
      cleanup();
    }
  }, 120_000);

  it("ignores a stale entry beside a source tree and boots through the autoloader", async () => {
    const { stacks, scanned, cleanup } = await bootFixture("ts", { stale: true });
    try {
      expect(scanned).not.toEqual([]);
      expect(stacks.length).toBe(2);
      expect(stacks.some((stack) => stack.includes("/.trails/compiled/"))).toBe(false);
    } finally {
      cleanup();
    }
  }, 120_000);

  it("boots a compiled root through the autoloader when its entry is older than config.js", async () => {
    const { stacks, scanned, cleanup } = await bootFixture("js", { recompiled: true });
    try {
      expect(scanned).not.toEqual([]);
      expect(stacks.length).toBe(2);
      expect(stacks.some((stack) => stack.includes("/.trails/compiled/"))).toBe(false);
    } finally {
      cleanup();
    }
  }, 120_000);
});
