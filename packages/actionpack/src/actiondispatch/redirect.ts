/**
 * ActionController redirect helpers.
 *
 * Generates redirect responses with appropriate status codes and headers.
 */

export interface RedirectResult {
  status: number;
  location: string;
  body: string;
}

export function redirectTo(url: string, options: { status?: number } = {}): RedirectResult {
  const status = options.status ?? 302;
  const location = sanitizeUrl(url);
  return {
    status,
    location,
    body: `<html><body>You are being <a href="${escapeHtml(location)}">redirected</a>.</body></html>`,
  };
}

export function redirectBack(options: {
  fallbackLocation: string;
  referer?: string;
  status?: number;
  allowOtherHost?: boolean;
  currentHost?: string;
}): RedirectResult {
  let url = options.referer ?? options.fallbackLocation;

  if (options.allowOtherHost === false && options.referer && options.currentHost) {
    try {
      const refererHost = new URL(options.referer).host;
      if (refererHost !== options.currentHost) {
        url = options.fallbackLocation;
      }
    } catch {
      url = options.fallbackLocation;
    }
  }

  return redirectTo(url, { status: options.status });
}

function sanitizeUrl(url: string): string {
  // Block header injection
  if (url.includes("\r") || url.includes("\n")) {
    throw new Error("Invalid redirect URL: contains header break characters");
  }
  // Block null bytes
  if (url.includes("\0")) {
    throw new Error("Invalid redirect URL: contains null bytes");
  }
  return url;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
