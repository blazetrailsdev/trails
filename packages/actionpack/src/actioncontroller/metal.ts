/**
 * ActionController::Metal
 *
 * Minimal controller with Rack interface. Provides params, request,
 * response accessors and basic status/header management.
 */

import { AbstractController } from "./abstract-controller.js";
import { Request } from "../actiondispatch/request.js";
import { Response } from "../actiondispatch/response.js";
import { Parameters } from "./metal/strong-parameters.js";
import type { RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";

const STATUS_CODES: Record<string, number> = {
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

export class Metal extends AbstractController {
  request!: Request;
  response!: Response;
  params: Parameters = new Parameters({});

  private _status: number = 200;
  private _headers: Record<string, string> = {};
  private _body: string = "";
  private _contentType: string | null = null;

  /** Dispatch an action in the context of a request/response. */
  async dispatch(action: string, request: Request, response: Response): Promise<Response> {
    this.request = request;
    this.response = response;
    this.params =
      (request as any).parameters ??
      new Parameters({ ...request.params, ...request.pathParameters });

    await this.processAction(action);

    // Commit the response
    this.response.status = this._status;
    for (const [k, v] of Object.entries(this._headers)) {
      this.response.setHeader(k, v);
    }
    if (this._contentType) {
      this.response.setHeader("content-type", this._contentType);
    }
    if (this._body) {
      this.response.body = this._body;
    }

    return this.response;
  }

  /** Set response status. Accepts number or symbol. */
  set status(value: number | string) {
    if (typeof value === "string") {
      const code = STATUS_CODES[value];
      if (!code) throw new Error(`Unknown status: ${value}`);
      this._status = code;
    } else {
      this._status = value;
    }
  }

  get status(): number {
    return this._status;
  }

  /** Set a response header. */
  setHeader(name: string, value: string): void {
    this._headers[name.toLowerCase()] = value;
  }

  /** Get a response header. */
  getHeader(name: string): string | undefined {
    return this._headers[name.toLowerCase()];
  }

  /** Set content type. */
  set contentType(value: string) {
    this._contentType = value;
  }

  get contentType(): string | null {
    return this._contentType;
  }

  /** Send a head-only response with given status. */
  head(status: number | string): void {
    if (typeof status === "string") {
      const code = STATUS_CODES[status];
      if (!code) throw new Error(`Unknown status: ${status}`);
      this._status = code;
    } else {
      this._status = status;
    }
    this._body = "";
    this.markPerformed();
  }

  /** Set the response body directly. */
  set body(value: string) {
    this._body = value;
  }

  get body(): string {
    return this._body;
  }

  /** Convert controller to a Rack-compatible response. */
  toRackResponse(): RackResponse {
    const headers = { ...this._headers };
    if (this._contentType) {
      headers["content-type"] = this._contentType;
    }
    return [this._status, headers, bodyFromString(this._body)];
  }

  /** Resolve a status symbol to a number. */
  static resolveStatus(status: number | string): number {
    if (typeof status === "number") return status;
    return STATUS_CODES[status] ?? 500;
  }
}
