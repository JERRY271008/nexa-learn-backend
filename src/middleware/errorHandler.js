function notFoundHandler(req, res) {
  res.status(404).json({ error: true, code: 'NOT_FOUND', message: 'Route not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = Number.isInteger(err.status) ? err.status : 500;

  // Log full detail server-side; only ever send the curated message to the client.
  console.error(`[API ERROR] ${status} ${err.code || 'INTERNAL_ERROR'} — ${err.message}`);
  if (status >= 500 && err.stack) console.error(err.stack);

  // Multer's file-too-large error doesn't set our .status, catch it by name.
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: true, code: 'FILE_TOO_LARGE', message: 'File must be under 5MB.' });
  }

  res.status(status).json({
    error: true,
    code: err.code || 'INTERNAL_ERROR',
    message: status >= 500 && !err.code ? 'Something went wrong on the server.' : err.message,
  });
}

module.exports = { notFoundHandler, errorHandler };
