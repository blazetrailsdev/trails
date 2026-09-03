import type { ParameterFilter } from "@blazetrails/activesupport";

/** @internal */
export const FILTERED = "[FILTERED]";

export interface FilterRedirectHost {
  location: string;
  request: FilterRedirectRequest | null | undefined;
}

export interface FilterRedirectRequest {
  getHeader(key: string): unknown;
  parameterFilter(): ParameterFilter;
}

/** @internal */
export function filteredLocation(this: FilterRedirectHost): string {
  return locationFilterMatch.call(this) ? FILTERED : parameterFilteredLocation.call(this);
}

/** @internal */
export function locationFilters(this: FilterRedirectHost): Array<string | RegExp> {
  if (this.request) {
    return (
      (this.request.getHeader("action_dispatch.redirect_filter") as
        | Array<string | RegExp>
        | undefined) ?? []
    );
  }
  return [];
}

/** @internal */
export function locationFilterMatch(this: FilterRedirectHost): boolean {
  const loc = this.location;
  return locationFilters.call(this).some((filter) => {
    if (typeof filter === "string") return loc.includes(filter);
    if (filter instanceof RegExp) return filter.test(loc);
    return false;
  });
}

/** @internal */
export function parameterFilteredLocation(this: FilterRedirectHost): string {
  try {
    const PLACEHOLDER_BASE = "http://__filter_redirect_placeholder__/";
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(this.location);
    const url = isAbsolute ? new URL(this.location) : new URL(this.location, PLACEHOLDER_BASE);
    if (url.search.length > 1 && this.request) {
      const filter = this.request.parameterFilter();
      const query = url.search.slice(1);
      const parts = query.split(/([&;])/);
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
      url.search = `?${filteredParts.join("")}`;
    }
    if (!isAbsolute) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return url.toString();
  } catch {
    return FILTERED;
  }
}
