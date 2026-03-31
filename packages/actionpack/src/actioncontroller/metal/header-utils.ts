/**
 * Shared header utilities for ActionController metal modules.
 */

export function deleteHeaderCaseInsensitive(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) delete headers[key];
  }
}

export function setHeaderCaseInsensitive(
  headers: Record<string, string>,
  name: string,
  value: string,
): void {
  deleteHeaderCaseInsensitive(headers, name);
  headers[name.toLowerCase()] = value;
}
