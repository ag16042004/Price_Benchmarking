import { Router } from 'express';
import { wrap } from '../middleware/errors.js';
import { HttpError } from '../../models/errors.js';
import { allowedEmailDomain } from '../../models/validators.js';

export default function authRoutes({ authService, limiters, userRepo, demo, registrationCode }) {
  const r = Router();

  // Public: what the sign-up form needs to know (so the page never hard-codes the rules).
  r.get('/config', (req, res) => res.json({ emailDomain: allowedEmailDomain(), inviteCodeRequired: !!registrationCode, demoLogin: demo.quickLogin }));

  r.post('/register', limiters.auth, wrap(async (req, res) => res.status(201).json(await authService.register(req.body))));
  r.post('/login', limiters.auth, wrap(async (req, res) => res.json(await authService.login(req.body))));

  // Demo only (DEMO_QUICK_LOGIN=true): a session for the seeded admin or officer.
  r.post('/demo', limiters.auth, wrap(async (req, res) => {
    if (!demo.quickLogin) throw new HttpError(404, 'Not found');
    const user = await userRepo.findByEmail(demo.accounts[req.body?.role === 'admin' ? 'admin' : 'officer'].email);
    if (!user) throw new HttpError(404, 'The demo accounts do not exist yet. Start the server with DEMO_SEED=true.');
    res.json(authService.sessionFor(user));
  }));
  return r;
}
