import { include } from "@blazetrails/activesupport";
import { ForbiddenAttributesProtection } from "../../forbidden-attributes-protection.js";

export class Account {
  declare sanitizeForMassAssignment: (
    attributes: Record<string, unknown>,
  ) => Record<string, unknown>;

  static {
    include(this, ForbiddenAttributesProtection);
  }
}
