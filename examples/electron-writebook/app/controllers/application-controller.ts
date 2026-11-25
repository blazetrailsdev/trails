import { include, type Extended, type Included } from "@blazetrails/activesupport";
import { ActionController } from "@blazetrails/actionpack";
import {
  Authentication,
  type ClassMethods as AuthenticationClassMethods,
} from "./concerns/authentication.ts";
import { Authorization } from "../models/concerns/authorization.ts";
import { UploadedFiles } from "./concerns/uploaded-files.ts";
import { VersionHeaders } from "./concerns/version-headers.ts";
import { InlineScriptHashes } from "./concerns/inline-script-hashes.ts";
import { EmbedProvider } from "../models/embed-provider.ts";
import { TagHelper } from "../../lib/trails-ext/action-text-tag-helper.ts";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ApplicationController
  extends
    Included<typeof Authentication>,
    Included<typeof Authorization>,
    Included<typeof UploadedFiles>,
    Included<typeof VersionHeaders>,
    Included<typeof InlineScriptHashes> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ApplicationController extends ActionController.Base {
  declare static allowUnauthenticatedAccess: Extended<
    typeof AuthenticationClassMethods
  >["allowUnauthenticatedAccess"];
  declare static requireUnauthenticatedAccess: Extended<
    typeof AuthenticationClassMethods
  >["requireUnauthenticatedAccess"];

  static {
    include(this, Authentication);
    include(this, Authorization);
    include(this, UploadedFiles);
    include(this, VersionHeaders);
    include(this, InlineScriptHashes);

    this.helper(TagHelper);

    this.allowBrowser({ versions: "modern" });

    this.beforeAction(async () => {
      await EmbedProvider.resolution();
    });

    this.contentSecurityPolicy(
      true,
      { if: () => EmbedProvider.isConfigured() },
      (policy: { frameSrc(...sources: string[]): void }) => {
        policy.frameSrc(...EmbedProvider.cspFrameSources()!);
      },
    );
  }
}
