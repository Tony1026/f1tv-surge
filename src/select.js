// Select the best currently valid PASS node. Safe when no PASS exists.
var KEY_NODES = "f1tv.nodes.v1";
var DEFAULT_GROUP = "F1TV";
var DEFAULT_CANDIDATES = "F1TV-US-Candidates";
function read(key, fallback) { try { var v = $persistentStore.read(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
function args() { var out = {}; if (typeof $argument !== "string") return out; $argument.split(";").forEach(function (p) { var i = p.indexOf("="); if (i > 0) out[p.slice(0, i)] = p.slice(i + 1); }); return out; }
function policies(group) { try { var d = $surge.selectGroupDetails() || {}; var p = (d.groups || {})[group] || []; if (typeof p === "string") p = p.split(","); return Array.isArray(p) ? p.filter(function (x) { return x && x !== "DIRECT" && x !== "REJECT" && x !== "REJECT-TINYGIF"; }) : []; } catch (e) { return []; } }
function current(group) { try { var d = $surge.selectGroupDetails() || {}; return d.decisions && d.decisions[group]; } catch (e) { return null; } }
var a = args(), group = a.f1tvGroup || DEFAULT_GROUP, candidateGroup = a.candidateGroup || DEFAULT_CANDIDATES, state = read(KEY_NODES, {nodes:{}}), names = policies(candidateGroup), now = Math.floor(Date.now()/1000);
var valid = names.filter(function (name) { var n = state.nodes[name]; return n && n.status === "pass" && Number(n.expiresAt || 0) > now; });
valid.sort(function (x, y) { return (Number(state.nodes[x].latencyMs) || 999999) - (Number(state.nodes[y].latencyMs) || 999999); });
var selected = current(group);
if (!selected || !valid.some(function (x) { return x === selected; })) selected = valid[0] || null;
if (selected) {
  try {
    $surge.setSelectGroupPolicy(group, selected);
    if (current(group) === selected) {
      state.currentPolicy = selected;
      state.updatedAt = now;
      $persistentStore.write(JSON.stringify(state), KEY_NODES);
    }
  } catch (e) {}
}
$done();
