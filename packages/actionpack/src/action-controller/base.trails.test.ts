import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  Base as ViewBase,
  FixtureResolver,
  MissingTemplate,
  TemplateHandlers,
} from "@blazetrails/actionview";
import { Model } from "@blazetrails/activemodel";
import {
  extend,
  Module,
  rbObjRespondTo,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";

import { include } from "@blazetrails/activesupport";

import { Base } from "./base.js";
import { API } from "./api.js";
import { Metal } from "./metal.js";
import { Cookies } from "./metal/cookies.js";
import { Helpers, setHelpersPath } from "./metal/helpers.js";
import type { HelpersClass } from "../abstract-controller/helpers.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";

class ApplicationController extends Base {}

class BadgeController extends ApplicationController {
  async show(): Promise<void> {
    await this.render({ partial: "shared/status-badge", locals: { status: "ready" } });
  }

  async row(): Promise<void> {
    await this.render({ partial: "row" });
  }

  async footer(): Promise<void> {
    await this.render({ partial: "footer" });
  }
}

function makeRequest(): Request {
  return new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" });
}

beforeAll(() => {
  TemplateHandlers.registerTemplateHandler("html", {
    call: (_template: unknown, source: string) => `return ${JSON.stringify(source)};`,
  });
  BadgeController.prependViewPath(
    new FixtureResolver({
      "shared/_status-badge.html.html": "badge",
      "badge/_row.html.html": "row",
      "application/_footer.html.html": "footer",
    }),
  );
});

describe("ActionController::Base render partial:", () => {
  it("resolves a qualified partial name from a controller whose path is unrelated", async () => {
    const c = new BadgeController();
    await c.dispatch("show", makeRequest(), new Response());
    expect(c.responseBody).toBe("badge");
  });

  it("resolves an unqualified partial against the controller's prefix", async () => {
    const c = new BadgeController();
    await c.dispatch("row", makeRequest(), new Response());
    expect(c.responseBody).toBe("row");
  });

  it("reaches a partial in app/views/application from a subclass", async () => {
    const c = new BadgeController();
    await c.dispatch("footer", makeRequest(), new Response());
    expect(c.responseBody).toBe("footer");
  });
});

describe("ActionController::Cookies#cookies", () => {
  class CookiesController extends ApplicationController {
    async authenticate(): Promise<void> {
      this.cookies().set("user_name", "david");
      this.head("ok");
    }
  }

  it("is the request's cookie jar, reachable as a view helper", async () => {
    const request = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_COOKIE: "flavor=oatmeal",
    });
    const controller = new CookiesController();
    await controller.dispatch("authenticate", request, new Response());
    expect(controller.cookies()).toBe(request.cookieJar());
    expect(controller.cookies().get("flavor")).toBe("oatmeal");
    expect(request.cookieJar().get("user_name")).toBe("david");
    expect((CookiesController as unknown as { _helperMethods: string[] })._helperMethods).toContain(
      "cookies",
    );
  });

  it("skips helper_method on a controller without AbstractController::Helpers", () => {
    class CookiesMetal extends Metal {}
    expect(rbObjRespondTo(CookiesMetal, "helperMethod", true)).toBe(false);
    include(CookiesMetal, Cookies);
    expect(Object.hasOwn(CookiesMetal, "_helperMethods")).toBe(false);
    expect(rbObjRespondTo(Base, "helperMethod", true)).toBe(true);
  });
});

describe("anonymous? for a class JS names after its binding (anonymous.rb:27-29)", () => {
  it("constructs a controller class bound to a lowercase local", () => {
    const klass = class extends Base {};
    expect(klass.name).toBe("klass");
    expect(() => new klass()).not.toThrow();
    expect(klass.controllerName()).toBeNull();

    const PostsController = class extends Base {};
    expect(PostsController.controllerName()).toBe("posts");
  });

  it("names a class expression a constant seat paths", () => {
    const seated = class extends Base {};
    registerConstant("SeatedController", seated);
    try {
      expect(() => new seated()).not.toThrow();
      expect(seated.controllerName()).toBe("seated");
    } finally {
      unregisterConstant("SeatedController", seated);
    }
  });
});

describe("ActionController::Base#respond_to?", () => {
  class BackController extends ApplicationController {
    back = "";
    async show(): Promise<void> {
      this.back = this.viewContext().urlFor(":back");
      this.head("ok");
    }
  }

  it("answers respond_to? without negotiating MimeResponds#respond_to", async () => {
    const controller = new BackController();
    await controller.dispatch("show", makeRequest(), new Response());
    expect(rbObjRespondTo(controller, "request")).toBe(true);
  });

  it("lets the view context answer url_for(:back) with the referer", async () => {
    const request = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_REFERER: "http://localhost/previous",
    });
    const controller = new BackController();
    await controller.dispatch("show", request, new Response());
    expect(controller.back).toBe("http://localhost/previous");
  });
});

describe("ActionController::Streaming#_render_template", () => {
  class StreamController extends ApplicationController {
    async show(): Promise<void> {
      await this.render({ partial: "row", stream: true });
    }
  }
  StreamController.prependViewPath(
    new FixtureResolver({ "stream/_row.html.html": "streamed row" }),
  );

  it("renders a stream: true template through view_renderer.render_body with no-cache", async () => {
    const controller = new StreamController();
    const renderBody = vi.spyOn(controller.viewRenderer(), "renderBody");
    await controller.dispatch("show", makeRequest(), new Response());
    expect(renderBody).toHaveBeenCalledOnce();
    expect(controller.responseBody).toBe("streamed row");
    expect(controller.response.getHeader("cache-control")).toBe("no-cache");
  });
});

describe("ActionController::Base bare render", () => {
  class BareController extends ApplicationController {
    async index(): Promise<void> {
      await this.render();
    }
  }

  it("raises MissingTemplate for a bare render with no view paths", async () => {
    await expect(
      new BareController().dispatch("index", makeRequest(), new Response()),
    ).rejects.toBeInstanceOf(MissingTemplate);
  });
});

describe("ActionView::ViewPaths.local_prefixes (view_paths.rb:73-77)", () => {
  class HyphenatedController extends ApplicationController {
    static localPrefixes(): string[] {
      return [this.controllerPath().replace(/_/g, "-")];
    }
  }

  class RfcPagesController extends HyphenatedController {
    async show(): Promise<void> {
      await this.render();
    }
  }

  beforeAll(() => {
    RfcPagesController.prependViewPath(
      new FixtureResolver({ "rfc-pages/show.html.html": "from rfc-pages" }),
    );
  });

  it("renders from the prefix an overriding controller names", async () => {
    const c = new RfcPagesController();
    await c.dispatch("show", makeRequest(), new Response());
    expect(c.responseBody).toBe("from rfc-pages");
  });

  it("stops the prefix chain at ActionController::Base, which is abstract (base.rb:208)", () => {
    class PlainController extends ApplicationController {}
    expect([
      Base.isAbstract(),
      Metal.isAbstract(),
      API.isAbstract(),
      ApplicationController.isAbstract(),
    ]).toEqual([true, true, true, false]);
    expect(PlainController._prefixes()).toEqual(["plain", "application"]);
  });

  it("leaves controller_path, which routes and tests read, as Rails derives it", () => {
    expect(RfcPagesController.controllerPath()).toBe("rfc_pages");
    expect(RfcPagesController._prefixes()[0]).toBe("rfc-pages");
  });
});

describe("ActionView::Helpers::ControllerHelper#assign_controller", () => {
  class Post extends Model {}

  class PostsController extends ApplicationController {
    builder: unknown = null;
    async new(): Promise<void> {
      this.viewContext().formWith({ model: new Post(), url: "/posts" }, (f) => {
        this.builder = f;
      });
      this.head("ok");
    }
  }

  it("calls the controller's default_form_builder reader for formWith({ model })", async () => {
    const controller = new PostsController();
    await controller.dispatch("new", makeRequest(), new Response());
    expect((controller.builder as object).constructor).toBe(
      (ViewBase as unknown as { defaultFormBuilder: unknown }).defaultFormBuilder,
    );
  });
});

describe("ActionController::ConditionalGet (conditional_get.rb:137-155,290-303)", () => {
  it("expiresIn merges into the response cache-control hash and renders it on commit", async () => {
    class ExpiresController extends Base {
      async index() {
        this.noStore();
        this.expiresIn(3600, { staleWhileRevalidate: 60, immutable: true, "s-maxage": 10 });
        await this.render({ plain: "ok" });
      }
    }
    const c = new ExpiresController();
    await c.dispatch("index", makeRequest(), new Response());
    expect(c.headers.get("cache-control")).toBe(
      "max-age=3600, private, stale-while-revalidate=60, immutable, s-maxage=10",
    );
    expect(c.headers.get("date")).toMatch(/ GMT$/);
  });

  it("freshWhen merges the cacheControl option", async () => {
    class CcController extends Base {
      async index() {
        await this.freshWhen(null, { etag: "v1", public: true, cacheControl: { noCache: true } });
        if (!this.performed) await this.render({ plain: "ok" });
      }
    }
    const c = new CcController();
    await c.dispatch("index", makeRequest(), new Response());
    expect(c.headers.get("cache-control")).toBe("public, no-cache");
  });

  it("freshWhen awaits a relation's maximum(:updated_at)", async () => {
    const updatedAt = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));
    const relation = {
      cacheKey: "posts/query-1",
      maximum: async (attribute: string) => (attribute === "updatedAt" ? updatedAt : null),
    };
    class RelationController extends Base {
      async index() {
        if (await this.isStale(relation)) await this.render({ plain: "ok" });
      }
    }
    const c = new RelationController();
    await c.dispatch("index", makeRequest(), new Response());
    expect(c.headers.get("last-modified")).toBe(updatedAt.toUTCString());
  });
});

describe("ActionController::ConditionalGet#http_cache_forever (conditional_get.rb:316-322)", () => {
  class ForeverController extends Base {
    yielded = false;
    async index() {
      await this.httpCacheForever({ public: true }, () => (this.yielded = true));
      if (!this.performed) await this.render({ plain: "ok" });
    }
  }

  it("renders a hundred-year public immutable max-age and yields when stale", async () => {
    const c = new ForeverController();
    await c.dispatch("index", makeRequest(), new Response());
    expect(c.yielded).toBe(true);
    expect(c.headers.get("cache-control")).toBe("max-age=3155695200, public, immutable");
    expect(c.headers.get("etag")).toMatch(/^W\//);
  });

  it("answers 304 without yielding when the request is fresh", async () => {
    const first = new ForeverController();
    await first.dispatch("index", makeRequest(), new Response());
    const request = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_IF_NONE_MATCH: first.headers.get("etag")!,
      HTTP_IF_MODIFIED_SINCE: first.headers.get("last-modified")!,
    });
    const c = new ForeverController();
    await c.dispatch("index", request, new Response());
    expect(c.yielded).toBe(false);
    expect(c.status).toBe(304);
  });
});

describe("ActionController::Rescue#process_action (rescue.rb:26-31)", () => {
  it("process_action records show_detailed_exceptions? on the request env when rescuing", async () => {
    class BoomController extends Base {
      async index() {
        throw new RangeError("boom");
      }
    }
    BoomController.rescueFrom(RangeError, { with: () => {} });
    const c = new BoomController();
    const request = makeRequest();
    await c.dispatch("index", request, new Response());
    expect(request.env["action_dispatch.show_detailed_exceptions"]).toBe(false);
  });
});

describe("ActionController::Helpers included into ActionController::API", () => {
  it("carries helper, helpers and the class attributes onto a subclass", () => {
    const ApiWithHelper = new Module().include({ myHelper: () => "helper" });
    type WithHelpers = typeof API &
      HelpersClass & { helpers(): { myHelper(): string }; helpersPath: string[] };
    class WithHelpersController extends API {}
    include(WithHelpersController, Helpers);
    (WithHelpersController as unknown as WithHelpers).helper(ApiWithHelper);
    class SubclassWithHelpersController extends WithHelpersController {}

    const subclass = SubclassWithHelpersController as unknown as WithHelpers;
    expect(subclass.helpers().myHelper()).toBe("helper");
    expect(subclass.helpersPath).toEqual([]);
    expect(rbObjRespondTo(new SubclassWithHelpersController(), "helpers")).toBe(true);
    expect(rbObjRespondTo(API, "helper", true)).toBe(false);
  });

  it("fires the inherited hooks for a subclass: default helper module and helpersPath", () => {
    const helper = new Module().include({ probe: () => "probed" });
    registerConstant("ApiSubclassProbeHelper", helper);
    const paths = ["app/helpers"];
    setHelpersPath(paths);
    try {
      class ApiProbeWithHelpersController extends API {}
      include(ApiProbeWithHelpersController, Helpers);
      class ApiSubclassProbeController extends ApiProbeWithHelpersController {}
      new ApiSubclassProbeController();

      const subclass = ApiSubclassProbeController as unknown as HelpersClass & {
        helpersPath: string[];
      };
      expect(subclass.helpersPath).toBe(paths);
      expect(
        (ApiProbeWithHelpersController as unknown as { helpersPath: string[] }).helpersPath,
      ).toEqual([]);
      expect((extend({}, subclass._helpers) as Probe).probe()).toBe("probed");
    } finally {
      setHelpersPath([]);
      unregisterConstant("ApiSubclassProbeHelper", helper);
    }
  });
});

type Probe = Record<string, () => unknown>;

describe("AbstractController::Helpers::ClassMethods#inherited (helpers.rb:68-74)", () => {
  it("includes the controller's default helper module with no helper call", () => {
    registerConstant("DefaultHelperProbeHelper", new Module().include({ probe: () => "probed" }));
    class DefaultHelperProbeController extends Base {}
    new DefaultHelperProbeController();
    expect((extend({}, DefaultHelperProbeController._helpers) as Probe).probe()).toBe("probed");
  });

  it("leaves a controller with no matching helper constant unaffected", () => {
    class HelperlessProbeController extends Base {}
    expect(() => new HelperlessProbeController()).not.toThrow();
    expect("probe" in extend({}, HelperlessProbeController._helpers)).toBe(false);
  });

  it("keeps helpers a subclass declared before the hook fired", () => {
    class DeclaredProbeController extends Base {
      static {
        this.helper(new Module().include({ declared: () => "declared" }));
      }
    }
    new DeclaredProbeController();
    expect((extend({}, DeclaredProbeController._helpers) as Probe).declared()).toBe("declared");
  });

  it("skips an anonymous controller class", () => {
    registerConstant("KlassHelper", new Module().include({ leaked: () => "leaked" }));
    const klass = (() => class extends Base {})();
    new klass();
    expect("leaked" in extend({}, klass._helpers)).toBe(false);
  });
});
