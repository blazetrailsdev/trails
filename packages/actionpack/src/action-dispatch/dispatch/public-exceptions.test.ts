import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { I18n } from "@blazetrails/activesupport";
import { X_CASCADE } from "../constants.js";
import { PublicExceptions } from "../middleware/public-exceptions.js";
import { Response } from "../http/response.js";

let publicPath: string;
let app: PublicExceptions;
let priorLocale: string | false;

beforeAll(() => {
  publicPath = mkdtempSync(path.join(tmpdir(), "public-exceptions-"));
  mkdirSync(publicPath, { recursive: true });
  writeFileSync(path.join(publicPath, "404.html"), "<h1>404</h1>");
  writeFileSync(path.join(publicPath, "500.html"), "<h1>500</h1>");
  writeFileSync(path.join(publicPath, "404.en.html"), "<h1>404 en</h1>");
  priorLocale = I18n.locale();
  I18n.setLocale("en");
  app = new PublicExceptions(publicPath);
});

afterAll(() => {
  I18n.setLocale(priorLocale);
  rmSync(publicPath, { recursive: true, force: true });
});

describe("PublicExceptions", () => {
  it("renders the static html page for the requested status", async () => {
    const [status, headers, body] = await app.call({
      PATH_INFO: "/500",
      HTTP_ACCEPT: "text/html",
    });
    expect(status).toBe(500);
    expect(headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(Array.from(body as Iterable<string>).join("")).toBe("<h1>500</h1>");
  });

  it("prefers the localized html when present", async () => {
    const [status, , body] = await app.call({
      PATH_INFO: "/404",
      HTTP_ACCEPT: "text/html",
    });
    expect(status).toBe(404);
    expect(Array.from(body as Iterable<string>).join("")).toBe("<h1>404 en</h1>");
  });

  it("returns x-cascade pass when no template exists", async () => {
    const [status, headers, body] = await app.call({
      PATH_INFO: "/418",
      HTTP_ACCEPT: "text/html",
    });
    expect(status).toBe(404);
    expect(headers[X_CASCADE]).toBe("pass");
    expect(Array.from(body as Iterable<string>).join("")).toBe("");
  });

  it("renders json when requested", async () => {
    const [status, headers, body] = await app.call({
      PATH_INFO: "/500",
      HTTP_ACCEPT: "application/json",
    });
    expect(status).toBe(500);
    expect(headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(Array.from(body as Iterable<string>).join(""))).toEqual({
      status: 500,
      error: "Internal Server Error",
    });
  });

  it("renders xml when requested", async () => {
    const [status, headers, body] = await app.call({
      PATH_INFO: "/500",
      HTTP_ACCEPT: "application/xml",
    });
    expect(status).toBe(500);
    expect(headers["content-type"]).toBe("application/xml; charset=utf-8");
    const xml = Array.from(body as Iterable<string>).join("");
    expect(xml).toContain('<status type="integer">500</status>');
    expect(xml).toContain("<error>Internal Server Error</error>");
  });

  it("falls back to html when content type is invalid", async () => {
    const [status, headers] = await app.call({
      PATH_INFO: "/500",
      HTTP_ACCEPT: "invalid;;;",
    });
    expect(status).toBe(500);
    expect(headers["content-type"]).toBe("text/html; charset=utf-8");
  });

  it("uses the status from the path info", async () => {
    const [status] = await app.call({
      PATH_INFO: "/404",
      HTTP_ACCEPT: "application/json",
    });
    expect(status).toBe(404);
  });

  it("honors a customized Response.defaultCharset across html/json/xml", async () => {
    const prior = Response.defaultCharset;
    try {
      Response.defaultCharset = "iso-8859-1";
      const html = await app.call({ PATH_INFO: "/500", HTTP_ACCEPT: "text/html" });
      expect(html[1]["content-type"]).toBe("text/html; charset=iso-8859-1");
      const json = await app.call({ PATH_INFO: "/500", HTTP_ACCEPT: "application/json" });
      expect(json[1]["content-type"]).toBe("application/json; charset=iso-8859-1");
      const xml = await app.call({ PATH_INFO: "/500", HTTP_ACCEPT: "application/xml" });
      expect(xml[1]["content-type"]).toBe("application/xml; charset=iso-8859-1");
    } finally {
      Response.defaultCharset = prior;
    }
  });

  it("interpolates a nil Response.defaultCharset as an empty charset", async () => {
    const prior = Response.defaultCharset;
    try {
      Response.defaultCharset = null;
      const json = await app.call({ PATH_INFO: "/500", HTTP_ACCEPT: "application/json" });
      expect(json[1]["content-type"]).toBe("application/json; charset=");
    } finally {
      Response.defaultCharset = prior;
    }
  });
});
