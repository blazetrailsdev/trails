import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { Request } from "../actiondispatch/request.js";
import { Response } from "../actiondispatch/response.js";
import {
  TemplateHandlerRegistry,
  InMemoryResolver,
  LookupContext,
  EjsHandler,
  MissingTemplate,
} from "../actionview/index.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}
function makeResponse(): Response { return new Response(); }

// ==========================================================================
// action_controller/render_template_test.rb
// ==========================================================================
describe("ActionController template rendering", () => {
  let resolver: InMemoryResolver;
  let ctx: LookupContext;

  beforeEach(() => {
    TemplateHandlerRegistry.clear();
    TemplateHandlerRegistry.register(new EjsHandler());
    resolver = new InMemoryResolver();
    ctx = new LookupContext();
    ctx.addResolver(resolver);
  });

  afterEach(() => {
    TemplateHandlerRegistry.clear();
  });

  it("render action template", async () => {
    resolver.add("template/index", "html", "ejs", "<h1>Index</h1>");

    class TemplateController extends Base {
      async index() {
        this.render({ action: "index" });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<h1>Index</h1>");
  });

  it("render action with locals", async () => {
    resolver.add("template/show", "html", "ejs", "<h1><%= title %></h1>");

    class TemplateController extends Base {
      async show() {
        this.render({ action: "show", locals: { title: "My Post" } });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("show", makeRequest(), makeResponse());
    expect(c.body).toBe("<h1>My Post</h1>");
  });

  it("render action with layout", async () => {
    resolver.add("template/index", "html", "ejs", "<p>Content</p>");
    resolver.addLayout("application", "html", "ejs", "<html><%- yield %></html>");

    class TemplateController extends Base {
      async index() {
        this.render({ action: "index" });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = "application";

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<html><p>Content</p></html>");
  });

  it("render action with layout: false disables layout", async () => {
    resolver.add("template/index", "html", "ejs", "<p>No layout</p>");
    resolver.addLayout("application", "html", "ejs", "<html><%- yield %></html>");

    class TemplateController extends Base {
      async index() {
        this.render({ action: "index", layout: false });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = "application";

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<p>No layout</p>");
  });

  it("render action with custom layout", async () => {
    resolver.add("template/index", "html", "ejs", "content");
    resolver.addLayout("admin", "html", "ejs", "<admin><%- yield %></admin>");

    class TemplateController extends Base {
      async index() {
        this.render({ action: "index", layout: "admin" });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<admin>content</admin>");
  });

  it("render partial", async () => {
    resolver.addPartial("template/sidebar", "html", "ejs", "<aside>Sidebar</aside>");

    class TemplateController extends Base {
      async index() {
        this.render({ partial: "sidebar" });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<aside>Sidebar</aside>");
  });

  it("render partial with locals", async () => {
    resolver.addPartial("template/item", "html", "ejs", "<li><%= name %></li>");

    class TemplateController extends Base {
      async index() {
        this.render({ partial: "item", locals: { name: "Widget" } });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<li>Widget</li>");
  });

  it("render collection with partial", async () => {
    resolver.addPartial("template/item", "html", "ejs", "<li><%= item %></li>");

    class TemplateController extends Base {
      async index() {
        this.render({ partial: "item", collection: ["A", "B", "C"] });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<li>A</li><li>B</li><li>C</li>");
  });

  it("render collection with as option", async () => {
    resolver.addPartial("template/card", "html", "ejs", "<div><%= post %></div>");

    class TemplateController extends Base {
      async index() {
        this.render({ partial: "card", collection: ["X", "Y"], as: "post" });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<div>X</div><div>Y</div>");
  });

  it("render sets content type to text/html", async () => {
    resolver.add("template/index", "html", "ejs", "hi");

    class TemplateController extends Base {
      async index() {
        this.render({ action: "index" });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.contentType).toBe("text/html; charset=utf-8");
  });

  it("render with custom status", async () => {
    resolver.add("template/error", "html", "ejs", "<h1>Error</h1>");

    class TemplateController extends Base {
      async show() {
        this.render({ action: "error", status: 404 });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await c.dispatch("show", makeRequest(), makeResponse());
    expect(c.status).toBe(404);
    expect(c.body).toBe("<h1>Error</h1>");
  });

  it("render missing template throws MissingTemplate", async () => {
    class TemplateController extends Base {
      async index() {
        this.render({ action: "nonexistent" });
      }
    }
    TemplateController.lookupContext = ctx;
    TemplateController.layout = false;

    const c = new TemplateController();
    await expect(c.dispatch("index", makeRequest(), makeResponse()))
      .rejects.toThrow(MissingTemplate);
  });

  it("render without lookupContext throws helpful error", async () => {
    class NoCtxController extends Base {
      async index() {
        this.render({ action: "index" });
      }
    }
    // Explicitly clear lookupContext
    NoCtxController.lookupContext = undefined;
    NoCtxController.layout = false;

    const c = new NoCtxController();
    await expect(c.dispatch("index", makeRequest(), makeResponse()))
      .rejects.toThrow(/No lookupContext configured/);
  });

  it("json render still works with lookupContext set", async () => {
    class TemplateController extends Base {
      async index() {
        this.render({ json: { ok: true } });
      }
    }
    TemplateController.lookupContext = ctx;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(JSON.parse(c.body)).toEqual({ ok: true });
  });

  it("plain render still works with lookupContext set", async () => {
    class TemplateController extends Base {
      async index() {
        this.render({ plain: "hello" });
      }
    }
    TemplateController.lookupContext = ctx;

    const c = new TemplateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("hello");
  });

  it("double render still throws with templates", async () => {
    resolver.add("template/index", "html", "ejs", "first");

    class TemplateController extends Base {
      async index() {
        this.render({ plain: "first" });
        this.render({ action: "index" });
      }
    }
    TemplateController.lookupContext = ctx;

    const c = new TemplateController();
    await expect(c.dispatch("index", makeRequest(), makeResponse()))
      .rejects.toThrow(/Render and\/or redirect/);
  });

  it("controller name derived from class name", async () => {
    resolver.add("posts/index", "html", "ejs", "<h1>Posts</h1>");

    class PostsController extends Base {
      async index() {
        this.render({ action: "index" });
      }
    }
    PostsController.lookupContext = ctx;
    PostsController.layout = false;

    const c = new PostsController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("<h1>Posts</h1>");
  });

  it("template has access to controller and action name", async () => {
    resolver.add("info/debug", "html", "ejs",
      "controller=<%= controller_name %> action=<%= action_name %>");

    class InfoController extends Base {
      async debug() {
        this.render({ action: "debug" });
      }
    }
    InfoController.lookupContext = ctx;
    InfoController.layout = false;

    const c = new InfoController();
    await c.dispatch("debug", makeRequest(), makeResponse());
    expect(c.body).toBe("controller=info action=debug");
  });
});
