import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { TopLevel, include } from "@blazetrails/ruby-compat";
import { Trails } from "../trails.js";
import type { Generation } from "../test-helpers/isolation/abstract-unit.js";
import "../test-helpers/isolation/abstract-unit.js";
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface ActionControllerTestCaseIntegrationTest extends Omit<
  Generation,
  keyof ActionController.TestCase
> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ActionControllerTestCaseIntegrationTest extends ActionController.TestCase {
  static executorAroundEachRequest: boolean | null | undefined;

  async setup(): Promise<void> {
    await this.buildApp();

    await this.appFile(
      "app/models/current.ts",
      `
        import { CurrentAttributes, setZone } from "@blazetrails/activesupport";
        export class Current extends CurrentAttributes {
          static {
            this.attribute("customer");

            this.resets(() => setZone("UTC"));
          }

          get customer() {
            return this.attributes["customer"];
          }
          set customer(customer) {
            this.attributes["customer"] = customer;
            setZone(customer?.timeZone ?? null);
          }
        }
`,
    );

    await this.appFile(
      "app/models/customer.ts",
      `
        export class Customer {
          constructor(name) {
            this.name = name;
          }

          get timeZone() {
            return "Copenhagen";
          }
        }
`,
    );

    await this.removeFromConfig(".*config\\.loadDefaults.*\\n");
    await this.addToConfig(
      `this.config.activeSupport.executorAroundTestCase = ${(this.constructor as typeof ActionControllerTestCaseIntegrationTest).executorAroundEachRequest};`,
    );

    await this.appFile(
      "app/controllers/customers-controller.ts",
      `
        import { ApplicationController } from "./application-controller.ts";
        import { Current } from "../models/current.ts";
        import { Customer } from "../models/customer.ts";
        export class CustomersController extends ApplicationController {
          static {
            this.layout(false);
          }

          async getCurrentCustomer() {
            await this.render("index");
          }

          async setCurrentCustomer() {
            Current.customer = new Customer("david");
            await this.render("index");
          }
        }
`,
    );

    await this.appFile(
      "app/views/customers/index.html.tse",
      `
      <%= TopLevel.Current.customer?.name ?? 'noone' %>,<%= timeZone().name %>
`,
    );

    await this.appFile(
      "app/helpers/application-helper.ts",
      `
        import { zone } from "@blazetrails/activesupport";
        export const ApplicationHelper = {
          timeZone: zone,
        };
`,
    );

    await this.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get("/customers/:action", { controller: "customers" });
        });
`,
    );

    await this.bootTrails();

    const { CustomersController } = TopLevel as unknown as {
      CustomersController: new () => InstanceType<typeof ActionController.Base>;
    };
    this.controller = new CustomersController();
    this.routes = Trails.application!.routes();
    await Trails.application!.reloadRoutesUnlessLoaded();
  }
}
include(ActionControllerTestCaseIntegrationTest, Isolation);

class WithExecutorIntegrationTest extends ActionControllerTestCaseIntegrationTest {
  static {
    this.executorAroundEachRequest = true;
  }
}

class WithoutExecutorIntegrationTest extends ActionControllerTestCaseIntegrationTest {
  static {
    this.executorAroundEachRequest = false;
  }
}

describe("WithExecutorIntegrationTest", () => {
  let t: WithExecutorIntegrationTest;
  beforeEach(async ({ task }) => {
    t = new WithExecutorIntegrationTest(task.name);
    await t.setup();
    await t.beforeSetup();
  }, 120_000);
  afterEach(() => t.teardownApp());

  it("current customer is cleared after each request", { timeout: 120_000 }, async () => {
    expect(Trails.application!.config.activeSupport.executorAroundTestCase).toBeTruthy();
    expect(ActionController.TestCase.executorAroundEachRequest).toBeTruthy();

    await t.get("getCurrentCustomer");
    t.assertResponse("ok");
    expect(t.response.body).toMatch(/noone,UTC/);

    await t.get("setCurrentCustomer");
    t.assertResponse("ok");
    expect(t.response.body).toMatch(/david,Copenhagen/);

    await t.get("getCurrentCustomer");
    t.assertResponse("ok");
    expect(t.response.body).toMatch(/noone,UTC/);
  });
});

describe("WithoutExecutorIntegrationTest", () => {
  let t: WithoutExecutorIntegrationTest;
  beforeEach(async ({ task }) => {
    t = new WithoutExecutorIntegrationTest(task.name);
    await t.setup();
    await t.beforeSetup();
  }, 120_000);
  afterEach(() => t.teardownApp());

  it("current customer is not cleared after each request", { timeout: 120_000 }, async () => {
    expect(Trails.application!.config.activeSupport.executorAroundTestCase).toBeFalsy();
    expect(ActionController.TestCase.executorAroundEachRequest).toBeFalsy();

    await t.get("getCurrentCustomer");
    t.assertResponse("ok");
    expect(t.response.body).toMatch(/noone,UTC/);

    await t.get("setCurrentCustomer");
    t.assertResponse("ok");
    expect(t.response.body).toMatch(/david,Copenhagen/);

    await t.get("getCurrentCustomer");
    t.assertResponse("ok");
    expect(t.response.body).toMatch(/david,Copenhagen/);
  });
});
