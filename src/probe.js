// F1TV Probe for Surge Mac/iOS.
// The script deliberately stores only status metadata.

var KEY_CONFIG = "f1tv.config.v1";
var KEY_NODES = "f1tv.nodes.v1";

var DEFAULT_CONFIG = {
  candidateGroup: "F1TV-US-Candidates",
  f1tvGroup: "F1TV",
  candidateRegex: "美国|US|USA|United States|🇺🇸",
  l0Url: "https://f1tv.formula1.com/",
  playBaseUrl: "https://f1tv.formula1.com",
  playPath: "/3.0/R/ENG/WEB_HLS/ALL/CONTENT/PLAY",
  channelId: "1033",
  contentIds: ["1000010385"],
  batchSize: 0,
  intervalMs: 800,
  timeoutSeconds: 10,
  passTtlSeconds: 86400,
  failTtlSeconds: 36000,
  maxRuntimeSeconds: 840,
  l3Enabled: false,
  notify: true
};

function jsonRead(key, fallback) {
  try {
    var raw = $persistentStore.read(key);
    if (!raw) return fallback;
    var value = JSON.parse(raw);
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function jsonWrite(key, value) {
  try { return $persistentStore.write(JSON.stringify(value), key); } catch (e) { return false; }
}

function copyObject(base, override) {
  var out = {};
  Object.keys(base).forEach(function (key) { out[key] = base[key]; });
  Object.keys(override || {}).forEach(function (key) { out[key] = override[key]; });
  return out;
}

function parseArgument(text) {
  var result = {};
  if (!text) return result;
  String(text).split(";").forEach(function (part) {
    var idx = part.indexOf("=");
    if (idx < 1) return;
    result[part.slice(0, idx)] = part.slice(idx + 1);
  });
  if (result.contentIds) result.contentIds = result.contentIds.split("|").filter(Boolean);
  ["batchSize", "intervalMs", "timeoutSeconds", "passTtlSeconds", "failTtlSeconds", "maxRuntimeSeconds"].forEach(function (key) {
    if (result[key] !== undefined) result[key] = Number(result[key]);
  });
  if (result.l3Enabled !== undefined) result.l3Enabled = result.l3Enabled === "true";
  if (result.notify !== undefined) result.notify = result.notify !== "false";
  return result;
}

function getConfig() {
  var stored = jsonRead(KEY_CONFIG, {});
  var argument = typeof $argument === "string" ? parseArgument($argument) : {};
  var config = copyObject(DEFAULT_CONFIG, stored);
  config = copyObject(config, argument);
  if (!Array.isArray(config.contentIds) || !config.contentIds.length) config.contentIds = DEFAULT_CONFIG.contentIds;
  return config;
}

function groupPolicies(groupName, candidateRegex) {
  try {
    var details = $surge.selectGroupDetails() || {};
    var groups = details.groups || {};
    var policies = groups[groupName] || [];
    if (typeof policies === "string") policies = policies.split(",");
    if (!Array.isArray(policies)) return [];
    var pattern = null;
    try { pattern = candidateRegex ? new RegExp(candidateRegex, "i") : null; } catch (e) {}
    return policies.filter(function (policy) {
      return policy && policy !== "DIRECT" && policy !== "REJECT" && policy !== "REJECT-TINYGIF";
    }).filter(function (policy) {
      return !pattern || pattern.test(policy);
    });
  } catch (e) {
    return [];
  }
}

function currentDecision(groupName) {
  try {
    var details = $surge.selectGroupDetails() || {};
    return details.decisions && details.decisions[groupName] ? details.decisions[groupName] : null;
  } catch (e) {
    return null;
  }
}

function chooseGroupPolicy(groupName, policyName) {
  try {
    $surge.setSelectGroupPolicy(groupName, policyName);
    return currentDecision(groupName) === policyName;
  } catch (e) {
    return false;
  }
}

function request(method, options, callback) {
  var fn = $httpClient[method.toLowerCase()];
  if (typeof fn !== "function") {
    callback("unsupported_method", null, null);
    return;
  }
  // Some Surge builds can leave a request without invoking its callback.
  // Keep one guarded fallback so the probe can always advance and call $done().
  var called = false;
  var requestTimeout = Math.max(3, Math.min(10, Number(options && options.timeout) || 5));
  var watchdog = null;
  function finish(error, response, data) {
    if (called) return;
    called = true;
    if (watchdog) clearTimeout(watchdog);
    callback(error, response, data);
  }
  watchdog = setTimeout(function () {
    finish("timeout", null, null);
  }, (requestTimeout + 2) * 1000);
  try {
    fn.call($httpClient, options, finish);
  } catch (error) {
    finish(String(error), null, null);
  }
}

function classifyHttp(error, response, data) {
  if (error) return String(error).toLowerCase().indexOf("timeout") >= 0 ? "timeout" : "network_error";
  var status = response && Number(response.status);
  if (status === 401) return "playback_blocked";
  if (status === 403) return "playback_blocked";
  if (!response || !status) return "network_error";
  if (status >= 500) return "upstream_error";
  if (status >= 400) return "playback_blocked";
  return null;
}

function parseJson(data) {
  try { return JSON.parse(data || "{}"); } catch (e) { return null; }
}

function manifestType(data, contentType) {
  var text = String(data || "").trim();
  if (text.indexOf("#EXTM3U") === 0) return "hls";
  if (text.indexOf("<MPD") >= 0) return "dash";
  return null;
}

function responseHeader(response, name) {
  if (!response || !response.headers) return "";
  var wanted = name.toLowerCase();
  var headers = response.headers;
  if (Array.isArray(headers)) {
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i].field).toLowerCase() === wanted) return headers[i].value || "";
    }
    return "";
  }
  var keys = Object.keys(headers);
  for (var j = 0; j < keys.length; j++) {
    if (keys[j].toLowerCase() === wanted) return headers[keys[j]] || "";
  }
  return "";
}

function safeManifestUrl(url) {
  var match = String(url || "").match(/^(https?):\/\/([^\/?#]+)/i);
  return match ? match[1] + "://" + match[2] + "/<signed-path>" : "<redacted>";
}

function resolveUrl(base, reference) {
  reference = String(reference || "");
  if (/^https?:\/\//i.test(reference)) return reference;
  var originMatch = String(base || "").match(/^(https?:\/\/[^\/]+)(\/[^?#]*)?/i);
  if (!originMatch) return null;
  if (reference.indexOf("//") === 0) return originMatch[1].split("://")[0] + ":" + reference;
  if (reference.charAt(0) === "/") return originMatch[1] + reference;
  var basePath = originMatch[2] || "/";
  var directory = basePath.slice(0, basePath.lastIndexOf("/") + 1);
  var parts = (directory + reference).split("/");
  var normalized = [];
  parts.forEach(function (part) {
    if (!part || part === ".") return;
    if (part === "..") normalized.pop(); else normalized.push(part);
  });
  return originMatch[1] + "/" + normalized.join("/");
}

function firstMediaUri(body) {
  var lines = String(body || "").split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#") continue;
    return line;
  }
  var map = String(body || "").match(/#EXT-X-MAP:[^\n]*URI="([^"]+)"/i);
  return map ? map[1] : null;
}

function probeSegment(policy, manifestUrl, manifestBody, timeout, callback) {
  var first = firstMediaUri(manifestBody);
  if (!first) {
    callback({ ok: false, reason: "l3_no_media_uri" });
    return;
  }
  var firstUrl = resolveUrl(manifestUrl, first);
  if (!firstUrl) {
    callback({ ok: false, reason: "l3_invalid_media_uri" });
    return;
  }
  function fetchSegment(url) {
    request("GET", { url: url, policy: policy, timeout: timeout }, function (error, response, data) {
      var classification = classifyHttp(error, response, data);
      if (classification) {
        callback({ ok: false, reason: "l3_" + classification, httpStatus: response && response.status });
        return;
      }
      if (!response || Number(response.status) < 200 || Number(response.status) >= 300) {
        callback({ ok: false, reason: "l3_bad_status", httpStatus: response && response.status });
        return;
      }
      callback({ ok: true, reason: "segment_pass", httpStatus: response.status });
    });
  }
  if (/\.m3u8(?:[?#]|$)/i.test(firstUrl)) {
    request("GET", { url: firstUrl, policy: policy, timeout: timeout }, function (error, response, data) {
      var classification = classifyHttp(error, response, data);
      if (classification) {
        callback({ ok: false, reason: "l3_variant_" + classification, httpStatus: response && response.status });
        return;
      }
      var segment = firstMediaUri(data);
      var segmentUrl = segment && resolveUrl(firstUrl, segment);
      if (!segmentUrl) {
        callback({ ok: false, reason: "l3_variant_no_segment", httpStatus: response && response.status });
        return;
      }
      fetchSegment(segmentUrl);
    });
    return;
  }
  fetchSegment(firstUrl);
}

function selectBest(config, state, policies) {
  var now = Math.floor(Date.now() / 1000);
  var current = currentDecision(config.f1tvGroup);
  var candidates = policies || groupPolicies(config.candidateGroup, config.candidateRegex);
  var usable = candidates.filter(function (policy) {
    var node = state.nodes[policy];
    return node && node.status === "pass" && Number(node.expiresAt || 0) > now;
  });
  if (current && usable.some(function (nodeName) { return nodeName === current; })) return current;
  usable.sort(function (a, b) {
    var left = state.nodes[a];
    var right = state.nodes[b];
    return (Number(left.latencyMs) || 999999) - (Number(right.latencyMs) || 999999) || (Number(right.lastCheckedAt) || 0) - (Number(left.lastCheckedAt) || 0);
  });
  return usable.length ? usable[0] : null;
}

function notifyOnce(title, body) {
  try { if (getConfig().notify && typeof $notification !== "undefined") $notification.post(title, "F1TV 节点维护", body); } catch (e) {}
}

function probeManifest(policy, url, timeout, runL3, callback) {
  var started = Date.now();
  request("GET", { url: url, policy: policy, timeout: timeout }, function (error, response, data) {
    var classification = classifyHttp(error, response, data);
    if (classification) {
      callback({ ok: false, reason: classification, httpStatus: response && response.status, latencyMs: Date.now() - started, url: safeManifestUrl(url) });
      return;
    }
    var type = manifestType(data, responseHeader(response, "content-type"));
    if (!type) {
      callback({ ok: false, reason: "manifest_invalid", httpStatus: response.status, latencyMs: Date.now() - started, url: safeManifestUrl(url) });
      return;
    }
    if (runL3 && type === "hls") {
      probeSegment(policy, url, data, timeout, function (segment) {
        if (!segment.ok) {
          callback({ ok: false, reason: segment.reason, httpStatus: segment.httpStatus || response.status, latencyMs: Date.now() - started, url: safeManifestUrl(url) });
          return;
        }
        callback({ ok: true, reason: "manifest_and_segment", httpStatus: segment.httpStatus || response.status, latencyMs: Date.now() - started, manifestType: type, url: safeManifestUrl(url) });
      });
      return;
    }
    callback({ ok: true, reason: runL3 && type === "dash" ? "manifest_pass_l3_skipped_dash" : "pass", httpStatus: response.status, latencyMs: Date.now() - started, manifestType: type, url: safeManifestUrl(url) });
  });
}

function probeNode(config, nodePolicy, requestPolicy, callback) {
  var started = Date.now();
  // This probe measures CDN/VPN/region reachability only. F1TV performs that
  // omitted; a 400/401 application response still proves the route passed CDN.
  var headers = {};
  // Some CDN/proxy paths reject HEAD while allowing the normal page request.
  // L0 is only a diagnostic preflight; it must not discard a node before the
  // entitlement/playback request, which is the authoritative check.
  request("GET", { url: config.l0Url, policy: requestPolicy, timeout: config.timeoutSeconds }, function (l0Error, l0Response) {
    var l0Reason = classifyHttp(l0Error, l0Response, "");
    // Continue even when L0 fails. The L1 request below is authoritative.
    var contentIndex = 0;
    var lastContentFailure = null;
    function tryContent() {
      if (contentIndex >= config.contentIds.length) {
        callback({ status: lastContentFailure ? lastContentFailure.status : "playback_blocked", reason: lastContentFailure ? lastContentFailure.reason : "all_content_ids_failed", latencyMs: Date.now() - started, lastHttpStatus: lastContentFailure && lastContentFailure.httpStatus });
        return;
      }
      var contentId = config.contentIds[contentIndex++];
      var playUrl = config.playBaseUrl + config.playPath + "?channelId=" + encodeURIComponent(config.channelId) + "&contentId=" + encodeURIComponent(contentId) + "&player=player_tm";
      request("GET", { url: playUrl, headers: headers, policy: requestPolicy, timeout: config.timeoutSeconds }, function (playError, playResponse, playData) {
        var playReason = classifyHttp(playError, playResponse, playData);
        var payload = parseJson(playData);
        var playStatus = playResponse && Number(playResponse.status);
        if (!playError && playStatus >= 200 && playStatus < 500 && playStatus !== 403 && playStatus !== 451) {
          if (playStatus !== 200 || !payload || String(payload.resultCode || "").toUpperCase() !== "OK") {
            callback({ status: "pass", reason: "vpn_region_check_passed", latencyMs: Date.now() - started, lastHttpStatus: playStatus, contentId: contentId });
            return;
          }
        }
        if (playReason === "playback_blocked" || playReason === "timeout" || playReason === "network_error") {
          lastContentFailure = { status: playReason === "playback_blocked" ? "playback_blocked" : playReason, reason: "content_play_" + playReason, httpStatus: playResponse && playResponse.status };
          tryContent();
          return;
        }
        if (!payload || String(payload.resultCode || "").toUpperCase() !== "OK") {
          var resultText = JSON.stringify(payload || {}).toLowerCase();
          lastContentFailure = { status: "playback_blocked", reason: "content_play_result", httpStatus: playResponse && playResponse.status };
          tryContent();
          return;
        }
        var feeds = payload.resultObj && payload.resultObj.tme && payload.resultObj.tme.feeds;
        if (!Array.isArray(feeds) || !feeds.length) {
          callback({ status: "manifest_invalid", reason: "content_play_no_feeds", latencyMs: Date.now() - started, lastHttpStatus: playResponse && playResponse.status, contentId: contentId });
          return;
        }
        var feedIndex = 0;
        var lastManifestFailure = null;
        function tryFeed() {
          if (feedIndex >= feeds.length || feedIndex >= 3) {
            lastContentFailure = lastManifestFailure || { status: "manifest_invalid", reason: "all_manifests_failed", httpStatus: playResponse && playResponse.status };
            if (contentIndex < config.contentIds.length) {
              tryContent();
              return;
            }
            callback({ status: lastContentFailure.status, reason: lastContentFailure.reason, latencyMs: Date.now() - started, lastHttpStatus: lastContentFailure.httpStatus, contentId: contentId });
            return;
          }
          var feed = feeds[feedIndex++];
          if (!feed || !feed.url) { tryFeed(); return; }
          var current = currentDecision(config.f1tvGroup);
          var runL3 = !!config.l3Enabled && current === nodePolicy;
          probeManifest(requestPolicy, feed.url, config.timeoutSeconds, runL3, function (manifest) {
            if (manifest.ok) {
              callback({ status: "pass", reason: "content_play_and_manifest", latencyMs: Date.now() - started, lastHttpStatus: manifest.httpStatus, contentId: contentId, manifestType: manifest.manifestType, manifestUrl: manifest.url });
            } else {
              lastManifestFailure = { status: manifest.reason === "playback_blocked" ? "playback_blocked" : (manifest.reason.indexOf("timeout") >= 0 ? "timeout" : "manifest_invalid"), reason: manifest.reason, httpStatus: manifest.httpStatus };
              tryFeed();
            }
          });
        }
        tryFeed();
      });
    }
    tryContent();
  });
}

function emptyState() {
  return { version: 1, updatedAt: 0, cursor: 0, currentPolicy: null, nodes: {}, lastRun: null };
}

function run() {
  var config = getConfig();
  // Bound values even when an older persistent config or stale profile argument
  // is still present in Surge's in-memory configuration.
  config.timeoutSeconds = Math.max(3, Math.min(10, Number(config.timeoutSeconds) || 10));
  config.intervalMs = Math.max(0, Math.min(1500, Number(config.intervalMs) || 800));
  config.maxRuntimeSeconds = Math.max(30, Math.min(840, Number(config.maxRuntimeSeconds) || 840));
  var policies = groupPolicies(config.candidateGroup, config.candidateRegex);
  var requestedBatchSize = Number(config.batchSize);
  var batchSize = requestedBatchSize > 0 ? Math.min(policies.length, Math.floor(requestedBatchSize)) : policies.length;
  var state = jsonRead(KEY_NODES, emptyState());
  if (!state.nodes) state.nodes = {};
  var cursor = Number(state.cursor || 0);
  if (cursor >= policies.length) cursor = 0;
  var batch = [];
  for (var i = 0; i < policies.length && batch.length < batchSize; i++) {
    var index = (cursor + i) % policies.length;
    if (policies[index]) batch.push({ policy: policies[index], index: index });
  }
  if (!batch.length) {
    state.updatedAt = Math.floor(Date.now() / 1000);
    state.lastRun = { status: "no_candidates", count: 0 };
    jsonWrite(KEY_NODES, state);
    notifyOnce("F1TV 没有候选节点", "请检查 Airport-All 和美国节点正则。");
    $done();
    return;
  }
  var position = 0;
  var runStartedAt = Date.now();
  var maxRuntimeMs = config.maxRuntimeSeconds * 1000;
  var finished = false;
  var originalCandidatePolicy = currentDecision(config.candidateGroup);
  var maxRuntimeTimer = null;
  function finish(statusOverride) {
    if (finished) return;
    finished = true;
    if (maxRuntimeTimer) clearTimeout(maxRuntimeTimer);
    var lastProcessed = position ? batch[position - 1] : null;
    state.cursor = policies.length && lastProcessed ? (lastProcessed.index + 1) % policies.length : cursor;
    state.updatedAt = Math.floor(Date.now() / 1000);
    state.lastRun = { status: statusOverride || (position >= batch.length ? "ok" : "time_budget_exhausted"), count: position, finishedAt: state.updatedAt };
    var selected = selectBest(config, state, policies);
    var currentBefore = currentDecision(config.f1tvGroup);
    if (selected && selected !== currentBefore) {
      if (chooseGroupPolicy(config.f1tvGroup, selected)) state.currentPolicy = selected;
    } else if (currentBefore) {
      state.currentPolicy = currentBefore;
    }
    if (originalCandidatePolicy) {
      try { $surge.setSelectGroupPolicy(config.candidateGroup, originalCandidatePolicy); } catch (e) {}
    }
    jsonWrite(KEY_NODES, state);
    var passCount = policies.filter(function (name) { return state.nodes[name] && state.nodes[name].status === "pass"; }).length;
    if (!passCount) notifyOnce("F1TV 没有可用节点", "最近一轮检测未发现 PASS 节点。");
    $done();
  }
  function next() {
    if (finished) return;
    if (position >= batch.length || Date.now() - runStartedAt >= maxRuntimeMs) {
      finish(position >= batch.length ? "ok" : "time_budget_exhausted");
      return;
    }
    var item = batch[position++];
    var startedAt = Math.floor(Date.now() / 1000);
    var switched = chooseGroupPolicy(config.candidateGroup, item.policy);
    if (!switched) {
      var unavailable = { status: "policy_unavailable", reason: "candidate_group_switch_failed", latencyMs: 0, lastHttpStatus: null };
      state.nodes[item.policy] = {
        status: unavailable.status,
        reason: unavailable.reason,
        latencyMs: unavailable.latencyMs,
        httpStatus: null,
        contentId: null,
        manifestType: null,
        manifestUrl: null,
        lastCheckedAt: startedAt,
        expiresAt: startedAt + config.failTtlSeconds
      };
      state.cursor = policies.length ? (item.index + 1) % policies.length : cursor;
      state.updatedAt = Math.floor(Date.now() / 1000);
      state.lastRun = { status: "in_progress", count: position, finishedAt: state.updatedAt };
      jsonWrite(KEY_NODES, state);
      setTimeout(next, Math.max(0, Number(config.intervalMs) || 800));
      return;
    }
    probeNode(config, item.policy, config.candidateGroup, function (result) {
      if (finished) return;
      var previous = state.nodes[item.policy] || {};
      var ttl = result.status === "pass" ? config.passTtlSeconds : config.failTtlSeconds;
      state.nodes[item.policy] = {
        status: result.status,
        reason: result.reason,
        latencyMs: result.latencyMs,
        httpStatus: result.lastHttpStatus || null,
        contentId: result.contentId || null,
        manifestType: result.manifestType || null,
        manifestUrl: result.manifestUrl || null,
        lastCheckedAt: startedAt,
        expiresAt: startedAt + ttl
      };
      state.cursor = policies.length ? (item.index + 1) % policies.length : cursor;
      state.updatedAt = Math.floor(Date.now() / 1000);
      state.lastRun = { status: "in_progress", count: position, finishedAt: state.updatedAt };
      jsonWrite(KEY_NODES, state);
      setTimeout(next, Math.max(0, Number(config.intervalMs) || 800));
    });
  }
  maxRuntimeTimer = setTimeout(function () { finish("time_budget_exhausted"); }, maxRuntimeMs);
  next();
}

try { run(); } catch (error) {
  console.log("probe failed: " + String(error));
  $done();
}
