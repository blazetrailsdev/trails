/**
 * The preview's cookies. A response a service worker builds cannot set a
 * cookie (browsers drop its `Set-Cookie`), and a page cannot send a `Cookie`
 * header through `fetch`, so the runtime keeps the jar: it records every
 * `Set-Cookie` the app answers and hands the cookies back as `HTTP_COOKIE`.
 * Every cookie is treated as scoped to the whole preview.
 */
export class CookieJar {
  private jar: Map<string, string>;

  constructor(initial: Record<string, string>) {
    this.jar = new Map(Object.entries(initial));
  }

  store(setCookie: string): void {
    const [pair, ...attributes] = setCookie.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    if (eq < 1) return;
    const name = pair.slice(0, eq);
    const expired = attributes.some((a) => {
      const [key, value = ""] = a.split("=");
      if (key.toLowerCase() === "max-age") return Number(value) <= 0;
      if (key.toLowerCase() === "expires") return Date.parse(value) <= Date.now();
      return false;
    });
    if (expired) this.jar.delete(name);
    else this.jar.set(name, pair.slice(eq + 1));
  }

  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  entries(): Record<string, string> {
    return Object.fromEntries(this.jar);
  }
}
