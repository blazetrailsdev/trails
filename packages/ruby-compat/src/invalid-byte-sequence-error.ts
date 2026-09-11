import type { Encoding } from "./encoding.js";
import { EncodingError } from "./encoding-error.js";

/**
 * Ruby's core `Encoding::InvalidByteSequenceError`
 * (`vendor/ruby/transcode.c:4506` `rb_eInvalidByteSequenceError`), an
 * `EncodingError` subclass — what `make_econv_exception`
 * (`vendor/ruby/transcode.c:2139-2144`) raises on bytes a converter cannot
 * read, carrying the readers `transcode.c:4627-4633` defines.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError`,
 * which Rails inherits rather than defines.
 */
export class InvalidByteSequenceError extends EncodingError {
  _errorBytes: string | null = null;
  _readagainBytes: string | null = null;
  _incompleteInput = false;
  _sourceEncoding: Encoding | null = null;
  _destinationEncoding: Encoding | null = null;

  /**
   * `ecerr_source_encoding_name` (`vendor/ruby/transcode.c:4627`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError#source_encoding_name`.
   */
  sourceEncodingName(): string | null {
    return this._sourceEncoding?.name ?? null;
  }

  /**
   * `ecerr_destination_encoding_name` (`vendor/ruby/transcode.c:4628`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError#destination_encoding_name`.
   */
  destinationEncodingName(): string | null {
    return this._destinationEncoding?.name ?? null;
  }

  /**
   * `ecerr_source_encoding` (`vendor/ruby/transcode.c:4629`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError#source_encoding`.
   */
  sourceEncoding(): Encoding | null {
    return this._sourceEncoding;
  }

  /**
   * `ecerr_destination_encoding` (`vendor/ruby/transcode.c:4630`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError#destination_encoding`.
   */
  destinationEncoding(): Encoding | null {
    return this._destinationEncoding;
  }

  /**
   * `ecerr_error_bytes` (`vendor/ruby/transcode.c:4631`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError#error_bytes`.
   */
  errorBytes(): string | null {
    return this._errorBytes;
  }

  /**
   * `ecerr_readagain_bytes` (`vendor/ruby/transcode.c:4632`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError#readagain_bytes`.
   */
  readagainBytes(): string | null {
    return this._readagainBytes;
  }

  /**
   * `ecerr_incomplete_input` (`vendor/ruby/transcode.c:4633`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Encoding::InvalidByteSequenceError#incomplete_input?`.
   */
  isIncompleteInput(): boolean {
    return this._incompleteInput;
  }
}
