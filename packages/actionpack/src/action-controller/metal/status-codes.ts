/** @internal */

export const STATUS_CODES: Record<string, number> = {
  ok: 200,
  created: 201,
  accepted: 202,
  no_content: 204,
  moved_permanently: 301,
  found: 302,
  see_other: 303,
  not_modified: 304,
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  not_acceptable: 406,
  conflict: 409,
  gone: 410,
  unprocessable_entity: 422,
  too_many_requests: 429,
  internal_server_error: 500,
  not_implemented: 501,
  bad_gateway: 502,
  service_unavailable: 503,
};

/** @internal */
export function resolveStatus(status: number | string): number {
  if (typeof status === "number") return status;
  return STATUS_CODES[status] ?? 500;
}
