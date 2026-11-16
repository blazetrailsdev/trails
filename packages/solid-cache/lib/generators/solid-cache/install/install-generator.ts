import { File } from "@blazetrails/ruby-compat";
import { Base } from "@blazetrails/trailties/generators";

export class InstallGenerator extends Base {
  static {
    this.sourceRoot(
      File.expandPath("templates", decodeURIComponent(new URL(".", import.meta.url).pathname)),
    );
    this.methodAdded("copyFiles");
    this.methodAdded("configureCacheStoreAdapter");
  }

  async copyFiles(): Promise<void> {
    await this.template("config/cache.ts");
    await this.template("db/cache_schema.ts");
  }

  async configureCacheStoreAdapter(): Promise<void> {
    await this.gsubFile(
      File.join(this.destinationRoot, "config/environments/production.ts"),
      /(\/\/ )?this\.config\.cacheStore = (".*")/,
      'this.config.cacheStore = ":solid_cache_store"',
    );
  }
}
