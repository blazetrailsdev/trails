export function getCookies(request: { cookies?: Record<string, string> }): Record<string, string> {
  return request.cookies ?? {};
}
