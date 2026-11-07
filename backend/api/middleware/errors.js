export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err.status) return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}
