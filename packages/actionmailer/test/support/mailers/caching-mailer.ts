import { Base } from "../../../lib/base.js";

export class CachingMailer extends Base {
  static {
    this.setMailerName("caching_mailer");

    this.prependViewPath(new URL("../../fixtures", import.meta.url).pathname);
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
