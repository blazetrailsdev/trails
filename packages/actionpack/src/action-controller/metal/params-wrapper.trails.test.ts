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
});
