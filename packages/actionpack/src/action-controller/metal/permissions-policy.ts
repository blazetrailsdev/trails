import type { CallbackOptions } from "../../abstract-controller/callbacks.js";
import { deleteHeaderCaseInsensitive } from "./header-utils.js";

export function applyPermissionsPolicy(
  headers: Record<string, string>,
  policy: string | false,
): void {
  deleteHeaderCaseInsensitive(headers, "permissions-policy");
  if (policy !== false) {
    headers["permissions-policy"] = policy;
  }
}

export function buildPermissionsPolicy(directives: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [feature, values] of Object.entries(directives)) {
    const valueList = Array.isArray(values) ? values.join(" ") : values;
    parts.push(`${feature}=(${valueList})`);
  }
  return parts.join(", ");
}

export type PermissionsPolicyBlock = (
  this: unknown,
  directives: Record<string, string | string[]>,
) => void;

interface PermissionsPolicyHost {
  beforeAction(callback: (controller: unknown) => void | boolean, options?: CallbackOptions): void;
}

export function permissionsPolicy(
  this: PermissionsPolicyHost,
  options: CallbackOptions = {},
  block?: PermissionsPolicyBlock,
): void {
  this.beforeAction(function (controller: unknown) {
    if (!block) return;
    const directives: Record<string, string | string[]> = {};
    block.call(controller, directives);
  }, options);
}
