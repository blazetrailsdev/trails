import { assertCalled, assertEqual } from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, it } from "vitest";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import { SharedTestRoutes } from "../../test-helpers/abstract-unit.js";

class UsersController extends Base {
  static lastParameters: Record<string, unknown> | null = null;

  parse() {
    UsersController.lastParameters = except(this.request.params, "controller", "action");
    this.head("ok");
  }
}

class Person {
  static attributeNames(): string[] {
    return [];
  }
}

class ParamsWrapperTest extends TestCase {
  static {
    this.tests(UsersController);
  }

  override setup(): void {
    super.setup();
    this.routes = SharedTestRoutes;
  }
}

describe("ParamsWrapperTest", () => {
  let tc: ParamsWrapperTest;

  beforeEach(async ({ task }) => {
    tc = new ParamsWrapperTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  afterEach(() => {
    UsersController.lastParameters = null;
  });

  async function withDefaultWrapperOptions(block: () => void | Promise<void>): Promise<void> {
    const klass = tc.controller.constructor as typeof UsersController;
    klass._setWrapperOptions({ format: [":json"] });
    klass.inheritedParamsWrapper();
    await block();
  }

  function assertParameters(expected: Record<string, unknown>): void {
    assertEqual(expected, UsersController.lastParameters);
  }

  it("specify wrapper name", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters("person");

      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu" } });
      assertParameters({ username: "sikachu", person: { username: "sikachu" } });
    });
  });

  it("specify wrapper model", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters(Person);

      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu" } });
      assertParameters({ username: "sikachu", person: { username: "sikachu" } });
    });
  });

  it("specify include option", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters({ include: "username" });

      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({
        username: "sikachu",
        title: "Developer",
        user: { username: "sikachu" },
      });
    });
  });

  it("specify exclude option", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters({ exclude: "title" });

      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({
        username: "sikachu",
        title: "Developer",
        user: { username: "sikachu" },
      });
    });
  });

  it("specify both wrapper name and include option", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters("person", { include: "username" });

      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({
        username: "sikachu",
        title: "Developer",
        person: { username: "sikachu" },
      });
    });
  });

  it("wrap parameters false", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters(false);
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({ username: "sikachu", title: "Developer" });
    });
  });

  it("specify format", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters({ format: ":xml" });

      tc.request.env["CONTENT_TYPE"] = "application/xml";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({
        username: "sikachu",
        title: "Developer",
        user: { username: "sikachu", title: "Developer" },
      });
    });
  });

  it("derived wrapped keys from specified model", async () => {
    await withDefaultWrapperOptions(async () => {
      await assertCalled(
        Person,
        "attributeNames",
        null,
        { times: 2, returns: ["username"] },
        async () => {
          UsersController.wrapParameters(Person);

          tc.request.env["CONTENT_TYPE"] = "application/json";
          await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
          assertParameters({
            username: "sikachu",
            title: "Developer",
            person: { username: "sikachu" },
          });
        },
      );
    });
  });
});
