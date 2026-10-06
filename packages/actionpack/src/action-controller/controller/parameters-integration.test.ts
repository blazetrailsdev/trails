import { beforeEach, describe, expect, it } from "vitest";
import { assertNotDeprecated } from "@blazetrails/activesupport";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { deprecator } from "../deprecator.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import "../../test-helpers/abstract-unit.js";

class IntegrationController extends Base {
  async yamlParams(): Promise<void> {
    await this.render({ plain: YAML.dump(this.params) });
  }

  async permitParams(): Promise<void> {
    this.params.permit({ key1: {} });

    await this.render({ plain: "Home" });
  }
}

describe("ActionControllerParametersIntegrationTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new IntegrationController();
    await tc.beforeSetup();
  });

  // BLOCKED: psych-dump-puts-root-tag-on-its-own-line
  // BLOCKED: parameters-holds-a-plain-object-not-hash-with-indifferent-access
  it.skip("parameters can be serialized as YAML", async () => {
    await tc.post("yamlParams", { params: { person: { name: "Mjallo!" } } });
    const expected = `--- !ruby/object:ActionController::Parameters
parameters: !ruby/hash:ActiveSupport::HashWithIndifferentAccess
  person: !ruby/hash:ActiveSupport::HashWithIndifferentAccess
    name: Mjallo!
  controller: integration
  action: yaml_params
permitted: false
`;
    expect(tc.response.body).toBe(expected);
  });

  it("identical arrays can be permitted", async () => {
    const params = {
      key1: {
        a: [{ same_key: { c: 1 } }],
        b: [{ same_key: { c: 1 } }],
      },
    };

    await assertNotDeprecated(deprecator(), async () => {
      await tc.post("permitParams", { params });
    });
    assertResponse("ok");
  });
});
