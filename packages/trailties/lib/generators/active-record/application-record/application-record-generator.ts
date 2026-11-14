import "../../../constants.active-record-application-record-application-record-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class ApplicationRecordGenerator extends Base {
  private _applicationRecordFileName?: string;

  static {
    this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("createApplicationRecord");
  }

  async createApplicationRecord(): Promise<void> {
    await this.template("application_record.ts", this.applicationRecordFileName());
  }

  /** @internal */
  private applicationRecordFileName(): string {
    return (this._applicationRecordFileName ??= this.isNamespaced()
      ? `app/models/${this.namespacedPath()}/application-record${this.ext()}`
      : `app/models/application-record${this.ext()}`);
  }
}

Object.defineProperty(ApplicationRecordGenerator, "name", {
  value: "ActiveRecord::Generators::ApplicationRecordGenerator",
});
