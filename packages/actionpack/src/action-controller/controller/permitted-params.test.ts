import { beforeEach, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import type { Parameters } from "../metal/strong-parameters.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

class PeopleController extends Base {
  async create(): Promise<void> {
    await this.render({
      plain: (this.params.get("person") as Parameters).permitted ? "permitted" : "forbidden",
    });
  }

  async createWithPermit(): Promise<void> {
    await this.render({
      plain: (this.params.get("person") as Parameters).permit("name").permitted
        ? "permitted"
        : "forbidden",
    });
  }
}

describe("ActionControllerPermittedParamsTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new PeopleController();
    await tc.beforeSetup();
  });

  it("parameters are forbidden", async () => {
    await tc.post("create", { params: { person: { name: "Mjallo!" } } });
    expect(tc.response.body).toBe("forbidden");
  });

  it("parameters can be permitted and are then not forbidden", async () => {
    await tc.post("create_with_permit", { params: { person: { name: "Mjallo!" } } });
    expect(tc.response.body).toBe("permitted");
  });
});
