/**
 * ActionController::UrlFor
 *
 * Includes url_for into the host class, adding HTTP-layer URL options
 * like host, port, and protocol from the current request.
 * @see https://api.rubyonrails.org/classes/ActionController/UrlFor.html
 */

export function urlOptionsFromRequest(request: {
  host?: string;
  port?: number | string;
  scheme?: string;
  protocol?: string;
  pathParameters?: Record<string, string>;
}): Record<string, unknown> {
  return {
    host: request.host ?? "localhost",
    port: request.port,
    protocol: request.scheme ?? request.protocol ?? "http",
    _recall: request.pathParameters ?? {},
  };
}

export interface UrlForHost {
  request?: {
    host?: string;
    port?: number | string;
    scheme?: string;
    protocol?: string;
    pathParameters?: Record<string, string>;
  };
}

export function urlOptions(this: UrlForHost): Record<string, unknown> {
  if (this.request) {
    return urlOptionsFromRequest(this.request);
  }
  return { host: "localhost", protocol: "http" };
}
