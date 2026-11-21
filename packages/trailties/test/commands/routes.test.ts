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

  it("singular resource output in trails routes", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`this.resource("post");
    this.resource("user_permission");`),
    );

    expect(await t.runRoutesCommand(["-c", "PostController"])).toBe(
      `                        Prefix Verb   URI Pattern                                              Controller#Action
                      new_post GET    /post/new(.:format)                                      posts#new
                     edit_post GET    /post/edit(.:format)                                     posts#edit
                          post GET    /post(.:format)                                          posts#show
                               PATCH  /post(.:format)                                          posts#update
                               PUT    /post(.:format)                                          posts#update
                               DELETE /post(.:format)                                          posts#destroy
                               POST   /post(.:format)                                          posts#create
trails_postmark_inbound_emails POST   /trails/action_mailbox/postmark/inbound_emails(.:format) action_mailbox/ingresses/postmark/inbound_emails#create
`,
    );

    expect(await t.runRoutesCommand(["-c", "UserPermissionController"])).toBe(
      `              Prefix Verb   URI Pattern                     Controller#Action
 new_user_permission GET    /user_permission/new(.:format)  user_permissions#new
edit_user_permission GET    /user_permission/edit(.:format) user_permissions#edit
     user_permission GET    /user_permission(.:format)      user_permissions#show
                     PATCH  /user_permission(.:format)      user_permissions#update
                     PUT    /user_permission(.:format)      user_permissions#update
                     DELETE /user_permission(.:format)      user_permissions#destroy
                     POST   /user_permission(.:format)      user_permissions#create
`,
    );
  });

  it("trails routes with global search key", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`this.get("/cart", { to: "cart#show" });
    this.post("/cart", { to: "cart#create" });
    this.get("/basketballs", { to: "basketball#index" });`),
    );

    expect(await t.runRoutesCommand(["-g", "show"])).toBe(
      `                          Prefix Verb URI Pattern                                                                                        Controller#Action
                            cart GET  /cart(.:format)                                                                                    cart#show
  trails_conductor_inbound_email GET  /trails/conductor/action_mailbox/inbound_emails/:id(.:format)                                      trails/conductor/action_mailbox/inbound_emails#show
             trails_service_blob GET  /trails/active_storage/blobs/redirect/:signed_id/*filename(.:format)                               active_storage/blobs/redirect#show
       trails_service_blob_proxy GET  /trails/active_storage/blobs/proxy/:signed_id/*filename(.:format)                                  active_storage/blobs/proxy#show
                                 GET  /trails/active_storage/blobs/:signed_id/*filename(.:format)                                        active_storage/blobs/redirect#show
      trails_blob_representation GET  /trails/active_storage/representations/redirect/:signed_blob_id/:variation_key/*filename(.:format) active_storage/representations/redirect#show
trails_blob_representation_proxy GET  /trails/active_storage/representations/proxy/:signed_blob_id/:variation_key/*filename(.:format)    active_storage/representations/proxy#show
                                 GET  /trails/active_storage/representations/:signed_blob_id/:variation_key/*filename(.:format)          active_storage/representations/redirect#show
             trails_disk_service GET  /trails/active_storage/disk/:encoded_key/*filename(.:format)                                       active_storage/disk#show
`,
    );

    expect(await t.runRoutesCommand(["-g", "POST"])).toBe(
      `                                   Prefix Verb URI Pattern                                                             Controller#Action
                                          POST /cart(.:format)                                                         cart#create
           trails_postmark_inbound_emails POST /trails/action_mailbox/postmark/inbound_emails(.:format)                action_mailbox/ingresses/postmark/inbound_emails#create
              trails_relay_inbound_emails POST /trails/action_mailbox/relay/inbound_emails(.:format)                   action_mailbox/ingresses/relay/inbound_emails#create
           trails_sendgrid_inbound_emails POST /trails/action_mailbox/sendgrid/inbound_emails(.:format)                action_mailbox/ingresses/sendgrid/inbound_emails#create
           trails_mandrill_inbound_emails POST /trails/action_mailbox/mandrill/inbound_emails(.:format)                action_mailbox/ingresses/mandrill/inbound_emails#create
            trails_mailgun_inbound_emails POST /trails/action_mailbox/mailgun/inbound_emails/mime(.:format)            action_mailbox/ingresses/mailgun/inbound_emails#create
                                          POST /trails/conductor/action_mailbox/inbound_emails(.:format)               trails/conductor/action_mailbox/inbound_emails#create
   trails_conductor_inbound_email_sources POST /trails/conductor/action_mailbox/inbound_emails/sources(.:format)       trails/conductor/action_mailbox/inbound_emails/sources#create
   trails_conductor_inbound_email_reroute POST /trails/conductor/action_mailbox/:inbound_email_id/reroute(.:format)    trails/conductor/action_mailbox/reroutes#create
trails_conductor_inbound_email_incinerate POST /trails/conductor/action_mailbox/:inbound_email_id/incinerate(.:format) trails/conductor/action_mailbox/incinerates#create
                    trails_direct_uploads POST /trails/active_storage/direct_uploads(.:format)                         active_storage/direct_uploads#create
`,
    );

    expect(await t.runRoutesCommand(["-g", "basketballs"])).toBe(
      `     Prefix Verb URI Pattern            Controller#Action
basketballs GET  /basketballs(.:format) basketball#index
`,
    );
  });

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

  it("trails routes displays message when no routes are defined", async () => {
    await t.appFile("config/routes.ts", routes(""));

    expect(await t.runRoutesCommand()).toBe(
      `                                   Prefix Verb URI Pattern                                                                                        Controller#Action
           trails_postmark_inbound_emails POST /trails/action_mailbox/postmark/inbound_emails(.:format)                                           action_mailbox/ingresses/postmark/inbound_emails#create
              trails_relay_inbound_emails POST /trails/action_mailbox/relay/inbound_emails(.:format)                                              action_mailbox/ingresses/relay/inbound_emails#create
           trails_sendgrid_inbound_emails POST /trails/action_mailbox/sendgrid/inbound_emails(.:format)                                           action_mailbox/ingresses/sendgrid/inbound_emails#create
     trails_mandrill_inbound_health_check GET  /trails/action_mailbox/mandrill/inbound_emails(.:format)                                           action_mailbox/ingresses/mandrill/inbound_emails#healthCheck
           trails_mandrill_inbound_emails POST /trails/action_mailbox/mandrill/inbound_emails(.:format)                                           action_mailbox/ingresses/mandrill/inbound_emails#create
            trails_mailgun_inbound_emails POST /trails/action_mailbox/mailgun/inbound_emails/mime(.:format)                                       action_mailbox/ingresses/mailgun/inbound_emails#create
          trails_conductor_inbound_emails GET  /trails/conductor/action_mailbox/inbound_emails(.:format)                                          trails/conductor/action_mailbox/inbound_emails#index
                                          POST /trails/conductor/action_mailbox/inbound_emails(.:format)                                          trails/conductor/action_mailbox/inbound_emails#create
       new_trails_conductor_inbound_email GET  /trails/conductor/action_mailbox/inbound_emails/new(.:format)                                      trails/conductor/action_mailbox/inbound_emails#new
           trails_conductor_inbound_email GET  /trails/conductor/action_mailbox/inbound_emails/:id(.:format)                                      trails/conductor/action_mailbox/inbound_emails#show
new_trails_conductor_inbound_email_source GET  /trails/conductor/action_mailbox/inbound_emails/sources/new(.:format)                              trails/conductor/action_mailbox/inbound_emails/sources#new
   trails_conductor_inbound_email_sources POST /trails/conductor/action_mailbox/inbound_emails/sources(.:format)                                  trails/conductor/action_mailbox/inbound_emails/sources#create
   trails_conductor_inbound_email_reroute POST /trails/conductor/action_mailbox/:inbound_email_id/reroute(.:format)                               trails/conductor/action_mailbox/reroutes#create
trails_conductor_inbound_email_incinerate POST /trails/conductor/action_mailbox/:inbound_email_id/incinerate(.:format)                            trails/conductor/action_mailbox/incinerates#create
                      trails_service_blob GET  /trails/active_storage/blobs/redirect/:signed_id/*filename(.:format)                               active_storage/blobs/redirect#show
                trails_service_blob_proxy GET  /trails/active_storage/blobs/proxy/:signed_id/*filename(.:format)                                  active_storage/blobs/proxy#show
                                          GET  /trails/active_storage/blobs/:signed_id/*filename(.:format)                                        active_storage/blobs/redirect#show
               trails_blob_representation GET  /trails/active_storage/representations/redirect/:signed_blob_id/:variation_key/*filename(.:format) active_storage/representations/redirect#show
         trails_blob_representation_proxy GET  /trails/active_storage/representations/proxy/:signed_blob_id/:variation_key/*filename(.:format)    active_storage/representations/proxy#show
                                          GET  /trails/active_storage/representations/:signed_blob_id/:variation_key/*filename(.:format)          active_storage/representations/redirect#show
                      trails_disk_service GET  /trails/active_storage/disk/:encoded_key/*filename(.:format)                                       active_storage/disk#show
               update_trails_disk_service PUT  /trails/active_storage/disk/:encoded_token(.:format)                                               active_storage/disk#update
                    trails_direct_uploads POST /trails/active_storage/direct_uploads(.:format)                                                    active_storage/direct_uploads#create
`,
    );
  });
});
