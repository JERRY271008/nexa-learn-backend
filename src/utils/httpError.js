/**
 * Build an Error carrying an HTTP status code and a machine-readable code,
 * so route handlers can `throw` it and the central error handler can turn
 * it into the right response.
 */
function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code || 'ERROR';
  return err;
}

module.exports = { httpError };
