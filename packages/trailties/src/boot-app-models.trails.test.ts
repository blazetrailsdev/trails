import { afterEach, describe, expect, it } from "vitest";
import { rbFSend, rbModName, registeredConstant } from "@blazetrails/ruby-compat";
import type { RackResponse } from "@blazetrails/rack";
import type { Base } from "@blazetrails/activerecord";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("a generated app's models resolve string association targets", () => {
  afterEach(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("registers every app/models class so an association names its target by string", async () => {
    await import("./__fixtures__/boot-app/config/application.js");
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await Trails.initialize();

    const Post = registeredConstant("Post") as typeof Base;
    const Comment = registeredConstant("Comment") as typeof Base;
    expect(Post).toBeDefined();
    expect(Comment).toBeDefined();
    expect(Post.reflectOnAssociation("comments")!.klass).toBe(Comment);
    expect(Comment.reflectOnAssociation("post")!.klass).toBe(Post);
  }, 15_000);

  it("resolves a namespaced app class by its directory under app/<root>", async () => {
    const { BootApp } = await import("./__fixtures__/boot-app/config/application.js");
    class BootAppNamespaces extends BootApp {}
    Application.register(BootAppNamespaces);
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await Trails.initialize();

    const { User } = await import("./__fixtures__/boot-app/app/models/admin/user.js");
    const { Superuser } = await import("./__fixtures__/boot-app/app/models/admin/superuser.js");
    const { CleanupJob } = await import("./__fixtures__/boot-app/app/jobs/admin/cleanup-job.js");
    expect(registeredConstant("Admin::User")).toBe(User);
    expect(rbModName(User)).toBe("Admin::User");
    expect(rbModName(CleanupJob)).toBe("Admin::CleanupJob");
    expect(User.stiClassFor("Admin::Superuser")).toBe(Superuser);

    const [status, , body] = await (rbFSend(app.app(), "call", {
      REQUEST_METHOD: "GET",
      PATH_INFO: "/admin/users",
    }) as Promise<RackResponse>);
    expect(status).toBe(200);
    expect(JSON.parse([...(body as Iterable<string>)].join(""))).toEqual({ users: [] });
  }, 15_000);
});
