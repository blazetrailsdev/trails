import { isBlank, isPresent, presence } from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import { Trails } from "@blazetrails/trailties";
import { Account } from "./account.ts";

type Entry = Record<string, unknown>;

interface Resolution {
  source: [string | null, Entry[] | null];
  entries: Entry[] | null;
  providers: EmbedProvider[];
}

export class EmbedProvider {
  static PERMITTED_ATTRIBUTES = Object.freeze([
    "src",
    "width",
    "height",
    "allowfullscreen",
    "frameborder",
    "title",
    "loading",
  ]);

  static HOST_FORMAT = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

  static DEFAULTS: readonly Entry[] = Object.freeze([
    {
      name: "YouTube",
      hosts: ["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"],
      path_prefix: "/embed",
    },
    { name: "Vimeo", hosts: ["player.vimeo.com"], path_prefix: "/video" },
    { name: "Loom", hosts: ["loom.com", "www.loom.com"], path_prefix: "/embed" },
    { name: "Google Maps", hosts: ["google.com", "www.google.com"], path_prefix: "/maps/embed" },
  ] as Entry[]);

  private static _resolution: Resolution | undefined;

  static isConfigured(): boolean {
    return this._resolution!.entries != null;
  }

  static all(): EmbedProvider[] {
    return this._resolution!.providers;
  }

  static match(src: string | null | undefined): EmbedProvider | undefined {
    if (isBlank(src)) return;

    const uri = this.parse(src!);
    if (!uri) return;

    return this.all().find((provider) => provider.isAllows(uri));
  }

  static isAllows(src: string | null | undefined): boolean {
    return this.match(src) != null;
  }

  static cspFrameSources(): string[] | undefined {
    if (this.isConfigured()) {
      return presence([...new Set(this.all().flatMap((p) => p.cspSources()))]) ?? ["'none'"];
    }
  }

  static cacheVersion(): string {
    if (this.isConfigured()) {
      return Digest.hexdigest(
        this.all()
          .map((p) => p.signature())
          .join("\n"),
      );
    } else {
      return "permissive";
    }
  }

  static parse(src: string): URL | undefined {
    let uri: URL;
    try {
      uri = new URL(String(src).trim());
    } catch {
      return undefined;
    }
    if (uri.protocol !== "https:") return;
    if (isBlank(uri.hostname) || isPresent(uri.username) || isPresent(uri.password)) return;
    if (uri.port !== "") return;

    return uri;
  }

  /** @noRailsEquivalent CONVERGEABLE embed-provider-sync-account-read */
  static async resolution(): Promise<Resolution> {
    const source: Resolution["source"] = [
      presence(process.env.WRITEBOOK_EMBED_PROVIDERS) ?? null,
      (await Account.first())?.embed_providers ?? null,
    ];
    let resolved = this._resolution;
    if (JSON.stringify(resolved?.source) !== JSON.stringify(source)) {
      resolved = this._resolution = this.resolve(source);
    }
    return resolved!;
  }

  private static resolve(source: Resolution["source"]): Resolution {
    const [raw, accountEntries] = source;
    const entries = this.parseEnvironment(raw) ?? accountEntries;
    return Object.freeze({ source, entries, providers: this.build(entries) });
  }

  private static parseEnvironment(raw: string | null): Entry[] | undefined {
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Entry[]) : [parsed as Entry];
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        Trails.logger?.warn(
          "[EmbedProvider] WRITEBOOK_EMBED_PROVIDERS is not valid JSON; ignoring",
        );
        return undefined;
      }
    }
  }

  private static build(entries: Entry[] | null): EmbedProvider[] {
    return Object.freeze(
      (entries ?? [])
        .map((entry) => this.normalizeConfig(entry))
        .filter((attributes) => attributes != null)
        .map((attributes) => new EmbedProvider(attributes)),
    ) as EmbedProvider[];
  }

  private static normalizeConfig(entry: unknown) {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return;
    const e = entry as Entry;

    let hosts = [e.hosts ?? e.host]
      .flat()
      .filter((h) => h != null)
      .map((h) => String(h).trim().toLowerCase());
    hosts = hosts.filter((host) => this.HOST_FORMAT.test(host));
    const pathPrefix = this.canonicalPathPrefix(e.path_prefix);

    if (hosts.length === 0 || pathPrefix == null) {
      Trails.logger?.warn(
        `[EmbedProvider] ignoring invalid provider entry: ${JSON.stringify(entry)}`,
      );
      return;
    }

    const attributes = e.attributes;
    return {
      name: presence(String(e.name ?? "")) ?? hosts[0],
      hosts,
      pathPrefix,
      attributes: attributes == null ? null : [attributes].flat().map(String),
    };
  }

  private static canonicalPathPrefix(prefix: unknown): string | undefined {
    const p = String(prefix ?? "");
    const segments = p.split("/").filter((s) => s !== "");

    if (
      p.startsWith("/") &&
      segments.length > 0 &&
      !segments.some((s) => s === "." || s === "..")
    ) {
      return `/${segments.join("/")}`;
    }
  }

  readonly name: string;
  readonly hosts: string[];
  readonly pathPrefix: string;
  readonly attributes: string[];

  constructor({
    name,
    hosts,
    pathPrefix,
    attributes = null,
  }: {
    name: string;
    hosts: string[];
    pathPrefix: string;
    attributes?: string[] | null;
  }) {
    this.name = name;
    this.hosts = [hosts].flat().map((host) => this.normalizeHost(host));
    this.pathPrefix = pathPrefix;
    this.attributes = (attributes ?? EmbedProvider.PERMITTED_ATTRIBUTES).filter((a) =>
      EmbedProvider.PERMITTED_ATTRIBUTES.includes(a),
    );
  }

  isAllows(uri: URL): boolean {
    return (
      this.hosts.includes(this.normalizeHost(uri.hostname)) && this.isPathAllowed(uri.pathname)
    );
  }

  cspSources(): string[] {
    return this.hosts.map((host) => `https://${host}`);
  }

  signature(): string {
    return JSON.stringify([this.hosts, this.pathPrefix, this.attributes]);
  }

  private normalizeHost(host: string): string {
    return String(host ?? "").toLowerCase();
  }

  private isPathAllowed(path: string): boolean {
    if (isBlank(path) || this.isTraversal(path)) return false;

    return path === this.pathPrefix || path.startsWith(`${this.pathPrefix}/`);
  }

  private isTraversal(path: string): boolean {
    return path.split("/").includes("..") || /%2e|%2f/i.test(path);
  }
}
