const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { heavyWorkGuard, isDistrictScan, _state } = require('../src/middleware/heavy-work-guard.middleware');

function fakeRes() {
  const res = new EventEmitter();
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  return res;
}

function run(mw, req) {
  const res = fakeRes();
  let error = null;
  let passed = false;
  mw(req, res, (err) => {
    if (err) error = err;
    else passed = true;
  });
  return { res, error, passed };
}

test('isDistrictScan flags district and near-me scans only', () => {
  assert.equal(isDistrictScan({ query: { district: 'Gurugram' } }), true);
  assert.equal(isDistrictScan({ query: { nearLat: '28.4' } }), true);
  assert.equal(isDistrictScan({ query: { sector: 'industrial' } }), false);
  assert.equal(isDistrictScan({ query: { district: '  ' } }), false);
});

test('one heavy job per user, released when the response finishes', () => {
  const mw = heavyWorkGuard();
  const first = run(mw, { user: { id: 'u1' } });
  assert.equal(first.passed, true);
  const second = run(mw, { user: { id: 'u1' } });
  assert.equal(second.error?.statusCode ?? second.error?.status, 429);
  first.res.emit('finish');
  const third = run(mw, { user: { id: 'u1' } });
  assert.equal(third.passed, true);
  third.res.emit('close');
  assert.equal(_state().active, 0);
});

test('global cap rejects extra users and light requests skip the guard', () => {
  const mw = heavyWorkGuard((req) => req.heavy);
  const max = _state().max;
  const running = [];
  for (let i = 0; i < max; i += 1) running.push(run(mw, { heavy: true, user: { id: `g${i}` } }));
  assert.ok(running.every((r) => r.passed));
  const overflow = run(mw, { heavy: true, user: { id: 'late' } });
  assert.ok(overflow.error, 'over-capacity request is refused');
  assert.ok(overflow.res.headers['Retry-After']);
  const light = run(mw, { heavy: false, user: { id: 'late' } });
  assert.equal(light.passed, true);
  running.forEach((r) => r.res.emit('finish'));
  assert.equal(_state().active, 0);
});
