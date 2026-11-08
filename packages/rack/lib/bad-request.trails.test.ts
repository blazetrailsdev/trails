import { it, expect } from "vitest";
import { BadRequest } from "./bad-request.js";
import { MissingInputError } from "./multipart.js";
import {
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  EmptyContentError,
  BoundaryTooLongError,
} from "./multipart/parser.js";
import { ParameterTypeError, InvalidParameterError, QueryLimitError } from "./query-parser.js";

it("marks every malformed-input error as a BadRequest", () => {
  const errors = [
    new MissingInputError("Missing input stream!"),
    new MultipartPartLimitError(),
    new MultipartTotalPartLimitError(),
    new EmptyContentError(),
    new BoundaryTooLongError(),
    new ParameterTypeError("bad"),
    new InvalidParameterError("bad"),
    new QueryLimitError("bad"),
  ];

  for (const error of errors) {
    expect(error instanceof BadRequest).toBe(true);
  }

  expect(new Error("nope") instanceof BadRequest).toBe(false);
});
