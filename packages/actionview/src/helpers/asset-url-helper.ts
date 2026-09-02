import { isBlank } from "@blazetrails/activesupport";

/**
 * ActionView::Helpers::AssetUrlHelper
 *
 * Mirrors `actionview/lib/action_view/helpers/asset_url_helper.rb`.
 */

/** `asset_url_helper.rb:122`. */
export const URI_REGEXP = /^[-a-z]+:\/\/|^(?:cid|data):|^\/\//i;

/** `asset_url_helper.rb:245`. */
export const ASSET_EXTENSIONS: Record<string, string> = {
  javascript: ".js",
  stylesheet: ".css",
};

/** `asset_url_helper.rb:255`. */
export const ASSET_PUBLIC_DIRECTORIES: Record<string, string> = {
  audio: "/audios",
  font: "/fonts",
  image: "/images",
  javascript: "/javascripts",
  stylesheet: "/stylesheets",
  video: "/videos",
};

export interface AssetPathOptions {
  extname?: string | false;
  type?: string;
  skipPipeline?: boolean;
}

/**
 * The subset of the view an `AssetUrlHelper` body dispatches back through.
 * `compute_asset_path` is documented as the override point for a pipeline
 * (`asset_url_helper.rb:262-264`), so it is looked up on the receiver rather
 * than called as a module-local function.
 */
export interface AssetUrlHelperHost {
  computeAssetPath?(source: string, options?: AssetPathOptions): string;
  publicComputeAssetPath?(source: string, options?: AssetPathOptions): string;
}

/**
 * Compute extname to append to asset path. Returns `null` if
 * nothing should be added. `asset_url_helper.rb:242-250`.
 */
export function computeAssetExtname(source: string, options: AssetPathOptions = {}): string | null {
  if (options.extname === false) return null;
  const extname = options.extname || (options.type != null ? ASSET_EXTENSIONS[options.type] : null);
  const dot = source.lastIndexOf(".");
  const slash = source.lastIndexOf("/");
  const sourceExtname = dot > slash && dot !== -1 ? source.slice(dot) : "";
  if (extname != null && extname !== "" && sourceExtname !== extname) {
    return extname;
  } else {
    return null;
  }
}

/**
 * Computes asset path to public directory. Plugins and
 * extensions can override this method to point to custom assets
 * or generate digested paths or query strings.
 * `asset_url_helper.rb:265-268`.
 */
export function computeAssetPath(source: string, options: AssetPathOptions = {}): string {
  const dir = (options.type != null ? ASSET_PUBLIC_DIRECTORIES[options.type] : null) || "";
  return dir === "" ? source : `${dir}/${source}`;
}

/** `alias :public_compute_asset_path :compute_asset_path` (`asset_url_helper.rb:269`). */
export const publicComputeAssetPath = computeAssetPath;

/**
 * Computes the path to an asset in a public directory.
 * `asset_url_helper.rb:187-216`.
 */
export function assetPath(
  this: AssetUrlHelperHost | void,
  source: string | null | undefined,
  options: AssetPathOptions = {},
): string {
  if (source == null) throw new TypeError("nil is not a valid asset source");

  source = String(source);
  if (isBlank(source)) return "";
  if (URI_REGEXP.test(source)) return source;

  const match = /([?#].+)$/.exec(source);
  const tail = match ? match[1] : "";
  source = source.replace(/([?#].+)$/, "");

  const extname = computeAssetExtname(source, options);
  if (extname != null) {
    source = `${source}${extname}`;
  }

  if (!source.startsWith("/")) {
    if (options.skipPipeline === true) {
      source = (this?.publicComputeAssetPath ?? publicComputeAssetPath).call(this, source, options);
    } else {
      source = (this?.computeAssetPath ?? computeAssetPath).call(this, source, options);
    }
  }

  return `${source}${tail}`;
}

/** `alias_method :path_to_asset, :asset_path` (`asset_url_helper.rb:218`). */
export const pathToAsset = assetPath;

/**
 * Computes the path to a stylesheet asset in the public stylesheets directory.
 * `asset_url_helper.rb:348-350`.
 */
export function stylesheetPath(
  this: AssetUrlHelperHost | void,
  source: string,
  options: AssetPathOptions = {},
): string {
  return pathToAsset.call(this, source, { type: "stylesheet", ...options });
}

/** `alias_method :path_to_stylesheet, :stylesheet_path` (`asset_url_helper.rb:351`). */
export const pathToStylesheet = stylesheetPath;
