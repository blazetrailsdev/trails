import {
  indexWith,
  withIndifferentAccess,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { rbFPublicSend } from "@blazetrails/ruby-compat";

export class Access {
  slice(...methods: (string | string[])[]): HashWithIndifferentAccess<unknown> {
    return withIndifferentAccess(
      indexWith(methods.flat(), (method) => rbFPublicSend(this, method)),
    );
  }

  valuesAt(...methods: (string | string[])[]): unknown[] {
    return methods.flat().map((method) => rbFPublicSend(this, method));
  }
}
