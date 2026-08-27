import {
  indexWith,
  withIndifferentAccess,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { NoMethodError } from "./attribute-assignment.js";

export class Access {
  /** @missingRailsArgs index_with — PERMANENT */
  slice(...methods: (string | string[])[]): HashWithIndifferentAccess<unknown> {
    return withIndifferentAccess(
      Object.fromEntries(indexWith(methods.flat(), (method) => publicSend(this, method))),
    );
  }

  valuesAt(...methods: (string | string[])[]): unknown[] {
    return methods.flat().map((method) => publicSend(this, method));
  }
}

function publicSend(obj: object, method: string): unknown {
  if (!(method in obj)) {
    throw new NoMethodError(
      `undefined method '${method}' for an instance of ${obj.constructor.name}`,
    );
  }
  const value = (obj as Record<string, unknown>)[method];
  return typeof value === "function" ? (value as () => unknown).call(obj) : value;
}
