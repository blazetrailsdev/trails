import { ArgumentError, Gem, type Pathname } from "@blazetrails/ruby-compat";
import { DEFAULT_PLUGIN_VERSION, VERSION } from "./version.js";

export const CompatibilityCheck = {
  async verifyPluginVersion(root: Pathname): Promise<void> {
    let pkg: Record<string, Record<string, string> | undefined>;
    try {
      pkg = JSON.parse(await root.join("package.json").read());
    } catch {
      pkg = {};
    }
    const requirement =
      pkg["devDependencies"]?.["vite-plugin-ruby"] ?? pkg["dependencies"]?.["vite-plugin-ruby"];

    CompatibilityCheck.raiseUnlessSatisfied(requirement, DEFAULT_PLUGIN_VERSION);
  },

  raiseUnlessSatisfied(npmReq: string | undefined, rubyReq: string | null): void {
    if (!CompatibilityCheck.isCompatiblePlugin(npmReq, rubyReq)) {
      throw new ArgumentError(`vite-plugin-ruby@${npmReq ?? ""} might not be compatible with vite_ruby-${VERSION}

You may disable this check if needed: https://vite-ruby.netlify.app/config/#skipcompatibilitycheck

You may upgrade both by running:

    bundle exec vite upgrade
`);
    }
  },

  isCompatiblePlugin(npmReq: string | undefined, rubyReq: string | null): boolean {
    try {
      const [npm, ruby] = [npmReq, rubyReq].map(
        (req) => new Gem.Requirement(req!.replace("^", "~>")),
      );

      const currentVersion = npm.requirements[0][1];

      return ruby.isSatisfiedBy(currentVersion);
    } catch {
      return true;
    }
  },
};
