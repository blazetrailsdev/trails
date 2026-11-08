import { StandardError } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";

export class Error extends StandardError {}

export class InvariableError extends Error {}

export class UnpreviewableError extends Error {}

export class UnrepresentableError extends Error {}

export class IntegrityError extends Error {}

export class FileNotFoundError extends Error {}

export class PreviewError extends Error {}

ActiveStorage.Error = Error;
ActiveStorage.InvariableError = InvariableError;
ActiveStorage.UnpreviewableError = UnpreviewableError;
ActiveStorage.UnrepresentableError = UnrepresentableError;
ActiveStorage.IntegrityError = IntegrityError;
ActiveStorage.FileNotFoundError = FileNotFoundError;
ActiveStorage.PreviewError = PreviewError;
