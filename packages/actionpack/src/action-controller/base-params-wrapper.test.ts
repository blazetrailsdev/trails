import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { Options as ParamsWrapperOptions } from "./metal/params-wrapper.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";

describe("Base ParamsWrapper wiring", () => {
  it("has default _wrapperOptions with empty format array", () => {
    expect(Base._wrapperOptions).toBeInstanceOf(ParamsWrapperOptions);
    expect(Base._wrapperOptions.format).toEqual([]);
  });

  it("wrapParameters with symbol/string sets name and binds klass", () => {
    class UsersController extends Base {}
    UsersController.wrapParameters("person", { include: ["name"] });
    expect(UsersController._wrapperOptions.name).toBe("person");
    expect(UsersController._wrapperOptions.include).toEqual(["name"]);
    expect(UsersController._wrapperOptions.klass).toBe(UsersController);
    // Parent unchanged
    expect(Base._wrapperOptions.name).toBeNull();
  });

  it("wrapParameters with hash merges format from current", () => {
    class A extends Base {}
    A.wrapParameters({ format: ["json"] });
    class B extends A {}
    // No own format set yet; inherits A's [json]
    expect(B._wrapperOptions.format).toEqual(["json"]);
    // Adding more options preserves format from current
    B.wrapParameters({ include: ["x"] });
    expect(B._wrapperOptions.format).toEqual(["json"]);
    expect(B._wrapperOptions.include).toEqual(["x"]);
  });

  it("wrapParameters derives default name from controller class when format enabled", () => {
    class UsersController extends Base {}
    UsersController.wrapParameters({ format: ["json"] });
    expect(UsersController._wrapperOptions.name).toBe("user");
    expect(UsersController._wrapperOptions.format).toEqual(["json"]);
  });

  it("wrapParameters(false) disables wrapping by zeroing format", () => {
    class C extends Base {}
    C.wrapParameters({ format: ["json"] });
    C.wrapParameters(false);
    expect(C._wrapperOptions.format).toEqual([]);
  });

  it("wrapParameters with class arg stores model", () => {
    class Model {}
    class D extends Base {}
    D.wrapParameters(Model);
    expect(D._wrapperOptions.model).toBe(Model);
    expect(D._wrapperOptions.klass).toBe(D);
  });

  it("inheritedParamsWrapper rebinds klass when format is enabled", () => {
    class Parent extends Base {}
    Parent.wrapParameters({ format: ["json"], name: "parent" });
    class Child extends Parent {}
    Child.inheritedParamsWrapper();
    expect(Child._wrapperOptions.klass).toBe(Child);
    expect(Child._wrapperOptions.name).toBe("parent");
    expect(Child._wrapperOptions.format).toEqual(["json"]);
    // Parent's options unchanged
    expect(Parent._wrapperOptions.klass).toBe(Parent);
  });

  it("inheritedParamsWrapper re-derives auto-derived name from subclass klass", () => {
    class UsersController extends Base {}
    UsersController.wrapParameters({ format: ["json"] });
    expect(UsersController._wrapperOptions.name).toBe("user");
    expect(UsersController._wrapperOptions.nameSet).toBe(false);
    class AdminsController extends UsersController {}
    AdminsController.inheritedParamsWrapper();
    // Re-derived from AdminsController, not inherited "user"
    expect(AdminsController._wrapperOptions.name).toBe("admin");
    expect(AdminsController._wrapperOptions.klass).toBe(AdminsController);
  });

  it("inheritedParamsWrapper is a no-op when format is empty", () => {
    class E extends Base {}
    const before = E._wrapperOptions;
    E.inheritedParamsWrapper();
    expect(E._wrapperOptions).toBe(before);
  });

  it("instance _wrapperOptions reads from constructor", () => {
    class F extends Base {}
    F.wrapParameters("widget");
    const instance = Object.create(F.prototype) as F;
    expect(instance._wrapperOptions.name).toBe("widget");
  });

  it("processAction wraps request params and exposes them via this.params", async () => {
    let seen: Record<string, unknown> | null = null;
    class WidgetsController extends Base {
      static actions = ["create"];
      create(): void {
        seen = this.params.toUnsafeHash();
        this.head(204);
      }
    }
    WidgetsController.wrapParameters({ format: ["json"], name: "widget" });
    const request = new Request({
      REQUEST_METHOD: "POST",
      PATH_INFO: "/widgets",
      HTTP_HOST: "localhost",
      CONTENT_TYPE: "application/json",
      "action_dispatch.request.request_parameters": { name: "alpha", color: "blue" },
    });
    const controller = new WidgetsController();
    await controller.dispatch("create", request, new Response());
    expect(seen).not.toBeNull();
    expect((seen as unknown as Record<string, unknown>).widget).toEqual({
      name: "alpha",
      color: "blue",
    });
    expect((seen as unknown as Record<string, unknown>).name).toBe("alpha");
  });

  it("processAction does not wrap when format does not match request content-type", async () => {
    let seen: Record<string, unknown> | null = null;
    class ThingsController extends Base {
      static actions = ["create"];
      create(): void {
        seen = this.params.toUnsafeHash();
        this.head(204);
      }
    }
    ThingsController.wrapParameters({ format: ["xml"], name: "thing" });
    const request = new Request({
      REQUEST_METHOD: "POST",
      PATH_INFO: "/things",
      HTTP_HOST: "localhost",
      CONTENT_TYPE: "application/json",
      "action_dispatch.request.request_parameters": { name: "beta" },
    });
    const controller = new ThingsController();
    await controller.dispatch("create", request, new Response());
    expect(seen).not.toBeNull();
    expect((seen as unknown as Record<string, unknown>).thing).toBeUndefined();
    expect((seen as unknown as Record<string, unknown>).name).toBe("beta");
  });
});
