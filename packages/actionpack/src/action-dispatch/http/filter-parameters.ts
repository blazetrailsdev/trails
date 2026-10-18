import { ParameterFilter } from "@blazetrails/activesupport";
import type { ParametersHost } from "./parameters.js";
import { ParseError } from "./parameters.js";

export const ENV_MATCH: ReadonlyArray<string | RegExp> = [
  /RAW_POST_DATA/,
  "rack.request.form_vars",
];

/** @internal */
export const NULL_PARAM_FILTER = new ParameterFilter();
/** @internal */
export const NULL_ENV_FILTER = new ParameterFilter([...ENV_MATCH]);

export interface FilterParametersHost extends ParametersHost {
  hasHeader(key: string): boolean;
  fetchHeader<T>(key: string, fallback: (key: string) => T): unknown | T;
  env: Record<string, unknown>;
  path: string;
  queryString: string;
  parameters: Record<string, unknown>;
}

export interface FilterParameters {
  /** @internal */
  _filteredParameters: Record<string, unknown> | null;
  /** @internal */
  _filteredEnv: Record<string, unknown> | null;
  /** @internal */
  _filteredPath: string | null;
  /** @internal */
  _parameterFilter: ParameterFilter | null;
}

interface CachedState {
  _filteredParameters?: Record<string, unknown> | null;
  _filteredEnv?: Record<string, unknown> | null;
  _filteredPath?: string | null;
  _parameterFilter?: ParameterFilter | null;
}

export function filteredParameters(this: FilterParametersHost): Record<string, unknown> {
  const host = this as FilterParametersHost & CachedState;
  if (host._filteredParameters != null) return host._filteredParameters;
  try {
    host._filteredParameters = parameterFilter.call(this).filter(this.parameters);
  } catch (e) {
    if (e instanceof ParseError) {
      host._filteredParameters = {};
    } else {
      throw e;
    }
  }
  return host._filteredParameters;
}

export function filteredEnv(this: FilterParametersHost): Record<string, unknown> {
  const host = this as FilterParametersHost & CachedState;
  if (host._filteredEnv != null) return host._filteredEnv;
  host._filteredEnv = envFilter.call(this).filter(this.env);
  return host._filteredEnv;
}

export function filteredPath(this: FilterParametersHost): string {
  const host = this as FilterParametersHost & CachedState;
  if (host._filteredPath != null) return host._filteredPath;
  host._filteredPath =
    this.queryString.length === 0 ? this.path : `${this.path}?${filteredQueryString.call(this)}`;
  return host._filteredPath;
}

export function parameterFilter(this: FilterParametersHost): ParameterFilter {
  const host = this as FilterParametersHost & CachedState;
  if (host._parameterFilter != null) return host._parameterFilter;
  if (this.hasHeader("action_dispatch.parameter_filter")) {
    host._parameterFilter = parameterFilterFor(
      this.getHeader("action_dispatch.parameter_filter") as Array<string | RegExp>,
    );
  } else {
    host._parameterFilter = NULL_PARAM_FILTER;
  }
  return host._parameterFilter;
}

/** @internal */
export function envFilter(this: FilterParametersHost): ParameterFilter {
  const userKey = this.fetchHeader("action_dispatch.parameter_filter", () => NULL_ENV_FILTER) as
    | Array<string | RegExp>
    | string
    | RegExp
    | ParameterFilter;
  if (userKey === NULL_ENV_FILTER) return NULL_ENV_FILTER;
  const arr = (Array.isArray(userKey) ? userKey : [userKey]) as Array<string | RegExp>;
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
      const [key, value] = [part.slice(0, eq), part.slice(eq + 1)];
      return Object.entries(filter.filter({ [key]: value }))[0].join("=");
    }
    return part;
  });
  return filteredParts.join("");
}
