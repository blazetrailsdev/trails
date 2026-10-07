import { describe, it, expect } from "vitest";
import { API } from "../api.js";
import { Base } from "../base.js";
import { _wrapperKey, type ParamsWrapperHost } from "./params-wrapper.js";

describe("ParamsWrapper.inherited", () => {
  it("a subclass that never calls wrap_parameters wraps under its own name", () => {
    class UsersController extends Base {}
    UsersController.wrapParameters({ format: [":json"] });
    class AdminsController extends UsersController {}

    expect(_wrapperKey.call(AdminsController.prototype as unknown as ParamsWrapperHost)).toBe(
      "admin",
    );
    expect(AdminsController._wrapperOptions.klass).toBe(AdminsController);
    expect(AdminsController._wrapperOptions.format).toEqual([":json"]);
    expect(UsersController._wrapperOptions.name).toBe("user");
    expect(UsersController._wrapperOptions.klass).toBe(UsersController);
  });

  it("reaches a subclass through an ancestor that was never read", () => {
    class UsersController extends API {}
    UsersController.wrapParameters({ format: [":json"] });
    class MembersController extends UsersController {}
    class AdminsController extends MembersController {}

    expect(AdminsController._wrapperOptions.name).toBe("admin");
    expect(MembersController._wrapperOptions.name).toBe("member");
  });

  it("leaves a subclass on the inherited options while the format is empty", () => {
    class UsersController extends Base {}
    class AdminsController extends UsersController {}

    expect(AdminsController._wrapperOptions).toBe(Base._wrapperOptions);
  });

  it("runs before a subclass's own wrap_parameters, which keeps the inherited format", () => {
    class UsersController extends Base {}
    UsersController.wrapParameters({ format: [":json"] });
    class AdminsController extends UsersController {}
    AdminsController.wrapParameters({ include: ["username"] });

    expect(AdminsController._wrapperOptions.format).toEqual([":json"]);
    expect(AdminsController._wrapperOptions.klass).toBe(AdminsController);
    expect(AdminsController._wrapperOptions.name).toBe("admin");
  });

  it("is a no-op for a subclass read before its parent enables wrapping", () => {
    class UsersController extends Base {}
    class AdminsController extends UsersController {}
    expect(AdminsController._wrapperOptions.format).toEqual([]);
    UsersController.wrapParameters({ format: [":json"] });

    expect(AdminsController._wrapperOptions).toBe(UsersController._wrapperOptions);
    expect(AdminsController._wrapperOptions.name).toBe("user");
  });

  it("runs at a subclass's first read when its parent enabled wrapping after it was defined", () => {
    class UsersController extends Base {}
    class AdminsController extends UsersController {}
    UsersController.wrapParameters({ format: [":json"] });

    expect(AdminsController._wrapperOptions.klass).toBe(AdminsController);
    expect(AdminsController._wrapperOptions.name).toBe("admin");
  });
});
