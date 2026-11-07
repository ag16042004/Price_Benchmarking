import { ValidationError } from './errors.js';

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const clean = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '');
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});   // body may be null, an array, a string...
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Registration is limited to official government addresses. The domain must be exactly the allowed
 * one (gov.in) or a subdomain of it (dept.gov.in), so "evilgov.in" and "gov.in.evil.com" are refused.
 * Set REGISTRATION_EMAIL_DOMAIN to another domain, or to an empty value to switch the rule off.
 * Read on every call so the setting can be changed without a code change.
 */
export function allowedEmailDomain() {
  const v = process.env.REGISTRATION_EMAIL_DOMAIN;
  return (v === undefined ? 'gov.in' : v).trim().toLowerCase().replace(/^[@.]+/, '');
}
export function isAllowedEmail(email) {
  const allowed = allowedEmailDomain();
  if (!allowed) return true;
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return domain === allowed || domain.endsWith(`.${allowed}`);
}

function required(out, errors, input, field, label, max = 120) {
  const v = clean(input[field]);
  if (!v) errors[field] = `${label} is required`;
  else if (v.length > max) errors[field] = `${label} must be at most ${max} characters`;
  else out[field] = v;
}

export function validateRegistration(rawInput = {}) {
  const input = obj(rawInput);
  const errors = {}, out = {};
  required(out, errors, input, 'name', 'Name', 80);
  const email = clean(input.email).toLowerCase();
  if (!EMAIL.test(email)) errors.email = 'Enter a valid email address';
  else if (!isAllowedEmail(email)) errors.email = `Registration requires an official @${allowedEmailDomain()} email address`;
  else out.email = email;
  const pw = typeof input.password === 'string' ? input.password : '';
  if (pw.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (pw.length > 72) errors.password = 'Password must be at most 72 characters';
  else out.password = pw;
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

export function validateLogin(rawInput = {}) {
  const input = obj(rawInput);
  const errors = {};
  const email = clean(input.email).toLowerCase();
  if (!email) errors.email = 'Email is required';
  if (!input.password) errors.password = 'Password is required';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { email, password: input.password };
}

/** FR-3: Item Name, Item Type, Make, Model are all mandatory. */
export function validateExactMatch(rawInput = {}, allowedItemTypes = []) {
  const input = obj(rawInput);
  const errors = {}, out = {};
  required(out, errors, input, 'itemName', 'Item name');
  required(out, errors, input, 'make', 'Make', 80);
  required(out, errors, input, 'model', 'Model', 80);
  const t = clean(input.itemType);
  if (!t) errors.itemType = 'Item type is required';
  else if (!allowedItemTypes.includes(t)) errors.itemType = 'Select a valid item type';
  else out.itemType = t;
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

const MAX_SPECS = 15;

/** FR-4: Item Name + Item Type + at least one Spec:Value pair. Errors are keyed specs.<i>.key / specs.<i>.value. */
export function validateSpecification(rawInput = {}, allowedItemTypes = []) {
  const input = obj(rawInput);
  const errors = {}, out = {};
  required(out, errors, input, 'itemName', 'Item name');
  const t = clean(input.itemType);
  if (!t) errors.itemType = 'Item type is required';
  else if (!allowedItemTypes.includes(t)) errors.itemType = 'Select a valid item type';
  else out.itemType = t;

  const rows = Array.isArray(input.specs) ? input.specs : [];
  if (rows.length === 0) errors.specs = 'Add at least one specification';
  else if (rows.length > MAX_SPECS) errors.specs = `Use at most ${MAX_SPECS} specifications`;
  const seen = new Set(), specs = [];
  rows.slice(0, MAX_SPECS).forEach((row, i) => {
    const key = clean(row?.key), value = clean(row?.value);
    if (!key) errors[`specs.${i}.key`] = 'Specification name is required';
    else if (key.length > 60) errors[`specs.${i}.key`] = 'Must be at most 60 characters';
    else if (seen.has(key.toLowerCase())) errors[`specs.${i}.key`] = 'Each specification can only be listed once';
    if (!value) errors[`specs.${i}.value`] = 'Value is required';
    else if (value.length > 80) errors[`specs.${i}.value`] = 'Must be at most 80 characters';
    seen.add(key.toLowerCase());
    specs.push({ key, value });
  });
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { ...out, specs };
}

/** FR-5: Service Type + Location + description. */
export function validateService(rawInput = {}, allowedServiceTypes = []) {
  const input = obj(rawInput);
  const errors = {}, out = {};
  const t = clean(input.serviceType);
  if (!t) errors.serviceType = 'Service type is required';
  else if (!allowedServiceTypes.includes(t)) errors.serviceType = 'Select a valid service type';
  else out.serviceType = t;
  required(out, errors, input, 'location', 'Location', 120);
  required(out, errors, input, 'description', 'Description', 700);   // the form box allows 500, then appends quantity and duration
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

// ---------------------------------------------------------------- admin
export const SOURCE_CATEGORIES = ['RF & Microwave', 'Antennas & Cabling', 'HF/VHF & Antennas', 'HF/VHF & Radios', 'SDR', 'Distributor',
  'Manufacturer', 'Retailer', 'Marketplace', 'Government', 'Services'];
const TRUST = ['HIGH', 'MEDIUM', 'LOW'];
const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeDomain(raw) {
  return clean(raw).toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '');
}

function activeFlag(input, out, errors, partial) {
  if (input.isActive === undefined) { if (!partial) out.isActive = true; return; }
  if (typeof input.isActive !== 'boolean') errors.isActive = 'Must be true or false';
  else out.isActive = input.isActive;
}

/** FR-9. `partial` is for PATCH: only the fields that were sent are checked. */
export function validateSource(rawInput = {}, { partial = false } = {}) {
  const input = obj(rawInput), errors = {}, out = {};
  const want = (k) => !partial || input[k] !== undefined;
  if (want('domain')) {
    const d = normalizeDomain(input.domain);
    if (!DOMAIN.test(d)) errors.domain = 'Enter a valid domain such as example.com';
    else out.domain = d;
  }
  if (want('name')) required(out, errors, input, 'name', 'Name', 80);
  if (want('category')) {
    const c = clean(input.category);
    if (!SOURCE_CATEGORIES.includes(c)) errors.category = 'Select a valid category'; else out.category = c;
  }
  if (want('trustLevel')) {
    const t = clean(input.trustLevel).toUpperCase();
    if (!TRUST.includes(t)) errors.trustLevel = 'Select HIGH, MEDIUM or LOW'; else out.trustLevel = t;
  }
  activeFlag(input, out, errors, partial);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

/** FR-10: item types and service types share one shape. */
export function validateCategory(rawInput = {}, { partial = false } = {}) {
  const input = obj(rawInput), errors = {}, out = {};
  if (!partial || input.name !== undefined) required(out, errors, input, 'name', 'Name', 80);
  if (input.description !== undefined) {
    const d = clean(input.description);
    if (d.length > 200) errors.description = 'Must be at most 200 characters'; else out.description = d || null;
  }
  activeFlag(input, out, errors, partial);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

/** Curated service rate. A source link and a date are mandatory so the figure can be cited. */
export function validateRate(rawInput = {}, { partial = false } = {}, serviceTypes = []) {
  const input = obj(rawInput), errors = {}, out = {};
  const want = (k) => !partial || input[k] !== undefined;
  if (want('serviceType')) {
    const t = clean(input.serviceType);
    if (!serviceTypes.includes(t)) errors.serviceType = 'Select a valid service type'; else out.serviceType = t;
  }
  if (want('location')) required(out, errors, input, 'location', 'Location', 120);
  if (input.description !== undefined) out.description = clean(input.description).slice(0, 300) || null;
  if (want('price')) {
    const n = typeof input.price === 'number' ? input.price : Number(clean(String(input.price ?? '')).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > 1e9) errors.price = 'Enter a price greater than 0'; else out.price = Math.round(n * 100) / 100;
  }
  if (want('currency') && (input.currency !== undefined || !partial)) {
    const c = clean(input.currency || 'INR').toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) errors.currency = 'Use a 3-letter currency code, e.g. INR'; else out.currency = c;
  }
  if (want('sourceName')) required(out, errors, input, 'sourceName', 'Source name', 80);
  if (want('sourceUrl')) {
    try {
      const u = new URL(clean(input.sourceUrl));
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      out.sourceUrl = u.toString();
    } catch { errors.sourceUrl = 'Enter a full link starting with http:// or https://'; }
  }
  if (want('vintage')) {
    const d = new Date(clean(String(input.vintage ?? '')));
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getTime() > Date.now() + 86_400_000) errors.vintage = 'Enter the date the rate was published (not in the future)';
    else out.vintage = d.toISOString();
  }
  activeFlag(input, out, errors, partial);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}
