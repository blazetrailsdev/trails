/**
 * ActionController exceptions
 *
 * All error classes referenced throughout ActionController modules.
 * @see https://api.rubyonrails.org/classes/ActionController.html
 */

export class ActionControllerError extends Error {
  constructor(message?: string) {
    super(message ?? "");
    this.name = "ActionControllerError";
  }
}

export class BadRequest extends ActionControllerError {
  constructor(message?: string) {
    super(message);
    this.name = "BadRequest";
  }
}

export class RenderError extends ActionControllerError {
  constructor(message?: string) {
    super(message);
    this.name = "RenderError";
  }
}

export class RoutingError extends ActionControllerError {
  readonly failures: unknown[];

  constructor(message: string, failures: unknown[] = []) {
    super(message);
    this.name = "RoutingError";
    this.failures = failures;
  }
}

export class UrlGenerationError extends ActionControllerError {
  readonly routes: unknown;
  readonly routeName: string | null;
  readonly methodName: string | null;

  constructor(
    message: string,
    routes: unknown = null,
    routeName: string | null = null,
    methodName: string | null = null,
  ) {
    super(message);
    this.name = "UrlGenerationError";
    this.routes = routes;
    this.routeName = routeName;
    this.methodName = methodName;
  }
}

export class MethodNotAllowed extends ActionControllerError {
  constructor(...allowedMethods: string[]) {
    super(`Only ${allowedMethods.join(", ")} requests are allowed.`);
    this.name = "MethodNotAllowed";
  }
}

export class NotImplemented extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Not Implemented");
    this.name = "NotImplemented";
  }
}

export class MissingFile extends ActionControllerError {
  constructor(message?: string) {
    super(message);
    this.name = "MissingFile";
  }
}

export class SessionOverflowError extends ActionControllerError {
  static DEFAULT_MESSAGE =
    "Your session data is larger than the data column in which it is to be stored. You must increase the size of your data column if you intend to store large data.";

  constructor(message?: string) {
    super(message ?? SessionOverflowError.DEFAULT_MESSAGE);
    this.name = "SessionOverflowError";
  }
}

export class UnknownHttpMethod extends ActionControllerError {
  constructor(message?: string) {
    super(message);
    this.name = "UnknownHttpMethod";
  }
}

export class UnknownFormat extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Unknown format");
    this.name = "UnknownFormat";
  }
}

export class RespondToMismatchError extends ActionControllerError {
  static DEFAULT_MESSAGE =
    "respond_to was called multiple times and matched with conflicting formats in this action. Please note that you may only call respond_to and match on a single format per action.";

  constructor(message?: string) {
    super(message ?? RespondToMismatchError.DEFAULT_MESSAGE);
    this.name = "RespondToMismatchError";
  }
}

export class MissingExactTemplate extends UnknownFormat {
  readonly controller: string;
  readonly actionName: string;

  constructor(message: string, controller: string, actionName: string) {
    super(message);
    this.name = "MissingExactTemplate";
    this.controller = controller;
    this.actionName = actionName;
  }
}
