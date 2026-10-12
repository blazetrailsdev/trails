import { beforeEach, describe, it } from "vitest";
import { Conversion, ModelName, Naming } from "@blazetrails/activemodel";
import { assertEqual, assertRaises, Concern, extend, underscore } from "@blazetrails/activesupport";
import { include, merge, Module, NameError, rbFSend, RuntimeError } from "@blazetrails/ruby-compat";
import {
  Parameters,
  UnfilteredParameters,
} from "../../../action-controller/metal/strong-parameters.js";
import {
  HelperMethodBuilder,
  type PolymorphicHost,
  type ToModel,
} from "../../routing/polymorphic-routes.js";
import { RouteSet, type UrlHelpersModule } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import "../../../test-helpers/abstract-unit.js";

type Helper = (...args: unknown[]) => string;
type Direct =
  | "website"
  | "string"
  | "helper"
  | "linkable"
  | "nested"
  | "params"
  | "symbol"
  | "hash"
  | "array"
  | "options"
  | "defaults"
  | "browse";
type Helpers = Record<`${Direct}Path` | `${Direct}Url`, Helper>;

class Linkable {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  linkableType(): string {
    return underscore(this.constructor.name);
  }
}

class Category extends Linkable {}
class Collection extends Linkable {}
class Product extends Linkable {}
class Manufacturer extends Linkable {}

class Model {
  declare _modelName?: ModelName;
  declare readonly modelName: ModelName;
  declare toModel: Conversion["toModel"];
  readonly id: string | null;

  constructor(id: string | null = null) {
    this.id = id;
  }

  isPersisted(): boolean {
    return false;
  }
}
extend(Model, Naming);
include(Model, Conversion);
Object.defineProperty(Model.prototype, "modelName", {
  get(this: Model): ModelName {
    return (this._modelName ??= new ModelName(this.constructor, null, this.constructor.name));
  },
  configurable: true,
});

class Basket extends Model {}
class User extends Model {}
class Video extends Model {}

class Article {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }
}

class Page {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }
}

class CategoryPage extends Page {}
class ProductPage extends Page {}

const Routes = new RouteSet() as { urlHelpers(): UrlHelpersModule & Helpers } & RouteSet;
Routes.draw(function () {
  this.defaultUrlOptions = { host: "www.example.com" };

  this.root({ to: "pages#index" });
  this.get("/basket", { to: "basket#show", as: "basket" });
  this.get("/posts/:id", { to: "posts#show", as: "post" });
  this.get("/profile", { to: "users#profile", as: "profile" });
  this.get("/media/:id", { to: "media#show", as: "media" });
  this.get("/pages/:id", { to: "pages#show", as: "page" });

  this.resources("categories");
  this.resources("collections");
  this.resources("products");
  this.resources("manufacturers");

  this.namespace("admin", () => {
    this.get("/dashboard", { to: "dashboard#index" });
  });

  this.direct("website", undefined, () => "http://www.rubyonrails.org");
  this.direct("string", undefined, () => "http://www.rubyonrails.org");
  this.direct("helper", undefined, function () {
    return (this.basketUrl as Helper)();
  });
  this.direct("linkable", undefined, (linkable) => [
    `:${(linkable as Linkable).linkableType()}`,
    { id: (linkable as Linkable).id },
  ]);
  this.direct("nested", undefined, function (linkable) {
    return (this.routeFor as Helper)("linkable", linkable);
  });
  this.direct("params", undefined, (params) => params as Parameters);
  this.direct("symbol", undefined, () => ":basket");
  this.direct("hash", undefined, () => ({ controller: "basket", action: "show" }));
  this.direct("array", undefined, () => [":admin", ":dashboard"]);
  this.direct("options", undefined, (options) => [":products", options]);
  this.direct("defaults", { size: 10 }, (options) => [":products", options]);

  this.direct("browse", { page: 1, size: 10 }, function (options) {
    return [
      ":products",
      merge(
        options as Record<string, unknown>,
        (rbFSend(this, "params") as Parameters).permit("page", "size").toH(),
      ),
    ];
  });

  this.resolve("Article", (article: Article) => [":post", { id: article.id }]);
  this.resolve("Basket", (_basket: Basket) => [":basket"]);
  this.resolve("Manufacturer", function (this: { routeFor: Helper }, manufacturer: Manufacturer) {
    return this.routeFor("linkable", manufacturer);
  });
  this.resolve("User", { anchor: "details" }, (_user: User, options: object) => [
    ":profile",
    options,
  ]);
  this.resolve("Video", (video: Video) => [":media", { id: video.id }]);
  this.resolve(["Page", "CategoryPage", "ProductPage"], (page: Page) => [":page", { id: page.id }]);
});

const APP = IntegrationTest.buildApp(Routes);

class TestCustomUrlHelpers extends IntegrationTest {
  override get app(): unknown {
    return APP;
  }

  category!: Category;
  collection!: Collection;
  product!: Product;
  manufacturer!: ToModel;
  basket!: Basket;
  user!: User;
  video!: Video;
  article!: ToModel;
  page!: ToModel;
  categoryPage!: ToModel;
  productPage!: ToModel;
  pathParams!: Record<string, string>;
  unsafeParams!: Parameters;
  safeParams!: Parameters;

  static {
    this.prototype.setup = function (this: TestCustomUrlHelpers): void {
      this.category = new Category("1");
      this.collection = new Collection("2");
      this.product = new Product("3");
      this.manufacturer = new Manufacturer("apple") as unknown as ToModel;
      this.basket = new Basket();
      this.user = new User();
      this.video = new Video("4");
      this.article = new Article("5") as unknown as ToModel;
      this.page = new Page("6") as unknown as ToModel;
      this.categoryPage = new CategoryPage("7") as unknown as ToModel;
      this.productPage = new ProductPage("8") as unknown as ToModel;
      this.pathParams = { controller: "pages", action: "index" };
      this.unsafeParams = new Parameters(this.pathParams);
      this.safeParams = new Parameters(this.pathParams).permit("controller", "action");
    };
  }

  params(): Parameters {
    return new Parameters({ page: 2, size: 25 });
  }
}
include(TestCustomUrlHelpers, Routes.urlHelpers());

describe("TestCustomUrlHelpers", () => {
  let t: TestCustomUrlHelpers & PolymorphicHost & Helpers;
  beforeEach(({ task }) => {
    t = new TestCustomUrlHelpers(task.name) as TestCustomUrlHelpers & PolymorphicHost & Helpers;
    t.setup();
  });

  it("direct paths", async () => {
    assertEqual("/", t.websitePath());
    assertEqual("/", Routes.urlHelpers().websitePath());

    assertEqual("/", t.stringPath());
    assertEqual("/", Routes.urlHelpers().stringPath());

    assertEqual("/basket", t.helperPath());
    assertEqual("/basket", Routes.urlHelpers().helperPath());

    assertEqual("/categories/1", t.linkablePath(t.category));
    assertEqual("/categories/1", Routes.urlHelpers().linkablePath(t.category));
    assertEqual("/collections/2", t.linkablePath(t.collection));
    assertEqual("/collections/2", Routes.urlHelpers().linkablePath(t.collection));
    assertEqual("/products/3", t.linkablePath(t.product));
    assertEqual("/products/3", Routes.urlHelpers().linkablePath(t.product));

    assertEqual("/categories/1", t.nestedPath(t.category));
    assertEqual("/categories/1", Routes.urlHelpers().nestedPath(t.category));

    assertEqual("/", t.paramsPath(t.safeParams));
    assertEqual("/", Routes.urlHelpers().paramsPath(t.safeParams));
    await assertRaises([UnfilteredParameters], {}, () => t.paramsPath(t.unsafeParams));
    await assertRaises([UnfilteredParameters], {}, () =>
      Routes.urlHelpers().paramsPath(t.unsafeParams),
    );

    assertEqual("/basket", t.symbolPath());
    assertEqual("/basket", Routes.urlHelpers().symbolPath());
    assertEqual("/basket", t.hashPath());
    assertEqual("/basket", Routes.urlHelpers().hashPath());
    assertEqual("/admin/dashboard", t.arrayPath());
    assertEqual("/admin/dashboard", Routes.urlHelpers().arrayPath());

    assertEqual("/products?page=2", t.optionsPath({ page: 2 }));
    assertEqual("/products?page=2", Routes.urlHelpers().optionsPath({ page: 2 }));
    assertEqual("/products?size=10", t.defaultsPath());
    assertEqual("/products?size=10", Routes.urlHelpers().defaultsPath());
    assertEqual("/products?size=20", t.defaultsPath({ size: 20 }));
    assertEqual("/products?size=20", Routes.urlHelpers().defaultsPath({ size: 20 }));

    assertEqual("/products?page=2&size=25", t.browsePath());
    await assertRaises([NameError], {}, () => Routes.urlHelpers().browsePath());
  });

  it("direct urls", async () => {
    assertEqual("http://www.rubyonrails.org", t.websiteUrl());
    assertEqual("http://www.rubyonrails.org", Routes.urlHelpers().websiteUrl());

    assertEqual("http://www.rubyonrails.org", t.stringUrl());
    assertEqual("http://www.rubyonrails.org", Routes.urlHelpers().stringUrl());

    assertEqual("http://www.example.com/basket", t.helperUrl());
    assertEqual("http://www.example.com/basket", Routes.urlHelpers().helperUrl());

    assertEqual("http://www.example.com/categories/1", t.linkableUrl(t.category));
    assertEqual("http://www.example.com/categories/1", Routes.urlHelpers().linkableUrl(t.category));
    assertEqual("http://www.example.com/collections/2", t.linkableUrl(t.collection));
    assertEqual(
      "http://www.example.com/collections/2",
      Routes.urlHelpers().linkableUrl(t.collection),
    );
    assertEqual("http://www.example.com/products/3", t.linkableUrl(t.product));
    assertEqual("http://www.example.com/products/3", Routes.urlHelpers().linkableUrl(t.product));

    assertEqual("http://www.example.com/categories/1", t.nestedUrl(t.category));
    assertEqual("http://www.example.com/categories/1", Routes.urlHelpers().nestedUrl(t.category));

    assertEqual("http://www.example.com/", t.paramsUrl(t.safeParams));
    assertEqual("http://www.example.com/", Routes.urlHelpers().paramsUrl(t.safeParams));
    await assertRaises([UnfilteredParameters], {}, () => t.paramsUrl(t.unsafeParams));
    await assertRaises([UnfilteredParameters], {}, () =>
      Routes.urlHelpers().paramsUrl(t.unsafeParams),
    );

    assertEqual("http://www.example.com/basket", t.symbolUrl());
    assertEqual("http://www.example.com/basket", Routes.urlHelpers().symbolUrl());
    assertEqual("http://www.example.com/basket", t.hashUrl());
    assertEqual("http://www.example.com/basket", Routes.urlHelpers().hashUrl());
    assertEqual("http://www.example.com/admin/dashboard", t.arrayUrl());
    assertEqual("http://www.example.com/admin/dashboard", Routes.urlHelpers().arrayUrl());

    assertEqual("http://www.example.com/products?page=2", t.optionsUrl({ page: 2 }));
    assertEqual(
      "http://www.example.com/products?page=2",
      Routes.urlHelpers().optionsUrl({ page: 2 }),
    );
    assertEqual("http://www.example.com/products?size=10", t.defaultsUrl());
    assertEqual("http://www.example.com/products?size=10", Routes.urlHelpers().defaultsUrl());
    assertEqual("http://www.example.com/products?size=20", t.defaultsUrl({ size: 20 }));
    assertEqual(
      "http://www.example.com/products?size=20",
      Routes.urlHelpers().defaultsUrl({ size: 20 }),
    );

    assertEqual("http://www.example.com/products?page=2&size=25", t.browseUrl());
    await assertRaises([NameError], {}, () => Routes.urlHelpers().browseUrl());
  });

  it("resolve paths", () => {
    assertEqual("/basket", t.polymorphicPath(t.basket));
    assertEqual("/basket", Routes.urlHelpers().polymorphicPath(t.basket));

    assertEqual("/profile#details", t.polymorphicPath(t.user));
    assertEqual("/profile#details", Routes.urlHelpers().polymorphicPath(t.user));

    assertEqual("/profile#password", t.polymorphicPath(t.user, { anchor: "password" }));
    assertEqual(
      "/profile#password",
      Routes.urlHelpers().polymorphicPath(t.user, { anchor: "password" }),
    );

    assertEqual("/media/4", t.polymorphicPath(t.video));
    assertEqual("/media/4", Routes.urlHelpers().polymorphicPath(t.video));
    assertEqual("/media/4", HelperMethodBuilder.path().handleModelCall(t, t.video));

    assertEqual("/posts/5", t.polymorphicPath(t.article));
    assertEqual("/posts/5", Routes.urlHelpers().polymorphicPath(t.article));
    assertEqual("/posts/5", HelperMethodBuilder.path().handleModelCall(t, t.article));

    assertEqual("/pages/6", t.polymorphicPath(t.page));
    assertEqual("/pages/6", Routes.urlHelpers().polymorphicPath(t.page));
    assertEqual("/pages/6", HelperMethodBuilder.path().handleModelCall(t, t.page));

    assertEqual("/pages/7", t.polymorphicPath(t.categoryPage));
    assertEqual("/pages/7", Routes.urlHelpers().polymorphicPath(t.categoryPage));
    assertEqual("/pages/7", HelperMethodBuilder.path().handleModelCall(t, t.categoryPage));

    assertEqual("/pages/8", t.polymorphicPath(t.productPage));
    assertEqual("/pages/8", Routes.urlHelpers().polymorphicPath(t.productPage));
    assertEqual("/pages/8", HelperMethodBuilder.path().handleModelCall(t, t.productPage));

    assertEqual("/manufacturers/apple", t.polymorphicPath(t.manufacturer));
    assertEqual("/manufacturers/apple", Routes.urlHelpers().polymorphicPath(t.manufacturer));
  });

  it("resolve urls", () => {
    assertEqual("http://www.example.com/basket", t.polymorphicUrl(t.basket));
    assertEqual("http://www.example.com/basket", Routes.urlHelpers().polymorphicUrl(t.basket));
    assertEqual("http://www.example.com/basket", t.polymorphicUrl(t.basket));
    assertEqual("http://www.example.com/basket", Routes.urlHelpers().polymorphicUrl(t.basket));

    assertEqual("http://www.example.com/profile#details", t.polymorphicUrl(t.user));
    assertEqual(
      "http://www.example.com/profile#details",
      Routes.urlHelpers().polymorphicUrl(t.user),
    );

    assertEqual(
      "http://www.example.com/profile#password",
      t.polymorphicUrl(t.user, { anchor: "password" }),
    );
    assertEqual(
      "http://www.example.com/profile#password",
      Routes.urlHelpers().polymorphicUrl(t.user, { anchor: "password" }),
    );

    assertEqual("http://www.example.com/media/4", t.polymorphicUrl(t.video));
    assertEqual("http://www.example.com/media/4", Routes.urlHelpers().polymorphicUrl(t.video));
    assertEqual(
      "http://www.example.com/media/4",
      HelperMethodBuilder.url().handleModelCall(t, t.video),
    );

    assertEqual("http://www.example.com/posts/5", t.polymorphicUrl(t.article));
    assertEqual("http://www.example.com/posts/5", Routes.urlHelpers().polymorphicUrl(t.article));
    assertEqual(
      "http://www.example.com/posts/5",
      HelperMethodBuilder.url().handleModelCall(t, t.article),
    );

    assertEqual("http://www.example.com/pages/6", t.polymorphicUrl(t.page));
    assertEqual("http://www.example.com/pages/6", Routes.urlHelpers().polymorphicUrl(t.page));
    assertEqual(
      "http://www.example.com/pages/6",
      HelperMethodBuilder.url().handleModelCall(t, t.page),
    );

    assertEqual("http://www.example.com/pages/7", t.polymorphicUrl(t.categoryPage));
    assertEqual(
      "http://www.example.com/pages/7",
      Routes.urlHelpers().polymorphicUrl(t.categoryPage),
    );
    assertEqual(
      "http://www.example.com/pages/7",
      HelperMethodBuilder.url().handleModelCall(t, t.categoryPage),
    );

    assertEqual("http://www.example.com/pages/8", t.polymorphicUrl(t.productPage));
    assertEqual(
      "http://www.example.com/pages/8",
      Routes.urlHelpers().polymorphicUrl(t.productPage),
    );
    assertEqual(
      "http://www.example.com/pages/8",
      HelperMethodBuilder.url().handleModelCall(t, t.productPage),
    );

    assertEqual("http://www.example.com/manufacturers/apple", t.polymorphicUrl(t.manufacturer));
    assertEqual(
      "http://www.example.com/manufacturers/apple",
      Routes.urlHelpers().polymorphicUrl(t.manufacturer),
    );
  });

  it("url helpers module can be included directly in an active support concern", () => {
    const concern = new Module((mod) => {
      extend(mod, Concern);
      mod.include(Routes.urlHelpers());
    });

    const klass = class {};
    include(klass, concern);
    const concerned = new klass() as { rootUrl: Helper };

    assertEqual("http://www.example.com/", concerned.rootUrl());
  });

  it("defining direct inside a scope raises runtime error", async () => {
    const routes = new RouteSet();

    await assertRaises([RuntimeError], {}, () => {
      routes.draw(function () {
        this.namespace("admin", () => {
          this.direct("rubyonrails", undefined, () => "http://www.rubyonrails.org");
        });
      });
    });
  });

  it("defining resolve inside a scope raises runtime error", async () => {
    const routes = new RouteSet();

    await assertRaises([RuntimeError], {}, () => {
      routes.draw(function () {
        this.namespace("admin", () => {
          this.resolve("User", () => "/profile");
        });
      });
    });
  });

  it("defining direct url registers helper method", () => {
    assertEqual("http://www.example.com/basket", Routes.urlHelpers().symbolUrl());
    assertEqual(
      true,
      Routes.namedRoutes.isRouteDefined("symbolUrl"),
      "'symbol_url' named helper not found",
    );
    assertEqual(
      true,
      Routes.namedRoutes.isRouteDefined("symbolPath"),
      "'symbol_path' named helper not found",
    );
  });
});
