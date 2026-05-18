/**
 * ActionDispatch::Http::FilterParameters
 *
 * Port of `actionpack/lib/action_dispatch/http/filter_parameters.rb`. Allows
 * specifying sensitive query string and POST parameters to filter from the
 * request log. The filter list lives at
 * `env["action_dispatch.parameter_filter"]`.
 *
 * Rails mixes this into `ActionDispatch::Request`. Per CLAUDE.md, we expose
 * the methods as `this`-typed functions against a {@link FilterParametersHost}
 * interface so they can be assigned directly onto the host class.
 */

import { ParameterFilter } from "@blazetrails/activesupport";
import type { ParametersHost } from "./parameters.js";
import { ParseError } from "./parameters.js";

/** Patterns Rails always strips from `filtered_env`. */
export const ENV_MATCH: ReadonlyArray<string | RegExp> = [
  /RAW_POST_DATA/,
  "rack.request.form_vars",
];

/** @internal */
export const NULL_PARAM_FILTER = new ParameterFilter();
/** @internal */
export const NULL_ENV_FILTER = new ParameterFilter([...ENV_MATCH]);

/**
 * Minimal host surface required by the {@link FilterParameters} mixin.
 * Mirrors the methods Rails' `Http::FilterParameters` calls on `self`.
 */
export interface FilterParametersHost extends ParametersHost {
  hasHeader(key: string): boolean;
  env: Record<string, unknown>;
  path: string;
  queryString: string;
  parameters(): Record<string, unknown>;
}

interface CachedState {
  _filteredParameters?: Record<string, unknown>;
  _filteredEnv?: Record<string, unknown>;
  _filteredPath?: string;
  _parameterFilter?: ParameterFilter;
}

/** Returns a hash of parameters with all sensitive data replaced. */
export function filteredParameters(this: FilterParametersHost): Record<string, unknown> {
  const host = this as FilterParametersHost & CachedState;
  if (host._filteredParameters !== undefined) return host._filteredParameters;
  try {
    host._filteredParameters = parameterFilter.call(this).filter(this.parameters());
  } catch (e) {
    if (e instanceof ParseError) {
      host._filteredParameters = {};
    } else {
      throw e;
    }
  }
  return host._filteredParameters;
}

/** Returns a hash of request.env with all sensitive data replaced. */
export function filteredEnv(this: FilterParametersHost): Record<string, unknown> {
  const host = this as FilterParametersHost & CachedState;
  if (host._filteredEnv !== undefined) return host._filteredEnv;
  host._filteredEnv = envFilter.call(this).filter(this.env);
  return host._filteredEnv;
}

/** Reconstructs a path with all sensitive GET parameters replaced. */
export function filteredPath(this: FilterParametersHost): string {
  const host = this as FilterParametersHost & CachedState;
  if (host._filteredPath !== undefined) return host._filteredPath;
  host._filteredPath =
    this.queryString.length === 0 ? this.path : `${this.path}?${filteredQueryString.call(this)}`;
  return host._filteredPath;
}

/** Returns the `ParameterFilter` object used to filter in this request. */
export function parameterFilter(this: FilterParametersHost): ParameterFilter {
  const host = this as FilterParametersHost & CachedState;
  if (host._parameterFilter !== undefined) return host._parameterFilter;
  if (this.hasHeader("action_dispatch.parameter_filter")) {
    const list = this.getHeader("action_dispatch.parameter_filter") as Array<string | RegExp>;
    host._parameterFilter = parameterFilterFor(list);
  } else {
    host._parameterFilter = NULL_PARAM_FILTER;
  }
  return host._parameterFilter;
}

/** @internal */
export function envFilter(this: FilterParametersHost): ParameterFilter {
  if (!this.hasHeader("action_dispatch.parameter_filter")) return NULL_ENV_FILTER;
  const userKey = this.getHeader("action_dispatch.parameter_filter") as
    | Array<string | RegExp>
    | string
    | RegExp;
  const arr = Array.isArray(userKey) ? userKey : [userKey];
  return parameterFilterFor([...arr, ...ENV_MATCH]);
}

/** @internal */
export function parameterFilterFor(filters: Array<string | RegExp>): ParameterFilter {
  return new ParameterFilter(filters);
}

/** @internal */
export function filteredQueryString(this: FilterParametersHost): string {
  const parts = this.queryString.split(/([&;])/);
  const filter = parameterFilter.call(this);
  const filteredParts = parts.map((part) => {
    if (part.includes("=")) {
      const eq = part.indexOf("=");
      const key = part.slice(0, eq);
      const value = part.slice(eq + 1);
      const filtered = filter.filter({ [key]: value });
      const firstKey = Object.keys(filtered)[0];
      return `${firstKey}=${filtered[firstKey] as string}`;
    }
    return part;
  });
  return filteredParts.join("");
}
