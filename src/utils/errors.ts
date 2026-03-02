export class APIError extends Error {
  code?: number;
  status?: number;

  constructor(message: string, options?: { code?: number; status?: number }) {
    super(message);
    this.name = 'APIError';
    this.code = options?.code;
    this.status = options?.status;
  }
}
