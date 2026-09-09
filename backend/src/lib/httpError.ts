/** A structured error the API's error handler turns into `{ error: { code, message } }`. */
export class HttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const unauthorized = (message = "Not authenticated") =>
  new HttpError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "Not allowed") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
