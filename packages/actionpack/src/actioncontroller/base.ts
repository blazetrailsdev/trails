/**
 * ActionController::Base
 *
 * Full-featured controller with rendering, redirecting, filters,
 * flash, CSRF, content negotiation, caching, rescue, and more.
 */

import { Metal } from "./metal.js";
import { FlashHash } from "../actiondispatch/flash.js";
import { RequestForgeryProtection, InvalidAuthenticityToken } from "../actiondispatch/request-forgery-protection.js";
import { Collector, UnknownFormat } from "../actiondispatch/respond-to.js";
import type { ActionCallback, AroundCallback, CallbackOptions } from "./abstract-controller.js";
import { createHash } from "crypto";

// Re-export callback registration
export { type ActionCallback, type AroundCallback, type CallbackOptions };

export type RenderOptions = {
  json?: unknown;
  plain?: string;
  html?: string;
  body?: string;
  text?: string;
  status?: number | string;
  contentType?: string;
  layout?: boolean | string;
  formats?: string;
};

export type RescueHandler = (error: Error) => void | Promise<void>;

export class Base extends Metal {
  /** Flash messages for the current request. */
  flash: FlashHash = new FlashHash();

  /** Session store (simple object). */
  session: Record<string, unknown> = {};

  /** Template resolver (pluggable). */
  static templateResolver?: (controller: string, action: string, format: string) => string | null;

  /** Rescue handlers (class-level, inherited). */
  private static _rescueHandlers: Array<{ errorClass: new (...args: any[]) => Error; handler: RescueHandler }> = [];

  // --- Rendering ---

  /** Render a response. Supports json, plain, html, body, text, status. */
  render(options: RenderOptions = {}): void {
    if (this.performed) {
      throw new DoubleRenderError("Render and/or redirect were called multiple times in this action.");
    }

    if (options.status) {
      this.status = options.status;
    }

    if (options.json !== undefined) {
      this.contentType = options.contentType ?? "application/json; charset=utf-8";
      this.body = typeof options.json === "string" ? options.json : JSON.stringify(options.json);
    } else if (options.plain !== undefined) {
      this.contentType = options.contentType ?? "text/plain; charset=utf-8";
      this.body = options.plain;
    } else if (options.html !== undefined) {
      this.contentType = options.contentType ?? "text/html; charset=utf-8";
      this.body = options.html;
    } else if (options.body !== undefined) {
      this.contentType = options.contentType ?? "application/octet-stream";
      this.body = options.body;
    } else if (options.text !== undefined) {
      this.contentType = options.contentType ?? "text/plain; charset=utf-8";
      this.body = options.text;
    } else {
      // Implicit render — try template resolver
      this._renderTemplate(this.actionName, options);
      if (!this.performed) {
        // No template found, render empty 200
        this.contentType = "text/html; charset=utf-8";
        this.body = "";
      }
    }

    this.markPerformed();
  }

  /** Render to string without committing the response. */
  renderToString(options: RenderOptions = {}): string {
    const oldBody = this.body;
    const oldPerformed = this.performed;
    this.render(options);
    const result = this.body;
    this.body = oldBody;
    // Reset performed state
    (this as any)._performed = oldPerformed;
    return result;
  }

  // --- Redirecting ---

  /** Redirect to a URL. */
  redirectTo(url: string, options: { status?: number | string; allow_other_host?: boolean } = {}): void {
    if (this.performed) {
      throw new DoubleRenderError("Render and/or redirect were called multiple times in this action.");
    }

    const status = options.status ? Metal.resolveStatus(options.status) : 302;
    this.status = status;
    this.setHeader("location", url);
    this.contentType = "text/html; charset=utf-8";
    this.body = `<html><body>You are being <a href="${url}">redirected</a>.</body></html>`;
    this.markPerformed();
  }

  /** Redirect back to the referer or a fallback URL. */
  redirectBack(options: { fallbackLocation: string; status?: number | string; allow_other_host?: boolean }): void {
    const referer = this.request?.getHeader("referer");
    const url = referer ?? options.fallbackLocation;
    this.redirectTo(url, { status: options.status });
  }

  // --- Content Negotiation ---

  /** Content negotiation via respond_to. */
  respondTo(block: (collector: Collector) => void): void {
    const collector = new Collector();
    block(collector);

    const format = this.request?.format ?? undefined;
    const accept = this.request?.getHeader("accept") ?? undefined;

    const result = collector.negotiate({ format, accept });
    if (!result) {
      throw new UnknownFormat();
    }

    result.handler();
  }

  // --- Flash ---

  /** Set a flash notice. */
  set notice(value: string) {
    this.flash.notice = value;
  }

  get notice(): unknown {
    return this.flash.notice;
  }

  /** Set a flash alert. */
  set alert(value: string) {
    this.flash.alert = value;
  }

  get alert(): unknown {
    return this.flash.alert;
  }

  // --- CSRF Protection ---

  private static _csrfProtection: RequestForgeryProtection | null = null;

  /** Enable CSRF protection (class-level). */
  static protectFromForgery(options: { with?: "exception" | "reset_session" | "null_session" } = {}): void {
    this._csrfProtection = new RequestForgeryProtection({
      strategy: options.with ?? "exception",
    });
  }

  /** Verify the CSRF token. Called as a before_action. */
  verifyAuthenticityToken(): void {
    const csrf = (this.constructor as typeof Base)._csrfProtection;
    if (!csrf) return;

    const token = this.params.get("authenticity_token") as string ??
      this.request?.getHeader("x-csrf-token") ?? null;

    const result = csrf.verifyRequest({
      method: this.request?.method ?? "GET",
      session: this.session,
      token,
      host: this.request?.host ?? "localhost",
    });

    if (!result.verified) {
      csrf.handleUnverified(this.session);
    }
  }

  /** Get the form authenticity token for the current session. */
  formAuthenticityToken(): string {
    const csrf = (this.constructor as typeof Base)._csrfProtection;
    if (!csrf) return "";
    const realToken = csrf.getRealToken(this.session);
    return csrf.maskToken(realToken);
  }

  // --- Rescue ---

  /** Register a rescue handler for a specific error class. */
  static rescueFrom(errorClass: new (...args: any[]) => Error, handler: RescueHandler): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_rescueHandlers")) {
      (this as any)._rescueHandlers = [];
    }
    (this as any)._rescueHandlers.push({ errorClass, handler });
  }

  /** Process action with rescue handling. */
  async processAction(action: string): Promise<void> {
    try {
      await super.processAction(action);
    } catch (error) {
      if (error instanceof Error) {
        const handler = this._findRescueHandler(error);
        if (handler) {
          await handler(error);
          return;
        }
      }
      throw error;
    }
  }

  // --- Caching / Conditional GET ---

  /** Check if the response should be fresh (304 Not Modified). */
  freshWhen(options: { etag?: string; lastModified?: Date; public?: boolean }): void {
    if (options.etag) {
      const etag = this._generateEtag(options.etag);
      this.setHeader("etag", etag);
    }
    if (options.lastModified) {
      this.setHeader("last-modified", options.lastModified.toUTCString());
    }
    if (options.public) {
      this.setHeader("cache-control", "public");
    }

    if (this._isFresh()) {
      this.head(304);
    }
  }

  /** Check if the resource is stale. Returns true if a re-render is needed. */
  stale(options: { etag?: string; lastModified?: Date; public?: boolean }): boolean {
    this.freshWhen(options);
    return !this.performed;
  }

  /** Set cache control headers. */
  expiresIn(seconds: number, options: { public?: boolean; mustRevalidate?: boolean } = {}): void {
    const parts = [`max-age=${seconds}`];
    if (options.public) parts.push("public");
    if (options.mustRevalidate) parts.push("must-revalidate");
    this.setHeader("cache-control", parts.join(", "));
  }

  /** Mark response as expired. */
  expiresNow(): void {
    this.setHeader("cache-control", "no-cache");
  }

  // --- Send File / Send Data ---

  /** Send file content. */
  sendFile(filePath: string, options: { type?: string; disposition?: string; filename?: string } = {}): void {
    const fs = require("fs");
    const path = require("path");
    const content = fs.readFileSync(filePath);
    const filename = options.filename ?? path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();

    this.contentType = options.type ?? SEND_FILE_MIME_TYPES[ext] ?? "application/octet-stream";
    this.body = content.toString();

    if (options.disposition !== undefined && options.disposition !== null) {
      this.setHeader("content-disposition",
        `${options.disposition}; filename="${filename}"`);
    } else {
      this.setHeader("content-disposition", `attachment; filename="${filename}"`);
    }

    this.setHeader("content-length", String(content.length));
    this.markPerformed();
  }

  /** Send raw data as a download. */
  sendData(data: string | Buffer, options: { type?: string; disposition?: string; filename?: string } = {}): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

    this.contentType = options.type ?? "application/octet-stream";
    this.body = buf.toString();

    if (options.filename) {
      const disposition = options.disposition ?? "attachment";
      this.setHeader("content-disposition", `${disposition}; filename="${options.filename}"`);
    } else if (options.disposition) {
      this.setHeader("content-disposition", options.disposition);
    }

    this.setHeader("content-length", String(buf.length));
    this.markPerformed();
  }

  // --- Cookies ---

  /** Get cookie jar (from request). */
  get cookies(): Record<string, string> {
    return (this.request as any)?.cookies ?? {};
  }

  // --- Private helpers ---

  private _renderTemplate(action: string, _options: RenderOptions): void {
    const resolver = (this.constructor as typeof Base).templateResolver;
    if (!resolver) return;

    const controllerName = this.constructor.name.replace(/Controller$/, "").toLowerCase();
    const format = this.request?.format ?? "html";
    const template = resolver(controllerName, action, format);
    if (template) {
      this.contentType = "text/html; charset=utf-8";
      this.body = template;
      this.markPerformed();
    }
  }

  private _findRescueHandler(error: Error): RescueHandler | null {
    const hierarchy: Array<typeof Base> = [];
    let klass = this.constructor as typeof Base;
    while (klass && klass !== (Object as unknown)) {
      hierarchy.unshift(klass);
      klass = Object.getPrototypeOf(klass);
    }

    for (const k of hierarchy.reverse()) {
      if (Object.prototype.hasOwnProperty.call(k, "_rescueHandlers")) {
        const handlers = (k as any)._rescueHandlers as Array<{ errorClass: new (...args: any[]) => Error; handler: RescueHandler }>;
        for (const { errorClass, handler } of handlers.reverse()) {
          if (error instanceof errorClass) return handler;
        }
      }
    }
    return null;
  }

  private _generateEtag(seed: string): string {
    const hash = createHash("sha256").update(seed).digest("hex").slice(0, 32);
    return `W/"${hash}"`;
  }

  private _isFresh(): boolean {
    if (!this.request) return false;
    const ifNoneMatch = this.request.getHeader("if-none-match");
    const ifModifiedSince = this.request.getHeader("if-modified-since");
    const etag = this.getHeader("etag");
    const lastModified = this.getHeader("last-modified");

    if (ifNoneMatch && etag) {
      return ifNoneMatch === etag;
    }
    if (ifModifiedSince && lastModified) {
      return new Date(ifModifiedSince) >= new Date(lastModified);
    }
    return false;
  }
}

export class DoubleRenderError extends Error {
  constructor(message = "Render and/or redirect were called multiple times in this action.") {
    super(message);
    this.name = "DoubleRenderError";
  }
}

export class API extends Metal {
  /** Render JSON (API controllers only render JSON/plain). */
  render(options: RenderOptions = {}): void {
    if (this.performed) {
      throw new DoubleRenderError();
    }

    if (options.status) {
      this.status = options.status;
    }

    if (options.json !== undefined) {
      this.contentType = options.contentType ?? "application/json; charset=utf-8";
      this.body = typeof options.json === "string" ? options.json : JSON.stringify(options.json);
    } else if (options.plain !== undefined) {
      this.contentType = options.contentType ?? "text/plain; charset=utf-8";
      this.body = options.plain;
    } else if (options.body !== undefined) {
      this.body = options.body;
    }

    this.markPerformed();
  }

  /** Redirect to a URL. */
  redirectTo(url: string, options: { status?: number | string } = {}): void {
    if (this.performed) {
      throw new DoubleRenderError();
    }

    const status = options.status ? Metal.resolveStatus(options.status) : 302;
    this.status = status;
    this.setHeader("location", url);
    this.body = "";
    this.markPerformed();
  }
}

const SEND_FILE_MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".txt": "text/plain",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".csv": "text/csv",
};
