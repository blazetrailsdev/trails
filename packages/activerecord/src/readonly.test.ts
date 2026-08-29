import { describe, it, expect, beforeAll } from "vitest";

import { fixtures } from "./test-fixtures.js";
import { registerModel } from "./associations.js";

import { Developer } from "./test-helpers/models/developer.js";
import { Person } from "./test-helpers/models/person.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Project } from "./test-helpers/models/project.js";
import "./test-helpers/models/reader.js";
import "./associations/collection-proxy.js";
import "./association-relation.js";

registerModel(Post);
registerModel(Comment);
registerModel(Project);

describe("ReadOnlyTest", () => {
  const { developers, people, posts } = fixtures([
    "developers",
    "people",
    "posts",
    "projects",
    "developersProjects",
    "readers",
    "comments",
  ]);

  beforeAll(async () => {
    await Promise.all([Developer, Person, Post].map((m) => m.first().catch(() => null)));
  });

  it("cant save readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBeFalsy();

    dev.readonlyBang();
    expect(dev.isReadonly()).toBeTruthy();

    (dev as Record<string, unknown>).name = "Luscious forbidden fruit.";
    expect(await dev.save()).toBeFalsy();
    (dev as Record<string, unknown>).name = "Forbidden.";

    const catchError = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (err: unknown) => err as Error,
      );
    let e = await catchError(dev.save());
    expect(e?.message).toBe("Developer is marked as readonly");
    e = await catchError(dev.saveBang());
    expect(e?.message).toBe("Developer is marked as readonly");
    e = await catchError(dev.destroy());
    expect(e?.message).toBe("Developer is marked as readonly");
  });

  it("cant touch readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBe(false);

    dev.readonlyBang();
    expect(dev.isReadonly()).toBe(true);

    await expect(dev.touch()).rejects.toThrow("Developer is marked as readonly");
  });

  it("cant touch readonly column", async () => {
    const person = await Person.find(people("michael").id);
    await expect(person.touch("born_at")).rejects.toThrow("born_at is marked as readonly");
  });

  it("cant update column readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBe(false);

    dev.readonlyBang();
    expect(dev.isReadonly()).toBe(true);

    await expect(dev.updateColumn("name", "New name")).rejects.toThrow(
      "Developer is marked as readonly",
    );
  });

  it("cant update columns readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBe(false);

    dev.readonlyBang();
    expect(dev.isReadonly()).toBe(true);

    await expect(dev.updateColumns({ name: "New name" })).rejects.toThrow(
      "Developer is marked as readonly",
    );
  });

  it("find with readonly option", async () => {
    for (const d of await Developer.all()) {
      expect(d.isReadonly()).toBe(false);
    }
    expect(Developer.all().isReadonly).toBeFalsy();
    for (const d of await Developer.all().readonly(false)) {
      expect(d.isReadonly()).toBe(false);
    }
    for (const d of await Developer.all().readonly(true)) {
      expect(d.isReadonly()).toBe(true);
    }
    for (const d of await Developer.all().readonly()) {
      expect(d.isReadonly()).toBe(true);
    }
    expect(Developer.all().readonly().isReadonly).toBe(true);
  });

  it("find with joins option does not imply readonly", async () => {
    for (const d of await Developer.joins("  ")) {
      expect(d.isReadonly()).toBe(false);
    }
    for (const d of await Developer.joins("  ").readonly(true)) {
      expect(d.isReadonly()).toBe(true);
    }
    for (const d of await Developer.joins(", projects")) {
      expect(d.isReadonly()).toBe(false);
    }
    for (const d of await Developer.joins(", projects").readonly(true)) {
      expect(d.isReadonly()).toBe(true);
    }
  });

  it("has many find readonly", async () => {
    const post = await Post.find(posts("welcome").id);
    expect(await (post as any).comments.isAny()).toBe(true);
    expect(await (post as any).comments.isAny((c: any) => c.isReadonly())).toBe(false);
    const arr = await (post as any).comments.toArray();
    expect(arr.some((c: any) => c.isReadonly())).toBe(false);
    const readonlyComments = await (post as any).comments.readonly(true).toArray();
    expect(readonlyComments.every((c: any) => c.isReadonly())).toBe(true);
  });

  it("has many with through is not implicitly marked readonly", async () => {
    const post = await Post.find(posts("welcome").id);
    const loaded: Person[] = await (post as any).people.toArray();
    expect(loaded.some((p) => p.isReadonly())).toBe(false);
  });

  it("has many with through is not implicitly marked readonly while finding by id", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person = await (post as any).people.find(people("michael").id);
    expect(person.isReadonly()).toBe(false);
  });

  it("has many with through is not implicitly marked readonly while finding first", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person | null = await (post as any).people.first();
    expect(person?.isReadonly()).toBe(false);
  });

  it("has many with through is not implicitly marked readonly while finding last", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person | null = await (post as any).people.last();
    expect(person?.isReadonly()).toBe(false);
  });

  it("readonly scoping", async () => {
    await Post.where("1=1").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(false);
      expect((await Post.readonly(true).find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });

    await Post.joins("   ").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(false);
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });

    await Post.joins(", developers").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(false);
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });

    await Post.readonly(true).scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });
  });

  it("association collection method missing scoping not readonly", async () => {
    const developer = await Developer.find(developers("david").id);
    const post = await Post.find(posts("welcome").id);

    expect((await (developer as any).projects.allAsMethod().first())?.isReadonly()).toBe(false);
    expect((await (developer as any).projects.allAsScope().first())?.isReadonly()).toBe(false);

    expect((await (post as any).comments.allAsMethod().first())?.isReadonly()).toBe(false);
    expect((await (post as any).comments.allAsScope().first())?.isReadonly()).toBe(false);
  });
});
