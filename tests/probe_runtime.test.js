const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const play = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/content-play-pass.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/manifest-m3u8.json'), 'utf8'));
const candidates = Array.from({length: 6}, (_, index) => `🇺🇸 Test US ${index + 1}`);
const group = 'F1TV-US-Candidates';
const decisions = {[group]: 'Manual', F1TV: 'Manual'};
const store = new Map([
  ['f1tv.auth.v1', JSON.stringify({entitlementtoken: 'test-entitlement', sessionid: 'test-session'})],
  ['f1tv.config.v1', JSON.stringify({batchSize: 0, intervalMs: 1, notify: false})],
]);
const pendingTimers = new Set();
const observedPolicies = [];
let doneCount = 0;
let resolveDone;
const completed = new Promise(resolve => { resolveDone = resolve; });

// Track timers the probe schedules so we can assert none survive $done.
const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;
function trackedTimeout(callback, delay) {
  const id = realSetTimeout(() => { pendingTimers.delete(id); callback(); }, delay);
  pendingTimers.add(id);
  return id;
}
function clearTrackedTimeout(id) {
  pendingTimers.delete(id);
  realClearTimeout(id);
}

global.setTimeout = trackedTimeout;
global.clearTimeout = clearTrackedTimeout;
global.$persistentStore = {
  read: key => store.get(key) || null,
  write: (value, key) => { store.set(key, value); return true; },
};
global.$surge = {
  selectGroupDetails: () => ({groups: {[group]: candidates, F1TV: ['Manual'].concat(candidates)}, decisions: {...decisions}}),
  setSelectGroupPolicy: (name, policy) => {
    assert.ok([group, 'F1TV'].includes(name));
    decisions[name] = policy;
    return true;
  },
};
global.$httpClient = {
  get: (options, callback) => {
    observedPolicies.push(options.policy);
    assert.equal(options.policy, group, 'requests must use the selectable group');
    assert.ok(candidates.includes(decisions[group]), 'candidate must be selected before the request');
    if (options.url.includes('/CONTENT/PLAY')) {
      callback(null, {status: play.response.status, headers: play.response.headers}, JSON.stringify(play.response.body));
    } else if (options.url === 'https://f1tv.formula1.com/') {
      callback(null, {status: 200, headers: {}}, '<html></html>');
    } else {
      callback(null, {status: manifest.response.status, headers: manifest.response.headers}, manifest.response.body);
    }
  },
};
global.$done = () => { doneCount++; resolveDone(); };

require('../src/probe.js');

Promise.race([
  completed,
  new Promise((_, reject) => realSetTimeout(() => reject(new Error('probe did not finish')), 3000)),
]).then(() => {
  const state = JSON.parse(store.get('f1tv.nodes.v1'));
  assert.equal(doneCount, 1);
  assert.equal(state.lastRun.status, 'ok');
  assert.equal(state.lastRun.count, candidates.length);
  candidates.forEach(candidate => assert.equal(state.nodes[candidate].status, 'pass'));
  assert.equal(decisions[group], 'Manual', 'candidate group must be restored');
  assert.ok(candidates.includes(decisions.F1TV));
  assert.equal(observedPolicies.length, candidates.length * 3);
  assert.equal(pendingTimers.size, 0, 'no timers should survive $done');
  console.log('probe runtime integration passed');
}).catch(error => { console.error(error); process.exitCode = 1; });
