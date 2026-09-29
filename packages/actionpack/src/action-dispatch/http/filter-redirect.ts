import type { ParameterFilter } from "@blazetrails/activesupport";
import { Error as URIError, URI } from "@blazetrails/ruby-compat";

/** @internal */
export const FILTERED = "[FILTERED]";

export interface FilterRedirectHost {
  location: string | undefined;
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
  const loc = this.location!;
  return locationFilters.call(this).some((filter) => {
    if (typeof filter === "string") return loc.includes(filter);
    if (filter instanceof RegExp) return filter.test(loc);
    return false;
  });
}

/** @internal */
export function parameterFilteredLocation(this: FilterRedirectHost): string {
  try {
    const uri = URI.parse(this.location!);
    if (!(uri.query == null || uri.query === "")) {
      const parts = uri.query.split(/([&;])/);
      const filteredParts = parts.map((part) => {
        if (part.includes("=")) {
          const eq = part.indexOf("=");
          const [key, value] = [part.slice(0, eq), part.slice(eq + 1)];
          const filtered = this.request!.parameterFilter().filter({ [key]: value });
          const firstKey = Object.keys(filtered)[0];
          return [firstKey, filtered[firstKey] as string].join("=");
        } else {
          return part;
        }
      });
      uri.query = filteredParts.join("");
    }
    return uri.toString();
  } catch (e) {
    if (e instanceof URIError) return FILTERED;
    throw e;
  }
}
