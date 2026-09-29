const assert = require('node:assert/strict');

const now = Math.floor(Date.now() / 1000);
const state = {
  updatedAt: now,
  nodes: {
    'US blocked': {status: 'playback_blocked', reason: 'content_play_playback_blocked', latencyMs: 10, lastCheckedAt: now, expiresAt: now + 3600},
    'US pass': {status: 'pass', reason: 'content_play_and_manifest', latencyMs: 4000, lastCheckedAt: now, expiresAt: now + 3600},
  },
};
let result;

global.$persistentStore = {read: key => key === 'f1tv.nodes.v1' ? JSON.stringify(state) : null};
global.$surge = {selectGroupDetails: () => ({groups: {'F1TV-US-Candidates': ['US blocked', 'US untested', 'US pass']}, decisions: {F1TV: 'US pass'}})};
global.$done = value => { result = value; };

require('../src/panel.js');

assert.equal(result.style, 'good');
const lines = result.content.split('\n');
assert.match(lines[1], /PASS：1 \/ 3/);
assert.match(lines[2], /^✅ US pass/);
assert.match(lines[3], /^❌ US blocked/);
assert.match(lines[4], /^⏳ US untested.*待检测/);
console.log('panel runtime integration passed');
