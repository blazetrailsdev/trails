import { isBlank } from "@blazetrails/activesupport";
import { ArgumentError, Zlib } from "@blazetrails/ruby-compat";

export const URI_REGEXP = /^[-a-z]+:\/\/|^(?:cid|data):|^\/\//i;

export const ASSET_EXTENSIONS: Record<string, string> = {
  javascript: ".js",
  stylesheet: ".css",
};

export const ASSET_PUBLIC_DIRECTORIES: Record<string, string> = {
  audio: "/audios",
  font: "/fonts",
  image: "/images",
  javascript: "/javascripts",
  stylesheet: "/stylesheets",
  video: "/videos",
};

export interface AssetPathOptions {
  type?: string;
  extname?: string | false;
  skipPipeline?: boolean;
  host?: string | ((source: string, request?: unknown) => string);
  protocol?: string;
}

export interface AssetUrlHelperHost {
  config?: {
    relativeUrlRoot?: string;
    assetHost?: string | ((source: string, request?: unknown) => string);
    defaultAssetHostProtocol?: string;
  } | null;
  request?: { baseUrl: string; protocol: string } | null;
  computeAssetPath(source: string, options?: AssetPathOptions): string;
  publicComputeAssetPath(source: string, options?: AssetPathOptions): string;
}

function fileJoin(...segments: string[]): string {
  return segments
    .map((segment, index) =>
      index === 0 ? segment.replace(/\/+$/, "") : segment.replace(/^\/+|\/+$/g, ""),
    )
    .join("/");
}

export function assetPath(
  this: AssetUrlHelperHost,
  source: string | null | undefined,
  options: AssetPathOptions = {},
): string {
  if (source === null || source === undefined) {
    throw new ArgumentError("nil is not a valid asset source");
  }

  source = String(source);
  if (isBlank(source)) return "";
  if (URI_REGEXP.test(source)) return source;

  const tail = /([?#].+)$/.exec(source)?.[1];
  source = source.replace(/([?#].+)$/, "");

  const extname = computeAssetExtname(source, options);
  if (extname !== null) {
    source = `${source}${extname}`;
  }

  if (!source.startsWith("/")) {
    if (options.skipPipeline === true) {
      source = this.publicComputeAssetPath(source, options);
    } else {
      source = this.computeAssetPath(source, options);
    }
  }

  const relativeUrlRoot = this.config?.relativeUrlRoot;
  if (relativeUrlRoot !== null && relativeUrlRoot !== undefined && relativeUrlRoot !== "") {
    if (!source.startsWith(`${relativeUrlRoot}/`)) {
      source = fileJoin(relativeUrlRoot, source);
    }
  }

  const host = computeAssetHost.call(this, source, options);
  if (host !== null && host !== undefined) {
    source = fileJoin(host, source);
  }

  return `${source}${tail ?? ""}`;
}

export const pathToAsset = assetPath;

export function computeAssetExtname(source: string, options: AssetPathOptions = {}): string | null {
  if (options.extname === false) return null;
  const extname =
    options.extname ?? (options.type === undefined ? undefined : ASSET_EXTENSIONS[options.type]);
  if (extname !== undefined && extname !== null && extnameOf(source) !== extname) {
    return extname;
  }
  return null;
}

function extnameOf(source: string): string {
  const base = source.slice(source.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
}

export function computeAssetPath(source: string, options: AssetPathOptions = {}): string {
  const dir =
    (options.type === undefined ? undefined : ASSET_PUBLIC_DIRECTORIES[options.type]) ?? "";
  return fileJoin(dir, source);
}

export const publicComputeAssetPath = computeAssetPath;

export function computeAssetHost(
  this: AssetUrlHelperHost,
  source = "",
  options: AssetPathOptions = {},
): string | undefined {
  const request = this.request;
  let host = options.host;
  host ??= this.config?.assetHost;

  if (host !== null && host !== undefined && host !== "") {
    if (typeof host === "function") {
      const args: unknown[] = [source];
      if (request && host.length > 1) args.push(request);
      host = (host as (...a: unknown[]) => string)(...args);
    } else if (host.includes("%d")) {
      host = host.replace("%d", String(Zlib.crc32(source) % 4));
    }
  }

  if (
    (host === null || host === undefined || host === "") &&
    request &&
    options.protocol === ":request"
  ) {
    host = request.baseUrl;
  }
  if (host === null || host === undefined || host === "") return undefined;

  if (URI_REGEXP.test(host)) {
    return host;
  }
  const protocol =
    options.protocol ??
    this.config?.defaultAssetHostProtocol ??
    (request ? ":request" : ":relative");
  switch (protocol) {
    case ":relative":
      return `//${host}`;
    case ":request":
      return `${request!.protocol}${host}`;
    default:
      return `${protocol}://${host}`;
  }
}

export function stylesheetPath(
  this: AssetUrlHelperHost,
  source: string,
  options: AssetPathOptions = {},
): string {
  return pathToAsset.call(this, source, { type: "stylesheet", ...options });
}

export const pathToStylesheet = stylesheetPath;
