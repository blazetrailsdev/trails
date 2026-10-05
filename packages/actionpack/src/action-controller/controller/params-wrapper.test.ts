import { assertCalled, assertEqual, Inflections, inflections } from "@blazetrails/activesupport";
import { except, rbObjDup, registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, it } from "vitest";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import { SharedTestRoutes } from "../../test-helpers/abstract-unit.js";

registerConstant("Admin::User", class User {});

let tc: TestCase;

async function withDefaultWrapperOptions(block: () => void | Promise<void>): Promise<void> {
  const klass = tc.controller.constructor as typeof Base;
  klass._setWrapperOptions({ format: [":json"] });
  klass.inheritedParamsWrapper();
  await block();
}

function assertParameters(expected: Record<string, unknown>): void {
  assertEqual(
    expected,
    ((tc.constructor as typeof TestCase).controllerClass as unknown as { lastParameters: unknown })
      .lastParameters,
  );
}

describe("ParamsWrapperTest", () => {
  class UsersController extends Base {
    static lastParameters: Record<string, unknown> | null = null;

    parse() {
      (this.constructor as typeof UsersController).lastParameters = except(
        this.request.params,
        "controller",
        "action",
      );
      this.head("ok");
    }
  }
  Object.defineProperty(UsersController, "name", { value: "ParamsWrapperTest::UsersController" });

  class User {
    static attributeNames(): string[] {
      return [];
    }

    static storedAttributes(): Record<string, string[]> {
      return { settings: ["color", "size"] };
    }
  }
  registerConstant("ParamsWrapperTest::User", User);

  class Person {
    static attributeNames(): string[] {
      return [];
    }
  }
  registerConstant("ParamsWrapperTest::Person", Person);

  class ParamsWrapperTest extends TestCase {
    static {
      this.tests(UsersController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  beforeEach(async ({ task }) => {
    tc = new ParamsWrapperTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  afterEach(() => {
    UsersController.lastParameters = null;
  });

  it("filtered parameters", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu" } });
      assertEqual(
        {
          controller: "params_wrapper_test/users",
          action: "parse",
          username: "sikachu",
          user: { username: "sikachu" },
        },
        tc.request.filteredParameters(),
      );
    });
  });

  it("derived name from controller", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu" } });
      assertParameters({ username: "sikachu", user: { username: "sikachu" } });
    });
  });

  it("store accessors wrapped", async () => {
    await assertCalled(User, "attributeNames", null, { times: 2, returns: ["username"] }, () =>
      withDefaultWrapperOptions(async () => {
        tc.request.env["CONTENT_TYPE"] = "application/json";
        await tc.post("parse", { params: { username: "sikachu", color: "blue", size: "large" } });
        assertParameters({
          username: "sikachu",
          color: "blue",
          size: "large",
          user: { username: "sikachu", color: "blue", size: "large" },
        });
      }),
    );
  });

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
      assertParameters({ username: "sikachu", title: "Developer", user: { username: "sikachu" } });
    });
  });

  it("specify exclude option", async () => {
    await withDefaultWrapperOptions(async () => {
      UsersController.wrapParameters({ exclude: "title" });

      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({ username: "sikachu", title: "Developer", user: { username: "sikachu" } });
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

  it("not enabled format", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/xml";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({ username: "sikachu", title: "Developer" });
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

  it("not wrap reserved parameters", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", {
        params: {
          authenticity_token: "pwned",
          _method: "put",
          utf8: "&#9731;",
          username: "sikachu",
        },
      });
      assertParameters({
        authenticity_token: "pwned",
        _method: "put",
        utf8: "&#9731;",
        username: "sikachu",
        user: { username: "sikachu" },
      });
    });
  });

  it("no double wrap if key exists", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { user: { username: "sikachu" } } });
      assertParameters({ user: { username: "sikachu" } });
    });
  });

  it("no double wrap if key exists and value is nil", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { user: null } });
      assertParameters({ user: null });
    });
  });

  it("nested params", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { person: { username: "sikachu" } } });
      assertParameters({
        person: { username: "sikachu" },
        user: { person: { username: "sikachu" } },
      });
    });
  });

  it("derived wrapped keys from matching model", async () => {
    await assertCalled(User, "attributeNames", null, { times: 2, returns: ["username"] }, () =>
      withDefaultWrapperOptions(async () => {
        tc.request.env["CONTENT_TYPE"] = "application/json";
        await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
        assertParameters({
          username: "sikachu",
          title: "Developer",
          user: { username: "sikachu" },
        });
      }),
    );
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

  it("not wrapping abstract model", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
      assertParameters({
        username: "sikachu",
        title: "Developer",
        user: { username: "sikachu", title: "Developer" },
      });
    });
  });

  it("preserves query string params", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.get("parse", { params: { user: { username: "nixon" } } });
      assertParameters({ user: { username: "nixon" } });
    });
  });

  it("preserves query string params in filtered params", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.get("parse", { params: { user: { username: "nixon" } } });
      assertEqual(
        {
          controller: "params_wrapper_test/users",
          action: "parse",
          user: { username: "nixon" },
        },
        tc.request.filteredParameters(),
      );
    });
  });

  it("empty parameter set", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: {} });
      assertParameters({ user: {} });
    });
  });

  it("handles empty content type", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = null;
      await (ParamsWrapperTest._controllerClass as typeof UsersController).dispatch(
        "parse",
        tc.request,
        tc.response,
      );

      assertEqual(200, tc.response.status);
      assertEqual("", tc.response.body);
    });
  });

  it("derived wrapped keys from nested attributes", async () => {
    (User as unknown as Record<string, unknown>).nestedAttributesOptions = () => ({ person: {} });

    await assertCalled(User, "attributeNames", null, { times: 2, returns: ["username"] }, () =>
      withDefaultWrapperOptions(async () => {
        tc.request.env["CONTENT_TYPE"] = "application/json";
        await tc.post("parse", {
          params: { username: "sikachu", person_attributes: { title: "Developer" } },
        });
        assertParameters({
          username: "sikachu",
          person_attributes: { title: "Developer" },
          user: { username: "sikachu", person_attributes: { title: "Developer" } },
        });
      }),
    );
  });
});

describe("NamespacedParamsWrapperTest", () => {
  class UsersController extends Base {
    static lastParameters: Record<string, unknown> | null = null;

    parse() {
      (this.constructor as typeof UsersController).lastParameters = except(
        this.request.params,
        "controller",
        "action",
      );
      this.head("ok");
    }
  }
  Object.defineProperty(UsersController, "name", {
    value: "NamespacedParamsWrapperTest::Admin::Users::UsersController",
  });

  class SampleOne {
    static attributeNames(): string[] {
      return ["username"];
    }

    static attributeAliases(): Record<string, string> {
      return { nick: "username" };
    }
  }

  class SampleTwo {
    static attributeNames(): string[] {
      return ["title"];
    }
  }

  class NamespacedParamsWrapperTest extends TestCase {
    static {
      this.tests(UsersController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  beforeEach(async ({ task }) => {
    tc = new NamespacedParamsWrapperTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  afterEach(() => {
    UsersController.lastParameters = null;
  });

  it("derived name from controller", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu" } });
      assertParameters({ username: "sikachu", user: { username: "sikachu" } });
    });
  });

  it("namespace lookup from model", async () => {
    const user = class extends SampleOne {};
    registerConstant("NamespacedParamsWrapperTest::Admin::User", user);
    try {
      await withDefaultWrapperOptions(async () => {
        tc.request.env["CONTENT_TYPE"] = "application/json";
        await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
        assertParameters({
          username: "sikachu",
          title: "Developer",
          user: { username: "sikachu" },
        });
      });
    } finally {
      unregisterConstant("NamespacedParamsWrapperTest::Admin::User", user);
    }
  });

  it("namespace lookup from model alias", async () => {
    const user = class extends SampleOne {};
    registerConstant("NamespacedParamsWrapperTest::Admin::User", user);
    try {
      await withDefaultWrapperOptions(async () => {
        tc.request.env["CONTENT_TYPE"] = "application/json";
        await tc.post("parse", { params: { nick: "sikachu", title: "Developer" } });
        assertParameters({ nick: "sikachu", title: "Developer", user: { nick: "sikachu" } });
      });
    } finally {
      unregisterConstant("NamespacedParamsWrapperTest::Admin::User", user);
    }
  });

  it("hierarchy namespace lookup from model", async () => {
    const user = class extends SampleTwo {};
    registerConstant("User", user);
    try {
      await withDefaultWrapperOptions(async () => {
        tc.request.env["CONTENT_TYPE"] = "application/json";
        await tc.post("parse", { params: { username: "sikachu", title: "Developer" } });
        assertParameters({
          username: "sikachu",
          title: "Developer",
          user: { title: "Developer" },
        });
      });
    } finally {
      unregisterConstant("User", user);
    }
  });
});

describe("AnonymousControllerParamsWrapperTest", () => {
  class AnonymousControllerParamsWrapperTest extends TestCase {
    static {
      this.tests(
        class extends Base {
          static lastParameters: Record<string, unknown> | null = null;

          parse() {
            (this.constructor as unknown as { lastParameters: unknown }).lastParameters = except(
              this.request.params,
              "controller",
              "action",
            );
            this.head("ok");
          }
        },
      );
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  beforeEach(async ({ task }) => {
    tc = new AnonymousControllerParamsWrapperTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("does not implicitly wrap params", async () => {
    await withDefaultWrapperOptions(async () => {
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu" } });
      assertParameters({ username: "sikachu" });
    });
  });

  it("does wrap params if name provided", async () => {
    await withDefaultWrapperOptions(async () => {
      (tc.controller.constructor as typeof Base).wrapParameters({ name: "guest" });
      tc.request.env["CONTENT_TYPE"] = "application/json";
      await tc.post("parse", { params: { username: "sikachu" } });
      assertParameters({ username: "sikachu", guest: { username: "sikachu" } });
    });
  });
});

describe("IrregularInflectionParamsWrapperTest", () => {
  class ParamswrappernewsItem {
    static attributeNames(): string[] {
      return ["test_attr"];
    }
  }
  registerConstant(
    "IrregularInflectionParamsWrapperTest::ParamswrappernewsItem",
    ParamswrappernewsItem,
  );

  class ParamswrappernewsController extends Base {
    static lastParameters: Record<string, unknown> | null = null;

    parse() {
      (this.constructor as typeof ParamswrappernewsController).lastParameters = except(
        this.request.params,
        "controller",
        "action",
      );
      this.head("ok");
    }
  }
  Object.defineProperty(ParamswrappernewsController, "name", {
    value: "IrregularInflectionParamsWrapperTest::ParamswrappernewsController",
  });

  class IrregularInflectionParamsWrapperTest extends TestCase {
    static {
      this.tests(ParamswrappernewsController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  beforeEach(async ({ task }) => {
    tc = new IrregularInflectionParamsWrapperTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("uses model attribute names with irregular inflection", async () => {
    await withDup(async () => {
      inflections("en", (inflect) => {
        inflect.irregular("paramswrappernews_item", "paramswrappernews");
      });

      await withDefaultWrapperOptions(async () => {
        tc.request.env["CONTENT_TYPE"] = "application/json";
        await tc.post("parse", { params: { username: "sikachu", test_attr: "test_value" } });
        assertParameters({
          username: "sikachu",
          test_attr: "test_value",
          paramswrappernews_item: { test_attr: "test_value" },
        });
      });
    });
  });

  async function withDup(block: () => Promise<void>): Promise<void> {
    const instances = (Inflections as unknown as { instances: Map<string, Inflections> }).instances;
    const original = instances.get("en")!;
    instances.set("en", rbObjDup(original));
    try {
      await block();
    } finally {
      instances.set("en", original);
    }
  }
});
