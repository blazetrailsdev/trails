import { ActionController, ParseError } from "@blazetrails/actionpack";
import { RecordNotFound } from "@blazetrails/activerecord";
import { include, type Included } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";
import { Authentication } from "./concerns/authentication.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface ApplicationController extends Included<typeof Authentication> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ApplicationController extends ActionController.API {
  declare static allowUnauthenticatedAccess: (options?: { only?: string | string[] }) => void;

  static {
    include(this, Authentication);

    this.wrapParameters(false);

    this.rescueFrom(Error, { with: "internalServerError" });
    this.rescueFrom(RecordNotFound, { with: "postNotFound" });
    this.rescueFrom(ParseError, { with: "malformedJsonBody" });
  }

  protected async renderError(message: string | null, status: string): Promise<void> {
    await this.render({ json: { error: message }, status });
  }

  /**
   * Rescues `Error`, not `StandardError`: a native `TypeError` or a driver's error
   * does not extend ruby-compat's `StandardError`, and Ruby's would.
   */
  protected async internalServerError(exception: Error): Promise<void> {
    Trails.logger!.error(exception.stack ?? String(exception));
    await this.renderError("internal server error", ":internal_server_error");
  }

  protected async postNotFound(): Promise<void> {
    await this.renderError("post not found", ":not_found");
  }

  protected async malformedJsonBody(): Promise<void> {
    await this.renderError("malformed JSON body", ":bad_request");
  }
}
