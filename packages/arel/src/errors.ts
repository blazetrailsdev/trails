import { constSet } from "@blazetrails/ruby-compat";
import { Arel } from "./namespaces.js";

export class ArelError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ArelError";
  }
}

export class EmptyJoinError extends ArelError {
  constructor(message?: string) {
    super(message);
    this.name = "EmptyJoinError";
  }
}

export class BindError extends ArelError {
  constructor(message: string, sql?: string) {
    super(sql !== undefined ? `${message} in: ${JSON.stringify(sql)}` : message);
    this.name = "BindError";
  }
}

constSet(Arel, "ArelError", ArelError);
constSet(Arel, "EmptyJoinError", EmptyJoinError);
constSet(Arel, "BindError", BindError);
