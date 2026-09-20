import { describe, it, expect, beforeAll } from "vitest";
import { assertNotEmpty } from "@blazetrails/activesupport";

import { fixtures } from "./test-fixtures.js";
import { registerModel } from "./associations.js";
import { ActiveRecordError, ReadOnlyRecord } from "./errors.js";

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

  const catchError = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (err: unknown) => err as Error,
    );

  it("cant save readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBeFalsy();

    dev.readonlyBang();
    expect(dev.isReadonly()).toBeTruthy();

    await expect(
      (async () => {
        (dev as unknown as Record<string, unknown>).name = "Luscious forbidden fruit.";
        expect(await dev.save()).toBeFalsy();
        (dev as unknown as Record<string, unknown>).name = "Forbidden.";
      })(),
    ).resolves.not.toThrow();

    let e = null as Error | null;
    e = await catchError(dev.save());
    expect(() => {
      throw e;
    }).toThrow(ReadOnlyRecord);
    expect(e?.message).toBe("Developer is marked as readonly");
    e = await catchError(dev.saveBang());
    expect(() => {
      throw e;
    }).toThrow(ReadOnlyRecord);
    expect(e?.message).toBe("Developer is marked as readonly");
    e = await catchError(dev.destroy());
    expect(() => {
      throw e;
    }).toThrow(ReadOnlyRecord);
    expect(e?.message).toBe("Developer is marked as readonly");
  });

  it("cant touch readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBeFalsy();

    dev.readonlyBang();
    expect(dev.isReadonly()).toBeTruthy();

    const e = await catchError(dev.touch());
    expect(() => {
      throw e;
    }).toThrow(ReadOnlyRecord);
    expect(e?.message).toBe("Developer is marked as readonly");
  });

  it("cant touch readonly column", async () => {
    const person = await Person.find(people("michael").id);
    const e = await catchError(person.touch("born_at"));
    expect(() => {
      throw e;
    }).toThrow(ActiveRecordError);
    expect(e?.message).toBe("born_at is marked as readonly");
  });

  it("cant update column readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBeFalsy();

    dev.readonlyBang();
    expect(dev.isReadonly()).toBeTruthy();

    const e = await catchError(dev.updateColumn("name", "New name"));
    expect(() => {
      throw e;
    }).toThrow(ReadOnlyRecord);
    expect(e?.message).toBe("Developer is marked as readonly");
  });

  it("cant update columns readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBeFalsy();

    dev.readonlyBang();
    expect(dev.isReadonly()).toBeTruthy();

    const e = await catchError(dev.updateColumns({ name: "New name" }));
    expect(() => {
      throw e;
    }).toThrow(ReadOnlyRecord);
    expect(e?.message).toBe("Developer is marked as readonly");
  });

  it("find with readonly option", async () => {
    for (const d of await Developer.all()) {
      expect(d.isReadonly()).toBeFalsy();
    }
    expect(Developer.all().isReadonly).toBeFalsy();
    for (const d of await Developer.all().readonly(false)) {
      expect(d.isReadonly()).toBeFalsy();
    }
    for (const d of await Developer.all().readonly(true)) {
      expect(d.isReadonly()).toBeTruthy();
    }
    for (const d of await Developer.all().readonly()) {
      expect(d.isReadonly()).toBeTruthy();
    }
    expect(Developer.all().readonly().isReadonly).toBeTruthy();
  });

  it("find with joins option does not imply readonly", async () => {
    for (const d of await Developer.joins("  ")) {
      expect(d.isReadonly()).toBeFalsy();
    }
    for (const d of await Developer.joins("  ").readonly(true)) {
      expect(d.isReadonly()).toBeTruthy();
    }
    for (const d of await Developer.joins(", projects")) {
      expect(d.isReadonly()).toBeFalsy();
    }
    for (const d of await Developer.joins(", projects").readonly(true)) {
      expect(d.isReadonly()).toBeTruthy();
    }
  });

  it("has many find readonly", async () => {
    const post = await Post.find(posts("welcome").id);
    assertNotEmpty(await (post as any).comments.toArray());
    expect(await (post as any).comments.isAny((c: any) => c.isReadonly())).toBeFalsy();
    const arr = await (post as any).comments.toArray();
    expect(arr.some((c: any) => c.isReadonly())).toBeFalsy();
    const readonlyComments = await (post as any).comments.readonly(true).toArray();
    expect(readonlyComments.every((c: any) => c.isReadonly())).toBeTruthy();
  });

  it("has many with through is not implicitly marked readonly", async () => {
    const post = await Post.find(posts("welcome").id);
    const loaded: Person[] = await (post as any).people.toArray();
    expect(loaded).toBeTruthy();
    expect(loaded.some((p) => p.isReadonly())).toBeFalsy();
  });

  it("has many with through is not implicitly marked readonly while finding by id", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person = await (post as any).people.find(people("michael").id);
    expect(person.isReadonly()).toBeFalsy();
  });

  it("has many with through is not implicitly marked readonly while finding first", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person | null = await (post as any).people.first();
    expect(person?.isReadonly()).toBeFalsy();
  });

  it("has many with through is not implicitly marked readonly while finding last", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person | null = await (post as any).people.last();
    expect(person?.isReadonly()).toBeFalsy();
  });

  it("readonly scoping", async () => {
    await Post.where("1=1").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBeFalsy();
      expect((await Post.readonly(true).find(posts("welcome").id)).isReadonly()).toBeTruthy();
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBeFalsy();
    });

    await Post.joins("   ").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBeFalsy();
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBeTruthy();
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBeFalsy();
    });

    await Post.joins(", developers").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBeFalsy();
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBeTruthy();
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBeFalsy();
    });

    await Post.readonly(true).scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBeTruthy();
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBeTruthy();
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBeFalsy();
    });
  });

  it("association collection method missing scoping not readonly", async () => {
    const developer = await Developer.find(developers("david").id);
    const post = await Post.find(posts("welcome").id);

    expect((await (developer as any).projects.allAsMethod().first())?.isReadonly()).toBeFalsy();
    expect((await (developer as any).projects.allAsScope().first())?.isReadonly()).toBeFalsy();

    expect((await (post as any).comments.allAsMethod().first())?.isReadonly()).toBeFalsy();
    expect((await (post as any).comments.allAsScope().first())?.isReadonly()).toBeFalsy();
  });
});
