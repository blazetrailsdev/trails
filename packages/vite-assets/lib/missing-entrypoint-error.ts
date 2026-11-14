import type { Pathname } from "@blazetrails/ruby-compat";
import type { Config } from "./config.js";
import { Error } from "./error.js";

export interface LastBuild {
  success: boolean | null;
  errors: unknown;
  toJson(): string;
}

export class MissingEntrypointError extends Error {
  readonly fileName: string;
  readonly lastBuild: LastBuild;
  readonly manifest: unknown;
  readonly config: Config;

  /**
   * @inventedArm manifestPaths — PERMANENT
   * @inventedArm call — PERMANENT
   */
  constructor({
    fileName,
    lastBuild,
    manifest,
    config,
    manifestPaths,
  }: {
    fileName: string;
    lastBuild: LastBuild;
    manifest: unknown;
    config: Config;
    manifestPaths: Pathname[];
  }) {
    super(`Vite Ruby can't find ${fileName} in the manifests.

Possible causes:
${MissingEntrypointError.prototype.possibleCauses.call({ config }, lastBuild)}
:troubleshooting:
${lastBuild.success ? `Manifest files found:\n${manifestPaths.map((path) => `  ${path.relativePathFrom(config.root)}`).join("\n")}\n` : ""}
${lastBuild.success ? `Last build in ${config.mode} mode:\n${lastBuild.toJson()}\n` : ""}
`);
    [this.fileName, this.lastBuild, this.manifest, this.config] = [
      fileName,
      lastBuild,
      manifest,
      config,
    ];
  }

  possibleCauses(this: { config: Config }, lastBuild: LastBuild): string {
    if (lastBuild.success === false) {
      return MissingEntrypointError.FAILED_BUILD_CAUSES.replace(
        ":mode:",
        () => this.config.mode,
      ).replace(":errors:", () => String(lastBuild.errors ?? "").replace(/^(?!$)/gm, "  "));
    } else if (this.config.autoBuild) {
      return MissingEntrypointError.DEFAULT_CAUSES;
    } else {
      return MissingEntrypointError.DEFAULT_CAUSES + MissingEntrypointError.NO_AUTO_BUILD_CAUSES;
    }
  }

  static readonly FAILED_BUILD_CAUSES = `  - The last build failed. Try running \`bin/vite build --clear --mode=:mode:\` manually and check for errors.

Errors:
:errors:
`;

  static readonly DEFAULT_CAUSES = `  - The file path is incorrect.
  - The file is not in the entrypoints directory.
  - Some files are outside the sourceCodeDir, and have not been added to watchAdditionalPaths.
`;

  static readonly NO_AUTO_BUILD_CAUSES = `  - You have not run \`bin/vite dev\` to start Vite, or the dev server is not reachable.
  - "autoBuild" is set to \`false\` in your config/vite.json for this environment.
`;
}
