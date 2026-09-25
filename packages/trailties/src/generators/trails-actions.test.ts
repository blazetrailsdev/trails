import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import { GeneratorBase } from "./base.js";
import { optimizeIndentation } from "./actions.js";

class TestGenerator extends GeneratorBase {}

const path: PathAdapter = {
  join: (...p) => p.filter(Boolean).join("/"),
  dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
  basename: (p) => p.split("/").pop()!,
  resolve: (...p) => p.filter(Boolean).join("/"),
  extname: (p) => (p.lastIndexOf(".") >= 0 ? p.slice(p.lastIndexOf(".")) : ""),
  isAbsolute: (p) => p.startsWith("/"),
  sep: "/",
};

let files: Map<string, string>;
let dirs: Set<string>;
let previousAdapter: string | null;

function install(): void {
  const fs = {
    exists: async (p: string) => files.has(p) || dirs.has(p),
    readFile: async (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p: string, c: string) => void files.set(p, c),
    mkdir: async (p: string) => void dirs.add(p),
  } as unknown as FsAdapter;
  registerFsAdapter("trails-actions-test", fs, path);
  previousAdapter = fsAdapterConfig.adapter;
  fsAdapterConfig.adapter = "trails-actions-test";
}

beforeEach(() => {
  files = new Map();
  dirs = new Set();
  install();
});

afterEach(() => {
  fsAdapterConfig.adapter = previousAdapter;
});

function makeGen(output: (m: string) => void = () => {}): TestGenerator {
  return new TestGenerator({ cwd: "/app", output });
}

describe("TrailsActions", () => {
  describe("pkg", () => {
    it("adds the dependency to package.json", async () => {
      files.set(
        "/app/package.json",
        JSON.stringify({ name: "app", dependencies: { existing: "1.0.0" } }, null, 2) + "\n",
      );
      await makeGen().pkg("left-pad", "^1.3.0");
      const json = JSON.parse(files.get("/app/package.json")!) as {
        dependencies: Record<string, string>;
      };
      expect(json.dependencies).toEqual({ existing: "1.0.0", "left-pad": "^1.3.0" });
    });

    it("defaults version to *", async () => {
      files.set("/app/package.json", JSON.stringify({ name: "app" }, null, 2) + "\n");
      await makeGen().pkg("left-pad");
      const json = JSON.parse(files.get("/app/package.json")!) as {
        dependencies: Record<string, string>;
      };
      expect(json.dependencies["left-pad"]).toBe("*");
    });

    it("rejects empty or whitespace-only package names", async () => {
      files.set("/app/package.json", JSON.stringify({ name: "app" }, null, 2) + "\n");
      await expect(makeGen().pkg("")).rejects.toThrow(/non-empty/);
      await expect(makeGen().pkg("   ")).rejects.toThrow(/non-empty/);
    });

    it("rejects prototype-pollution package names", async () => {
      files.set("/app/package.json", JSON.stringify({ name: "app" }, null, 2) + "\n");
      await expect(makeGen().pkg("__proto__")).rejects.toThrow(/invalid package name/);
      await expect(makeGen().pkg("constructor")).rejects.toThrow(/invalid package name/);
      await expect(makeGen().pkg("prototype")).rejects.toThrow(/invalid package name/);
    });

    it("throws a clear error when package.json is not a JSON object", async () => {
      files.set("/app/package.json", "[]\n");
      await expect(makeGen().pkg("left-pad")).rejects.toThrow(
        /package.json must be a JSON object, got array/,
      );
    });

    it("throws a clear error when dependencies is not an object", async () => {
      files.set(
        "/app/package.json",
        JSON.stringify({ name: "app", dependencies: "oops" }, null, 2) + "\n",
      );
      await expect(makeGen().pkg("left-pad")).rejects.toThrow(/must be an object/);
    });

    it("with dev option targets devDependencies", async () => {
      files.set("/app/package.json", JSON.stringify({ name: "app" }, null, 2) + "\n");
      await makeGen().pkg("vitest", "^3.0.0", { dev: true });
      const json = JSON.parse(files.get("/app/package.json")!) as {
        devDependencies: Record<string, string>;
      };
      expect(json.devDependencies.vitest).toBe("^3.0.0");
    });
  });

  describe("route", () => {
    const draw = `import type { Mapper } from "@blazetrails/actionpack";\n\nexport function drawRoutes(mapper: Mapper): void {\n`;

    it("injects code after the drawRoutes sentinel", async () => {
      files.set("/app/config/routes.ts", `${draw}  mapper.get("up");\n}\n`);
      await makeGen().route(`mapper.resources("posts");`);
      expect(files.get("/app/config/routes.ts")).toBe(
        `${draw}  mapper.resources("posts");\n  mapper.get("up");\n}\n`,
      );
    });

    it("does not inject code that is already present", async () => {
      files.set("/app/config/routes.ts", `${draw}}\n`);
      await makeGen().route(`mapper.resources("posts");`);
      await makeGen().route(`mapper.resources("posts");`);
      expect(files.get("/app/config/routes.ts")).toBe(`${draw}  mapper.resources("posts");\n}\n`);
    });

    it("wraps code in the given namespaces", async () => {
      files.set("/app/config/routes.ts", `${draw}}\n`);
      await makeGen().route(`mapper.resources("posts");`, { namespace: ["admin", "blog"] });
      expect(files.get("/app/config/routes.ts")).toBe(
        `${draw}  mapper.namespace("admin", () => {\n    mapper.namespace("blog", () => {\n      mapper.resources("posts");\n    });\n  });\n}\n`,
      );
    });

    it("injects into an existing namespace block", async () => {
      files.set(
        "/app/config/routes.ts",
        `${draw}  mapper.namespace("admin", () => {\n    mapper.resources("users");\n  });\n}\n`,
      );
      await makeGen().route(`mapper.resources("posts");`, { namespace: "admin" });
      expect(files.get("/app/config/routes.ts")).toBe(
        `${draw}  mapper.namespace("admin", () => {\n    mapper.resources("posts");\n    mapper.resources("users");\n  });\n}\n`,
      );
    });
  });

  describe("environment", () => {
    const app = `export class MyApp extends Application {\n  static {\n    this.config.loadDefaults("8.0");\n  }\n}\n`;
    const env = `Trails.application!.configure(function () {\n  this.config.eagerLoad = false;\n});\n`;

    it("injects code into application.ts after the class sentinel by default", async () => {
      files.set("/app/config/application.ts", app);
      await makeGen().environment(`this.config.logLevel = "debug";`);
      expect(files.get("/app/config/application.ts")).toBe(
        `export class MyApp extends Application {\n  static {\n    this.config.logLevel = "debug";\n    this.config.loadDefaults("8.0");\n  }\n}\n`,
      );
    });

    it("application is an alias of environment", async () => {
      files.set("/app/config/application.ts", app);
      await makeGen().application(`this.config.logLevel = "debug";`);
      expect(files.get("/app/config/application.ts")).toContain(
        `  static {\n    this.config.logLevel = "debug";\n`,
      );
    });

    it("injects after every occurrence of the sentinel, as Thor's gsub! does", async () => {
      files.set("/app/config/environments/production.ts", `${env}${env}`);
      await makeGen().environment(`this.config.logLevel = "warn";`, { env: "production" });
      expect(
        files.get("/app/config/environments/production.ts")!.match(/this\.config\.logLevel/g),
      ).toHaveLength(2);
    });

    it("rejects env names containing path separators or traversal segments", async () => {
      await expect(makeGen().environment(`x: 1,`, { env: "../evil" })).rejects.toThrow(
        /environment name must match/,
      );
      await expect(makeGen().environment(`x: 1,`, { env: "prod/extra" })).rejects.toThrow(
        /environment name must match/,
      );
    });

    it("with env option targets each env-specific config file", async () => {
      files.set("/app/config/environments/production.ts", env);
      files.set("/app/config/environments/test.ts", env);
      await makeGen().environment(`this.config.logLevel = "warn";`, {
        env: ["production", "test"],
      });
      for (const name of ["production", "test"]) {
        expect(files.get(`/app/config/environments/${name}.ts`)).toBe(
          `Trails.application!.configure(function () {\n  this.config.logLevel = "warn";\n  this.config.eagerLoad = false;\n});\n`,
        );
      }
    });
  });

  describe("initializer", () => {
    it("writes the file under config/initializers/", async () => {
      await makeGen().initializer("my-config.ts", `export const myConfig = { enabled: true };\n`);
      expect(files.get("/app/config/initializers/my-config.ts")).toBe(
        `export const myConfig = { enabled: true };\n`,
      );
      expect(dirs.has("/app/config/initializers")).toBe(true);
    });

    it("appends a trailing newline when missing", async () => {
      await makeGen().initializer("x.ts", "export const x = 1;");
      expect(files.get("/app/config/initializers/x.ts")).toBe("export const x = 1;\n");
    });

    it("rejects Ruby-shape source via assertNoRubySource", async () => {
      await expect(makeGen().initializer("bad.rb", "class Foo\nend\n")).rejects.toThrow(
        /Ruby-like source/,
      );
    });

    it("rejects filenames containing path separators or .. segments", async () => {
      await expect(makeGen().initializer("../evil.ts", "export {};")).rejects.toThrow(/leaf name/);
      await expect(makeGen().initializer("nested/x.ts", "export {};")).rejects.toThrow(/leaf name/);
    });

    it("rejects empty, ., and .. filenames", async () => {
      await expect(makeGen().initializer("", "export {};")).rejects.toThrow(/leaf name/);
      await expect(makeGen().initializer(".", "export {};")).rejects.toThrow(/leaf name/);
      await expect(makeGen().initializer("..", "export {};")).rejects.toThrow(/leaf name/);
    });
  });

  it('optimizeIndentation interpolates a nil value as Ruby\'s "#{nil}\\n" does', () => {
    expect(optimizeIndentation(null)).toBe("\n");
    expect(optimizeIndentation(undefined)).toBe("\n");
    expect(optimizeIndentation("  a\n    b\n", 2)).toBe("  a\n    b\n");
  });

  it("route and environment reject Ruby-shape source", async () => {
    await expect(makeGen().route("class Foo\nend")).rejects.toThrow(/Ruby-like source/);
    await expect(makeGen().environment("class Foo\nend")).rejects.toThrow(/Ruby-like source/);
  });
});
