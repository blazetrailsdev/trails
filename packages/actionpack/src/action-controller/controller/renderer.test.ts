import { beforeEach, describe, it } from "vitest";
import { assert, assertEqual } from "@blazetrails/activesupport";
import { URL } from "../../action-dispatch/http/url.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import {
  AccountsController,
  ApplicationController,
  CommentsController,
} from "../../test-helpers/abstract-unit.js";
import { TestRenderable } from "../../test-helpers/lib/test-renderable.js";
import { Base } from "../base.js";
import { Renderer } from "../renderer.js";

describe("RendererTest", () => {
  let _renderer: Renderer | undefined;

  beforeEach(() => {
    _renderer = undefined;
  });

  it("action controller base has a renderer", () => {
    assert(Base.renderer);
  });

  it("creating with a controller", () => {
    const controller = CommentsController;
    const renderer = Renderer.for(controller);

    assertEqual(controller, renderer.controller);
  });

  it("creating from a controller", () => {
    const controller = AccountsController;
    const renderer = controller.renderer;

    assertEqual(controller, renderer.controller);
  });

  it("creating with new defaults", async () => {
    const renderer = ApplicationController.renderer;

    const newDefaults = { https: true };
    const newRenderer = renderer.withDefaults(newDefaults).new();
    const content = await newRenderer.render({ inline: "<%= request.ssl %>" });

    assertEqual("true", content);
  });

  it("rendering with a class renderer", async () => {
    const renderer = ApplicationController.renderer;
    const content = await renderer.render({ template: "ruby-template" });

    assertEqual("Hello from Ruby code", content);
  });

  it("rendering with an instance renderer", async () => {
    const renderer = ApplicationController.renderer.new();
    const content = await renderer.render({ template: "test/hello-world" });

    assertEqual("Hello world!", content);
  });

  it("rendering with a controller class", async () => {
    assertEqual(
      "Hello world!",
      await (ApplicationController as unknown as Renderer).render("test/hello-world"),
    );
  });

  it("rendering with locals", async () => {
    const renderer = ApplicationController.renderer;
    const content = await renderer.render({
      template: "test/render_file_with_locals",
      locals: { secret: "bar" },
    });

    assertEqual("The secret is bar\n", content);
  });

  it("rendering with assigns", async () => {
    const renderer = ApplicationController.renderer;
    const content = await renderer.render({
      template: "test/render_file_with_ivar",
      assigns: { secret: "foo" },
    });

    assertEqual("The secret is foo\n", content);
  });

  it("render a renderable object", async () => {
    const renderer = ApplicationController.renderer;

    assertEqual("Hello, World!", await renderer.render(new TestRenderable()));
    assertEqual("Hello, World!", await renderer.render({ renderable: new TestRenderable() }));
  });

  it("rendering with custom env", async () => {
    const renderer = ApplicationController.renderer.new({ method: "post" });
    const content = await renderer.render({ inline: "<%= request.isPost() %>" });

    assertEqual("true", content);
  });

  it("rendering with custom env using a key that is not in RACK_KEY_TRANSLATION", async () => {
    const value = "warden is here";
    const renderer = ApplicationController.renderer.new({ warden: value });
    const content = await renderer.render({ inline: "<%= request.env['warden'] %>" });

    assertEqual(value, content);
  });

  it("rendering with defaults", async () => {
    const renderer = ApplicationController.renderer.new({ https: true });
    const content = await renderer.render({ inline: "<%= request.ssl %>" });

    assertEqual("true", content);
  });

  it("same defaults from the same controller", () => {
    const rendererDefaults = (controller: typeof Base) => controller.renderer.defaults;

    assertEqual(rendererDefaults(AccountsController), rendererDefaults(AccountsController));
    assertEqual(rendererDefaults(AccountsController), rendererDefaults(CommentsController));
  });

  it("rendering with different formats", async () => {
    const html = "Hello world!";
    const xml = "<p>Hello world!</p>\n";

    assertEqual(html, await render("respond-to/using-defaults"));
    assertEqual(xml, await render("respond-to/using-defaults", { formats: ":xml" }));
  });

  it("rendering with helpers", async () => {
    assertEqual("<p>1\n<br />2</p>", await render({ inline: '<%= simpleFormat("1\\n2") %>' }));
  });

  it("rendering with user specified defaults", async () => {
    Object.assign(renderer().defaults, { hello: "hello", https: true });
    const content = await renderer().new().render({ inline: "<%= request.ssl %>" });

    assertEqual("true", content);
  });

  it("return valid asset URL with defaults", async () => {
    const renderer = ApplicationController.renderer;
    const content = await renderer.render({ inline: "<%= assetUrl('asset.jpg') %>" });

    assertEqual("http://example.org/asset.jpg", content);
  });

  it("return valid asset URL when https is true", async () => {
    const renderer = ApplicationController.renderer.new({ https: true });
    const content = await renderer.render({ inline: "<%= assetUrl('asset.jpg') %>" });

    assertEqual("https://example.org/asset.jpg", content);
  });

  it("uses default_url_options from the controller's routes when env[:http_host] not specified", async () => {
    await withDefaultUrlOptions(
      { protocol: "https", host: "foo.example.com", port: 9001, scriptName: "/bar" },
      async () => {
        assertEqual(
          "https://foo.example.com:9001/bar/posts",
          await renderUrlFor({ controller: "posts" }),
        );
      },
    );
  });

  it("uses config.force_ssl when env[:http_host] not specified", async () => {
    await withDefaultUrlOptions({ host: "foo.example.com" }, async () => {
      await withForceSsl(undefined, async () => {
        assertEqual("https://foo.example.com/posts", await renderUrlFor({ controller: "posts" }));
      });
    });
  });

  it("can specify env[:https] when using default_url_options", async () => {
    await withDefaultUrlOptions({ host: "foo.example.com" }, async () => {
      _renderer = renderer().new({ https: true });
      assertEqual("https://foo.example.com/posts", await renderUrlFor({ controller: "posts" }));
    });
  });

  it("env[:https] overrides default_url_options[:protocol]", async () => {
    await withDefaultUrlOptions({ host: "foo.example.com", protocol: "https" }, async () => {
      _renderer = renderer().new({ https: false });
      assertEqual("http://foo.example.com/posts", await renderUrlFor({ controller: "posts" }));
    });
  });

  it("can specify env[:script_name] when using default_url_options", async () => {
    await withDefaultUrlOptions({ host: "foo.example.com" }, async () => {
      _renderer = renderer().new({ scriptName: "/bar" });
      assertEqual("http://foo.example.com/bar/posts", await renderUrlFor({ controller: "posts" }));
    });
  });

  it("env[:script_name] overrides default_url_options[:script_name]", async () => {
    await withDefaultUrlOptions({ host: "foo.example.com", scriptName: "/bar" }, async () => {
      _renderer = renderer().new({ scriptName: "" });
      assertEqual("http://foo.example.com/posts", await renderUrlFor({ controller: "posts" }));
    });
  });

  function renderer(): Renderer {
    return (_renderer ??= ApplicationController.renderer.new());
  }

  function render(...args: unknown[]): unknown {
    return renderer().render(...args);
  }

  function renderUrlFor(...args: unknown[]): unknown {
    return render({ inline: `<%= fullUrlFor(...${JSON.stringify(args)}) %>` });
  }

  async function withDefaultUrlOptions(
    defaultUrlOptions: Record<string, unknown>,
    block: () => Promise<void>,
  ): Promise<void> {
    const routes = renderer().controller._routes as unknown as RouteSet;
    const originalDefaultUrlOptions = routes.defaultUrlOptions;
    routes.defaultUrlOptions = defaultUrlOptions;
    try {
      await block();
    } finally {
      routes.defaultUrlOptions = originalDefaultUrlOptions;
      routes.defaultEnv();
    }
  }

  async function withForceSsl(forceSsl = true, block: () => Promise<void>): Promise<void> {
    const originalSecureProtocol = URL.secureProtocol;
    URL.secureProtocol = forceSsl;
    try {
      await block();
    } finally {
      URL.secureProtocol = originalSecureProtocol;
    }
  }
});
