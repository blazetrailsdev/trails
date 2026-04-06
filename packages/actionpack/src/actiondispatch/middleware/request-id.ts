/**
 * ActionDispatch::RequestId
 *
 * Middleware that sets a unique X-Request-Id header on each request.
 */

import { getCrypto } from "@blazetrails/activesupport";
import type { RackEnv, RackResponse } from "@blazetrails/rack";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export interface RequestIdOptions {
  /** Header to read existing request IDs from (default: "X-Request-Id") */
  header?: string;
}

export class RequestId {
  private app: RackApp;
  private header: string;

  constructor(app: RackApp, options: RequestIdOptions = {}) {
    this.app = app;
    this.header = options.header ?? "X-Request-Id";
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const requestId = this.makeRequestId(env);
    env["action_dispatch.request_id"] = requestId;

    const [status, headers, body] = await this.app(env);
    headers[this.header.toLowerCase()] = requestId;
    return [status, headers, body];
  }

  private makeRequestId(env: RackEnv): string {
    const headerKey = `HTTP_${this.header.toUpperCase().replace(/-/g, "_")}`;
    const existing = env[headerKey] as string | undefined;
    if (existing) {
      // Sanitize: only allow alphanumeric, dashes, and underscores
      const sanitized = existing.replace(/[^\w-]/g, "").slice(0, 255);
      if (sanitized.length > 0) return sanitized;
    }
    const bytes = getCrypto().randomBytes(16);
    const buf = Buffer.from(bytes);
    // Set version 4 (0100) and variant (10xx) bits per RFC 4122
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = buf.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}
