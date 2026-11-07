import { Router } from 'express';
import { wrap } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';

export default function metaRoutes({ categoryRepo, authService }) {
  const r = Router();
  r.use(requireAuth(authService));
  r.get('/item-types', wrap(async (req, res) => res.json(await categoryRepo.listItemTypes())));
  r.get('/service-types', wrap(async (req, res) => res.json(await categoryRepo.listServiceTypes())));
  return r;
}
