import { describe, it, expect } from "vitest";
import { Base, CollectionProxy, association, registerModel } from "../index.js";
import { HasMany } from "./builder/has-many.js";

import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment, OopsError } from "../test-helpers/models/comment.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Project } from "../test-helpers/models/project.js";

registerModel(Post);
registerModel(Comment);
registerModel(Developer);
registerModel(Project);

describe("AssociationsExtensionsTest", () => {
  const { posts, comments, developers, projects } = fixtures([
    "posts",
    "comments",
    "developers",
    "projects",
    "developersProjects",
  ]);
  it("extension on has many", async () => {
    const proxy = association(posts("welcome"), "comments") as unknown as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(comments("more_greetings").id);
  });

  it("proxy association after scoped", async () => {
    const post = posts("welcome");
    const proxy = association(post, "comments") as unknown as CollectionProxy & {
      theAssociation: () => { owner: Base; reflection: { name: string } };
    };
    expect(proxy).toBeInstanceOf(CollectionProxy);
    expect(proxy.theAssociation().owner).toBe(post);
    expect(proxy.theAssociation().reflection.name).toBe("comments");

    const scoped = proxy.where("1=1") as unknown as {
      theAssociation: () => { owner: Base; reflection: { name: string } };
    };
    expect(scoped.theAssociation().owner).toBe(post);
    expect(scoped.theAssociation().reflection.name).toBe("comments");
  });

  it("extension with dirty target", async () => {
    const proxy = association(posts("welcome"), "comments") as unknown as CollectionProxy & {
      withContent: (content: string) => Promise<Base | null>;
    };
    const comment = proxy.build({ body: "New comment" });
    expect(await proxy.withContent("New comment")).toBe(comment);
  });

  it("extension with scopes", async () => {
    const post = posts("welcome");
    const offsetScoped = (association(post, "comments") as any).offset(1) as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await offsetScoped.findMostRecent())!.id).toBe(comments("greetings").id);
    const namedScoped = (association(post, "comments") as any).notAgain() as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await namedScoped.findMostRecent())!.id).toBe(comments("greetings").id);
  });

  it("extension on habtm", async () => {
    const proxy = association(developers("david"), "projects") as unknown as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
  });

  it("named extension on habtm", async () => {
    const proxy = association(developers("david"), "projectsExtendedByName") as unknown as {
      findMostRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
  });

  it("named two extensions on habtm", async () => {
    const proxy = association(developers("david"), "projectsExtendedByNameTwice") as unknown as {
      findMostRecent: () => Promise<Base | null>;
      findLeastRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
    expect((await proxy.findLeastRecent())!.id).toBe(projects("active_record").id);
  });

  it("named extension and block on habtm", async () => {
    const proxy = association(developers("david"), "projectsExtendedByNameAndBlock") as unknown as {
      findMostRecent: () => Promise<Base | null>;
      findLeastRecent: () => Promise<Base | null>;
    };
    expect((await proxy.findMostRecent())!.id).toBe(projects("action_controller").id);
    expect((await proxy.findLeastRecent())!.id).toBe(projects("active_record").id);
  });

  it("association with default scope", async () => {
    const proxy = association(posts("welcome"), "comments") as unknown as {
      destroyAll: () => never;
    };
    expect(() => proxy.destroyAll()).toThrow(OopsError);
  });

  it.skip("marshalling extensions", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });
  it.skip("marshalling named extensions", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });
  it("extension name", () => {
    class Developer extends Base {}
    class BusinessDeveloper extends Base {}
    HasMany.defineExtensions(Developer, "associationName", () => {});
    HasMany.defineExtensions(BusinessDeveloper, "associationName", () => {});
    expect(
      (Developer as unknown as Record<string, unknown>).AssociationNameAssociationExtension,
    ).toBeTruthy();
    expect(
      (BusinessDeveloper as unknown as Record<string, unknown>).AssociationNameAssociationExtension,
    ).toBeTruthy();
  });
});
