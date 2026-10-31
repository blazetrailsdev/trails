import { rbFSend, rbProcCall } from "@blazetrails/ruby-compat";

export class NamedVariant {
  readonly transformations: { [k: string]: unknown };
  readonly preprocessed: unknown;

  constructor(transformations: { [k: string]: unknown }) {
    const { preprocessed, ...rest } = transformations;
    this.preprocessed = preprocessed ?? null;
    this.transformations = rest;
  }

  isPreprocessed(record: unknown): unknown {
    const preprocessed = this.preprocessed;
    if (typeof preprocessed === "string" && preprocessed.startsWith(":")) {
      return rbFSend(record as object, preprocessed.slice(1));
    } else if (typeof preprocessed === "function") {
      return rbProcCall(preprocessed, record);
    } else {
      return preprocessed;
    }
  }
}
