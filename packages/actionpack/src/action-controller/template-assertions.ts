/**
 * ActionController::TemplateAssertions
 *
 * Template-related test assertions for controller tests.
 * @see https://api.rubyonrails.org/classes/ActionController/TemplateAssertions.html
 */

import { NameError } from "@blazetrails/activesupport";

class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

/** Mirrors: `assert_template` (`action_controller/template_assertions.rb:7-11`). */
export function assertTemplate(options: Record<string, unknown> = {}, message?: string): never {
  throw new NoMethodError(
    'assert_template has been extracted to a gem. To continue using it,\n        add `gem "rails-controller-testing"` to your Gemfile.',
  );
}
