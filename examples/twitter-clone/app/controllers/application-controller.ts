import { ActionController, ParseError } from "@blazetrails/actionpack";
import { RecordInvalid, RecordNotFound, RecordNotUnique } from "@blazetrails/activerecord";

export class ApplicationController extends ActionController.API {
  static {
    this.rescueFrom(RecordNotFound, { with: "notFound" });
    this.rescueFrom(RecordInvalid, { with: "unprocessableEntity" });
    this.rescueFrom(RecordNotUnique, { with: "conflict" });
    this.rescueFrom(ParseError, { with: "badRequest" });
  }

  protected async notFound(exception: Error): Promise<void> {
    await this.render({ json: { error: exception.message }, status: ":not_found" });
  }

  protected async unprocessableEntity(exception: Error): Promise<void> {
    await this.render({ json: { error: exception.message }, status: ":unprocessable_entity" });
  }

  protected async conflict(exception: Error): Promise<void> {
    await this.render({ json: { error: exception.message }, status: ":conflict" });
  }

  protected async badRequest(exception: Error): Promise<void> {
    await this.render({ json: { error: exception.message }, status: ":bad_request" });
  }
}
