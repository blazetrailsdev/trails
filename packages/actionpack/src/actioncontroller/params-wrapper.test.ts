import { describe, it, expect } from "vitest";
import {
  wrapParameters,
  applyParamsWrapper,
  deriveWrapperKey,
} from "./params-wrapper.js";
import { Parameters } from "../actiondispatch/parameters.js";

// ==========================================================================
// action_controller/params_wrapper_test.rb
// ==========================================================================
describe("ActionController::ParamsWrapper", () => {
  describe("wrapParameters", () => {
    it("creates config with key", () => {
      const config = wrapParameters("user");
      expect(config.key).toBe("user");
    });

    it("defaults to json format", () => {
      const config = wrapParameters("user");
      expect(config.format.has("json")).toBe(true);
    });

    it("accepts custom format", () => {
      const config = wrapParameters("user", { format: "xml" });
      expect(config.format.has("xml")).toBe(true);
      expect(config.format.has("json")).toBe(false);
    });

    it("accepts multiple formats", () => {
      const config = wrapParameters("user", { format: ["json", "xml"] });
      expect(config.format.has("json")).toBe(true);
      expect(config.format.has("xml")).toBe(true);
    });

    it("include restricts wrapped keys", () => {
      const config = wrapParameters("user", { include: ["name", "email"] });
      expect(config.include).not.toBeNull();
      expect(config.include!.has("name")).toBe(true);
      expect(config.include!.has("email")).toBe(true);
    });

    it("exclude adds to default exclusions", () => {
      const config = wrapParameters("user", { exclude: ["admin"] });
      expect(config.exclude.has("admin")).toBe(true);
      expect(config.exclude.has("controller")).toBe(true); // default
    });
  });

  describe("applyParamsWrapper", () => {
    it("wraps parameters under key", () => {
      const config = wrapParameters("user");
      const params = new Parameters({ name: "Dean", email: "d@e.com" });
      const wrapped = applyParamsWrapper(params, config);

      const user = wrapped.get("user") as Parameters;
      expect(user).toBeInstanceOf(Parameters);
      expect(user.get("name")).toBe("Dean");
      expect(user.get("email")).toBe("d@e.com");
    });

    it("preserves original params at top level", () => {
      const config = wrapParameters("user");
      const params = new Parameters({ name: "Dean" });
      const wrapped = applyParamsWrapper(params, config);

      expect(wrapped.get("name")).toBe("Dean");
      expect(wrapped.get("user")).toBeInstanceOf(Parameters);
    });

    it("excludes framework parameters from wrapped hash", () => {
      const config = wrapParameters("user");
      const params = new Parameters({
        name: "Dean",
        controller: "users",
        action: "create",
        format: "json",
      });
      const wrapped = applyParamsWrapper(params, config);

      const user = wrapped.get("user") as Parameters;
      expect(user.get("name")).toBe("Dean");
      expect(user.has("controller")).toBe(false);
      expect(user.has("action")).toBe(false);
      expect(user.has("format")).toBe(false);
    });

    it("excludes authenticity_token", () => {
      const config = wrapParameters("user");
      const params = new Parameters({
        name: "Dean",
        authenticity_token: "abc123",
      });
      const wrapped = applyParamsWrapper(params, config);

      const user = wrapped.get("user") as Parameters;
      expect(user.has("authenticity_token")).toBe(false);
    });

    it("excludes custom exclude keys", () => {
      const config = wrapParameters("user", { exclude: ["admin"] });
      const params = new Parameters({ name: "Dean", admin: "true" });
      const wrapped = applyParamsWrapper(params, config);

      const user = wrapped.get("user") as Parameters;
      expect(user.has("admin")).toBe(false);
    });

    it("only includes specified keys when include is set", () => {
      const config = wrapParameters("user", { include: ["name"] });
      const params = new Parameters({ name: "Dean", email: "d@e.com", admin: "true" });
      const wrapped = applyParamsWrapper(params, config);

      const user = wrapped.get("user") as Parameters;
      expect(user.get("name")).toBe("Dean");
      expect(user.has("email")).toBe(false);
      expect(user.has("admin")).toBe(false);
    });

    it("does not wrap for non-matching format", () => {
      const config = wrapParameters("user"); // json only
      const params = new Parameters({ name: "Dean" });
      const result = applyParamsWrapper(params, config, "html");

      expect(result.has("user")).toBe(false);
    });

    it("wraps for matching format", () => {
      const config = wrapParameters("user", { format: "xml" });
      const params = new Parameters({ name: "Dean" });
      const result = applyParamsWrapper(params, config, "xml");

      expect(result.has("user")).toBe(true);
    });

    it("does not wrap if key already exists", () => {
      const config = wrapParameters("user");
      const userParams = new Parameters({ name: "Existing" });
      const params = new Parameters({ user: userParams, extra: "val" });
      const result = applyParamsWrapper(params, config);

      // Should return original, not double-wrap
      expect(result.get("user")).toBe(userParams);
    });

    it("does not wrap when no wrappable keys", () => {
      const config = wrapParameters("user");
      const params = new Parameters({ controller: "users", action: "create" });
      const result = applyParamsWrapper(params, config);

      expect(result.has("user")).toBe(false);
    });

    it("wraps empty params returns original", () => {
      const config = wrapParameters("user");
      const params = new Parameters({});
      const result = applyParamsWrapper(params, config);

      expect(result.has("user")).toBe(false);
    });
  });

  describe("deriveWrapperKey", () => {
    it("derives from simple controller name", () => {
      expect(deriveWrapperKey("UsersController")).toBe("user");
    });

    it("derives from singular controller name", () => {
      expect(deriveWrapperKey("UserController")).toBe("user");
    });

    it("derives from namespaced controller", () => {
      expect(deriveWrapperKey("Admin::PostsController")).toBe("post");
    });

    it("derives from slash-namespaced controller", () => {
      expect(deriveWrapperKey("Admin/PostsController")).toBe("post");
    });

    it("handles controller without Controller suffix", () => {
      expect(deriveWrapperKey("Posts")).toBe("post");
    });

    it("lowercases first letter", () => {
      expect(deriveWrapperKey("ArticlesController")).toBe("article");
    });
  });
});
