import { StandardError } from "@blazetrails/ruby-compat";

export class Error extends StandardError {}

export class InvalidSalt extends Error {}

export class InvalidHash extends Error {}

export class InvalidCost extends Error {}

export class InvalidSecret extends Error {}

export const Errors = {
  name: "BCrypt::Errors",
  InvalidSalt,
  InvalidHash,
  InvalidCost,
  InvalidSecret,
} as const;
