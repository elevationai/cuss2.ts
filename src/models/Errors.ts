/**
 * Base class for all custom errors in the CUSS2 library
 */
export class Cuss2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // This is necessary for proper stack trace in TypeScript/ES6 classes
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends Cuss2Error {
  status: number;

  constructor(message: string, status: number = 401) {
    super(message);
    this.status = status;
  }
}
