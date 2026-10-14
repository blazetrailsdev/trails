import { StandardError, rbModConstSet } from "@blazetrails/ruby-compat";

export class Error extends StandardError {}

class InvalidSalt extends Error {}

class InvalidHash extends Error {}

class InvalidCost extends Error {}

class InvalidSecret extends Error {}

export const Errors = { name: "BCrypt::Errors" } as {
  readonly name: string;
  InvalidSalt: typeof InvalidSalt;
  InvalidHash: typeof InvalidHash;
  InvalidCost: typeof InvalidCost;
  InvalidSecret: typeof InvalidSecret;
};
rbModConstSet(Errors, "InvalidSalt", InvalidSalt);
rbModConstSet(Errors, "InvalidHash", InvalidHash);
rbModConstSet(Errors, "InvalidCost", InvalidCost);
rbModConstSet(Errors, "InvalidSecret", InvalidSecret);
