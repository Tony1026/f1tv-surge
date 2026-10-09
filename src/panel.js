// Dynamic Surge Panel. It never renders secrets or signed manifest URLs.
var KEY_NODES = "f1tv.nodes.v1";
function read(key, fallback) { try { var v = $persistentStore.read(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
function args() { var out = {}; if (typeof $argument !== "string") return out; $argument.split(";").forEach(function (p) { var i = p.indexOf("="); if (i > 0) out[p.slice(0, i)] = p.slice(i + 1); }); return out; }
function current(group) { try { var d = $surge.selectGroupDetails() || {}; return d.decisions && d.decisions[group] || "未选择"; } catch (e) { return "未知"; } }
function policies(group) { try { var d = $surge.selectGroupDetails() || {}; var p = (d.groups || {})[group] || []; if (typeof p === "string") p = p.split(","); return Array.isArray(p) ? p.filter(function (x) { return x && x !== "DIRECT" && x !== "REJECT" && x !== "REJECT-TINYGIF"; }) : []; } catch (e) { return []; } }
var a = args();
var group = a.f1tvGroup || "F1TV";
var candidateGroup = a.candidateGroup || "F1TV-US-Candidates";
var state = read(KEY_NODES, {nodes:{}, updatedAt:0, lastRun:null});
var nodes = state.nodes || {};
var names = policies(candidateGroup);
if (!names.length) names = Object.keys(nodes);
var now = Math.floor(Date.now() / 1000);
function fresh(node) { return node && Number(node.expiresAt || 0) > now; }
function rank(name) {
  var node = nodes[name];
  if (fresh(node) && node.status === "pass") return 0;
  if (fresh(node) && node.status) return 1;
  return 2;
}
names.sort(function (left, right) {
  var order = rank(left) - rank(right);
  if (order) return order;
  var leftLatency = Number(nodes[left] && nodes[left].latencyMs) || 999999;
  var rightLatency = Number(nodes[right] && nodes[right].latencyMs) || 999999;
  return leftLatency - rightLatency || left.localeCompare(right);
});
var pass = names.filter(function (name) { return rank(name) === 0; });
var lines = [
  "当前：" + current(group),
  "PASS：" + pass.length + " / " + names.length + "    最近更新：" + (state.updatedAt ? new Date(state.updatedAt * 1000).toLocaleString() : "无")
];
if (!names.length) lines.push("暂无候选节点。请检查策略组。");
names.slice(0, 60).forEach(function (name) {
  var node = nodes[name] || {};
  var mark = !fresh(node) || !node.status ? "⏳" : (node.status === "pass" ? "✅" : (node.status === "timeout" ? "⚠️" : "❌"));
  var reason = !fresh(node) || !node.status ? (node.lastCheckedAt ? "结果已过期" : "待检测") : (node.reason || node.status);
  var latency = node.latencyMs ? node.latencyMs + " ms" : "-";
  var checkedAt = node.lastCheckedAt ? new Date(node.lastCheckedAt * 1000).toLocaleTimeString() : "-";
  lines.push(mark + " " + name + "  " + latency + "  " + reason + "  " + checkedAt);
});
$done({title:"F1 TV 节点状态", content:lines.join("\n"), style:pass.length ? "good" : (names.length ? "alert" : "error")});
