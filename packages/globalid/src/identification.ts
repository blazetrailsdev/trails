import { GlobalID, type GlobalIDModel, type GlobalIDOptions } from "./global-id.js";
import { SignedGlobalID, type SignedGlobalIDOptions } from "./signed-global-id.js";

export function toGlobalId(this: GlobalIDModel, options: GlobalIDOptions = {}): GlobalID {
  return GlobalID.create(this, options);
}

export const toGid = toGlobalId;

export function toGidParam(this: GlobalIDModel, options: GlobalIDOptions = {}): string {
  return toGlobalId.call(this, options).toParam();
}

export function toSignedGlobalId(
  this: GlobalIDModel,
  options: SignedGlobalIDOptions,
): SignedGlobalID {
  return SignedGlobalID.create(this, options);
}

export const toSgid = toSignedGlobalId;

export function toSgidParam(this: GlobalIDModel, options: SignedGlobalIDOptions): string {
  return toSignedGlobalId.call(this, options).toParam();
}

export const Identification = {
  toGlobalId,
  toGid,
  toGidParam,
  toSignedGlobalId,
  toSgid,
  toSgidParam,
};

GlobalID.Identification = Identification;
