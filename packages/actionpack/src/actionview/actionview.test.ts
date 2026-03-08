import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  TemplateHandlerRegistry,
  InMemoryResolver,
  LookupContext,
  MissingTemplate,
  EjsHandler,
  Renderer,
} from "./index.js";
import type { TemplateHandler, RenderContext } from "./template-handler.js";

// ==========================================================================
// Register EJS handler for all tests
// ==========================================================================
beforeEach(() => {
  TemplateHandlerRegistry.clear();
  TemplateHandlerRegistry.register(new EjsHandler());
});

afterEach(() => {
  TemplateHandlerRegistry.clear();
});

// ==========================================================================
// action_view/template/handler_test.rb
// ==========================================================================
describe("ActionView::Template::Handler", () => {
  it("registers handler for extensions", () => {
    expect(TemplateHandlerRegistry.has("ejs")).toBe(true);
  });

  it("returns registered extensions", () => {
    expect(TemplateHandlerRegistry.extensions).toContain("ejs");
  });

  it("looks up handler by extension", () => {
    const handler = TemplateHandlerRegistry.handlerForExtension("ejs");
    expect(handler).toBeDefined();
    expect(handler!.extensions).toContain("ejs");
  });

  it("returns undefined for unregistered extension", () => {
    expect(TemplateHandlerRegistry.handlerForExtension("haml")).toBeUndefined();
  });

  it("first registered becomes default", () => {
    expect(TemplateHandlerRegistry.defaultExt).toBe("ejs");
  });

  it("setDefault changes the default", () => {
    class OtherHandler implements TemplateHandler {
      extensions = ["other"];
      render() { return ""; }
    }
    TemplateHandlerRegistry.register(new OtherHandler());
    TemplateHandlerRegistry.setDefault("other");
    expect(TemplateHandlerRegistry.defaultExt).toBe("other");
  });

  it("setDefault throws for unregistered extension", () => {
    expect(() => TemplateHandlerRegistry.setDefault("nope")).toThrow(/No handler registered/);
  });

  it("clear removes all handlers", () => {
    TemplateHandlerRegistry.clear();
    expect(TemplateHandlerRegistry.extensions).toEqual([]);
    expect(TemplateHandlerRegistry.defaultExt).toBeNull();
  });

  it("register multiple handlers", () => {
    class TsxHandler implements TemplateHandler {
      extensions = ["tsx", "jsx"];
      render() { return "<div/>"; }
    }
    TemplateHandlerRegistry.register(new TsxHandler());
    expect(TemplateHandlerRegistry.has("tsx")).toBe(true);
    expect(TemplateHandlerRegistry.has("jsx")).toBe(true);
  });
});

// ==========================================================================
// action_view/template/ejs_handler_test.rb
// ==========================================================================
describe("ActionView::EjsHandler", () => {
  const handler = new EjsHandler();
  const context: RenderContext = { controller: "test", action: "index", format: "html" };

  it("renders plain text", () => {
    expect(handler.render("Hello World", {}, context)).toBe("Hello World");
  });

  it("renders escaped expression", () => {
    expect(handler.render("<%= name %>", { name: "Dean" }, context)).toBe("Dean");
  });

  it("escapes HTML in escaped output", () => {
    const result = handler.render("<%= html %>", { html: "<script>alert('xss')</script>" }, context);
    expect(result).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("renders raw output with <%- %>", () => {
    const result = handler.render("<%- html %>", { html: "<b>bold</b>" }, context);
    expect(result).toBe("<b>bold</b>");
  });

  it("ignores comments", () => {
    expect(handler.render("<%# this is a comment %>Hello", {}, context)).toBe("Hello");
  });

  it("renders multiple expressions", () => {
    const result = handler.render("<%= first %> <%= last %>", { first: "Dean", last: "Marano" }, context);
    expect(result).toBe("Dean Marano");
  });

  it("handles undefined variables gracefully", () => {
    const result = handler.render("<%= missing %>", {}, context);
    expect(result).toBe("");
  });

  it("renders numbers", () => {
    expect(handler.render("<%= count %>", { count: 42 }, context)).toBe("42");
  });

  it("renders boolean", () => {
    expect(handler.render("<%= flag %>", { flag: true }, context)).toBe("true");
  });

  it("provides controller_name local", () => {
    const result = handler.render("<%= controller_name %>", {}, context);
    expect(result).toBe("test");
  });

  it("provides action_name local", () => {
    const result = handler.render("<%= action_name %>", {}, context);
    expect(result).toBe("index");
  });

  it("renders yield in layout context", () => {
    const layoutCtx: RenderContext = { ...context, yield: "<p>Content</p>" };
    const result = handler.render("<html><%- yield %></html>", {}, layoutCtx);
    expect(result).toBe("<html><p>Content</p></html>");
  });

  it("renders complex template", () => {
    const template = `<h1><%= title %></h1>
<ul>
<%- items %>
</ul>`;
    const result = handler.render(template, {
      title: "Posts",
      items: "<li>Post 1</li><li>Post 2</li>",
    }, context);
    expect(result).toContain("<h1>Posts</h1>");
    expect(result).toContain("<li>Post 1</li>");
  });

  it("renders ternary expressions", () => {
    const result = handler.render("<%= active ? 'yes' : 'no' %>", { active: true }, context);
    expect(result).toBe("yes");
  });

  it("renders arithmetic", () => {
    const result = handler.render("<%= a + b %>", { a: 2, b: 3 }, context);
    expect(result).toBe("5");
  });
});

// ==========================================================================
// action_view/resolver_test.rb
// ==========================================================================
describe("ActionView::InMemoryResolver", () => {
  let resolver: InMemoryResolver;

  beforeEach(() => {
    resolver = new InMemoryResolver();
  });

  it("stores and finds templates", () => {
    resolver.add("posts/index", "html", "ejs", "<h1>Posts</h1>");
    const template = resolver.find("index", "posts", "html", ["ejs"]);
    expect(template).not.toBeNull();
    expect(template!.source).toBe("<h1>Posts</h1>");
  });

  it("returns null for missing template", () => {
    expect(resolver.find("index", "posts", "html", ["ejs"])).toBeNull();
  });

  it("matches by extension", () => {
    resolver.add("posts/index", "html", "ejs", "<h1>EJS</h1>");
    expect(resolver.find("index", "posts", "html", ["tsx"])).toBeNull();
    expect(resolver.find("index", "posts", "html", ["ejs"])).not.toBeNull();
  });

  it("matches by format", () => {
    resolver.add("posts/index", "html", "ejs", "<h1>HTML</h1>");
    resolver.add("posts/index", "json", "ejs", '{"format":"json"}');
    const html = resolver.find("index", "posts", "html", ["ejs"]);
    const json = resolver.find("index", "posts", "json", ["ejs"]);
    expect(html!.source).toBe("<h1>HTML</h1>");
    expect(json!.source).toBe('{"format":"json"}');
  });

  it("falls back to wildcard format", () => {
    resolver.add("posts/index", "html", "ejs", "<h1>Fallback</h1>");
    // text format should fall back to html template
    const template = resolver.find("index", "posts", "text", ["ejs"]);
    expect(template).not.toBeNull();
    expect(template!.source).toBe("<h1>Fallback</h1>");
  });

  it("stores layout templates", () => {
    resolver.addLayout("application", "html", "ejs", "<html><%- yield %></html>");
    const layout = resolver.findLayout("application", "html", ["ejs"]);
    expect(layout).not.toBeNull();
    expect(layout!.isLayout).toBe(true);
    expect(layout!.source).toContain("yield");
  });

  it("stores partial templates", () => {
    resolver.addPartial("posts/form", "html", "ejs", "<form></form>");
    const partial = resolver.find("_form", "posts", "html", ["ejs"]);
    expect(partial).not.toBeNull();
    expect(partial!.source).toBe("<form></form>");
  });

  it("clear removes all templates", () => {
    resolver.add("posts/index", "html", "ejs", "test");
    resolver.clear();
    expect(resolver.find("index", "posts", "html", ["ejs"])).toBeNull();
  });

  it("template has correct metadata", () => {
    resolver.add("posts/show", "html", "ejs", "<h1>Show</h1>");
    const template = resolver.find("show", "posts", "html", ["ejs"]);
    expect(template!.identifier).toBe("posts/show");
    expect(template!.extension).toBe("ejs");
    expect(template!.format).toBe("html");
  });
});

// ==========================================================================
// action_view/lookup_context_test.rb
// ==========================================================================
describe("ActionView::LookupContext", () => {
  let ctx: LookupContext;
  let resolver: InMemoryResolver;

  beforeEach(() => {
    ctx = new LookupContext();
    resolver = new InMemoryResolver();
    ctx.addResolver(resolver);
  });

  it("finds template through resolver", () => {
    resolver.add("posts/index", "html", "ejs", "<h1>Posts</h1>");
    const template = ctx.findTemplate("index", "posts", "html");
    expect(template).not.toBeNull();
    expect(template!.source).toBe("<h1>Posts</h1>");
  });

  it("returns null for missing template", () => {
    expect(ctx.findTemplate("index", "posts", "html")).toBeNull();
  });

  it("finds layout template", () => {
    resolver.addLayout("application", "html", "ejs", "<html></html>");
    const layout = ctx.findLayout("application", "html");
    expect(layout).not.toBeNull();
    expect(layout!.isLayout).toBe(true);
  });

  it("finds partial template", () => {
    resolver.addPartial("posts/form", "html", "ejs", "<form></form>");
    const partial = ctx.findPartial("form", "posts", "html");
    expect(partial).not.toBeNull();
  });

  describe("render", () => {
    it("renders a template", async () => {
      resolver.add("posts/index", "html", "ejs", "<h1><%= title %></h1>");
      const output = await ctx.render("posts", "index", "html", { title: "All Posts" });
      expect(output).toBe("<h1>All Posts</h1>");
    });

    it("throws MissingTemplate when not found", async () => {
      await expect(ctx.render("posts", "missing", "html"))
        .rejects.toThrow(MissingTemplate);
    });

    it("MissingTemplate has metadata", async () => {
      try {
        await ctx.render("posts", "missing", "html");
      } catch (e) {
        const err = e as MissingTemplate;
        expect(err.controller).toBe("posts");
        expect(err.action).toBe("missing");
        expect(err.format).toBe("html");
      }
    });

    it("applies layout wrapping", async () => {
      resolver.add("posts/index", "html", "ejs", "<p>Content</p>");
      resolver.addLayout("application", "html", "ejs", "<html><%- yield %></html>");
      const output = await ctx.render("posts", "index", "html");
      expect(output).toBe("<html><p>Content</p></html>");
    });

    it("disables layout with layout: false", async () => {
      resolver.add("posts/index", "html", "ejs", "<p>Content</p>");
      resolver.addLayout("application", "html", "ejs", "<html><%- yield %></html>");
      const output = await ctx.render("posts", "index", "html", {}, { layout: false });
      expect(output).toBe("<p>Content</p>");
    });

    it("uses custom layout name", async () => {
      resolver.add("posts/index", "html", "ejs", "<p>Content</p>");
      resolver.addLayout("admin", "html", "ejs", "<div class='admin'><%- yield %></div>");
      const output = await ctx.render("posts", "index", "html", {}, { layout: "admin" });
      expect(output).toBe("<div class='admin'><p>Content</p></div>");
    });

    it("skips layout when layout template not found", async () => {
      resolver.add("posts/index", "html", "ejs", "<p>Content</p>");
      // No layout registered
      const output = await ctx.render("posts", "index", "html");
      expect(output).toBe("<p>Content</p>");
    });

    it("passes locals to template", async () => {
      resolver.add("posts/show", "html", "ejs", "<h1><%= post.title %></h1>");
      const output = await ctx.render("posts", "show", "html", {
        post: { title: "Hello World" },
      });
      expect(output).toBe("<h1>Hello World</h1>");
    });

    it("passes locals to layout", async () => {
      resolver.add("posts/index", "html", "ejs", "<p>inner</p>");
      resolver.addLayout("application", "html", "ejs", "<title><%= pageTitle %></title><%- yield %>");
      const output = await ctx.render("posts", "index", "html", { pageTitle: "My App" });
      expect(output).toBe("<title>My App</title><p>inner</p>");
    });
  });

  describe("renderPartial", () => {
    it("renders a partial", async () => {
      resolver.addPartial("posts/form", "html", "ejs", '<form><%= action %></form>');
      const output = await ctx.renderPartial("form", "posts", "html", { action: "/posts" });
      expect(output).toBe("<form>/posts</form>");
    });

    it("throws for missing partial", async () => {
      await expect(ctx.renderPartial("missing", "posts", "html"))
        .rejects.toThrow(MissingTemplate);
    });
  });

  describe("renderCollection", () => {
    it("renders each item with a partial", async () => {
      resolver.addPartial("posts/post", "html", "ejs", "<li><%= post.title %></li>");
      const output = await ctx.renderCollection(
        "post", "posts", "html",
        [{ title: "First" }, { title: "Second" }]
      );
      expect(output).toBe("<li>First</li><li>Second</li>");
    });

    it("provides counter variable", async () => {
      resolver.addPartial("posts/post", "html", "ejs", "<%= post_counter %>:");
      const output = await ctx.renderCollection(
        "post", "posts", "html",
        ["a", "b", "c"]
      );
      expect(output).toBe("0:1:2:");
    });

    it("provides iteration info", async () => {
      resolver.addPartial("posts/item", "html", "ejs",
        "<%= item_iteration.first ? 'FIRST' : '' %><%= item_iteration.last ? 'LAST' : '' %>");
      const output = await ctx.renderCollection(
        "item", "posts", "html",
        [1, 2, 3]
      );
      expect(output).toBe("FIRSTLAST");
    });

    it("uses custom as variable name", async () => {
      resolver.addPartial("posts/card", "html", "ejs", "<div><%= entry %></div>");
      const output = await ctx.renderCollection(
        "card", "posts", "html",
        ["A", "B"],
        "entry"
      );
      expect(output).toBe("<div>A</div><div>B</div>");
    });

    it("returns empty string for empty collection", async () => {
      resolver.addPartial("posts/post", "html", "ejs", "<li>nope</li>");
      const output = await ctx.renderCollection("post", "posts", "html", []);
      expect(output).toBe("");
    });
  });

  describe("multiple resolvers", () => {
    it("first resolver wins", async () => {
      const resolver2 = new InMemoryResolver();
      ctx.addResolver(resolver2);

      resolver.add("posts/index", "html", "ejs", "from first");
      resolver2.add("posts/index", "html", "ejs", "from second");

      const output = await ctx.render("posts", "index", "html", {}, { layout: false });
      expect(output).toBe("from first");
    });

    it("falls through to second resolver", async () => {
      const resolver2 = new InMemoryResolver();
      ctx.addResolver(resolver2);

      resolver2.add("posts/index", "html", "ejs", "from second");

      const output = await ctx.render("posts", "index", "html", {}, { layout: false });
      expect(output).toBe("from second");
    });
  });

  describe("setLayout", () => {
    it("changes default layout", async () => {
      resolver.add("posts/index", "html", "ejs", "content");
      resolver.addLayout("custom", "html", "ejs", "[<%- yield %>]");

      ctx.setLayout("custom");
      const output = await ctx.render("posts", "index", "html");
      expect(output).toBe("[content]");
    });

    it("disables layout with false", async () => {
      resolver.add("posts/index", "html", "ejs", "content");
      resolver.addLayout("application", "html", "ejs", "LAYOUT:<%- yield %>");

      ctx.setLayout(false);
      const output = await ctx.render("posts", "index", "html");
      expect(output).toBe("content");
    });
  });
});

// ==========================================================================
// action_controller/renderer_test.rb
// ==========================================================================
describe("ActionController::Renderer", () => {
  let ctx: LookupContext;
  let resolver: InMemoryResolver;

  beforeEach(() => {
    ctx = new LookupContext();
    resolver = new InMemoryResolver();
    ctx.addResolver(resolver);
    ctx.setLayout(false); // no layout by default for renderer tests
  });

  it("renders a template by action", async () => {
    resolver.add("posts/index", "html", "ejs", "<h1>Posts</h1>");
    const renderer = new Renderer(ctx, "posts");
    const output = await renderer.render("index");
    expect(output).toBe("<h1>Posts</h1>");
  });

  it("passes locals to template", async () => {
    resolver.add("posts/show", "html", "ejs", "<h1><%= title %></h1>");
    const renderer = new Renderer(ctx, "posts");
    const output = await renderer.render("show", { title: "My Post" });
    expect(output).toBe("<h1>My Post</h1>");
  });

  it("renders with layout", async () => {
    resolver.add("posts/index", "html", "ejs", "content");
    resolver.addLayout("application", "html", "ejs", "<html><%- yield %></html>");
    const renderer = new Renderer(ctx, "posts");
    const output = await renderer.render("index", {}, { layout: "application" });
    expect(output).toBe("<html>content</html>");
  });

  it("renders with json format", async () => {
    resolver.add("posts/index", "json", "ejs", '{"posts": []}');
    const renderer = new Renderer(ctx, "posts", { format: "json" });
    const output = await renderer.render("index");
    expect(output).toBe('{"posts": []}');
  });

  it("Renderer.for derives controller name", () => {
    class PostsController {
      static name = "PostsController";
      static lookupContext = ctx;
    }
    const renderer = Renderer.for(PostsController);
    expect(renderer).toBeInstanceOf(Renderer);
  });

  it("Renderer.for renders templates", async () => {
    resolver.add("posts/index", "html", "ejs", "via for");
    class PostsController {
      static name = "PostsController";
      static lookupContext = ctx;
    }
    const renderer = Renderer.for(PostsController);
    const output = await renderer.render("index");
    expect(output).toBe("via for");
  });

  it("withDefaults creates new renderer", async () => {
    resolver.add("posts/index", "json", "ejs", '{"ok":true}');
    const renderer = new Renderer(ctx, "posts");
    const jsonRenderer = renderer.withDefaults({ format: "json" });
    const output = await jsonRenderer.render("index");
    expect(output).toBe('{"ok":true}');
  });

  it("default locals are merged", async () => {
    resolver.add("posts/index", "html", "ejs", "<%= siteName %> - <%= title %>");
    const renderer = new Renderer(ctx, "posts", { locals: { siteName: "MySite" } });
    const output = await renderer.render("index", { title: "Posts" });
    expect(output).toBe("MySite - Posts");
  });

  it("renders partial", async () => {
    resolver.addPartial("posts/sidebar", "html", "ejs", "<aside>sidebar</aside>");
    const renderer = new Renderer(ctx, "posts");
    const output = await renderer.renderPartial("sidebar");
    expect(output).toBe("<aside>sidebar</aside>");
  });

  it("throws for missing template", async () => {
    const renderer = new Renderer(ctx, "posts");
    await expect(renderer.render("nonexistent")).rejects.toThrow(MissingTemplate);
  });
});

// ==========================================================================
// Custom handler registration (pluggability)
// ==========================================================================
describe("Custom TemplateHandler", () => {
  it("can register and use a custom handler", async () => {
    class MarkdownHandler implements TemplateHandler {
      extensions = ["md"];
      render(source: string): string {
        // Trivial markdown: just wrap in <p>
        return `<p>${source}</p>`;
      }
    }

    TemplateHandlerRegistry.register(new MarkdownHandler());

    const ctx = new LookupContext();
    const resolver = new InMemoryResolver();
    resolver.add("docs/readme", "html", "md", "Hello from Markdown");
    ctx.addResolver(resolver);
    ctx.setLayout(false);

    const output = await ctx.render("docs", "readme", "html");
    expect(output).toBe("<p>Hello from Markdown</p>");
  });

  it("can register async handler", async () => {
    class AsyncHandler implements TemplateHandler {
      extensions = ["async"];
      async render(source: string, locals: Record<string, unknown>): Promise<string> {
        await new Promise((r) => setTimeout(r, 1));
        return `ASYNC:${source}:${locals.name ?? ""}`;
      }
    }

    TemplateHandlerRegistry.register(new AsyncHandler());

    const ctx = new LookupContext();
    const resolver = new InMemoryResolver();
    resolver.add("test/hello", "html", "async", "template");
    ctx.addResolver(resolver);
    ctx.setLayout(false);

    const output = await ctx.render("test", "hello", "html", { name: "World" });
    expect(output).toBe("ASYNC:template:World");
  });

  it("handler receives render context", async () => {
    let receivedContext: RenderContext | null = null;

    class SpyHandler implements TemplateHandler {
      extensions = ["spy"];
      render(_source: string, _locals: Record<string, unknown>, context: RenderContext): string {
        receivedContext = context;
        return "spied";
      }
    }

    TemplateHandlerRegistry.register(new SpyHandler());

    const ctx = new LookupContext();
    const resolver = new InMemoryResolver();
    resolver.add("posts/show", "html", "spy", "source");
    ctx.addResolver(resolver);
    ctx.setLayout(false);

    await ctx.render("posts", "show", "html");
    expect(receivedContext).not.toBeNull();
    expect(receivedContext!.controller).toBe("posts");
    expect(receivedContext!.action).toBe("show");
    expect(receivedContext!.format).toBe("html");
  });

  it("layout handler receives yield in context", async () => {
    const calls: Array<{ source: string; yield?: string }> = [];

    class YieldHandler implements TemplateHandler {
      extensions = ["yld"];
      render(source: string, _locals: Record<string, unknown>, context: RenderContext): string {
        calls.push({ source, yield: context.yield });
        if (context.yield !== undefined) {
          return `wrapped:${context.yield}`;
        }
        return source;
      }
    }

    TemplateHandlerRegistry.register(new YieldHandler());

    const ctx = new LookupContext();
    const resolver = new InMemoryResolver();
    resolver.add("posts/index", "html", "yld", "inner");
    resolver.addLayout("application", "html", "yld", "layout");
    ctx.addResolver(resolver);

    const output = await ctx.render("posts", "index", "html");
    // First call: inner template, no yield
    expect(calls[0].source).toBe("inner");
    expect(calls[0].yield).toBeUndefined();
    // Second call: layout template, yield = rendered inner
    expect(calls[1].source).toBe("layout");
    expect(calls[1].yield).toBe("inner");
    expect(output).toBe("wrapped:inner");
  });
});
