import { describe, it, expect } from "vitest";
import type { FsAdapter, PathAdapter } from "@blazetrails/activesupport";
import { CreateMigration } from "./create-migration.js";

const path: PathAdapter = {
  join: (...p: string[]) => p.join("/"),
  dirname: (p: string) => p.split("/").slice(0, -1).join("/") || "/",
  basename: (p: string) => p.split("/").pop()!,
  resolve: (...p: string[]) => p.join("/"),
  extname: (p: string) => {
    const i = p.lastIndexOf(".");
    return i >= 0 ? p.slice(i) : "";
  },
  sep: "/",
};

function buildFs(initial: Record<string, string>): FsAdapter & {
  files: Record<string, string>;
  dirs: Set<string>;
} {
  const files = { ...initial };
  const dirs = new Set<string>();
  const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");
  for (const k of Object.keys(files)) dirs.add(dirOf(k));
  return {
    files,
    dirs,
    exists: async (p: string) => Object.hasOwn(files, p) || dirs.has(p),
    readFile: (async (p: string) => files[p]) as unknown as FsAdapter["readFile"],
    writeFile: async (p: string, c: string | Buffer | Uint8Array) => {
      files[p] = typeof c === "string" ? c : Buffer.from(c).toString("utf-8");
    },
    unlink: async (p: string) => {
      delete files[p];
    },
    mkdir: async (p: string) => {
      dirs.add(p);
    },
    readdir: async (p: string) =>
      Object.keys(files)
        .filter((f) => dirOf(f) === p)
        .map((f) => f.slice(p.length + 1)),
  } as FsAdapter & { files: Record<string, string>; dirs: Set<string> };
}

function buildHost(fs: FsAdapter, fileName: string, options: Record<string, boolean> = {}) {
  const log: string[] = [];
  return {
    fs,
    path,
    output: (m: string) => log.push(m),
    options,
    migrationFileName: fileName,
    relativeToOriginalDestinationRoot: (p: string) => p.replace(/^\/app\//, ""),
    log,
  };
}

describe("CreateMigration", () => {
  it("invoke writes a new migration and reports create", async () => {
    const fs = buildFs({});
    const host = buildHost(fs, "create_posts");
    const dest = "/app/db/migrate/20260101000000_create_posts.rb";
    const action = new CreateMigration(host, dest, "BODY");
    const result = await action.invoke();
    expect(result).toBe(dest);
    expect(fs.files[dest]).toBe("BODY");
    expect(host.log).toEqual(["      create  db/migrate/20260101000000_create_posts.rb"]);
  });

  it("invoke reports identical when content matches existing numbered migration", async () => {
    const fs = buildFs({
      "/app/db/migrate/20260101000000_create_posts.rb": "BODY",
    });
    const host = buildHost(fs, "create_posts");
    const action = new CreateMigration(
      host,
      "/app/db/migrate/20260102000000_create_posts.rb",
      "BODY",
    );
    const result = await action.invoke();
    expect(result).toBe("/app/db/migrate/20260101000000_create_posts.rb");
    expect(host.log[0]).toMatch(/identical/);
  });

  it("invoke with force replaces the existing migration", async () => {
    const fs = buildFs({
      "/app/db/migrate/20260101000000_create_posts.rb": "OLD",
    });
    const host = buildHost(fs, "create_posts", { force: true });
    const dest = "/app/db/migrate/20260102000000_create_posts.rb";
    const action = new CreateMigration(host, dest, "NEW");
    const result = await action.invoke();
    expect(result).toBe(dest);
    expect(fs.files["/app/db/migrate/20260101000000_create_posts.rb"]).toBeUndefined();
    expect(fs.files[dest]).toBe("NEW");
  });

  it("invoke with skip leaves the existing migration", async () => {
    const fs = buildFs({
      "/app/db/migrate/20260101000000_create_posts.rb": "OLD",
    });
    const host = buildHost(fs, "create_posts", { skip: true });
    const action = new CreateMigration(
      host,
      "/app/db/migrate/20260102000000_create_posts.rb",
      "NEW",
    );
    const result = await action.invoke();
    expect(result).toBe("/app/db/migrate/20260101000000_create_posts.rb");
    expect(host.log.some((m) => m.includes("skip"))).toBe(true);
  });

  it("invoke on conflict without force/skip raises", async () => {
    const fs = buildFs({
      "/app/db/migrate/20260101000000_create_posts.rb": "OLD",
    });
    const host = buildHost(fs, "create_posts");
    const action = new CreateMigration(
      host,
      "/app/db/migrate/20260102000000_create_posts.rb",
      "NEW",
    );
    await expect(action.invoke()).rejects.toThrow(/Another migration is already named/);
  });

  it("revoke removes the existing migration", async () => {
    const fs = buildFs({
      "/app/db/migrate/20260101000000_create_posts.rb": "OLD",
    });
    const host = buildHost(fs, "create_posts");
    const action = new CreateMigration(
      host,
      "/app/db/migrate/20260102000000_create_posts.rb",
      "NEW",
    );
    const removed = await action.revoke();
    expect(removed).toBe("/app/db/migrate/20260101000000_create_posts.rb");
    expect(fs.files["/app/db/migrate/20260101000000_create_posts.rb"]).toBeUndefined();
  });

  it("pretend does not write to the filesystem", async () => {
    const fs = buildFs({});
    const host = buildHost(fs, "create_posts", { pretend: true });
    const dest = "/app/db/migrate/20260101000000_create_posts.rb";
    await new CreateMigration(host, dest, "BODY").invoke();
    expect(fs.files[dest]).toBeUndefined();
  });
});
