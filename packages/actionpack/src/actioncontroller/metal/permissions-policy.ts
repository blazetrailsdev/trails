/**
 * ActionController::PermissionsPolicy
 *
 * Overrides parts of the globally configured Permissions-Policy header.
 * @see https://api.rubyonrails.org/classes/ActionController/PermissionsPolicy.html
 */

import type { CallbackOptions } from "../abstract-controller.js";
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

/**
 * Block invoked with the per-request Permissions-Policy directive map. Mutate
 * `directives` to override or extend the globally configured policy.
 */
export type PermissionsPolicyBlock = (
  this: unknown,
  directives: Record<string, string | string[]>,
) => void;

interface PermissionsPolicyHost {
  beforeAction(callback: (controller: unknown) => void | boolean, options?: CallbackOptions): void;
}

/**
 * Class DSL: register a per-controller Permissions-Policy override block.
 *
 * Mirrors Rails `ActionController::PermissionsPolicy::ClassMethods#permissions_policy`
 * (actionpack/lib/action_controller/metal/permissions_policy.rb, lines 27–37):
 *
 *     def permissions_policy(**options, &block)
 *       before_action(options) do
 *         if block_given?
 *           policy = request.permissions_policy.clone
 *           instance_exec(policy, &block)
 *           request.permissions_policy = policy
 *         end
 *       end
 *     end
 *
 * Divergence from Rails: Rails clones `request.permissions_policy` so child
 * controllers extend the inherited policy, then writes the mutated copy back;
 * downstream middleware materializes that into the response header. Until
 * `Request#permissionsPolicy` and the response middleware exist, we yield a
 * fresh empty directives object instead. The DSL surface and parity coverage
 * are complete; the request/response wiring is the remaining work. Tracked in
 * docs/actioncontroller-100-percent.md "Known divergences".
 */
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
