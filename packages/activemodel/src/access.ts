import {
  indexWith,
  withIndifferentAccess,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { flatten, rbFSend } from "@blazetrails/ruby-compat";

export class Access {
  slice(...methods: unknown[]): HashWithIndifferentAccess<unknown> {
    return withIndifferentAccess(indexWith(flatten(methods), (method) => rbFSend(this, method)));
  }

  valuesAt(...methods: unknown[]): unknown[] {
    return flatten(methods).map((method) => rbFSend(this, method));
  }
}
