export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export class ValidationError extends HttpError {
  constructor(details) {
    super(400, 'Validation Error', details);
  }
}
