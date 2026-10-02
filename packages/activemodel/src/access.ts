import {
  indexWith,
  withIndifferentAccess,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { rbFPublicSend } from "@blazetrails/ruby-compat";

export class Access {
  slice(...methods: unknown[]): HashWithIndifferentAccess<unknown> {
    return withIndifferentAccess(
      indexWith(methods.flat(Infinity) as string[], (method) => rbFPublicSend(this, method)),
    );
  }

  valuesAt(...methods: unknown[]): unknown[] {
    return (methods.flat(Infinity) as string[]).map((method) => rbFPublicSend(this, method));
  }
}
