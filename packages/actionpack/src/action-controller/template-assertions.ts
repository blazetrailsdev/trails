import { NameError } from "@blazetrails/activesupport";

class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

export function assertTemplate(options: Record<string, unknown> = {}, message?: string): never {
  throw new NoMethodError(
    'assert_template has been extracted to a gem. To continue using it,\n        add `gem "rails-controller-testing"` to your Gemfile.',
  );
}
