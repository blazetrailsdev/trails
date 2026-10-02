import { Module, NoMethodError, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActionController } from "../namespaces.js";

export function assertTemplate(options: Record<string, unknown> = {}, message?: string): never {
  throw new NoMethodError(
    'assert_template has been extracted to a gem. To continue using it,\n        add `gem "rails-controller-testing"` to your Gemfile.',
  );
}

export type TemplateAssertions = {
  assertTemplate: typeof assertTemplate;
};

export const TemplateAssertions = new Module((mod) => {
  mod.moduleEval((m) => {
    Object.assign(m, { assertTemplate });
  });
});

rbModConstSet(ActionController, "TemplateAssertions", TemplateAssertions);
