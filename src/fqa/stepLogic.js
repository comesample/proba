// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { surfaceOf } from "./data.js";


/* ═══════════ 4. 테스트 에디터 ═══════════ */
const LV = ["Low-Code", "Full-Code"];
/* 데이터셋을 붙이면 케이스가 행마다 반복 실행된다 —
   부하용 대량 데이터셋(accounts_10k 등)은 NQA의 몫이지 기능 케이스에 붙일 것이 아니다. */
const DS_MAX_ROWS = 100;
/* 스텝의 val 칸 placeholder — 액션마다 넣을 값이 다르다 */
const VAL_PH = {
  "입력": '"qa_user01"',
  "선택": '"premium"',
  "키 누르기": "Enter · Tab · Escape",
};
const LOC_PH = { "이동": "/login", "요청": "/v1/orders/checkout" };
/* 로케이터 표기 — CLI(레코딩)가 뱉는 것과 같은 DSL. 그 외는 CSS 셀렉터로 해석된다. */
const LOC_HINT = '[data-testid=x] · role=button[로그인] · text=… · placeholder=… · label=… · #css';

/* ───────── 검증 문법 ─────────
   val은 케이스에 저장되는 정식 표기이고, 편집기는 그 표기를 '만들어 주는' 컨트롤만 제공한다.
   자유 입력이면 오타(visble = true)가 조용히 다른 검증(toHaveText)으로 바뀐다 — Low-Code의 존재 이유에 어긋난다.
   CLI 파서가 뱉는 표기와 같은 형식이므로 레코딩 결과도 그대로 읽힌다. */
const ASSERTS = [
  { k: "보임", build: () => "visible = true", re: /^visible\s*=\s*true/i },
  { k: "숨김", build: () => "visible = false", re: /^visible\s*=\s*false/i },
  { k: "텍스트 포함", build: (a) => 'text = "' + a + '"', re: /^text\s*=\s*"([\s\S]*)"$/i, arg: "text", ph: "환영합니다" },
  { k: "입력값 일치", build: (a) => 'value = "' + a + '"', re: /^value\s*=\s*"([\s\S]*)"$/i, arg: "text", ph: "qa_user01" },
  { k: "체크됨", build: () => "checked = true", re: /^checked\s*=\s*true/i },
  { k: "체크 해제", build: () => "checked = false", re: /^checked\s*=\s*false/i },
  { k: "활성", build: () => "enabled = true", re: /^enabled\s*=\s*true/i },
  { k: "비활성", build: () => "enabled = false", re: /^enabled\s*=\s*false/i },
  { k: "개수 이상", build: (a) => "count >= " + (a || 0), re: /^count\s*>=\s*(\d+)/i, arg: "num", ph: "3" },
];
const assertDef = (k) => ASSERTS.find((a) => a.k === k) || ASSERTS[0];
/* 응답 저장 변수는 코드에서 const가 된다 — JS 식별자 규칙을 지켜야 한다.
   (계정·공통 변수는 V['계정 ID'] 맵이라 공백이 허용되지만, 이건 진짜 변수다) */
const JS_ID = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const JS_RESERVED = new Set(["const", "let", "var", "class", "function", "return", "if", "else", "for", "while", "new", "this", "await", "async", "import", "export", "default", "null", "true", "false", "typeof", "delete", "in", "of", "do", "try", "catch", "throw", "switch", "case", "break", "continue", "res", "body", "page", "expect", "test", "rows", "row", "V"]);

/* 저장·실행 전 검사 — 빈 로케이터/값은 러너에서 반드시 터진다. 여기서 잡는다. */
function stepErrors(steps) {
  const out = [];
  (steps || []).forEach((s, i) => {
    const n = i + 1;
    const has = (v) => String(v || "").trim() !== "";
    if (s.act === "코드 스텝") { if (!has(s.code)) out.push(n + "번 코드 스텝 — 코드가 비어 있습니다"); return; }
    if (s.act === "요청") {
      if (!has(reqParts(s.loc).path)) out.push(n + "번 요청 — 경로가 비어 있습니다");
      /* 응답 저장은 "이름 = $.경로" 꼴이고, 이름은 진짜 JS 변수(const)가 된다.
         공백·하이픈·숫자 시작·예약어면 스크립트 전체가 컴파일되지 않는다 — 여기서 잡는다. */
      String(s.save || "").split(",").map((x) => x.trim()).filter(Boolean).forEach((sv) => {
        const [nm, pth] = sv.split("=").map((x) => (x || "").trim());
        if (!nm || !pth) { out.push(n + "번 응답 저장 — \"" + sv + "\" 형식이 아닙니다 (예: orderId = $.orderId)"); return; }
        if (!JS_ID.test(nm)) out.push(n + "번 응답 저장 — 변수명 '" + nm + "'을 쓸 수 없습니다 (영문·숫자·_ 만, 숫자로 시작 불가)");
        else if (JS_RESERVED.has(nm)) out.push(n + "번 응답 저장 — '" + nm + "'은 예약어입니다");
        if (!/^\$\.?/.test(pth)) out.push(n + "번 응답 저장 — 경로는 $.로 시작합니다 (예: $.orderId)");
      });
      return;
    }
    if (s.act === "응답 검증") {
      if (!has(s.loc)) out.push(n + "번 응답 검증 — 검증 대상이 비어 있습니다");
      if (!has(s.val)) out.push(n + "번 응답 검증 — 값이 비어 있습니다");
      return;
    }
    if (!has(s.loc)) out.push(n + "번 " + s.act + " — " + (s.act === "이동" ? "경로" : "로케이터") + "가 비어 있습니다");
    if (s.act === "화면 검증") { const pa = parseAssert(s.val); if (assertDef(pa.k).arg && !has(pa.arg)) out.push(n + "번 화면 검증 — 값이 비어 있습니다"); return; }
    if ((s.act === "입력" || s.act === "선택" || s.act === "키 누르기") && !has(s.val)) out.push(n + "번 " + s.act + " — 값이 비어 있습니다");
  });
  return out;
}
const parseAssert = (val) => {
  for (const a of ASSERTS) { const m = String(val || "").match(a.re); if (m) return { k: a.k, arg: m[1] || "" }; }
  return { k: "보임", arg: "" };
};
/* 요청 스텝의 loc = "POST /v1/orders" — 메서드와 경로를 분리해 편집하고 다시 합쳐 저장한다.
   본문은 POST·PUT·PATCH에만 있다(GET/DELETE/HEAD의 body는 서버가 무시한다).
   헤더·응답 저장은 메서드와 무관하게 필요하다 — GET도 Accept 헤더를 쓰고, 조회 결과를 저장한다. */
const REQ_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const hasBody = (m) => ["POST", "PUT", "PATCH"].includes(String(m || "").toUpperCase());
const reqParts = (loc) => { const p = String(loc || "GET /").trim().split(/\s+/); return { m: (p[0] || "GET").toUpperCase(), path: p.slice(1).join(" ") || "" }; };
const reqJoin = (m, path) => m + " " + (path || "/");
/* 응답 검증 — 대상(상태코드 | 본문 필드) × 조건(존재 | 값 일치)
   🔴 부분 문자열로 판정하면 안 된다:
        loc="$.status"  → '상태코드' 검증으로 오인 (status·orderStatus는 아주 흔한 필드명)
        val='"존재하지 않는 사용자"' → '존재' 검증으로 오인 → 값 검증이 사라진다
   그래서 표기를 정확히 고정한다 — 상태코드는 loc === "상태코드", 본문 필드는 "$."로 시작.
   존재는 val === "존재", 값 일치는 따옴표로 감싼 문자열. */
const isStatusTarget = (loc) => String(loc || "").trim() === "상태코드";
const respCond = (val) => (String(val || "").trim() === "존재" ? "존재" : "값 일치");
// 스텝 액션 카탈로그는 data.js가 단일 출처 — act가 접점(web/api)을 결정한다

/* ───────── 로케이터 DSL ─────────
   🔴 CLI 파서(toDsl)와 이 표가 어긋나면 레코딩으로 만든 케이스가 실행에서 깨진다.
      CLI가 뱉는 표기를 여기가 전부 알아야 한다 — 한쪽만 아는 표기가 있으면 안 된다.
      실 구현에서는 이 표를 명세로 못 박고, CLI와 코드 생성기가 같은 표를 본다. */
const _q = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
const LOC_DSL = [
  [/^\[data-testid=([^\]]+)\]$/, (m) => "getByTestId(" + _q(m[1]) + ")"],
  [/^role=([a-zA-Z]+)\[([^\]]+)\]$/, (m) => "getByRole(" + _q(m[1]) + ", { name: " + _q(m[2]) + " })"],
  [/^role=([a-zA-Z]+)$/, (m) => "getByRole(" + _q(m[1]) + ")"],
  [/^text=([\s\S]+)$/, (m) => "getByText(" + _q(m[1]) + ")"],
  [/^placeholder=([\s\S]+)$/, (m) => "getByPlaceholder(" + _q(m[1]) + ")"],
  [/^label=([\s\S]+)$/, (m) => "getByLabel(" + _q(m[1]) + ")"],
  [/^alt=([\s\S]+)$/, (m) => "getByAltText(" + _q(m[1]) + ")"],
  [/^title=([\s\S]+)$/, (m) => "getByTitle(" + _q(m[1]) + ")"],
];
function _loc(loc) {
  const s = String(loc || "").trim();
  for (const [re, fn] of LOC_DSL) { const m = s.match(re); if (m) return fn(m); }
  return "locator(" + _q(s) + ")";   // 그 외는 CSS 셀렉터 그대로
}
// 스텝 기반 단건 실행 시뮬(결정적) — 케이스 성향 반영(호출부에서 lastVerdict 주입)
function simRun(steps, tc, lastVerdict) {
  const willFail = lastVerdict === "FAIL";
  const st = (steps || []).map((s, i) => ({ ...s, ok: true }));
  let failIdx = -1;
  if (willFail && st.length) { st.forEach((s, i) => { if (s.act.includes("검증")) failIdx = i; }); if (failIdx < 0) failIdx = st.length - 1; st[failIdx].ok = false; }
  return { verdict: willFail ? "FAIL" : "PASS", steps: st, failIdx };
}
/* ───────── 변경 이력 diff ─────────
   리비전은 전체 스냅샷이므로, 보여줄 때 현재본과 비교해 무엇이 달라졌는지 계산한다.
   LCS 한 번으로 스텝·코드 줄을 공통 처리한다. */
function lcsDiff(a, b, key) {
  const A = a.map(key), B = b.map(key);
  const m = A.length, n = B.length;
  const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push({ t: "same", v: b[j] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ t: "del", v: a[i] }); i++; }
    else { out.push({ t: "add", v: b[j] }); j++; }
  }
  while (i < m) out.push({ t: "del", v: a[i++] });
  while (j < n) out.push({ t: "add", v: b[j++] });
  return out;
}
const stepKey = (s) => [s.act, s.loc, s.val, s.code, s.body, s.headers, s.save].map((x) => x || "").join("│");
const stepText = (s) => (s.act === "코드 스텝" ? "코드 스텝 · " + (s.code || "").split("\n")[0] : s.act + "  " + (s.loc || "") + (s.val && s.val !== "-" ? "  " + s.val : ""));
/* 케이스 속성만 비교한다 — 소속 스위트 · 계정 역할은 스위트가 갖는다(케이스는 스위트를 모른다) */
const VER_FIELDS = [["name", "이름"], ["tags", "태그"], ["dataset", "데이터셋"], ["level", "관리 수준"]];
const fieldDiff = (v, cur) => VER_FIELDS.map(([k, label]) => ({ k, label, from: String(v[k] || "—"), to: String(cur[k] || "—") })).filter((d) => d.from !== d.to);
const DIFF_CLS = { add: "bg-emerald-50 text-emerald-700", del: "bg-red-50 text-red-700", same: "text-slate-500" };
const DIFF_MARK = { add: "+", del: "−", same: " " };

/* Full-Code는 스텝이 없다(코드가 관리 기준) — 코드 줄을 실행 단위로 본다 */
function simCode(code, lastVerdict) {
  const willFail = lastVerdict === "FAIL";
  const st = String(code || "").split("\n").map((l) => l.trim())
    .filter((l) => /^(await |expect\(|const |let )/.test(l))
    .map((l) => ({ act: /expect\(/.test(l) ? "검증" : "실행", loc: l, ok: true }));
  let failIdx = -1;
  if (willFail && st.length) { st.forEach((s, i) => { if (s.act === "검증") failIdx = i; }); if (failIdx < 0) failIdx = st.length - 1; st[failIdx].ok = false; }
  return { verdict: willFail ? "FAIL" : "PASS", steps: st, failIdx };
}
// "$.a.b" → "['a']['b']"
const _jp = (p) => String(p || "").replace(/^\$\.?/, "").split(".").filter(Boolean).map((k) => "['" + k + "']").join("");
// 스텝의 save 이름들 — 이건 진짜 JS const가 되므로 ${orderId} 그대로 둔다
const _saved = (steps) => new Set((steps || []).flatMap((s) => String(s.save || "").split(",").map((x) => x.split("=")[0].trim()).filter(Boolean)));
/* 템플릿 문자열.
   ${...}는 두 종류다 —
     · save로 만든 변수(orderId) · 데이터셋 행(row.x) → 진짜 JS 식별자이므로 그대로
     · 계정·공통 변수(계정 ID 등)   → 공백이 들어가 JS 식별자가 될 수 없다 → V['계정 ID']로 치환 */
const _tpl = (v, saved) => {
  const raw = String(v == null ? "" : v).replace(/^"|"$/g, "").replace(/`/g, "\\`");
  const s = raw.replace(/\$\{([^}]+)\}/g, (m0, k) => {
    const key = k.trim();
    if (key.startsWith("row.") || (saved && saved.has(key))) return "${" + key + "}";
    return "${V['" + key + "']}";
  });
  return "`" + s + "`";
};
/* 요청 본문(JSON)의 "${...}" 는 큰따옴표 문자열이라 JS가 치환하지 않는다 → 백틱 템플릿으로 바꾼다.
   { "name": "${row.name}" }  →  { "name": `${row.name}` } */
const _bodyJs = (b, saved) => String(b || "").trim().replace(/"([^"]*\$\{[^"]*)"/g, (m0, inner) => _tpl(inner, saved));
// "Key: Value" 줄들 → Playwright headers 옵션 (인증 헤더 AUTH를 항상 앞에 펼침 — API 호출에만 부착)
const _hdrs = (h, saved) => {
  const ls = String(h || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const extra = ls.map((l) => { const i = l.indexOf(":"); const k = i < 0 ? l : l.slice(0, i).trim(); const v = i < 0 ? "" : l.slice(i + 1).trim(); return "'" + k + "': " + _tpl(v, saved); });
  return "headers: { ...AUTH" + (extra.length ? ", " + extra.join(", ") : "") + " }";
};
/* 스텝 → Full-Code Playwright (TypeScript)
   주입 계약 (러너가 환경에서 채운다):
     baseURL   = 환경 webUrl   → page.goto('/login')이 웹 호스트로
     API_BASE  = 환경 apiUrl   → page.request는 컨텍스트 baseURL(=웹)을 쓰므로 API는 절대 URL로 만들어야 한다
     AUTH      = 환경 apiAuth 헤더 → API 호출에만 부착(웹 오리진으로 토큰이 새지 않도록)
     V         = 계정·공통 변수 맵 (${계정 ID} 등 공백 포함 이름 대응)
   API 요청은 page.request를 쓴다 — 웹 세션의 쿠키를 공유하므로 웹→API 흐름이 이어진다. */
function stepsToCode(steps, tc) {
  const id = (tc && tc.id) || "TC-000";
  const name = (tc && tc.name) || "테스트";
  const hasApi = (steps || []).some((s) => surfaceOf(s.act) === "api");
  const saved = _saved(steps);
  const T = (v) => _tpl(v, saved);
  const body = (steps || []).map((s) => {
    if (s.act === "코드 스텝") return (s.code || "").split("\n").map((ln) => "  " + ln).join("\n");
    if (s.act === "이동") return "  await page.goto(" + T(s.loc || "/") + ");";
    if (s.act === "입력") return "  await page." + _loc(s.loc) + ".fill(" + T(s.val) + ");";
    if (s.act === "클릭") return "  await page." + _loc(s.loc) + ".click();";
    if (s.act === "선택") return "  await page." + _loc(s.loc) + ".selectOption(" + T(s.val) + ");";
    if (s.act === "체크") return "  await page." + _loc(s.loc) + (/해제|uncheck|false/i.test(s.val || "") ? ".uncheck();" : ".check();");
    if (s.act === "키 누르기") return "  await page." + _loc(s.loc) + ".press(" + T(s.val || "Enter") + ");";
    /* 검증 표기는 편집기가 만들어 준다(ASSERTS) — 자유 입력이 아니므로 그대로 매핑하면 된다 */
    if (s.act === "화면 검증") {
      const { k, arg } = parseAssert(s.val);
      const L = "page." + _loc(s.loc);
      if (k === "보임") return "  await expect(" + L + ").toBeVisible();";
      if (k === "숨김") return "  await expect(" + L + ").toBeHidden();";
      if (k === "체크됨") return "  await expect(" + L + ").toBeChecked();";
      if (k === "체크 해제") return "  await expect(" + L + ").not.toBeChecked();";
      if (k === "활성") return "  await expect(" + L + ").toBeEnabled();";
      if (k === "비활성") return "  await expect(" + L + ").toBeDisabled();";
      if (k === "입력값 일치") return "  await expect(" + L + ").toHaveValue(" + T(arg) + ");";
      if (k === "개수 이상") return "  expect(await " + L + ".count()).toBeGreaterThanOrEqual(" + (parseInt(arg, 10) || 0) + ");";
      return "  await expect(" + L + ").toContainText(" + T(arg) + ");";   // 텍스트 포함
    }
    if (s.act === "요청") {
      const { m: M, path: P } = reqParts(s.loc);
      const mth = M.toLowerCase();
      const path = P || "/";
      const o = [_hdrs(s.headers, saved)];
      // 본문은 POST·PUT·PATCH만 — 메서드를 바꿔 남은 body가 GET에 실리지 않게 한다
      if (hasBody(M) && s.body && s.body.trim()) o.unshift("data: " + _bodyJs(s.body, saved));
      const out = [
        "  res = await page.request." + mth + "(API_BASE + " + T(path) + ", { " + o.join(", ") + " });",
        "  body = await res.json().catch(() => ({}));",
      ];
      String(s.save || "").split(",").map((x) => x.trim()).filter(Boolean).forEach((sv) => {
        const [nm, pth] = sv.split("=").map((x) => x.trim());
        if (nm && pth) out.push("  const " + nm + " = body" + _jp(pth) + ";");
      });
      return out.join("\n");
    }
    if (s.act === "응답 검증") {
      if (isStatusTarget(s.loc)) return "  expect(res.status()).toBe(" + (parseInt(s.val, 10) || 200) + ");";
      const path = _jp(s.loc);
      if (respCond(s.val) === "존재") return "  expect(body" + path + ").toBeDefined();";
      const m = (s.val || "").match(/"([\s\S]*)"/);
      return "  expect(body" + path + ").toBe(" + T(m ? m[1] : s.val) + ");";
    }
    return "  // " + s.act;
  }).join("\n");
  const usesRow = /\$\{row\./.test(JSON.stringify(steps || []));
  const ds = tc && tc.dataset && tc.dataset !== "-" ? tc.dataset : "";
  const head = [
    "import { test, expect } from '@playwright/test';",
    "",
    "// 실행 계획의 대상·환경에서 러너가 주입 — 케이스는 환경을 모른다",
    "const V = JSON.parse(process.env.PROBA_VARS || '{}');        // 계정·공통 변수",
    hasApi ? "const API_BASE = process.env.PROBA_API_BASE || '';           // 환경 apiUrl" : "",
    hasApi ? "const AUTH = JSON.parse(process.env.PROBA_API_AUTH || '{}');  // API 인증 헤더 (API 호출에만)" : "",
    (ds || usesRow) ? "const rows = JSON.parse(process.env.PROBA_ROWS || '[]');      // 데이터셋 " + (ds || "행") : "",
    "",
  ].filter((l) => l !== "").join("\n");
  const pre = hasApi ? "  let res: any, body: any;\n" : "";
  if (ds || usesRow) {
    return head + "\nfor (const row of rows) {\n  test(`" + id + " " + name + " [${row.__i}]`, async ({ page }) => {\n  " + pre.replace(/^ {2}/, "  ") + body.split("\n").map((l) => "  " + l).join("\n") + "\n  });\n}";
  }
  return head + "\ntest('" + id + " " + name + "', async ({ page }) => {\n" + pre + body + "\n});";
}

export { ASSERTS, DIFF_CLS, DIFF_MARK, DS_MAX_ROWS, LOC_HINT, LOC_PH, LV, REQ_METHODS, VAL_PH, assertDef, fieldDiff, hasBody, isStatusTarget, lcsDiff, parseAssert, reqJoin, reqParts, respCond, simCode, simRun, stepErrors, stepKey, stepText, stepsToCode };
