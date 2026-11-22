import type { IntakeError, IntakeErrorCode } from '@/types';

/**
 * Structured error thrown by the React-independent intake engine.
 * Never embeds raw cell data or sensitive user payload content.
 */
export class IntakeValidationError extends Error {
  readonly code: IntakeErrorCode;
  readonly title: string;
  readonly details?: string;

  constructor(error: IntakeError) {
    super(error.message);
    this.name = 'IntakeValidationError';
    this.code = error.code;
    this.title = error.title;
    this.details = error.details;
  }

  toIntakeError(): IntakeError {
    return {
      code: this.code,
      title: this.title,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export function isIntakeValidationError(
  error: unknown,
): error is IntakeValidationError {
  return error instanceof IntakeValidationError;
}

export function toIntakeError(error: unknown): IntakeError {
  if (isIntakeValidationError(error)) {
    return error.toIntakeError();
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'title' in error &&
    'message' in error
  ) {
    return error as IntakeError;
  }
  return {
    code: 'UNREADABLE_FILE',
    title: 'File could not be processed',
    message:
      'An unexpected error occurred while reading this file. Verify the file is not corrupted or locked and try again.',
  };
}
