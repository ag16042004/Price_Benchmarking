import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultItem } from '../models/ResultItem.js';

test('ResultItem.isStale: 12-month rule and missing date', () => {
  const now = new Date('2026-10-06');
  const mk = (vintage) => new ResultItem({ price: 1, sourceUrl: 'https://a.com/x', vintage });
  assert.equal(mk('2026-03-01').isStale(now), false);
  assert.equal(mk('2025-01-01').isStale(now), true);
  assert.equal(mk(null).isStale(now), true);
});

test('ResultItem.getFormattedPrice uses Indian digit grouping for INR', () => {
  const r = new ResultItem({ price: 1234567, sourceUrl: 'https://a.com/x' });
  assert.match(r.getFormattedPrice(), /12,34,567/);
});

test('ResultItem derives sourceName from the URL host', () => {
  assert.equal(new ResultItem({ price: 1, sourceUrl: 'https://in.mouser.com/p/1' }).sourceName, 'in.mouser.com');
});
