import { Module, NoMethodError } from "@blazetrails/ruby-compat";

export function assertTemplate(options: Record<string, unknown> = {}, message?: string): never {
  throw new NoMethodError(
    'assert_template has been extracted to a gem. To continue using it,\n        add `gem "rails-controller-testing"` to your Gemfile.',
  );
}

export type TemplateAssertions = {
  assertTemplate: typeof assertTemplate;
};

export const TemplateAssertions = new Module((mod) => {
  mod.defineMethod("assertTemplate", assertTemplate);
});
