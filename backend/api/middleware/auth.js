import { HttpError } from '../../models/errors.js';

export const requireAuth = (authService) => (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = authService.verifyToken(token);
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch (err) { next(err); }
};

// NFR-3: role is re-read from the database on every request, never trusted from the token,
// so a demoted admin loses access immediately instead of when their token expires.
export const requireRole = (userRepo, ...roles) => async (req, res, next) => {
  try {
    const user = await userRepo.findById(req.user.id);
    if (!user) return next(new HttpError(401, 'Account no longer exists'));
    if (!roles.includes(user.role)) return next(new HttpError(403, 'You do not have permission to do that'));
    req.user.role = user.role;
    next();
  } catch (err) { next(err); }
};
