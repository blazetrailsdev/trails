import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import { GeneratorBase } from "./base.js";

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
    cwd: () => "/",
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
});
