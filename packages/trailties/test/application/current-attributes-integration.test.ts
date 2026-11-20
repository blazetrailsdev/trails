import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { zone } from "@blazetrails/activesupport";
import { Methods } from "@blazetrails/rack-test";
import { TopLevel, include } from "@blazetrails/ruby-compat";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { status: number; body: string };
  };

interface CurrentClass {
  customer: { name: string } | null;
}

class CurrentAttributesIntegrationTest extends TestCase {}
include(CurrentAttributesIntegrationTest, Isolation);
include(CurrentAttributesIntegrationTest, Methods);
registerSpecType(/^CurrentAttributesIntegrationTest$/, CurrentAttributesIntegrationTest);

describe("CurrentAttributesIntegrationTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new CurrentAttributesIntegrationTest("test") as unknown as Host;
    await t.buildApp();

    await t.appFile(
      "app/models/current.ts",
      `
        import { CurrentAttributes, setZone } from "@blazetrails/activesupport";
        export class Current extends CurrentAttributes {
          static {
            this.attribute("customer");

            this.resets(() => setZone("UTC"));
          }

          get customer() {
            return super.customer;
          }
          set customer(customer) {
            super.customer = customer;
            setZone(customer?.timeZone ?? null);
          }
        }
`,
    );

    await t.appFile(
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

    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get("/customers/:action", { controller: "customers" });
        });
`,
    );

    await t.appFile(
      "app/controllers/customers-controller.ts",
      `
        import { ApplicationController } from "./application-controller.ts";
        import { Current } from "../models/current.ts";
        import { Customer } from "../models/customer.ts";
        export class CustomersController extends ApplicationController {
          static {
            this.layout(false);
          }

          async setCurrentCustomer() {
            Current.customer = new Customer("david");
            await this.render("index");
          }

          async setNoCustomer() {
            await this.render("index");
          }
        }
`,
    );

    await t.appFile(
      "app/views/customers/index.html.tse",
      `
      <%= TopLevel.Current.customer?.name ?? 'noone' %>,<%= timeZone().name %>
`,
    );

    await t.appFile(
      "app/helpers/application-helper.ts",
      `
        import { zone } from "@blazetrails/activesupport";
        export const ApplicationHelper = {
          timeZone: zone,
        };
`,
    );

    await t.app("development");
  });

  afterEach(() => t.teardownApp());

  it("current customer is assigned and cleared", async () => {
    await t.get("/customers/setCurrentCustomer");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toMatch(/david,Copenhagen/);

    await t.get("/customers/setNoCustomer");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toMatch(/noone,UTC/);
  });

  it("resets after execution", async () => {
    const Current = TopLevel.Current as unknown as CurrentClass;
    const { Customer } = TopLevel as unknown as { Customer: new (name: string) => object };

    expect(Current.customer).toBeNull();
    expect((zone() as { name: string }).name).toBe("UTC");

    await Trails.application!.executor.wrap(() => {
      Current.customer = new Customer("david") as { name: string };

      expect(Current.customer.name).toBe("david");
      expect((zone() as { name: string }).name).toBe("Copenhagen");
    });

    expect(Current.customer).toBeNull();
    expect((zone() as { name: string }).name).toBe("UTC");
  });
});
