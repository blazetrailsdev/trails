import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  _assertNothingRaisedOrWarn,
  Assertion,
  assertRaises,
  camelize,
  constantize,
  extractOptionsBang,
  include,
  pluralize,
  singularize,
  withOptions,
} from "@blazetrails/activesupport";
import {
  hashDelete,
  rbFPublicSend,
  rbFSend,
  rbInspect,
  rbObjClassname,
  rbObjSingletonClass,
  registerConstant,
} from "@blazetrails/ruby-compat";
import {
  AccountsController,
  CommentsController,
  ResourcesController,
} from "../../test-helpers/abstract-unit.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { controllerConstants } from "../../action-dispatch/http/request.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { RoutingError } from "../metal/exceptions.js";
import { TestCase } from "../test-case.js";
import type { Base } from "../base.js";
import type { DispatchableControllerClass } from "../../action-dispatch/routing/dispatcher.js";

type Options = Record<string, any>;

class AdminController extends ResourcesController {}
class MessagesController extends ResourcesController {}
class ProductsController extends ResourcesController {}
class ThreadsController extends ResourcesController {}

const Backoffice = {
  ProductsController: class ProductsController extends ResourcesController {},
  ImagesController: class ImagesController extends ResourcesController {},
  Admin: {
    ProductsController: class ProductsController extends ResourcesController {},
    ImagesController: class ImagesController extends ResourcesController {},
  },
};

beforeAll(() => {
  for (const [name, klass] of Object.entries({
    accounts: AccountsController,
    admin: AdminController,
    comments: CommentsController,
    messages: MessagesController,
    products: ProductsController,
    threads: ThreadsController,
    "backoffice/products": Backoffice.ProductsController,
    "backoffice/images": Backoffice.ImagesController,
    "backoffice/admin/products": Backoffice.Admin.ProductsController,
    "backoffice/admin/images": Backoffice.Admin.ImagesController,
  })) {
    controllerConstants.set(name, klass as unknown as DispatchableControllerClass);
    registerConstant(`${camelize(name).replace(/\//g, "::")}Controller`, klass);
  }
});

class ResourcesTest extends TestCase {
  async withRestfulRouting(...args: unknown[]): Promise<void> {
    const block = args.pop() as () => unknown;
    const options = extractOptionsBang(args) as Options;
    const collectionMethods = hashDelete(options, "collection") as Options | undefined;
    const memberMethods = hashDelete(options, "member") as Options | undefined;
    const pathPrefix = hashDelete(options, "pathPrefix") as string | undefined;
    args.push(options);

    await this.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope(pathPrefix ?? "", () => {
          this.resources(...(args as [string]), () => {
            if (collectionMethods != null) {
              this.collection(() => {
                for (const [name, method] of Object.entries(collectionMethods)) {
                  rbFPublicSend(this, method, `:${name}`);
                }
              });
            }

            if (memberMethods != null) {
              this.member(() => {
                for (const [name, method] of Object.entries(memberMethods)) {
                  rbFPublicSend(this, method, `:${name}`);
                }
              });
            }
          });
        });
      });
      await block();
    });
  }

  async withSingletonResources(...args: unknown[]): Promise<void> {
    const block = args.pop() as () => unknown;
    await this.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource(...(args as [string]));
      });
      await block();
    });
  }

  async assertSimplyRestfulFor(controllerName: string, options: Options = {}): Promise<void> {
    await this.assertRestfulRoutesFor(controllerName, options);
    await this.assertRestfulNamedRoutesFor(controllerName, null, options);
  }

  async assertSingletonRestfulFor(singletonName: string, options: Options = {}): Promise<void> {
    await this.assertSingletonRoutesFor(singletonName, options);
    await this.assertSingletonNamedRoutesFor(singletonName, options);
  }

  async assertRestfulRoutesFor(
    controllerName: string,
    options: Options = {},
    block?: (routeOptions: Options) => unknown,
  ): Promise<void> {
    const routeOptions: Options = { ...(options.options ??= {}) };
    routeOptions.controller = options.controller ?? controllerName;

    if (options.shallow) {
      options.shallowOptions ??= {};
      options.shallowOptions.controller = routeOptions.controller;
    } else {
      options.shallowOptions = routeOptions;
    }

    let newAction = this.routes!.resourcesPathNames.new ?? "new";
    let editAction = this.routes!.resourcesPathNames.edit ?? "edit";

    if (options.pathNames) {
      if (options.pathNames.new) newAction = options.pathNames.new;
      if (options.pathNames.edit) editAction = options.pathNames.edit;
    }

    const path = `${options.as ?? controllerName}`;
    const collectionPath = `/${options.pathPrefix ?? ""}${path}`;
    const shallowPath = `/${(options.shallow ? options.namespace : options.pathPrefix) ?? ""}${path}`;
    const memberPath = `${shallowPath}/1`;
    const newPath = `${collectionPath}/${newAction}`;
    const editMemberPath = `${memberPath}/${editAction}`;
    const formattedEditMemberPath = `${memberPath}/${editAction}.xml`;

    withOptions(this, routeOptions, (controller) => {
      controller.assertRouting(collectionPath, { action: "index" });
      controller.assertRouting(newPath, { action: "new" });
      controller.assertRouting(`${collectionPath}.xml`, { action: "index", format: "xml" });
      controller.assertRouting(`${newPath}.xml`, { action: "new", format: "xml" });
    });

    withOptions(this, options.shallowOptions, (controller) => {
      controller.assertRouting(memberPath, { action: "show", id: "1" });
      controller.assertRouting(editMemberPath, { action: "edit", id: "1" });
      controller.assertRouting(`${memberPath}.xml`, { action: "show", id: "1", format: "xml" });
      controller.assertRouting(formattedEditMemberPath, { action: "edit", id: "1", format: "xml" });
    });

    const so = options.shallowOptions;
    this.assertRecognizes(
      { ...routeOptions, action: "index" },
      { path: collectionPath, method: "get" },
    );
    this.assertRecognizes({ ...routeOptions, action: "new" }, { path: newPath, method: "get" });
    this.assertRecognizes(
      { ...routeOptions, action: "create" },
      { path: collectionPath, method: "post" },
    );
    this.assertRecognizes({ ...so, action: "show", id: "1" }, { path: memberPath, method: "get" });
    this.assertRecognizes(
      { ...so, action: "edit", id: "1" },
      { path: editMemberPath, method: "get" },
    );
    this.assertRecognizes(
      { ...so, action: "update", id: "1" },
      { path: memberPath, method: "put" },
    );
    this.assertRecognizes(
      { ...so, action: "destroy", id: "1" },
      { path: memberPath, method: "delete" },
    );

    this.assertRecognizes(
      { ...routeOptions, action: "index", format: "xml" },
      { path: `${collectionPath}.xml`, method: "get" },
    );
    this.assertRecognizes(
      { ...routeOptions, action: "new", format: "xml" },
      { path: `${newPath}.xml`, method: "get" },
    );
    this.assertRecognizes(
      { ...routeOptions, action: "create", format: "xml" },
      { path: `${collectionPath}.xml`, method: "post" },
    );
    this.assertRecognizes(
      { ...so, action: "show", id: "1", format: "xml" },
      { path: `${memberPath}.xml`, method: "get" },
    );
    this.assertRecognizes(
      { ...so, action: "edit", id: "1", format: "xml" },
      { path: formattedEditMemberPath, method: "get" },
    );
    this.assertRecognizes(
      { ...so, action: "update", id: "1", format: "xml" },
      { path: `${memberPath}.xml`, method: "put" },
    );
    this.assertRecognizes(
      { ...so, action: "destroy", id: "1", format: "xml" },
      { path: `${memberPath}.xml`, method: "delete" },
    );

    if (block) {
      await _assertNothingRaisedOrWarn("assert_restful_routes_for", () => block(routeOptions));
    }
  }

  async assertRestfulNamedRoutesFor(
    controllerName: string,
    singularName: string | Options | null = null,
    options: Options = {},
    block?: (routeOptions: Options) => unknown,
  ): Promise<void> {
    if (singularName != null && typeof singularName === "object") {
      options = singularName;
      singularName = null;
    }
    singularName ??= singularize(controllerName);

    const routeOptions: Options = { ...(options.options ??= {}) };
    routeOptions.controller = options.controller ?? controllerName;

    if (options.shallow) {
      options.shallowOptions ??= {};
      options.shallowOptions.controller = routeOptions.controller;
    } else {
      options.shallowOptions = routeOptions;
    }

    this.controller = new (constantize(
      `${camelize(routeOptions.controller)}Controller`,
    ) as new () => Base)();
    include(rbObjSingletonClass(this.controller), this.routes!.urlHelpers());
    await this.get("index", { params: routeOptions });
    delete routeOptions.action;

    const path = `${options.as ?? controllerName}`;
    const shallowPath = `/${(options.shallow ? options.namespace : options.pathPrefix) ?? ""}${path}`;
    const fullPath = `/${options.pathPrefix ?? ""}${path}`;
    const namePrefix = options.namePrefix ?? "";
    const shallowPrefix =
      (options.shallow ? options.namespace?.replace(/\//g, "_") : options.namePrefix) ?? "";

    let newAction = "new";
    let editAction = "edit";
    if (options.pathNames) {
      newAction = options.pathNames.new ?? "new";
      editAction = options.pathNames.edit ?? "edit";
    }

    const so = options.shallowOptions;
    this.assertNamedRoute(`${fullPath}`, `${namePrefix}${controllerName}_path`, routeOptions);
    this.assertNamedRoute(`${fullPath}.xml`, `${namePrefix}${controllerName}_path`, {
      ...routeOptions,
      format: "xml",
    });
    this.assertNamedRoute(`${shallowPath}/1`, `${shallowPrefix}${singularName}_path`, {
      ...so,
      id: "1",
    });
    this.assertNamedRoute(`${shallowPath}/1.xml`, `${shallowPrefix}${singularName}_path`, {
      ...so,
      id: "1",
      format: "xml",
    });

    this.assertNamedRoute(
      `${fullPath}/${newAction}`,
      `new_${namePrefix}${singularName}_path`,
      routeOptions,
    );
    this.assertNamedRoute(`${fullPath}/${newAction}.xml`, `new_${namePrefix}${singularName}_path`, {
      ...routeOptions,
      format: "xml",
    });
    this.assertNamedRoute(
      `${shallowPath}/1/${editAction}`,
      `edit_${shallowPrefix}${singularName}_path`,
      { ...so, id: "1" },
    );
    this.assertNamedRoute(
      `${shallowPath}/1/${editAction}.xml`,
      `edit_${shallowPrefix}${singularName}_path`,
      { ...so, id: "1", format: "xml" },
    );

    if (block) {
      await _assertNothingRaisedOrWarn("assert_restful_named_routes_for", () =>
        block(routeOptions),
      );
    }
  }

  async assertSingletonRoutesFor(
    singletonName: string,
    options: Options = {},
    block?: (routeOptions: Options) => unknown,
  ): Promise<void> {
    const routeOptions: Options = { ...(options.options ??= {}) };
    routeOptions.controller = options.controller ?? pluralize(singletonName);

    const fullPath = `/${options.pathPrefix ?? ""}${options.as ?? singletonName}`;
    const newPath = `${fullPath}/new`;
    const editPath = `${fullPath}/edit`;
    const formattedEditPath = `${fullPath}/edit.xml`;

    withOptions(this, routeOptions, (controller) => {
      controller.assertRouting(fullPath, { action: "show" });
      controller.assertRouting(newPath, { action: "new" });
      controller.assertRouting(editPath, { action: "edit" });
      controller.assertRouting(`${fullPath}.xml`, { action: "show", format: "xml" });
      controller.assertRouting(`${newPath}.xml`, { action: "new", format: "xml" });
      controller.assertRouting(formattedEditPath, { action: "edit", format: "xml" });
    });

    this.assertRecognizes({ ...routeOptions, action: "show" }, { path: fullPath, method: "get" });
    this.assertRecognizes({ ...routeOptions, action: "new" }, { path: newPath, method: "get" });
    this.assertRecognizes({ ...routeOptions, action: "edit" }, { path: editPath, method: "get" });
    this.assertRecognizes(
      { ...routeOptions, action: "create" },
      { path: fullPath, method: "post" },
    );
    this.assertRecognizes({ ...routeOptions, action: "update" }, { path: fullPath, method: "put" });
    this.assertRecognizes(
      { ...routeOptions, action: "destroy" },
      { path: fullPath, method: "delete" },
    );

    this.assertRecognizes(
      { ...routeOptions, action: "show", format: "xml" },
      { path: `${fullPath}.xml`, method: "get" },
    );
    this.assertRecognizes(
      { ...routeOptions, action: "new", format: "xml" },
      { path: `${newPath}.xml`, method: "get" },
    );
    this.assertRecognizes(
      { ...routeOptions, action: "edit", format: "xml" },
      { path: formattedEditPath, method: "get" },
    );
    this.assertRecognizes(
      { ...routeOptions, action: "create", format: "xml" },
      { path: `${fullPath}.xml`, method: "post" },
    );
    this.assertRecognizes(
      { ...routeOptions, action: "update", format: "xml" },
      { path: `${fullPath}.xml`, method: "put" },
    );
    this.assertRecognizes(
      { ...routeOptions, action: "destroy", format: "xml" },
      { path: `${fullPath}.xml`, method: "delete" },
    );

    if (block) {
      await _assertNothingRaisedOrWarn("assert_singleton_routes_for", () => block(routeOptions));
    }
  }

  async assertSingletonNamedRoutesFor(
    singletonName: string,
    options: Options = {},
    block?: (routeOptions: Options) => unknown,
  ): Promise<void> {
    const routeOptions: Options = { ...(options.options ??= {}) };
    const controllerName =
      routeOptions.controller ?? options.controller ?? pluralize(singletonName);
    this.controller = new (constantize(
      `${camelize(controllerName)}Controller`,
    ) as new () => Base)();
    include(rbObjSingletonClass(this.controller), this.routes!.urlHelpers());
    await this.get("show", { params: routeOptions });
    delete routeOptions.action;

    const fullPath = `/${options.pathPrefix ?? ""}${options.as ?? singletonName}`;
    const namePrefix = options.namePrefix ?? "";

    this.assertNamedRoute(`${fullPath}`, `${namePrefix}${singletonName}_path`, routeOptions);
    this.assertNamedRoute(`${fullPath}.xml`, `${namePrefix}${singletonName}_path`, {
      ...routeOptions,
      format: "xml",
    });

    this.assertNamedRoute(
      `${fullPath}/new`,
      `new_${namePrefix}${singletonName}_path`,
      routeOptions,
    );
    this.assertNamedRoute(`${fullPath}/new.xml`, `new_${namePrefix}${singletonName}_path`, {
      ...routeOptions,
      format: "xml",
    });
    this.assertNamedRoute(
      `${fullPath}/edit`,
      `edit_${namePrefix}${singletonName}_path`,
      routeOptions,
    );
    this.assertNamedRoute(`${fullPath}/edit.xml`, `edit_${namePrefix}${singletonName}_path`, {
      ...routeOptions,
      format: "xml",
    });

    if (block) {
      await _assertNothingRaisedOrWarn("assert_singleton_named_routes_for", () =>
        block(routeOptions),
      );
    }
  }

  assertNamedRoute(expected: string, route: string, options: Options): void {
    let actual: unknown;
    try {
      actual = rbFPublicSend(this.controller, camelize(route, false), options);
    } catch (e) {
      actual = rbObjClassname(e);
    }
    expect(actual, `Error on route: ${route}(${rbInspect(options)})`).toEqual(expected);
  }
  assertResourceMethods(
    expected: string[],
    resource: unknown,
    actionMethod: string,
    method: string,
  ): void {
    const methods = (rbFSend(resource, `${actionMethod}Methods`) as Options)[method];
    expect(methods.length, rbInspect(methods)).toBe(expected.length);
    for (const action of expected) {
      expect(methods, `${method} not in ${actionMethod} methods: ${rbInspect(methods)}`).toContain(
        action,
      );
    }
  }

  async assertResourceAllowedRoutes(
    controller: string,
    options: Options,
    shallowOptions: Options,
    allowed: string | string[],
    notAllowed: string | string[],
    path = controller,
  ): Promise<void> {
    const shallowPath = `${path}/${shallowOptions.id}`;
    const format = options.format != null ? `.${options.format}` : "";
    options.controller = controller;
    Object.assign(shallowOptions, options);

    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "index",
      `${path}${format}`,
      "get",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "new",
      `${path}/new${format}`,
      "get",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "create",
      `${path}${format}`,
      "post",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      shallowOptions,
      "show",
      `${shallowPath}${format}`,
      "get",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      shallowOptions,
      "edit",
      `${shallowPath}/edit${format}`,
      "get",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      shallowOptions,
      "update",
      `${shallowPath}${format}`,
      "put",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      shallowOptions,
      "destroy",
      `${shallowPath}${format}`,
      "delete",
    );
  }

  async assertSingletonResourceAllowedRoutes(
    controller: string,
    options: Options,
    allowed: string | string[],
    notAllowed: string | string[],
    path = singularize(controller),
  ): Promise<void> {
    const format = options.format != null ? `.${options.format}` : "";
    options.controller = controller;

    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "new",
      `${path}/new${format}`,
      "get",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "create",
      `${path}${format}`,
      "post",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "show",
      `${path}${format}`,
      "get",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "edit",
      `${path}/edit${format}`,
      "get",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "update",
      `${path}${format}`,
      "put",
    );
    await this.assertWhetherAllowed(
      allowed,
      notAllowed,
      options,
      "destroy",
      `${path}${format}`,
      "delete",
    );
  }

  async assertWhetherAllowed(
    allowed: string | string[],
    notAllowed: string | string[],
    options: Options,
    action: string,
    path: string,
    method: string,
  ): Promise<void> {
    options = { ...options, action };
    const pathOptions = { path, method };

    if (([] as string[]).concat(allowed).includes(action)) {
      this.assertRecognizes(options, pathOptions);
    } else if (([] as string[]).concat(notAllowed).includes(action)) {
      await this.assertNotRecognizes(options, pathOptions);
    } else {
      throw new Assertion("Invalid Action has passed");
    }
  }

  async assertNotRecognizes(expectedOptions: Options, path: Options): Promise<void> {
    await assertRaises([Assertion], {}, () => {
      this.assertRecognizes(expectedOptions, path as { path: string; method: string });
    });
  }
}

describe("ResourcesTest", () => {
  let tc: ResourcesTest;

  beforeEach(async ({ task }) => {
    tc = new ResourcesTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });
  it("default restful routes", async () => {
    await tc.withRestfulRouting("messages", async () => {
      await tc.assertSimplyRestfulFor("messages");
    });
  });

  it("override paths for member and collection methods", async () => {
    const collectionMethods: Options = { rss: "get", reorder: "post", csv: "post" };
    const memberMethods: Options = { rss: "get", atom: "get", upload: "post", fix: "post" };
    const pathNames: Options = { new: "nuevo", rss: "canal", fix: "corrigir" };

    await tc.withRestfulRouting(
      "messages",
      { collection: collectionMethods, member: memberMethods, pathNames },
      async () => {
        await tc.assertRestfulRoutesFor(
          "messages",
          { collection: collectionMethods, member: memberMethods, pathNames },
          (options) => {
            for (const [action, method] of Object.entries(memberMethods)) {
              tc.assertRecognizes(
                { ...options, action, id: "1" },
                { path: `/messages/1/${pathNames[action] ?? action}`, method },
              );
            }

            for (const [action, method] of Object.entries(collectionMethods)) {
              tc.assertRecognizes(
                { ...options, action },
                { path: `/messages/${pathNames[action] ?? action}`, method },
              );
            }
          },
        );

        await tc.assertRestfulNamedRoutesFor(
          "messages",
          { collection: collectionMethods, member: memberMethods, pathNames },
          undefined,
          () => {
            for (const action of Object.keys(collectionMethods)) {
              tc.assertNamedRoute(
                `/messages/${pathNames[action] ?? action}`,
                `${action}_messages_path`,
                { action },
              );
            }

            for (const action of Object.keys(memberMethods)) {
              tc.assertNamedRoute(
                `/messages/1/${pathNames[action] ?? action}`,
                `${action}_message_path`,
                { action, id: "1" },
              );
            }
          },
        );
      },
    );
  });

  it("multiple default restful routes", async () => {
    await tc.withRestfulRouting("messages", "comments", async () => {
      await tc.assertSimplyRestfulFor("messages");
      await tc.assertSimplyRestfulFor("comments");
    });
  });

  it("multiple resources with options", async () => {
    const expectedOptions = { controller: "threads", action: "index" };

    await tc.withRestfulRouting(
      "messages",
      "comments",
      { controller: expectedOptions.controller },
      () => {
        tc.assertRecognizes(expectedOptions, { path: "comments" });
        tc.assertRecognizes(expectedOptions, { path: "messages" });
      },
    );
  });

  it("with custom conditions", async () => {
    await tc.withRestfulRouting("messages", { conditions: { subdomain: "app" } }, () => {
      expect(
        tc.routes!.recognizePath("/messages", { method: "get", subdomain: "app" } as {
          method: string;
        }),
      ).toBeTruthy();
    });
  });

  it("irregular id with no constraints should raise error", async () => {
    const expectedOptions = { controller: "messages", action: "show", id: "1.1.1" };

    await tc.withRestfulRouting("messages", async () => {
      await assertRaises([Assertion], {}, () => {
        tc.assertRecognizes(expectedOptions, { path: "messages/1.1.1", method: "get" });
      });
    });
  });

  it("irregular id with constraints should pass", async () => {
    const expectedOptions = { controller: "messages", action: "show", id: "1.1.1" };

    await tc.withRestfulRouting("messages", { constraints: { id: /[0-9]\.[0-9]\.[0-9]/ } }, () => {
      tc.assertRecognizes(expectedOptions, { path: "messages/1.1.1", method: "get" });
    });
  });

  it("with path prefix constraints", async () => {
    const expectedOptions = { controller: "messages", action: "show", thread_id: "1.1.1", id: "1" };
    await tc.withRestfulRouting(
      "messages",
      { pathPrefix: "/thread/:thread_id", constraints: { thread_id: /[0-9]\.[0-9]\.[0-9]/ } },
      () => {
        tc.assertRecognizes(expectedOptions, { path: "thread/1.1.1/messages/1", method: "get" });
      },
    );
  });

  it("irregular id constraints should get passed to member actions", async () => {
    const expectedOptions = { controller: "messages", action: "custom", id: "1.1.1" };

    await tc.withRestfulRouting(
      "messages",
      { member: { custom: "get" }, constraints: { id: /[0-9]\.[0-9]\.[0-9]/ } },
      () => {
        tc.assertRecognizes(expectedOptions, { path: "messages/1.1.1/custom", method: "get" });
      },
    );
  });

  it("with path prefix", async () => {
    await tc.withRestfulRouting("messages", { pathPrefix: "/thread/:thread_id" }, async () => {
      await tc.assertSimplyRestfulFor("messages", {
        pathPrefix: "thread/5/",
        options: { thread_id: "5" },
      });
    });
  });

  it("multiple with path prefix", async () => {
    await tc.withRestfulRouting(
      "messages",
      "comments",
      { pathPrefix: "/thread/:thread_id" },
      async () => {
        await tc.assertSimplyRestfulFor("messages", {
          pathPrefix: "thread/5/",
          options: { thread_id: "5" },
        });
        await tc.assertSimplyRestfulFor("comments", {
          pathPrefix: "thread/5/",
          options: { thread_id: "5" },
        });
      },
    );
  });

  it("with name prefix", async () => {
    await tc.withRestfulRouting("messages", { as: "post_messages" }, async () => {
      await tc.assertSimplyRestfulFor("messages", { namePrefix: "post_" });
    });
  });

  it("with collection actions", async () => {
    const actions: Options = { a: "get", b: "put", c: "post", d: "delete", e: "patch" };

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("messages", () => {
          this.get("a", { on: "collection" });
          this.put("b", { on: "collection" });
          this.post("c", { on: "collection" });
          this.delete("d", { on: "collection" });
          this.patch("e", { on: "collection" });
        });
      });

      await tc.assertRestfulRoutesFor("messages", {}, (options) => {
        for (const [action, method] of Object.entries(actions)) {
          tc.assertRecognizes({ ...options, action }, { path: `/messages/${action}`, method });
        }
      });

      await tc.assertRestfulNamedRoutesFor("messages", null, {}, () => {
        for (const action of Object.keys(actions)) {
          tc.assertNamedRoute(`/messages/${action}`, `${action}_messages_path`, { action });
        }
      });
    });
  });

  it("with collection actions and name prefix", async () => {
    const actions: Options = { a: "get", b: "put", c: "post", d: "delete", e: "patch" };

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/threads/:thread_id", () => {
          this.resources("messages", { as: "thread_messages" }, () => {
            this.get("a", { on: "collection" });
            this.put("b", { on: "collection" });
            this.post("c", { on: "collection" });
            this.delete("d", { on: "collection" });
            this.patch("e", { on: "collection" });
          });
        });
      });

      await tc.assertRestfulRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        (options) => {
          for (const [action, method] of Object.entries(actions)) {
            tc.assertRecognizes(
              { ...options, action },
              { path: `/threads/1/messages/${action}`, method },
            );
          }
        },
      );

      await tc.assertRestfulNamedRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        undefined,
        () => {
          for (const action of Object.keys(actions)) {
            tc.assertNamedRoute(`/threads/1/messages/${action}`, `${action}_thread_messages_path`, {
              action,
            });
          }
        },
      );
    });
  });

  it("with collection actions and name prefix and member action with same name", async () => {
    const actions: Options = { a: "get" };

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/threads/:thread_id", () => {
          this.resources("messages", { as: "thread_messages" }, () => {
            this.get("a", { on: "collection" });
            this.get("a", { on: "member" });
          });
        });
      });

      await tc.assertRestfulRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        (options) => {
          for (const [action, method] of Object.entries(actions)) {
            tc.assertRecognizes(
              { ...options, action },
              { path: `/threads/1/messages/${action}`, method },
            );
          }
        },
      );

      await tc.assertRestfulNamedRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        undefined,
        () => {
          for (const action of Object.keys(actions)) {
            tc.assertNamedRoute(`/threads/1/messages/${action}`, `${action}_thread_messages_path`, {
              action,
            });
          }
        },
      );
    });
  });

  it("with collection action and name prefix and formatted", async () => {
    const actions: Options = { a: "get", b: "put", c: "post", d: "delete", e: "patch" };

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/threads/:thread_id", () => {
          this.resources("messages", { as: "thread_messages" }, () => {
            this.get("a", { on: "collection" });
            this.put("b", { on: "collection" });
            this.post("c", { on: "collection" });
            this.delete("d", { on: "collection" });
            this.patch("e", { on: "collection" });
          });
        });
      });

      await tc.assertRestfulRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        (options) => {
          for (const [action, method] of Object.entries(actions)) {
            tc.assertRecognizes(
              { ...options, action, format: "xml" },
              { path: `/threads/1/messages/${action}.xml`, method },
            );
          }
        },
      );

      await tc.assertRestfulNamedRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        undefined,
        () => {
          for (const action of Object.keys(actions)) {
            tc.assertNamedRoute(
              `/threads/1/messages/${action}.xml`,
              `${action}_thread_messages_path`,
              { action, format: "xml" },
            );
          }
        },
      );
    });
  });

  it("with member action", async () => {
    for (const method of ["patch", "put", "post"]) {
      await tc.withRestfulRouting("messages", { member: { mark: method } }, async () => {
        const markOptions = { action: "mark", id: "1" };
        const markPath = "/messages/1/mark";
        await tc.assertRestfulRoutesFor("messages", {}, (options) => {
          tc.assertRecognizes({ ...options, ...markOptions }, { path: markPath, method });
        });

        await tc.assertRestfulNamedRoutesFor("messages", null, {}, () => {
          tc.assertNamedRoute(markPath, "mark_message_path", markOptions);
        });
      });
    }
  });

  it("with member action and requirement", async () => {
    const expectedOptions = { controller: "messages", action: "mark", id: "1.1.1" };

    await tc.withRestfulRouting(
      "messages",
      { constraints: { id: /[0-9]\.[0-9]\.[0-9]/ }, member: { mark: "get" } },
      () => {
        tc.assertRecognizes(expectedOptions, { path: "messages/1.1.1/mark", method: "get" });
      },
    );
  });

  it("member when override paths for default restful actions with", async () => {
    for (const method of ["patch", "put", "post"]) {
      await tc.withRestfulRouting(
        "messages",
        { member: { mark: method }, pathNames: { new: "nuevo" } },
        async () => {
          const markOptions = { action: "mark", id: "1", controller: "messages" };
          const markPath = "/messages/1/mark";

          await tc.assertRestfulRoutesFor(
            "messages",
            { pathNames: { new: "nuevo" } },
            (options) => {
              tc.assertRecognizes({ ...options, ...markOptions }, { path: markPath, method });
            },
          );

          await tc.assertRestfulNamedRoutesFor(
            "messages",
            { pathNames: { new: "nuevo" } },
            undefined,
            () => {
              tc.assertNamedRoute(markPath, "mark_message_path", markOptions);
            },
          );
        },
      );
    }
  });

  it("with two member actions with same method", async () => {
    for (const method of ["patch", "put", "post"]) {
      await tc.withRouting(async (set: RouteSet) => {
        set.draw(function () {
          this.resources("messages", () => {
            this.member(() => {
              this.match("mark", { via: method });
              this.match("unmark", { via: method });
            });
          });
        });

        for (const action of ["mark", "unmark"]) {
          const actionOptions = { action, id: "1" };
          const actionPath = `/messages/1/${action}`;
          await tc.assertRestfulRoutesFor("messages", {}, (options) => {
            tc.assertRecognizes({ ...options, ...actionOptions }, { path: actionPath, method });
          });

          await tc.assertRestfulNamedRoutesFor("messages", null, {}, () => {
            tc.assertNamedRoute(actionPath, `${action}_message_path`, actionOptions);
          });
        }
      });
    }
  });

  it("array as collection or member method value", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("messages", () => {
          this.collection(() => {
            this.match("search", { via: ["post", "get"] });
          });

          this.member(() => {
            this.match("toggle", { via: ["post", "get"] });
          });
        });
      });

      await tc.assertRestfulRoutesFor("messages", {}, (options) => {
        for (const method of ["get", "post"]) {
          tc.assertRecognizes(
            { ...options, action: "search" },
            { path: "/messages/search", method },
          );
        }
        for (const method of ["get", "post"]) {
          tc.assertRecognizes(
            { ...options, action: "toggle", id: "1" },
            { path: "/messages/1/toggle", method },
          );
        }
      });
    });
  });

  it("with new action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("messages", () => {
          this.post("preview", { on: "new" });
        });
      });

      const previewOptions = { action: "preview" };
      const previewPath = "/messages/new/preview";
      await tc.assertRestfulRoutesFor("messages", {}, (options) => {
        tc.assertRecognizes(
          { ...options, ...previewOptions },
          { path: previewPath, method: "post" },
        );
      });

      await tc.assertRestfulNamedRoutesFor("messages", null, {}, () => {
        tc.assertNamedRoute(previewPath, "preview_new_message_path", previewOptions);
      });
    });
  });

  it("with new action with name prefix", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/threads/:thread_id", () => {
          this.resources("messages", { as: "thread_messages" }, () => {
            this.post("preview", { on: "new" });
          });
        });
      });

      const previewOptions = { action: "preview", thread_id: "1" };
      const previewPath = "/threads/1/messages/new/preview";
      await tc.assertRestfulRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        (options) => {
          tc.assertRecognizes(
            { ...options, ...previewOptions },
            { path: previewPath, method: "post" },
          );
        },
      );

      await tc.assertRestfulNamedRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        undefined,
        () => {
          tc.assertNamedRoute(previewPath, "preview_new_thread_message_path", previewOptions);
        },
      );
    });
  });

  it("with formatted new action with name prefix", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/threads/:thread_id", () => {
          this.resources("messages", { as: "thread_messages" }, () => {
            this.post("preview", { on: "new" });
          });
        });
      });

      const previewOptions = { action: "preview", thread_id: "1", format: "xml" };
      const previewPath = "/threads/1/messages/new/preview.xml";
      await tc.assertRestfulRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        (options) => {
          tc.assertRecognizes(
            { ...options, ...previewOptions },
            { path: previewPath, method: "post" },
          );
        },
      );

      await tc.assertRestfulNamedRoutesFor(
        "messages",
        { pathPrefix: "threads/1/", namePrefix: "thread_", options: { thread_id: "1" } },
        undefined,
        () => {
          tc.assertNamedRoute(previewPath, "preview_new_thread_message_path", previewOptions);
        },
      );
    });
  });

  it("override new method", async () => {
    await tc.withRestfulRouting("messages", async () => {
      await tc.assertRestfulRoutesFor("messages", {}, async (options) => {
        tc.assertRecognizes(
          { ...options, action: "new" },
          { path: "/messages/new", method: "get" },
        );
        await assertRaises([RoutingError], {}, () => {
          tc.routes!.recognizePath("/messages/new", { method: "post" });
        });
      });
    });

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("messages", () => {
          this.match(":new", { via: ["post", "get"], on: "new" });
        });
      });

      await tc.assertRestfulRoutesFor("messages", {}, (options) => {
        tc.assertRecognizes(
          { ...options, action: "new" },
          { path: "/messages/new", method: "post" },
        );
        tc.assertRecognizes(
          { ...options, action: "new" },
          { path: "/messages/new", method: "get" },
        );
      });
    });
  });

  it("nested restful routes", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("threads", () => {
          this.resources("messages", () => {
            this.resources("comments");
          });
        });
      });

      await tc.assertSimplyRestfulFor("threads");
      await tc.assertSimplyRestfulFor("messages", {
        namePrefix: "thread_",
        pathPrefix: "threads/1/",
        options: { thread_id: "1" },
      });
      await tc.assertSimplyRestfulFor("comments", {
        namePrefix: "thread_message_",
        pathPrefix: "threads/1/messages/2/",
        options: { thread_id: "1", message_id: "2" },
      });
    });
  });

  it("shallow nested restful routes", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("threads", { shallow: true }, () => {
          this.resources("messages", () => {
            this.resources("comments");
          });
        });
      });

      await tc.assertSimplyRestfulFor("threads", { shallow: true });
      await tc.assertSimplyRestfulFor("messages", {
        namePrefix: "thread_",
        pathPrefix: "threads/1/",
        shallow: true,
        options: { thread_id: "1" },
      });
      await tc.assertSimplyRestfulFor("comments", {
        namePrefix: "message_",
        pathPrefix: "messages/2/",
        shallow: true,
        options: { message_id: "2" },
      });
    });
  });

  it("shallow nested restful routes with namespaces", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("backoffice", () => {
          this.namespace("admin", () => {
            this.resources("products", { shallow: true }, () => {
              this.resources("images");
            });
          });
        });
      });

      await tc.assertSimplyRestfulFor("products", {
        controller: "backoffice/admin/products",
        namespace: "backoffice/admin/",
        namePrefix: "backoffice_admin_",
        pathPrefix: "backoffice/admin/",
        shallow: true,
      });
      await tc.assertSimplyRestfulFor("images", {
        controller: "backoffice/admin/images",
        namespace: "backoffice/admin/",
        namePrefix: "backoffice_admin_product_",
        pathPrefix: "backoffice/admin/products/1/",
        shallow: true,
        options: { product_id: "1" },
      });
    });
  });

  it("restful routes dont generate duplicates", async () => {
    await tc.withRestfulRouting("messages", () => {
      const routes = tc.routes!.routes.routes;
      for (const route of routes) {
        for (const r of routes) {
          if (route === r) continue;
          expect([route.conditions, route.path.spec.toString(), route.verb]).not.toEqual([
            r.conditions,
            r.path.spec.toString(),
            r.verb,
          ]);
        }
      }
    });
  });

  it("should create singleton resource routes", async () => {
    await tc.withSingletonResources("account", async () => {
      await tc.assertSingletonRestfulFor("account");
    });
  });

  it("should create multiple singleton resource routes", async () => {
    await tc.withSingletonResources("account", "product", async () => {
      await tc.assertSingletonRestfulFor("account");
      await tc.assertSingletonRestfulFor("product");
    });
  });

  it("should create nested singleton resource routes", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("admin", { controller: "admin" }, () => {
          this.resource("account");
        });
      });

      await tc.assertSingletonRestfulFor("admin", { controller: "admin" });
      await tc.assertSingletonRestfulFor("account", { namePrefix: "admin_", pathPrefix: "admin/" });
    });
  });

  it("singleton resource with member action", async () => {
    for (const method of ["patch", "put", "post"]) {
      await tc.withRouting(async (set: RouteSet) => {
        set.draw(function () {
          this.resource("account", () => {
            this.match("reset", { on: "member", via: method });
          });
        });

        const resetOptions = { action: "reset" };
        const resetPath = "/account/reset";
        await tc.assertSingletonRoutesFor("account", {}, (options) => {
          tc.assertRecognizes({ ...options, ...resetOptions }, { path: resetPath, method });
        });

        await tc.assertSingletonNamedRoutesFor("account", {}, () => {
          tc.assertNamedRoute(resetPath, "reset_account_path", resetOptions);
        });
      });
    }
  });

  it("singleton resource with two member actions with same method", async () => {
    for (const method of ["patch", "put", "post"]) {
      await tc.withRouting(async (set: RouteSet) => {
        set.draw(function () {
          this.resource("account", () => {
            this.match("reset", { on: "member", via: method });
            this.match("disable", { on: "member", via: method });
          });
        });

        for (const action of ["reset", "disable"]) {
          const actionOptions = { action };
          const actionPath = `/account/${action}`;
          await tc.assertSingletonRoutesFor("account", {}, (options) => {
            tc.assertRecognizes({ ...options, ...actionOptions }, { path: actionPath, method });
          });

          await tc.assertSingletonNamedRoutesFor("account", {}, () => {
            tc.assertNamedRoute(actionPath, `${action}_account_path`, actionOptions);
          });
        }
      });
    }
  });

  it("should nest resources in singleton resource", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", () => {
          this.resources("messages");
        });
      });

      await tc.assertSingletonRestfulFor("account");
      await tc.assertSimplyRestfulFor("messages", {
        namePrefix: "account_",
        pathPrefix: "account/",
      });
    });
  });

  it("should nest resources in singleton resource with path scope", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope(":site_id", () => {
          this.resource("account", () => {
            this.resources("messages");
          });
        });
      });

      await tc.assertSingletonRestfulFor("account", {
        pathPrefix: "7/",
        options: { site_id: "7" },
      });
      await tc.assertSimplyRestfulFor("messages", {
        namePrefix: "account_",
        pathPrefix: "7/account/",
        options: { site_id: "7" },
      });
    });
  });

  it("should nest singleton resource in resources", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("threads", () => {
          this.resource("admin", { controller: "admin" });
        });
      });

      await tc.assertSimplyRestfulFor("threads");
      await tc.assertSingletonRestfulFor("admin", {
        controller: "admin",
        namePrefix: "thread_",
        pathPrefix: "threads/5/",
        options: { thread_id: "5" },
      });
    });
  });

  it("should not allow delete or patch or put on collection path", async () => {
    const controllerName = "messages";
    await tc.withRestfulRouting(controllerName, async () => {
      const options = { controller: controllerName };
      const collectionPath = `/${controllerName}`;

      await assertRaises([Assertion], {}, () => {
        tc.assertRecognizes(
          { ...options, action: "update" },
          { path: collectionPath, method: "patch" },
        );
      });

      await assertRaises([Assertion], {}, () => {
        tc.assertRecognizes(
          { ...options, action: "update" },
          { path: collectionPath, method: "put" },
        );
      });

      await assertRaises([Assertion], {}, () => {
        tc.assertRecognizes(
          { ...options, action: "destroy" },
          { path: collectionPath, method: "delete" },
        );
      });
    });
  });

  it("new style named routes for resource", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/threads/:thread_id", () => {
          this.resources("messages", { as: "thread_messages" }, () => {
            this.get("search", { on: "collection" });
            this.get("preview", { on: "new" });
          });
        });
      });

      await tc.assertSimplyRestfulFor("messages", {
        namePrefix: "thread_",
        pathPrefix: "threads/1/",
        options: { thread_id: "1" },
      });
      tc.assertNamedRoute("/threads/1/messages/search", "search_thread_messages_path", {});
      tc.assertNamedRoute("/threads/1/messages/new", "new_thread_message_path", {});
      tc.assertNamedRoute("/threads/1/messages/new/preview", "preview_new_thread_message_path", {});
    });
  });

  it("new style named routes for singleton resource", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/admin", () => {
          this.resource("account", { as: "admin_account" }, () => {
            this.get("login", { on: "member" });
            this.get("preview", { on: "new" });
          });
        });
      });
      await tc.assertSingletonRestfulFor("account", { namePrefix: "admin_", pathPrefix: "admin/" });
      tc.assertNamedRoute("/admin/account/login", "login_admin_account_path", {});
      tc.assertNamedRoute("/admin/account/new", "new_admin_account_path", {});
      tc.assertNamedRoute("/admin/account/new/preview", "preview_new_admin_account_path", {});
    });
  });

  it("resources in namespace", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("backoffice", () => {
          this.resources("products");
        });
      });

      await tc.assertSimplyRestfulFor("products", {
        controller: "backoffice/products",
        namePrefix: "backoffice_",
        pathPrefix: "backoffice/",
      });
    });
  });

  it("resources in nested namespace", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("backoffice", () => {
          this.namespace("admin", () => {
            this.resources("products");
          });
        });
      });

      await tc.assertSimplyRestfulFor("products", {
        controller: "backoffice/admin/products",
        namePrefix: "backoffice_admin_",
        pathPrefix: "backoffice/admin/",
      });
    });
  });

  it("resources using namespace", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("backoffice", { path: null, as: null }, () => {
          this.resources("products");
        });
      });

      await tc.assertSimplyRestfulFor("products", { controller: "backoffice/products" });
    });
  });

  it("nested resources using namespace", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("backoffice", () => {
          this.resources("products", () => {
            this.resources("images");
          });
        });
      });

      await tc.assertSimplyRestfulFor("images", {
        controller: "backoffice/images",
        namePrefix: "backoffice_product_",
        pathPrefix: "backoffice/products/1/",
        options: { product_id: "1" },
      });
    });
  });

  it("nested resources in nested namespace", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("backoffice", () => {
          this.namespace("admin", () => {
            this.resources("products", () => {
              this.resources("images");
            });
          });
        });
      });

      await tc.assertSimplyRestfulFor("images", {
        controller: "backoffice/admin/images",
        namePrefix: "backoffice_admin_product_",
        pathPrefix: "backoffice/admin/products/1/",
        options: { product_id: "1" },
      });
    });
  });

  it("with path segment", async () => {
    await tc.withRestfulRouting("messages", async () => {
      await tc.assertSimplyRestfulFor("messages");
      tc.assertRecognizes({ controller: "messages", action: "index" }, "/messages");
      tc.assertRecognizes({ controller: "messages", action: "index" }, "/messages/");
    });

    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("messages", { path: "reviews" });
      });
      await tc.assertSimplyRestfulFor("messages", { as: "reviews" });
      tc.assertRecognizes({ controller: "messages", action: "index" }, "/reviews");
      tc.assertRecognizes({ controller: "messages", action: "index" }, "/reviews/");
    });
  });

  it("multiple with path segment and controller", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", () => {
          this.resources("product_reviews", { path: "reviews", controller: "messages" });
        });
        this.resources("tutors", () => {
          this.resources("tutor_reviews", { path: "reviews", controller: "comments" });
        });
      });

      await tc.assertSimplyRestfulFor("product_reviews", {
        controller: "messages",
        as: "reviews",
        namePrefix: "product_",
        pathPrefix: "products/1/",
        options: { product_id: "1" },
      });
      await tc.assertSimplyRestfulFor("tutor_reviews", {
        controller: "comments",
        as: "reviews",
        namePrefix: "tutor_",
        pathPrefix: "tutors/1/",
        options: { tutor_id: "1" },
      });
    });
  });

  it("with path segment path prefix constraints", async () => {
    const expectedOptions = { controller: "messages", action: "show", thread_id: "1.1.1", id: "1" };
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope(
          "/thread/:thread_id",
          { constraints: { thread_id: /[0-9]\.[0-9]\.[0-9]/ } },
          () => {
            this.resources("messages", { path: "comments" });
          },
        );
      });
      tc.assertRecognizes(expectedOptions, { path: "thread/1.1.1/comments/1", method: "get" });
    });
  });

  it("resource has only show action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: "show" });
      });

      await tc.assertResourceAllowedRoutes("products", {}, { id: "1" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertResourceAllowedRoutes("products", { format: "xml" }, { id: "1" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
    });
  });

  it("resource has only show action with string value", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: "show" });
      });

      await tc.assertResourceAllowedRoutes("products", {}, { id: "1" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertResourceAllowedRoutes("products", { format: "xml" }, { id: "1" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
    });
  });

  it("singleton resource has only show action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { only: "show" });
      });

      await tc.assertSingletonResourceAllowedRoutes("accounts", {}, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertSingletonResourceAllowedRoutes("accounts", { format: "xml" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
    });
  });

  it("singleton resource has only show action with string value", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { only: "show" });
      });

      await tc.assertSingletonResourceAllowedRoutes("accounts", {}, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertSingletonResourceAllowedRoutes("accounts", { format: "xml" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
    });
  });

  it("resource does not have destroy action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { except: "destroy" });
      });

      await tc.assertResourceAllowedRoutes(
        "products",
        {},
        { id: "1" },
        ["index", "new", "create", "show", "edit", "update"],
        "destroy",
      );
      await tc.assertResourceAllowedRoutes(
        "products",
        { format: "xml" },
        { id: "1" },
        ["index", "new", "create", "show", "edit", "update"],
        "destroy",
      );
    });
  });

  it("singleton resource does not have destroy action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { except: "destroy" });
      });

      await tc.assertSingletonResourceAllowedRoutes(
        "accounts",
        {},
        ["new", "create", "show", "edit", "update"],
        "destroy",
      );
      await tc.assertSingletonResourceAllowedRoutes(
        "accounts",
        { format: "xml" },
        ["new", "create", "show", "edit", "update"],
        "destroy",
      );
    });
  });

  it("resource has show action but does not have destroy action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: ["show", "destroy"], except: "destroy" });
      });

      await tc.assertResourceAllowedRoutes("products", {}, { id: "1" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertResourceAllowedRoutes("products", { format: "xml" }, { id: "1" }, "show", [
        "index",
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
    });
  });

  it("singleton resource has show action but does not have destroy action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { only: ["show", "destroy"], except: "destroy" });
      });

      await tc.assertSingletonResourceAllowedRoutes("accounts", {}, "show", [
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertSingletonResourceAllowedRoutes("accounts", { format: "xml" }, "show", [
        "new",
        "create",
        "edit",
        "update",
        "destroy",
      ]);
    });
  });

  it("resource has only create action and named route", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: "create" });
      });

      await tc.assertResourceAllowedRoutes("products", {}, { id: "1" }, "create", [
        "index",
        "new",
        "show",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertResourceAllowedRoutes("products", { format: "xml" }, { id: "1" }, "create", [
        "index",
        "new",
        "show",
        "edit",
        "update",
        "destroy",
      ]);

      expect(set.namedRoutes.get("products")).not.toBeUndefined();
    });
  });

  it("resource has only update action and named route", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: "update" });
      });

      await tc.assertResourceAllowedRoutes("products", {}, { id: "1" }, "update", [
        "index",
        "new",
        "create",
        "show",
        "edit",
        "destroy",
      ]);
      await tc.assertResourceAllowedRoutes("products", { format: "xml" }, { id: "1" }, "update", [
        "index",
        "new",
        "create",
        "show",
        "edit",
        "destroy",
      ]);

      expect(set.namedRoutes.get("product")).not.toBeUndefined();
    });
  });

  it("resource has only destroy action and named route", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: "destroy" });
      });

      await tc.assertResourceAllowedRoutes("products", {}, { id: "1" }, "destroy", [
        "index",
        "new",
        "create",
        "show",
        "edit",
        "update",
      ]);
      await tc.assertResourceAllowedRoutes("products", { format: "xml" }, { id: "1" }, "destroy", [
        "index",
        "new",
        "create",
        "show",
        "edit",
        "update",
      ]);

      expect(set.namedRoutes.get("product")).not.toBeUndefined();
    });
  });

  it("singleton resource has only create action and named route", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { only: "create" });
      });

      await tc.assertSingletonResourceAllowedRoutes("accounts", {}, "create", [
        "new",
        "show",
        "edit",
        "update",
        "destroy",
      ]);
      await tc.assertSingletonResourceAllowedRoutes("accounts", { format: "xml" }, "create", [
        "new",
        "show",
        "edit",
        "update",
        "destroy",
      ]);

      expect(set.namedRoutes.get("account")).not.toBeUndefined();
    });
  });

  it("singleton resource has only update action and named route", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { only: "update" });
      });

      await tc.assertSingletonResourceAllowedRoutes("accounts", {}, "update", [
        "new",
        "create",
        "show",
        "edit",
        "destroy",
      ]);
      await tc.assertSingletonResourceAllowedRoutes("accounts", { format: "xml" }, "update", [
        "new",
        "create",
        "show",
        "edit",
        "destroy",
      ]);

      expect(set.namedRoutes.get("account")).not.toBeUndefined();
    });
  });

  it("singleton resource has only destroy action and named route", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { only: "destroy" });
      });

      await tc.assertSingletonResourceAllowedRoutes("accounts", {}, "destroy", [
        "new",
        "create",
        "show",
        "edit",
        "update",
      ]);
      await tc.assertSingletonResourceAllowedRoutes("accounts", { format: "xml" }, "destroy", [
        "new",
        "create",
        "show",
        "edit",
        "update",
      ]);

      expect(set.namedRoutes.get("account")).not.toBeUndefined();
    });
  });

  it("resource has only collection action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: [] }, () => {
          this.get("sale", { on: "collection" });
        });
      });

      await tc.assertResourceAllowedRoutes(
        "products",
        {},
        { id: "1" },
        [],
        ["index", "new", "create", "show", "edit", "update", "destroy"],
      );
      await tc.assertResourceAllowedRoutes(
        "products",
        { format: "xml" },
        { id: "1" },
        [],
        ["index", "new", "create", "show", "edit", "update", "destroy"],
      );

      tc.assertRecognizes(
        { controller: "products", action: "sale" },
        { path: "products/sale", method: "get" },
      );
      tc.assertRecognizes(
        { controller: "products", action: "sale", format: "xml" },
        { path: "products/sale.xml", method: "get" },
      );
    });
  });

  it("resource has only member action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: [] }, () => {
          this.get("preview", { on: "member" });
        });
      });

      await tc.assertResourceAllowedRoutes(
        "products",
        {},
        { id: "1" },
        [],
        ["index", "new", "create", "show", "edit", "update", "destroy"],
      );
      await tc.assertResourceAllowedRoutes(
        "products",
        { format: "xml" },
        { id: "1" },
        [],
        ["index", "new", "create", "show", "edit", "update", "destroy"],
      );

      tc.assertRecognizes(
        { controller: "products", action: "preview", id: "1" },
        { path: "products/1/preview", method: "get" },
      );
      tc.assertRecognizes(
        { controller: "products", action: "preview", id: "1", format: "xml" },
        { path: "products/1/preview.xml", method: "get" },
      );
    });
  });

  it("singleton resource has only member action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("account", { only: [] }, () => {
          this.member(() => {
            this.get("signup");
          });
        });
      });

      await tc.assertSingletonResourceAllowedRoutes(
        "accounts",
        {},
        [],
        ["new", "create", "show", "edit", "update", "destroy"],
      );
      await tc.assertSingletonResourceAllowedRoutes(
        "accounts",
        { format: "xml" },
        [],
        ["new", "create", "show", "edit", "update", "destroy"],
      );

      tc.assertRecognizes(
        { controller: "accounts", action: "signup" },
        { path: "account/signup", method: "get" },
      );
      tc.assertRecognizes(
        { controller: "accounts", action: "signup", format: "xml" },
        { path: "account/signup.xml", method: "get" },
      );
    });
  });

  it("nested resource has only show and member action", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: ["index", "show"] }, () => {
          this.resources("images", { only: "show" }, () => {
            this.get("thumbnail", { on: "member" });
          });
        });
      });

      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1" },
        { id: "2" },
        "show",
        ["index", "new", "create", "edit", "update", "destroy"],
        "products/1/images",
      );
      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1", format: "xml" },
        { id: "2" },
        "show",
        ["index", "new", "create", "edit", "update", "destroy"],
        "products/1/images",
      );

      tc.assertRecognizes(
        { controller: "images", action: "thumbnail", product_id: "1", id: "2" },
        { path: "products/1/images/2/thumbnail", method: "get" },
      );
      tc.assertRecognizes(
        { controller: "images", action: "thumbnail", product_id: "1", id: "2", format: "jpg" },
        { path: "products/1/images/2/thumbnail.jpg", method: "get" },
      );
    });
  });

  it("nested resource does not inherit only option", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: "show" }, () => {
          this.resources("images", { except: "destroy" });
        });
      });

      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1" },
        { id: "2" },
        ["index", "new", "create", "show", "edit", "update"],
        "destroy",
        "products/1/images",
      );
      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1", format: "xml" },
        { id: "2" },
        ["index", "new", "create", "show", "edit", "update"],
        "destroy",
        "products/1/images",
      );
    });
  });

  it("nested resource does not inherit only option by default", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { only: "show" }, () => {
          this.resources("images");
        });
      });

      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1" },
        { id: "2" },
        ["index", "new", "create", "show", "edit", "update", "destroy"],
        [],
        "products/1/images",
      );
      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1", format: "xml" },
        { id: "2" },
        ["index", "new", "create", "show", "edit", "update", "destroy"],
        [],
        "products/1/images",
      );
    });
  });

  it("nested resource does not inherit except option", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { except: "show" }, () => {
          this.resources("images", { only: "destroy" });
        });
      });

      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1" },
        { id: "2" },
        "destroy",
        ["index", "new", "create", "show", "edit", "update"],
        "products/1/images",
      );
      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1", format: "xml" },
        { id: "2" },
        "destroy",
        ["index", "new", "create", "show", "edit", "update"],
        "products/1/images",
      );
    });
  });

  it("nested resource does not inherit except option by default", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("products", { except: "show" }, () => {
          this.resources("images");
        });
      });

      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1" },
        { id: "2" },
        ["index", "new", "create", "show", "edit", "update", "destroy"],
        [],
        "products/1/images",
      );
      await tc.assertResourceAllowedRoutes(
        "images",
        { product_id: "1", format: "xml" },
        { id: "2" },
        ["index", "new", "create", "show", "edit", "update", "destroy"],
        [],
        "products/1/images",
      );
    });
  });

  it("default singleton restful route uses get", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resource("product");
      });

      tc.assertRouting("/product", { controller: "products", action: "show" });
      expect(set.recognizePath("/product", { method: "get" })).toBeTruthy();
    });
  });

  it("assert routing accepts all as a valid method", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.match("/products", { to: "products#show", via: ":all" });
      });

      tc.assertRouting(
        { method: "all", path: "/products" },
        { controller: "products", action: "show" },
      );
    });
  });

  it("assert routing fails when not all http methods are recognized", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.match("/products", { to: "products#show", via: [":get", ":post", ":put"] });
      });

      await assertRaises([Assertion], {}, () => {
        tc.assertRouting(
          { method: "all", path: "/products" },
          { controller: "products", action: "show" },
        );
      });
    });
  });

  it("singleton resource name is not singularized", async () => {
    await tc.withSingletonResources("products", async () => {
      await tc.assertSingletonRestfulFor("products");
    });
  });

  it("invalid only option for resources", async () => {
    const expectedMessage =
      "Route `resources :products` - :only and :except must include only [:index, :create, :new, :show, :update, :destroy, :edit], but also included [:foo, :bar]";
    await assertRaises([ArgumentError], { match: expectedMessage }, async () => {
      await tc.withRouting(async (set: RouteSet) => {
        set.draw(function () {
          this.resources("products", { only: ["foo", "bar"] as never });
        });
      });
    });
  });

  it("invalid only option for singleton resource", async () => {
    const expectedMessage =
      "Route `resource :products` - :only and :except must include only [:show, :create, :update, :destroy, :new, :edit], but also included [:foo, :bar]";
    await assertRaises([ArgumentError], { match: expectedMessage }, async () => {
      await tc.withRouting(async (set: RouteSet) => {
        set.draw(function () {
          this.resource("products", { only: ["foo", "bar"] as never });
        });
      });
    });
  });

  it("invalid except option for resources", async () => {
    const expectedMessage =
      "Route `resources :products` - :only and :except must include only [:index, :create, :new, :show, :update, :destroy, :edit], but also included [:foo]";

    await assertRaises([ArgumentError], { match: expectedMessage }, async () => {
      await tc.withRouting(async (set: RouteSet) => {
        set.draw(function () {
          this.resources("products", { except: "foo" as never });
        });
      });
    });
  });

  it("invalid except option for singleton resource", async () => {
    const expectedMessage =
      "Route `resource :products` - :only and :except must include only [:show, :create, :update, :destroy, :new, :edit], but also included [:foo]";
    await assertRaises([ArgumentError], { match: expectedMessage }, async () => {
      await tc.withRouting(async (set: RouteSet) => {
        set.draw(function () {
          this.resource("products", { except: "foo" as never });
        });
      });
    });
  });
});
