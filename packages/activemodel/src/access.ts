import {
  indexWith,
  withIndifferentAccess,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { flatten, rbFPublicSend } from "@blazetrails/ruby-compat";

export class Access {
  slice(...methods: unknown[]): HashWithIndifferentAccess<unknown> {
    return withIndifferentAccess(
      indexWith(flatten(methods), (method) => rbFPublicSend(this, method)),
    );
  }

  valuesAt(...methods: unknown[]): unknown[] {
    return flatten(methods).map((method) => rbFPublicSend(this, method));
  }
}
