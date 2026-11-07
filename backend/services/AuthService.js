import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from '../models/errors.js';
import { validateLogin, validateRegistration } from '../models/validators.js';

// Compare two secrets without leaking, through timing, how many leading characters matched.
const sameSecret = (a, b) => {
  const h = (x) => crypto.createHash('sha256').update(String(x ?? '')).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

export class AuthService {
  constructor({ userRepo, jwtSecret, expiresIn = '8h', registrationCode = '' }) {
    this.userRepo = userRepo;
    this.jwtSecret = jwtSecret;
    this.expiresIn = expiresIn;
    this.registrationCode = registrationCode;   // when set, sign-up needs this invite code
  }

  async register(input) {
    if (this.registrationCode && !sameSecret(input?.inviteCode, this.registrationCode)) {
      throw new HttpError(403, 'Ask your administrator for the invite code');
    }
    const v = validateRegistration(input);
    if (await this.userRepo.findByEmail(v.email)) throw new HttpError(409, 'Email is already registered');
    const passwordHash = await this.#hash(v.password);
    const user = await this.userRepo.create({ name: v.name, email: v.email, passwordHash, role: 'OFFICER' });
    return this.sessionFor(user);
  }

  async login(input) {
    const v = validateLogin(input);
    const user = await this.userRepo.findByEmail(v.email);
    // Same message for unknown email and wrong password: do not reveal which.
    if (!user || !(await bcrypt.compare(v.password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    return this.sessionFor(user);
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch {
      throw new HttpError(401, 'Session expired or invalid. Please sign in again.');
    }
  }

  #hash(password) { return bcrypt.hash(password, 10); }

  /** A signed session for an already-verified user (used by login, register and the demo quick sign-in). */
  sessionFor(user) {
    const token = jwt.sign({ sub: user.id, role: user.role }, this.jwtSecret, { expiresIn: this.expiresIn });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }
}
