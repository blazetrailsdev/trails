import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import type { ThorClass } from "@blazetrails/thor";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { lookupBang, subclasses } from "../../lib/command/behavior.js";
import { RoutesCommand } from "../../lib/commands/routes.js";

await lookupBang();

const classOptions = () => (RoutesCommand as unknown as ThorClass).classOptions();

describe("RoutesCommand", () => {
  it("is registered on the program", () => {
    expect(subclasses()).toContain(RoutesCommand);
  });

  it("does not register invokeCommand as a command", () => {
    expect(Object.keys((RoutesCommand as unknown as ThorClass).allCommands())).not.toContain(
      "invoke-command",
    );
  });

  it("has --grep option", () => {
    expect(classOptions().grep.switchName).toBe("--grep");
  });

  it("has the class options RoutesCommand declares", () => {
    expect(Object.values(classOptions()).map((o) => o.switchName)).toEqual(
      expect.arrayContaining(["--controller", "--grep", "--expanded"]),
    );
  });
});

const routes = (body: string): string => `
  import { Trails } from "@blazetrails/trailties";
  Trails.application!.routes().draw(function () {
    ${body}
  });
`;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface RoutesTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class RoutesTest extends TestCase {
  runRoutesCommand(args: string[] = []): Promise<string> {
    return this.trails("routes", args);
  }
}
include(RoutesTest, Isolation);

describe("Trails::Command::RoutesTest", { timeout: 120_000 }, () => {
  let t: RoutesTest;

  beforeEach(async () => {
    t = new RoutesTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("trails routes with matching path", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`this.resources("photos");
    this.get("/cart", { to: "cart#show" });
    this.post("/cart", { to: "cart#create" });
    this.get("/basketballs", { to: "basketball#index" });`),
    );

    expect(await t.runRoutesCommand(["-g", "/cart"])).toBe(
      `Prefix Verb URI Pattern     Controller#Action
  cart GET  /cart(.:format) cart#show
       POST /cart(.:format) cart#create
`,
    );

    expect(await t.runRoutesCommand(["-g", "basketballs"])).toBe(
      `     Prefix Verb URI Pattern            Controller#Action
basketballs GET  /basketballs(.:format) basketball#index
`,
    );

    expect(await t.runRoutesCommand(["-g", "/photos/7"])).toBe(
      `Prefix Verb   URI Pattern           Controller#Action
 photo GET    /photos/:id(.:format) photos#show
       PATCH  /photos/:id(.:format) photos#update
       PUT    /photos/:id(.:format) photos#update
       DELETE /photos/:id(.:format) photos#destroy
`,
    );

    expect(await t.runRoutesCommand(["-g", "/cats"])).toBe(
      `No routes were found for this grep pattern.
For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.
`,
    );
  });

  it("trails routes with controller search key", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`this.get("/cart", { to: "cart#show" });
    this.get("/basketball", { to: "basketball#index" });
    this.get("/user_permission", { to: "user_permission#index" });`),
    );

    const expectedCartOutput =
      "Prefix Verb URI Pattern     Controller#Action\n  cart GET  /cart(.:format) cart#show\n";
    let output = await t.runRoutesCommand(["-c", "cart"]);
    expect(output).toBe(expectedCartOutput);

    output = await t.runRoutesCommand(["-c", "Cart"]);
    expect(output).toBe(expectedCartOutput);

    output = await t.runRoutesCommand(["-c", "CartController"]);
    expect(output).toBe(expectedCartOutput);

    const expectedPermOutput = [
      "         Prefix Verb URI Pattern                Controller#Action",
      "user_permission GET  /user_permission(.:format) user_permission#index\n",
    ].join("\n");
    output = await t.runRoutesCommand(["-c", "user_permission"]);
    expect(output).toBe(expectedPermOutput);

    output = await t.runRoutesCommand(["-c", "UserPermission"]);
    expect(output).toBe(expectedPermOutput);

    output = await t.runRoutesCommand(["-c", "UserPermissionController"]);
    expect(output).toBe(expectedPermOutput);
  });

  it("trails routes with namespaced controller search key", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`this.namespace("admin", function () {
      this.resource("post");
      this.resource("user_permission");
    });`),
    );

    expect(await t.runRoutesCommand(["-c", "Admin::PostController"])).toBe(
      `         Prefix Verb   URI Pattern                Controller#Action
 new_admin_post GET    /admin/post/new(.:format)  admin/posts#new
edit_admin_post GET    /admin/post/edit(.:format) admin/posts#edit
     admin_post GET    /admin/post(.:format)      admin/posts#show
                PATCH  /admin/post(.:format)      admin/posts#update
                PUT    /admin/post(.:format)      admin/posts#update
                DELETE /admin/post(.:format)      admin/posts#destroy
                POST   /admin/post(.:format)      admin/posts#create
`,
    );

    expect(await t.runRoutesCommand(["-c", "PostController"])).toBe(
      `                        Prefix Verb   URI Pattern                                              Controller#Action
                new_admin_post GET    /admin/post/new(.:format)                                admin/posts#new
               edit_admin_post GET    /admin/post/edit(.:format)                               admin/posts#edit
                    admin_post GET    /admin/post(.:format)                                    admin/posts#show
                               PATCH  /admin/post(.:format)                                    admin/posts#update
                               PUT    /admin/post(.:format)                                    admin/posts#update
                               DELETE /admin/post(.:format)                                    admin/posts#destroy
                               POST   /admin/post(.:format)                                    admin/posts#create
trails_postmark_inbound_emails POST   /trails/action_mailbox/postmark/inbound_emails(.:format) action_mailbox/ingresses/postmark/inbound_emails#create
`,
    );

    const expectedPermissionOutput = `                    Prefix Verb   URI Pattern                           Controller#Action
 new_admin_user_permission GET    /admin/user_permission/new(.:format)  admin/user_permissions#new
edit_admin_user_permission GET    /admin/user_permission/edit(.:format) admin/user_permissions#edit
     admin_user_permission GET    /admin/user_permission(.:format)      admin/user_permissions#show
                           PATCH  /admin/user_permission(.:format)      admin/user_permissions#update
                           PUT    /admin/user_permission(.:format)      admin/user_permissions#update
                           DELETE /admin/user_permission(.:format)      admin/user_permissions#destroy
                           POST   /admin/user_permission(.:format)      admin/user_permissions#create
`;

    expect(await t.runRoutesCommand(["-c", "Admin::UserPermissionController"])).toBe(
      expectedPermissionOutput,
    );
    expect(await t.runRoutesCommand(["-c", "UserPermissionController"])).toBe(
      expectedPermissionOutput,
    );
  });
});
