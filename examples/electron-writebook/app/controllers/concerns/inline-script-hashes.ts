import { defineModule, included } from "@blazetrails/activesupport";
import type { ActionController, ContentSecurityPolicy } from "@blazetrails/actionpack";

type Host = Omit<ActionController.Base, "helpers"> & {
  helpers(): { javascriptPath(source: string): string };
  scriptOrigins(...entryPoints: string[]): string[];
};

// Writebook allows the importmap helper's two inline scripts by hash and the
// origins its URLs point to. This app serves its JavaScript through Vite's
// `javascriptIncludeTag`, which emits no inline script, so only the origins are
// added: a configured asset host, however it's written (with or without a
// scheme, protocol-relative, a %d set, or a proc).
export const InlineScriptHashes = defineModule(
  {
    ENTRY_POINT: "application",

    [included](base: typeof ActionController.Base): void {
      // With the policy turned off there's nothing to add to, so leave the
      // request without one rather than starting an empty policy
      base.contentSecurityPolicy(
        true,
        {
          if: (controller: unknown) => (controller as Host).request.contentSecurityPolicy != null,
        },
        function (this: unknown, policy: ContentSecurityPolicy) {
          const sources = policy.directives["script-src"] as string[] | undefined;
          if (sources != null) {
            policy.directives["script-src"] = [
              ...new Set([
                ...sources,
                ...(this as Host).scriptOrigins(InlineScriptHashes.ENTRY_POINT),
              ]),
            ];
          }
        },
      );
    },
  },
  undefined,
  {
    scriptOrigins(this: Host, ...entryPoints: string[]): string[] {
      const baseUrl = this.request.baseUrl;
      const origins = entryPoints
        .map((source) => new URL(this.helpers().javascriptPath(source), baseUrl).origin)
        .filter((origin) => origin !== baseUrl);
      return [...new Set(origins)];
    },
  },
);
