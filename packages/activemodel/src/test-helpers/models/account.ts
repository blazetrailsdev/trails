import { include } from "@blazetrails/activesupport";
import { ForbiddenAttributesProtection } from "../../forbidden-attributes-protection.js";

export class Account {
  declare sanitizeForMassAssignment: (
    attributes: Record<string, unknown> | Map<string, unknown>,
  ) => Record<string, unknown> | Map<string, unknown>;

  static {
    include(this, ForbiddenAttributesProtection);
  }
}
