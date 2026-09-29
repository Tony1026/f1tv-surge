const assert = require('node:assert/strict');

const now = Math.floor(Date.now() / 1000);
let decision = 'Manual';
let stored = JSON.stringify({nodes: {
  'US slow': {status: 'pass', latencyMs: 500, expiresAt: now + 3600},
  'US fast': {status: 'pass', latencyMs: 200, expiresAt: now + 3600},
}});
let doneCount = 0;

global.$persistentStore = {
  read: () => stored,
  write: value => { stored = value; return true; },
};
global.$surge = {
  selectGroupDetails: () => ({groups: {'F1TV-US-Candidates': ['US slow', 'US fast']}, decisions: {F1TV: decision}}),
  setSelectGroupPolicy: (_, name) => { decision = name; },
};
global.$done = () => { doneCount++; };

require('../src/select.js');

assert.equal(doneCount, 1);
assert.equal(decision, 'US fast');
assert.equal(JSON.parse(stored).currentPolicy, 'US fast');
console.log('select runtime integration passed');
