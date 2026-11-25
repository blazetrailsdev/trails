import {
  indexWith,
  withIndifferentAccess,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { flatten } from "@blazetrails/ruby-compat/array";
import { rbFSend } from "@blazetrails/ruby-compat/object";

export class Access {
  slice(...methods: unknown[]): HashWithIndifferentAccess<unknown> {
    return withIndifferentAccess(indexWith(flatten(methods), (method) => rbFSend(this, method)));
  }

  valuesAt(...methods: unknown[]): unknown[] {
    return flatten(methods).map((method) => rbFSend(this, method));
  }
}
