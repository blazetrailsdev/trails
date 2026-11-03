import { assertMatch, assertNoMatch, capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import {
  Dir,
  File,
  TopLevel,
  unregisterConstant,
  constGet,
  constSet,
} from "@blazetrails/ruby-compat";
import { beforeAll, beforeEach, describe, it } from "vitest";
import { ActiveModel } from "../../active-model.js";
import { Application } from "../../../application.js";
import "../../../test-unit/trailtie.js";
import { copyRoutes } from "../../generators-test-helper.js";
import { TestCase } from "../../test-case.js";

class ScaffoldControllerGeneratorApp extends Application {}
class ScaffoldControllerGeneratorTest extends TestCase {}
ScaffoldControllerGeneratorTest.destination(Dir.mktmpdir());
ScaffoldControllerGeneratorTest.arguments(["User", "name:string", "age:integer"]);
registerSpecType(/^ScaffoldControllerGeneratorTest$/, ScaffoldControllerGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await ScaffoldControllerGeneratorApp.instance().loadGenerators();
  const { ScaffoldControllerGenerator } = await import("./scaffold-controller-generator.js");
  ScaffoldControllerGeneratorTest.tests(ScaffoldControllerGenerator);
});

beforeEach(async (context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  await copyRoutes.call(t);
});

const CONTROLLER = "app/controllers/users-controller.ts";
const FUNCTIONAL = "test/controllers/users-controller.test.ts";
const POLYMORPHIC_PARAMS =
  'user: \\{ age: t\\["@user"\\]\\.age, name: t\\["@user"\\]\\.name, organization_id: t\\["@user"\\]\\.organization_id, organization_type: t\\["@user"\\]\\.organization_type \\}';

describe("ScaffoldControllerGeneratorTest", () => {
  it("controller skeleton is created", async () => {
    await t.runGenerator();

    await t.assertFile(CONTROLLER, async (content) => {
      assertMatch(/class UsersController extends ApplicationController/, content);

      await t.assertInstanceMethod("index", content, (m) => {
        assertMatch(/this\.users = await User\.all\(\)/, m);
      });

      await t.assertInstanceMethod("show", content);

      await t.assertInstanceMethod("new", content, (m) => {
        assertMatch(/this\.user = new User\(\)/, m);
      });

      await t.assertInstanceMethod("edit", content);

      await t.assertInstanceMethod("create", content, (m) => {
        assertMatch(/this\.user = new User\(this\.userParams\(\)\)/, m);
        assertMatch(/this\.user\.save\(\)/, m);
        assertMatch(/this\.redirectTo\(this\.user/, m);
      });

      await t.assertInstanceMethod("update", content, (m) => {
        assertMatch(/this\.user\.update\(this\.userParams\(\)\)/, m);
        assertMatch(/this\.redirectTo\(this\.user/, m);
        assertMatch(/status: "see_other"/, m);
      });

      await t.assertInstanceMethod("destroy", content, (m) => {
        assertMatch(/this\.user\.destroy/, m);
        assertMatch(/User was successfully destroyed/, m);
        assertMatch(/this\.redirectTo\(this\.usersPath\(\)/, m);
        assertMatch(/status: "see_other"/, m);
      });

      await t.assertInstanceMethod("setUser", content, (m) => {
        assertMatch(/this\.user = await User\.find\(this\.params\.expect\("id"\)\)/, m);
      });

      assertMatch(/userParams\(\)/, content);
      assertMatch(/this\.params\.expect\(\{ user: \["name", "age"\] \}\)/, content);
    });
  });

  it("dont use require or permit if there are no attributes", async () => {
    await t.runGenerator(["User"]);

    await t.assertFile("app/controllers/users-controller.ts", (content) => {
      assertMatch(/userParams\(\)/, content);
      assertMatch(/this\.params\.fetch\("user", \{\}\)/, content);
    });
  });

  it("controller permit references attributes", async () => {
    await t.runGenerator(["LineItem", "product:references", "cart:belongs_to"]);

    await t.assertFile("app/controllers/line-items-controller.ts", (content) => {
      assertMatch(/lineItemParams\(\)/, content);
      assertMatch(/this\.params\.expect\(\{ line_item: \["product_id", "cart_id"\] \}\)/, content);
    });
  });

  it("controller permit polymorphic references attributes", async () => {
    await t.runGenerator(["LineItem", "product:references{polymorphic}"]);

    await t.assertFile("app/controllers/line-items-controller.ts", (content) => {
      assertMatch(/lineItemParams\(\)/, content);
      assertMatch(
        /this\.params\.expect\(\{ line_item: \["product_id", "product_type"\] \}\)/,
        content,
      );
    });
  });

  it("controller permit attachment attributes", async () => {
    await t.runGenerator(["Message", "video:attachment", "photos:attachments"]);

    await t.assertFile("app/controllers/messages-controller.ts", (content) => {
      assertMatch(/messageParams\(\)/, content);
      assertMatch(
        /this\.params\.expect\(\{ message: \["video", \{ photos: \[\] \}\] \}\)/,
        content,
      );
    });
  });

  it("controller permit attachments attributes only", async () => {
    await t.runGenerator(["Message", "photos:attachments"]);

    await t.assertFile("app/controllers/messages-controller.ts", (content) => {
      assertMatch(/messageParams\(\)/, content);
      assertMatch(/this\.params\.expect\(\{ message: \[\{ photos: \[\] \}\] \}\)/, content);
    });
  });

  it("controller route are added", async () => {
    await t.runGenerator(["Message", "photos:attachments"]);

    await t.assertFile("config/routes.ts", (route) => {
      assertMatch(/this\.resources\("messages"\);$/m, route);
    });
  });

  it("controller route are skipped", async () => {
    await t.runGenerator(["Message", "photos:attachments", "--skip-routes"]);

    await t.assertFile("config/routes.ts", (route) => {
      assertNoMatch(/this\.resources\("messages"\);$/m, route);
    });
  });

  it("helper are invoked with a pluralized name", async () => {
    await t.runGenerator();
    await t.assertFile("app/helpers/users-helper.ts", /UsersHelper/);
  });

  it("views are generated", async () => {
    await t.runGenerator();

    for (const view of ["index", "edit", "new", "show"]) {
      await t.assertFile(`app/views/users/${view}.html.tse`);
    }
    t.assertNoFile("app/views/layouts/users.html.tse");
  });

  it("index page have notice", async () => {
    await t.runGenerator();

    for (const view of ["index", "show"]) {
      await t.assertFile(`app/views/users/${view}.html.tse`, /notice/);
    }
  });

  it("functional tests", async () => {
    await t.runGenerator([
      "User",
      "name:string",
      "age:integer",
      "organization:references{polymorphic}",
    ]);

    await t.assertFile(FUNCTIONAL, (content) => {
      assertMatch(/^export class UsersControllerTest extends IntegrationTest/m, content);
      assertMatch(/it\("should get index"/, content);
      assertMatch(
        new RegExp(
          `t\\.post\\(t\\.usersUrl\\(\\), \\{ params: \\{ ${POLYMORPHIC_PARAMS} \\} \\}\\)`,
        ),
        content,
      );
      assertMatch(
        new RegExp(
          `t\\.patch\\(t\\.userUrl\\(t\\["@user"\\]\\), \\{ params: \\{ ${POLYMORPHIC_PARAMS} \\} \\}\\)`,
        ),
        content,
      );
    });
  });

  it("functional tests without attributes", async () => {
    await t.runGenerator(["User"]);

    await t.assertFile(FUNCTIONAL, (content) => {
      assertMatch(/^export class UsersControllerTest extends IntegrationTest/m, content);
      assertMatch(/it\("should get index"/, content);
      assertMatch(/t\.post\(t\.usersUrl\(\), \{ params: \{ user: \{\} \} \}\)/, content);
      assertMatch(
        /t\.patch\(t\.userUrl\(t\["@user"\]\), \{ params: \{ user: \{\} \} \}\)/,
        content,
      );
    });
  });

  it("skip helper if required", async () => {
    await t.runGenerator(["User", "name:string", "age:integer", "--no-helper"]);
    t.assertNoFile("app/helpers/users-helper.ts");
  });

  it("skip layout if required", async () => {
    await t.runGenerator(["User", "name:string", "age:integer", "--no-layout"]);
    t.assertNoFile("app/views/layouts/users.html.tse");
  });

  it("default orm is used", async () => {
    await t.runGenerator(["User", "--orm=unknown"]);

    await t.assertFile(CONTROLLER, async (content) => {
      assertMatch(/class UsersController extends ApplicationController/, content);

      await t.assertInstanceMethod("index", content, (m) => {
        assertMatch(/this\.users = await User\.all\(\)/, m);
      });
    });
  });

  it("customized orm is used", async () => {
    const klass = class extends ActiveModel {
      static override all(klass: string): string {
        return `${klass}.find("all")`;
      }
    };

    constSet(TopLevel, "Unknown", {});
    constSet(constGet(Object, "Unknown") as object, "Generators", {});
    constSet(constGet(Object, "Unknown::Generators") as object, "ActiveModel", klass);
    try {
      await t.runGenerator(["User", "--orm=unknown"]);

      await t.assertFile(CONTROLLER, async (content) => {
        assertMatch(/class UsersController extends ApplicationController/, content);

        await t.assertInstanceMethod("index", content, (m) => {
          assertMatch(/this\.users = await User\.find\("all"\)/, m);
          assertNoMatch(/this\.users = await User\.all\(\)/, m);
        });
      });
    } finally {
      unregisterConstant("Unknown::Generators::ActiveModel", klass);
    }
  });

  it("model name option", async () => {
    await t.runGenerator(["Admin::User", "--model-name=User"]);
    await t.assertFile("app/controllers/admin/users-controller.ts", async (content) => {
      assertMatch("// GET /admin/users", content);
      await t.assertInstanceMethod("index", content, (m) => {
        assertMatch("this.users = await User.all()", m);
      });

      assertMatch("// POST /admin/users", content);
      await t.assertInstanceMethod("create", content, (m) => {
        assertMatch('this.redirectTo(["admin", this.user]', m);
      });

      assertMatch("// PATCH/PUT /admin/users/1", content);
      await t.assertInstanceMethod("update", content, (m) => {
        assertMatch('this.redirectTo(["admin", this.user]', m);
      });
    });

    await t.assertFile("app/views/admin/users/index.html.tse", (content) => {
      assertMatch("for (const user of this.users) {", content);
      assertMatch("render(user)", content);
      assertMatch('"Show this user", ["admin", user]', content);
      assertMatch('"New user", newAdminUserPath()', content);
    });

    await t.assertFile("app/views/admin/users/show.html.tse", (content) => {
      assertMatch("render(this.user)", content);
      assertMatch('"Edit this user", editAdminUserPath(this.user)', content);
      assertMatch('"Back to users", adminUsersPath()', content);
      assertMatch('"Destroy this user", ["admin", this.user]', content);
    });

    await t.assertFile("app/views/admin/users/_user.html.tse", (content) => {
      assertMatch("user", content);
      assertNoMatch("adminUser", content);
    });

    await t.assertFile("app/views/admin/users/new.html.tse", (content) => {
      assertMatch('render("form", { user: this.user })', content);
      assertMatch('"Back to users", adminUsersPath()', content);
    });

    await t.assertFile("app/views/admin/users/edit.html.tse", (content) => {
      assertMatch('render("form", { user: this.user })', content);
      assertMatch('"Show this user", ["admin", this.user]', content);
      assertMatch('"Back to users", adminUsersPath()', content);
    });

    await t.assertFile("app/views/admin/users/_form.html.tse", (content) => {
      assertMatch('model: ["admin", user]', content);
    });

    await t.assertFile("test/controllers/admin/users-controller.test.ts", (content) => {
      assertMatch("(t.adminUsersUrl()", content);
      assertMatch("(t.newAdminUserUrl()", content);
      assertMatch('(t.editAdminUserUrl(t["@user"])', content);
      assertMatch('(t.adminUserUrl(t["@user"])', content);
      assertNoMatch(/\bt\.(new|edit)?[uU]sers?(Path|Url)/, content);
    });
  });

  it.skip("controller tests pass by default inside mountable engine", () => {});

  it.skip("controller tests pass by default inside full engine", () => {});

  it("api only generates a proper api controller", async () => {
    await t.runGenerator(["User", "--api"]);

    await t.assertFile(CONTROLLER, async (content) => {
      assertMatch(/class UsersController extends ApplicationController/, content);
      assertNoMatch(/respondTo/, content);

      await t.assertInstanceMethod("index", content, (m) => {
        assertMatch(/this\.users = await User\.all\(\)/, m);
        assertMatch(/this\.render\(\{ json: this\.users \}\)/, m);
      });

      await t.assertInstanceMethod("show", content, (m) => {
        assertMatch(/this\.render\(\{ json: this\.user \}\)/, m);
      });

      await t.assertInstanceMethod("create", content, (m) => {
        assertMatch(/this\.user = new User\(this\.userParams\(\)\)/, m);
        assertMatch(/this\.user\.save\(\)/, m);
        assertMatch(/this\.user\.errors/, m);
      });

      await t.assertInstanceMethod("update", content, (m) => {
        assertMatch(/this\.user\.update\(this\.userParams\(\)\)/, m);
        assertMatch(/this\.user\.errors/, m);
      });

      await t.assertInstanceMethod("destroy", content, (m) => {
        assertMatch(/this\.user\.destroy/, m);
      });
    });

    for (const view of ["index", "edit", "show", "new", "_form"]) {
      t.assertNoFile(`app/views/users/${view}.html.tse`);
    }
  });

  it("api controller tests", async () => {
    await t.runGenerator([
      "User",
      "name:string",
      "age:integer",
      "organization:references{polymorphic}",
      "--api",
    ]);

    await t.assertFile(FUNCTIONAL, (content) => {
      assertMatch(/^export class UsersControllerTest extends IntegrationTest/m, content);
      assertMatch(/it\("should get index"/, content);
      assertMatch(
        new RegExp(
          `t\\.post\\(t\\.usersUrl\\(\\), \\{ params: \\{ ${POLYMORPHIC_PARAMS} \\}, as: "json" \\}\\)`,
        ),
        content,
      );
      assertMatch(
        new RegExp(
          `t\\.patch\\(t\\.userUrl\\(t\\["@user"\\]\\), \\{ params: \\{ ${POLYMORPHIC_PARAMS} \\}, as: "json" \\}\\)`,
        ),
        content,
      );
      assertNoMatch(/assertRedirectedTo/, content);
    });
  });

  it("api only generates params for attachments", async () => {
    await t.runGenerator(["Message", "video:attachment", "photos:attachments", "--api"]);

    await t.assertFile("app/controllers/messages-controller.ts", (content) => {
      assertMatch(/messageParams\(\)/, content);
      assertMatch(
        /this\.params\.expect\(\{ message: \["video", \{ photos: \[\] \}\] \}\)/,
        content,
      );
    });
  });

  it("api only doesnt use require or permit if there are no attributes", async () => {
    await t.runGenerator(["User", "--api"]);

    await t.assertFile("app/controllers/users-controller.ts", (content) => {
      assertMatch(/userParams\(\)/, content);
      assertMatch(/this\.params\.fetch\("user", \{\}\)/, content);
    });
  });

  it("check class collision", async () => {
    (TopLevel as Record<string, unknown>).UsersController = class {};
    try {
      const content = await capture("stderr", () => t.runGenerator());
      assertMatch(
        /The name 'UsersController' is either already used in your application or reserved/,
        content,
      );
    } finally {
      delete (TopLevel as Record<string, unknown>).UsersController;
    }
  });
});
