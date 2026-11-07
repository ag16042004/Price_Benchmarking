import { Router } from 'express';
import { wrap } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

/** Every route here is behind requireAuth + a fresh database role check (NFR-3). */
export default function adminRoutes({ adminService, authService, userRepo }) {
  const r = Router();
  r.use(requireAuth(authService));
  r.use(requireRole(userRepo, 'ADMIN'));

  r.get('/sources', wrap(async (req, res) => res.json(await adminService.listSources())));
  r.post('/sources', wrap(async (req, res) => res.status(201).json(await adminService.createSource(req.body))));
  r.patch('/sources/:id', wrap(async (req, res) => res.json(await adminService.updateSource(req.params.id, req.body))));

  r.get('/:kind(item-types|service-types)', wrap(async (req, res) => res.json(await adminService.listCategories(req.params.kind))));
  r.post('/:kind(item-types|service-types)', wrap(async (req, res) => res.status(201).json(await adminService.createCategory(req.params.kind, req.body))));
  r.patch('/:kind(item-types|service-types)/:id', wrap(async (req, res) => res.json(await adminService.updateCategory(req.params.kind, req.params.id, req.body))));

  r.get('/rates', wrap(async (req, res) => res.json(await adminService.listRates())));
  r.post('/rates', wrap(async (req, res) => res.status(201).json(await adminService.createRate(req.body))));
  r.patch('/rates/:id', wrap(async (req, res) => res.json(await adminService.updateRate(req.params.id, req.body))));
  return r;
}
