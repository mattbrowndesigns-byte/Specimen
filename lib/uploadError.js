// What an upload route answers with: a sentence and a status.
export class UploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
