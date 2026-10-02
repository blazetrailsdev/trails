import { StandardError } from "@blazetrails/ruby-compat";

export class Error extends StandardError {}

export const Errors = {
  InvalidSalt: class InvalidSalt extends Error {},
  InvalidHash: class InvalidHash extends Error {},
  InvalidCost: class InvalidCost extends Error {},
  InvalidSecret: class InvalidSecret extends Error {},
};
