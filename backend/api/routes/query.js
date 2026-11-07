import { Router } from 'express';
import { wrap } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';

export default function queryRoutes({ queryService, authService, limiters }) {
  const r = Router();
  r.use(requireAuth(authService));

  // 202 + queryId when a job was queued; 200 when a cached answer was ready immediately.
  // "No data" is a normal 200 with noDataFlag on the GET, never an error status.
  // `refresh: true` in the body skips the cache.
  const submit = (method) => wrap(async (req, res) => {
    const out = await queryService[method](req.user, req.body, { refresh: req.body?.refresh === true });
    res.status(out.status === 'PENDING' ? 202 : 200).json(out);
  });
  r.post('/exact-match', limiters.query, submit('submitExactMatch'));
  r.post('/specs', limiters.query, submit('submitSpecification'));
  r.post('/service', limiters.query, submit('submitService'));

  // Fixed paths must be registered before /:id.
  r.get('/history', wrap(async (req, res) => res.json(await queryService.listHistory(req.user, req.query))));
  r.get('/stats', wrap(async (req, res) => res.json(await queryService.stats(req.user))));
  r.get('/:id', wrap(async (req, res) => res.json(await queryService.getQuery(req.user, req.params.id))));
  return r;
}
