// One-time setup. Fill the placeholders below in a private copy, then run this script once.
// Do not commit the filled copy and do not paste secrets into the main Surge profile.
var KEY_CONFIG = "f1tv.config.v1";
var KEY_AUTH = "f1tv.auth.v1";
var CONFIG = {
  candidateGroup: "F1TV-US-Candidates",
  f1tvGroup: "F1TV",
  candidateRegex: "美国|US|USA|United States|🇺🇸",
  contentIds: ["1000010385"],
  channelId: "1033",
  passTtlSeconds: 86400,
  failTtlSeconds: 36000,
  maxRuntimeSeconds: 240,
  batchSize: 4,
  intervalMs: 800,
  timeoutSeconds: 12,
  l3Enabled: false,
  notify: true
};
var AUTH = {
  ascendontoken: "<PASTE_ASCENDONTOKEN>",
  entitlementtoken: "<PASTE_ENTITLEMENTTOKEN>",
  sessionid: "<PASTE_SESSIONID>",
  correlationid: "",
  "x-f1-device-info": ""
};
function write(key, value) { return $persistentStore.write(JSON.stringify(value), key); }
var invalid = Object.keys(AUTH).some(function (key) { return AUTH[key] && String(AUTH[key]).indexOf("<PASTE_") === 0; });
if (invalid) {
  $notification.post("F1TV setup 未写入", "请先填写私有 setup 副本", "未修改 persistent store。");
  $done({title:"未写入", content:"请填写 setup.js 中的短期会话字段后再运行。", style:"alert"});
} else {
  write(KEY_CONFIG, CONFIG);
  write(KEY_AUTH, AUTH);
  $notification.post("F1TV setup 完成", "凭据已写入 Surge 持久化存储", "请删除私有 setup 副本，并运行 f1tv-probe。");
  $done({title:"Setup 完成", content:"配置和短期会话已写入 f1tv.config.v1 / f1tv.auth.v1。", style:"good"});
}
