import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerFsAdapter,
  fsAdapterConfig,
  registerChildProcessAdapter,
  childProcessAdapterConfig,
  type FsAdapter,
  type PathAdapter,
  type ChildProcessAdapter,
} from "@blazetrails/activesupport";
import {
  registerPackageManagerAdapter,
  packageManagerAdapterConfig,
  detectPackageManager,
  getPackageManager,
  packageManagerInstall,
} from "./package-manager.js";

let lockFiles: Set<string>;
let spawnCalls: Array<{ cmd: string; args: string[] }>;
let previousFs: string | null;
let previousCp: string | null;
let previousPm: string | null;

const stubFs = {
  existsSync: (p: string) => lockFiles.has(p),
} as unknown as FsAdapter;

const stubPath = {
  join: (...parts: string[]) => parts.join("/"),
} as unknown as PathAdapter;

const stubCp: ChildProcessAdapter = {
  spawnSync(cmd, args) {
    spawnCalls.push({ cmd, args });
    return { status: 0, signal: null, stdout: "", stderr: "" };
  },
};

beforeEach(() => {
  lockFiles = new Set();
  spawnCalls = [];
  registerFsAdapter("pm-test", stubFs, stubPath);
  registerChildProcessAdapter("pm-test", stubCp);
  previousFs = fsAdapterConfig.adapter;
  previousCp = childProcessAdapterConfig.adapter;
  previousPm = packageManagerAdapterConfig.adapter;
  fsAdapterConfig.adapter = "pm-test";
  childProcessAdapterConfig.adapter = "pm-test";
  packageManagerAdapterConfig.adapter = null;
});

afterEach(() => {
  fsAdapterConfig.adapter = previousFs;
  childProcessAdapterConfig.adapter = previousCp;
  packageManagerAdapterConfig.adapter = previousPm;
});

describe("detectPackageManager", () => {
  it("prefers pnpm when pnpm-lock.yaml is present", () => {
    lockFiles.add("/app/pnpm-lock.yaml");
    expect(detectPackageManager("/app").name).toBe("pnpm");
  });

  it("picks yarn when yarn.lock is present and no pnpm lock", () => {
    lockFiles.add("/app/yarn.lock");
    expect(detectPackageManager("/app").name).toBe("yarn");
  });

  it("picks bun when bun.lockb is present and no pnpm/yarn lock", () => {
    lockFiles.add("/app/bun.lockb");
    expect(detectPackageManager("/app").name).toBe("bun");
  });

  it("falls back to npm when no lockfile is present", () => {
    expect(detectPackageManager("/app").name).toBe("npm");
  });

  it("uses the fallback option when no lockfile is present", () => {
    expect(detectPackageManager("/app", { fallback: "pnpm" }).name).toBe("pnpm");
  });

  it("resolves pnpm before yarn when both lockfiles coexist", () => {
    lockFiles.add("/app/pnpm-lock.yaml");
    lockFiles.add("/app/yarn.lock");
    expect(detectPackageManager("/app").name).toBe("pnpm");
  });
});

describe("getPackageManager", () => {
  it("honors an explicit adapter override", () => {
    packageManagerAdapterConfig.adapter = "yarn";
    expect(getPackageManager("/app").name).toBe("yarn");
  });

  it("falls back to detection when no override is set", () => {
    lockFiles.add("/app/pnpm-lock.yaml");
    expect(getPackageManager("/app").name).toBe("pnpm");
  });

  it("throws when override names an unregistered adapter", () => {
    packageManagerAdapterConfig.adapter = "does-not-exist";
    expect(() => getPackageManager("/app")).toThrow(/is not registered/);
  });
});

describe("registerPackageManagerAdapter", () => {
  it("makes a custom adapter selectable via the override", () => {
    registerPackageManagerAdapter({
      name: "deno",
      installArgs: ["install"],
      addArgs: ["add"],
      runArgs: ["task"],
    });
    packageManagerAdapterConfig.adapter = "deno";
    expect(getPackageManager("/app").name).toBe("deno");
  });
});

describe("packageManagerInstall", () => {
  it("invokes the active package manager's install command in cwd", () => {
    packageManagerAdapterConfig.adapter = "npm";
    packageManagerInstall("/app");
    expect(spawnCalls).toEqual([{ cmd: "npm", args: ["install"] }]);
  });
});
