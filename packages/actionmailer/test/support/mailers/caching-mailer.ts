import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers";
import { Base } from "../../../lib/base.js";

const FIXTURES: Record<string, string> = {
  "caching-mailer/fragment-cache.html.tse": `<% await cache("caching", {}, () => { %>\n"Welcome"\n<% }) %>\n`,
  "caching-mailer/fragment-cache-in-partials.html.tse": `<%= render("partial") %>\n`,
  "caching-mailer/fragment-caching-options.html.tse": `<%= cache("no_digest", { skipDigest: true, expiresIn: 0 }, () => { %>\n    No Digest\n<% }) %>\n`,
  "caching-mailer/multipart-cache.html.tse": `<% await cache("html_caching", { skipDigest: true }, () => { %>\n    "Welcome html"\n<% }) %>\n`,
  "caching-mailer/multipart-cache.text.tse": `<% await cache("text_caching", { skipDigest: true }, () => { %>\n    "Welcome text"\n<% }) %>\n`,
  "caching-mailer/_partial.html.tse": `<% await cache("caching", {}, () => { %>\n  Old fragment caching in a partial\n<% }) %>\n`,
  "caching-mailer/skip-fragment-cache-digesting.html.tse": `<%= cache("no_digest", { skipDigest: true }, () => { %>\n  No Digest\n<% }) %>\n`,
};

export class CachingMailer extends Base {
  static {
    this.setMailerName("caching_mailer");

    this.prependViewPath(new FixtureResolver(FIXTURES));
  }

  fragmentCache() {
    return this.mail({ subject: "welcome", templateName: "fragment-cache" });
  }

  fragmentCacheInPartials() {
    return this.mail({ subject: "welcome", templateName: "fragment-cache-in-partials" });
  }

  skipFragmentCacheDigesting() {
    return this.mail({ subject: "welcome", templateName: "skip-fragment-cache-digesting" });
  }

  fragmentCachingOptions() {
    return this.mail({ subject: "welcome", templateName: "fragment-caching-options" });
  }

  multipartCache() {
    return this.mail({ subject: "welcome", templateName: "multipart-cache" });
  }
}
