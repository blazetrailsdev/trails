import type { RackResponse } from "@blazetrails/rack";
import { Proxy } from "@blazetrails/rack-proxy";
import { hashDelete, kernelURI, rbProcCall, stringSplit } from "@blazetrails/ruby-compat";
import type { Config } from "./config.js";
import { ViteAssets } from "./vite-assets.js";

type RackEnv = Record<string, unknown>;

export class DevServerProxy extends Proxy {
  static readonly HOST_WITH_PORT_REGEX = /^(.+?)(:\d+)\//m;
  static readonly VITE_DEPENDENCY_PREFIX = "/@";

  /** @internal */
  private viteRuby: ViteAssets;
  /** @internal */
  private _viteUrlPrefix: string | undefined;

  constructor(app: unknown = null, options: Record<string, unknown> = {}) {
    const viteRuby =
      (hashDelete(options, "viteRuby") as ViteAssets | null) ?? ViteAssets.instance();
    super(app, options);
    this.viteRuby = viteRuby;
  }

  /** @inventedArm streaming — PERMANENT */
  async performRequest(env: RackEnv): Promise<RackResponse> {
    if ((await this.isViteShouldHandle(env)) && (await this.isDevServerRunning())) {
      const config = await this.config();
      if (config.mode === "test" && !Object.hasOwn(this.opts, "streaming")) this.streaming = false;
      await this.forwardToViteDevServer(env);
      return super.performRequest(env);
    } else {
      return rbProcCall(this.app, env) as Promise<RackResponse>;
    }
  }

  /** @internal */
  private config(): Promise<Config> {
    return this.viteRuby.config();
  }

  /** @internal */
  private isDevServerRunning(): Promise<boolean> {
    return this.viteRuby.isDevServerRunning();
  }

  /** @internal */
  private rewriteUriForVite(env: RackEnv): void {
    const uri = Object.hasOwn(env, "REQUEST_URI")
      ? (env["REQUEST_URI"] as string)
      : [env["PATH_INFO"], env["QUERY_STRING"]]
          .filter((str) => String(str ?? "").trim() !== "")
          .join("?");
    [env["PATH_INFO"], env["QUERY_STRING"]] = stringSplit(
      (env["REQUEST_URI"] = this.normalizeUri(uri)),
      "?",
    );
  }

  /** @internal */
  private normalizeUri(uri: string): string {
    return uri
      .replace(DevServerProxy.HOST_WITH_PORT_REGEX, "/")
      .replace(".ts.js", ".ts")
      .replace(/\.(sass|scss|styl|stylus|less|pcss|postcss)\.css$/m, ".$1");
  }

  /** @internal */
  private async forwardToViteDevServer(env: RackEnv): Promise<void> {
    this.rewriteUriForVite(env);
    const config = await this.config();
    env["QUERY_STRING"] ??= "";
    env["rack.backend"] = kernelURI(config.origin());
    env["HTTP_HOST"] = env["HTTP_X_FORWARDED_HOST"] = config.host;
    env["HTTP_X_FORWARDED_SERVER"] = config.hostWithPort();
    env["HTTP_PORT"] = env["HTTP_X_FORWARDED_PORT"] = String(config.port);
    env["HTTP_X_FORWARDED_PROTO"] = env["HTTP_X_FORWARDED_SCHEME"] = config.protocol();
    if (!config.https) env["HTTPS"] = env["HTTP_X_FORWARDED_SSL"] = "off";
    env["SCRIPT_NAME"] = "";
  }

  /** @internal */
  private async isViteShouldHandle(env: RackEnv): Promise<boolean | null> {
    const path = this.normalizeUri(env["PATH_INFO"] as string);
    if (path.startsWith(await this.viteUrlPrefix())) return true;

    if (await this.isFileInViteRoot(path)) return true;
    return null;
  }

  /** @internal */
  private async isFileInViteRoot(path: string): Promise<boolean> {
    return (
      path.includes(".") &&
      (await (
        await this.config()
      )
        .viteRootDir()
        .join(path.startsWith("/") ? path.slice(1) : path)
        .isFile())
    );
  }

  /** @internal */
  private async viteUrlPrefix(): Promise<string> {
    return (this._viteUrlPrefix ??=
      (await this.config()).publicOutputDir === ""
        ? DevServerProxy.VITE_DEPENDENCY_PREFIX
        : `/${(await this.config()).publicOutputDir}/`);
  }
}

ViteAssets.DevServerProxy = DevServerProxy;
