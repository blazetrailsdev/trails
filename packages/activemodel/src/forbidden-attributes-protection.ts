import { rbObjRespondTo } from "@blazetrails/ruby-compat";

export class ForbiddenAttributesError extends globalThis.Error {}
ForbiddenAttributesError.prototype.name = "ForbiddenAttributesError";

export interface PermittedAttributes {
  isPermitted(): boolean;
  readonly keys: string[] | (() => string[]);
  toH(): Record<string, unknown> | Map<string, unknown>;
}

/** @internal */
export function sanitizeForMassAssignment(
  attributes: Record<string, unknown> | Map<string, unknown> | PermittedAttributes,
): Record<string, unknown> | Map<string, unknown> {
  const attrs = attributes as Record<string, unknown> & Partial<PermittedAttributes>;
  if (rbObjRespondTo(attrs, "isPermitted")) {
    if (!attrs.isPermitted!()) {
      throw new ForbiddenAttributesError();
    }
    return attrs.toH!();
  }
  return attrs;
}

/** @internal */
export const sanitizeForbiddenAttributes = sanitizeForMassAssignment;

export const ForbiddenAttributesProtection = {
  sanitizeForMassAssignment,
  sanitizeForbiddenAttributes,
};
