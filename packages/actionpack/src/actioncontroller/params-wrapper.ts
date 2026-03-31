/**
 * ActionController::ParamsWrapper
 *
 * Wraps the parameters hash into a nested hash, allowing the client to
 * submit requests without having to specify any root elements.
 *
 * Rails example:
 *   class UsersController < ApplicationController
 *     wrap_parameters :user, include: [:name, :email]
 *   end
 *
 *   # POST /users with { name: "Dean", email: "d@e.com" }
 *   # params[:user] => { name: "Dean", email: "d@e.com" }
 *
 * TypeScript equivalent:
 *   class UsersController extends Base {
 *     static wrapParams = wrapParameters("user", { include: ["name", "email"] });
 *   }
 */

import { Parameters } from "./metal/strong-parameters.js";

export interface WrapParametersOptions {
  /** Keys to include in the wrapped hash. If omitted, all non-framework keys are included. */
  include?: string[];
  /** Keys to exclude from the wrapped hash. */
  exclude?: string[];
  /** Format(s) to apply wrapping for. Defaults to ["json"]. */
  format?: string | string[];
  /** Key name. If omitted, derived from controller name. */
  name?: string;
}

/** Framework parameter keys that are never wrapped. */
const EXCLUDE_PARAMETERS = new Set([
  "controller",
  "action",
  "format",
  "_method",
  "authenticity_token",
  "utf8",
  "commit",
]);

/**
 * Wrap request parameters into a nested hash under the given key.
 *
 * @param key The root key to wrap under (e.g., "user")
 * @param options Configuration for which params to wrap
 * @returns A function that transforms a Parameters object
 */
export function wrapParameters(
  key: string,
  options: Omit<WrapParametersOptions, "name"> = {},
): ParamsWrapperConfig {
  return {
    key,
    include: options.include ? new Set(options.include) : null,
    exclude: new Set([...EXCLUDE_PARAMETERS, ...(options.exclude ?? [])]),
    format: normalizeFormats(options.format),
  };
}

export interface ParamsWrapperConfig {
  key: string;
  include: Set<string> | null;
  exclude: Set<string>;
  format: Set<string>;
}

function normalizeFormats(format?: string | string[]): Set<string> {
  if (!format) return new Set(["json"]);
  if (typeof format === "string") return new Set([format]);
  return new Set(format);
}

/**
 * Apply parameter wrapping to a Parameters object.
 *
 * @param params The original parameters
 * @param config The wrapper configuration
 * @param requestFormat The request format (e.g., "json", "html")
 * @returns The wrapped Parameters (or original if format doesn't match)
 */
export function applyParamsWrapper(
  params: Parameters,
  config: ParamsWrapperConfig,
  requestFormat = "json",
): Parameters {
  // Only wrap for matching formats
  if (!config.format.has(requestFormat)) {
    return params;
  }

  // Don't wrap if the key already exists in params
  if (params.has(config.key)) {
    return params;
  }

  // Collect wrappable keys
  const wrapped: Record<string, unknown> = {};
  const original = params.toUnsafeHash();

  for (const [k, v] of Object.entries(original)) {
    if (config.exclude.has(k)) continue;
    if (config.include && !config.include.has(k)) continue;
    wrapped[k] = v;
  }

  // Only wrap if there's something to wrap
  if (Object.keys(wrapped).length === 0) {
    return params;
  }

  // Create new params with the wrapped key added
  const newData = { ...original, [config.key]: new Parameters(wrapped) };
  return new Parameters(newData);
}

/**
 * Derive wrapper key from controller class name.
 * "UsersController" → "user"
 * "Admin::PostsController" → "post"
 */
export function deriveWrapperKey(controllerName: string): string {
  const name = controllerName.replace(/Controller$/, "").replace(/.*[:/]/, ""); // Remove namespace
  // Simple singularize: remove trailing 's'
  const singular = name.endsWith("s") ? name.slice(0, -1) : name;
  return singular.charAt(0).toLowerCase() + singular.slice(1);
}
