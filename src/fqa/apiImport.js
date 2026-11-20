// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음


/* ═══════════ API 임포트 (소스: OpenAPI 스펙 · cURL · HAR) ═══════════
   세 소스가 같은 IR({ m, path, status, headers, bodyTpl, … })로 정규화되어
   같은 '감지된 요청 → 선택 → 초안 등록' 흐름을 공유한다.
   🔴 cURL·HAR에는 실제 시크릿(Authorization·Cookie·비밀번호)이 박혀 있다 → maskReq로 ${…} 치환. */
const M_K = { GET: "info", POST: "pass", PUT: "warn", DELETE: "fail", PATCH: "warn", HEAD: "info", OPTIONS: "info" };

// ── 시크릿 마스킹 — 헤더/본문의 실값을 변수 참조로 바꾼다(레코딩 redact와 같은 원칙) ──
const SECRET_HDR = /^(authorization|cookie|x-api-key|x-auth-token|proxy-authorization)$/i;
const PW_KEY = /pass|pw|passwd|비밀번호|암호|secret|token/i;
// "Key: Value" 여러 줄 → 인증류는 값을 버리고 ${API 인증}으로. 반환 { headers, masked }
function maskHeaders(lines) {
  let masked = 0;
  const out = (lines || []).map((ln) => {
    const i = ln.indexOf(":"); if (i < 0) return ln;
    const k = ln.slice(0, i).trim(), v = ln.slice(i + 1).trim();
    if (SECRET_HDR.test(k)) { masked++; return null; }   // 인증 헤더는 환경에서 주입 — 케이스에 남기지 않는다
    return k + ": " + v;
  }).filter(Boolean);
  return { headers: out.join("\n"), masked };
}
// JSON 본문의 비밀번호류 값을 ${…}로. 반환 { body, masked }
function maskBody(body) {
  let masked = 0;
  const s = String(body || "").replace(/"([^"]*)"\s*:\s*"([^"]*)"/g, (m0, k, v) => {
    if (PW_KEY.test(k)) { masked++; return '"' + k + '": "${' + k + '}"'; }
    return m0;
  });
  return { body: s, masked };
}
// 데모용 번들 샘플 — URL 임포트 시뮬용. 실제 제품은 서버/러너가 스펙 URL을 가져옴.
const SAMPLE_OPENAPI = {
  openapi: "3.0.1", info: { title: "온마켓 API", version: "1.2.0" },
  paths: {
    "/v1/users/{id}": { get: { summary: "사용자 조회", responses: { "200": {}, "404": {} } }, put: { summary: "사용자 수정", requestBody: rb({ name: "string", phone: "string" }), responses: { "200": {}, "400": {} } }, delete: { summary: "사용자 삭제", responses: { "204": {} } } },
    "/v1/users": { post: { summary: "사용자 생성", requestBody: rb({ name: "string", phone: "string", planId: "integer" }), responses: { "201": {}, "409": {} } } },
    "/v1/products": { get: { summary: "상품 목록", responses: { "200": {} } } },
    "/v1/products/{id}/subscribe": { post: { summary: "상품 구매", requestBody: rb({ payment: "string", coupon: "string" }), responses: { "200": {}, "402": {} } } },
    "/v1/auth/login": { post: { summary: "로그인 토큰 발급", requestBody: rb({ id: "string", pw: "string" }), responses: { "200": {}, "401": {} } } },
    "/v1/auth/refresh": { post: { summary: "토큰 갱신", requestBody: rb({ refreshToken: "string" }), responses: { "200": {}, "401": {} } } },
  },
};
// requestBody(JSON) 스키마 헬퍼 — 데모 스펙을 간결하게
function rb(props) {
  const properties = {}; Object.keys(props).forEach((k) => (properties[k] = { type: props[k] }));
  return { content: { "application/json": { schema: { type: "object", properties } } } };
}

// ── 미니 파서: 무거운 의존성 없이 공통 요청 IR로 정규화 ──
function detectSpec(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.openapi || obj.swagger) return "OpenAPI";
  return null;   // v1 스펙 소스는 OpenAPI만 (Postman은 cURL 임포트로 대체)
}
// URL → 상대경로(호스트 제거). base는 케이스에 저장 안 함(실행 계획의 환경이 주입)
const urlPath = (u) => { let s = String(u || "").trim().replace(/^https?:\/\/[^/]+/, ""); return s || "/"; };
/* cURL 한 줄(또는 여러 줄) → 요청 1건.
   -X/--request 메서드, -H/--header 헤더, -d/--data/--data-raw 본문, 첫 URL 추출. */
function parseCurl(text) {
  const s = String(text || "").replace(/\\\r?\n/g, " ").trim();   // 줄바꿈 이스케이프 제거
  if (!/^\s*curl\b/.test(s)) return [];
  const q = "(?:'([^']*)'|\"([^\"]*)\"|(\\S+))";
  const grab = (re) => { const m = s.match(re); return m ? (m[1] ?? m[2] ?? m[3]) : ""; };
  let method = grab(new RegExp("(?:-X|--request)\\s+" + q, "i")).toUpperCase();
  const body = grab(new RegExp("(?:-d|--data|--data-raw|--data-binary)\\s+" + q, "i"));
  const headers = [];
  const hre = new RegExp("(?:-H|--header)\\s+" + q, "ig"); let hm;
  while ((hm = hre.exec(s))) headers.push(hm[1] ?? hm[2] ?? hm[3]);
  // URL: 옵션이 아닌 첫 토큰 (curl 다음)
  const url = grab(/curl\s+(?:-[A-Za-z-]+\s+(?:'[^']*'|"[^"]*"|\S+)\s+)*?(?:'([^']*)'|"([^"]*)"|(https?:\/\/\S+))/i) || grab(/(https?:\/\/\S+)/i);
  if (!method) method = body ? "POST" : "GET";
  const mh = maskHeaders(headers);
  const mb = maskBody(body);
  const masked = mh.masked + mb.masked;
  return [{ m: method, path: urlPath(url), name: method + " " + urlPath(url), status: method === "DELETE" ? "204" : method === "POST" ? "201" : "200",
    asrt: "상태" + (masked ? " · 🔒" + masked : ""), headers: mh.headers, bodyTpl: mb.body, secrets: masked, src: "cURL", script: false }];
}
/* HAR → 요청 여러 건. XHR/fetch만 남기고 정적파일·이미지·트래킹은 버린다. */
function parseHar(har) {
  const entries = (har && har.log && har.log.entries) || [];
  const out = [];
  entries.forEach((e) => {
    const req = e.request || {}; const res = e.response || {};
    const rt = (e._resourceType || "").toLowerCase();
    const accept = (req.headers || []).find((h) => /accept/i.test(h.name) && /json/i.test(h.value || ""));
    const isApi = rt === "xhr" || rt === "fetch" || !!accept || /\/(api|v\d)\//i.test(req.url || "");
    if (!isApi) return;   // 정적 리소스 제외
    const headers = (req.headers || []).filter((h) => !/^:/.test(h.name)).map((h) => h.name + ": " + h.value);
    const body = (req.postData && req.postData.text) || "";
    const mh = maskHeaders(headers); const mb = maskBody(body);
    const masked = mh.masked + mb.masked;
    const p = urlPath(req.url);
    out.push({ m: String(req.method || "GET").toUpperCase(), path: p, name: (req.method || "GET") + " " + p, status: String(res.status || 200),
      asrt: "상태 " + (res.status || 200) + (masked ? " · 🔒" + masked : ""), headers: mh.headers, bodyTpl: mb.body, secrets: masked, src: "HAR", script: false });
  });
  return out;
}
const detectFile = (obj) => (obj && obj.log && obj.log.entries) ? "HAR" : detectSpec(obj);
// requestBody(application/json) 스키마 → 필드 골격 { tpl, count }. 값은 비워 둔다(에디터에서 채움).
function bodySkeleton(op) {
  const sch = op && op.requestBody && op.requestBody.content && op.requestBody.content["application/json"] && op.requestBody.content["application/json"].schema;
  const props = (sch && sch.properties) || {};
  const keys = Object.keys(props);
  if (!keys.length) return { tpl: "", count: 0 };
  const parts = keys.map((k) => { const t = (props[k] || {}).type; return '"' + k + '": ' + (t === "integer" || t === "number" ? "0" : '""'); });
  return { tpl: "{ " + parts.join(", ") + " }", count: keys.length };
}
function parseOpenApi(spec) {
  const METHODS = ["get", "post", "put", "delete", "patch", "head", "options"];
  const paths = spec.paths || {};
  const out = [];
  Object.keys(paths).forEach((p) => {
    const item = paths[p] || {};
    METHODS.forEach((m) => {
      const op = item[m];
      if (!op || typeof op !== "object") return;
      const codes = Object.keys(op.responses || {});
      const ok = codes.find((c) => /^2\d\d$/.test(c)) || codes[0] || "200";
      const bs = bodySkeleton(op);   // 스펙에 requestBody 스키마가 있으면 필드 골격을 만든다
      // 검증 골격은 상태코드만 — 스키마 검증은 에디터에서 보강한다(스키마 자동 생성은 하지 않는다)
      out.push({ m: m.toUpperCase(), path: p, name: op.summary || op.operationId || (m.toUpperCase() + " " + p), status: ok, asrt: "상태 " + ok + (bs.count ? " · 본문 " + bs.count + "필드" : ""), bodyTpl: bs.tpl, src: "OpenAPI", script: false });
    });
  });
  return out;
}
// 요청 IR → 요청/응답 검증 스텝. 인증 헤더는 환경에서 주입되므로 넣지 않는다.
const apiSteps = (ep) => {
  const write = ["POST", "PUT", "PATCH"].includes(ep.m);
  // 본문: 스펙 스키마 골격 또는 cURL/HAR의 마스킹된 실제 본문, 없으면 쓰기 메서드에 한해 빈 객체
  const body = write ? (ep.bodyTpl || "{ }") : (ep.bodyTpl || "");   // cURL/HAR은 GET에도 본문이 있을 수 있음(마스킹된 실값)
  const steps = [
    { act: "요청", loc: ep.m + " " + ep.path, val: "-", body, headers: ep.headers || "", save: "" },
    { act: "응답 검증", loc: "상태코드", val: String(ep.status || "200") },
  ];
  return steps;
};
const SAMPLE_CURL = "curl 'https://api-stg.onmarket.io/v1/orders/checkout' \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc' \\\n  -d '{\"productId\":\"P-1001\",\"payment\":\"card\",\"password\":\"P@ss1234\"}'";
const SAMPLE_HAR = { log: { entries: [
  { _resourceType: "fetch", request: { method: "POST", url: "https://api-stg.onmarket.io/v1/auth/login", headers: [{ name: "Content-Type", value: "application/json" }], postData: { text: '{"id":"qa_user01","pw":"P@ss1234"}' } }, response: { status: 200 } },
  { _resourceType: "xhr", request: { method: "GET", url: "https://api-stg.onmarket.io/v1/products", headers: [{ name: "Authorization", value: "Bearer eyJ...tok" }, { name: "Accept", value: "application/json" }] }, response: { status: 200 } },
  { _resourceType: "xhr", request: { method: "POST", url: "https://api-stg.onmarket.io/v1/orders/checkout", headers: [{ name: "Authorization", value: "Bearer eyJ...tok" }, { name: "Content-Type", value: "application/json" }], postData: { text: '{"productId":"P-1001","payment":"card"}' } }, response: { status: 201 } },
  { _resourceType: "image", request: { method: "GET", url: "https://cdn.onmarket.io/logo.png", headers: [] }, response: { status: 200 } },
  { _resourceType: "script", request: { method: "GET", url: "https://cdn.onmarket.io/app.js", headers: [] }, response: { status: 200 } },
] } };

export { M_K, SAMPLE_CURL, SAMPLE_HAR, SAMPLE_OPENAPI, apiSteps, detectSpec, parseCurl, parseHar, parseOpenApi };
