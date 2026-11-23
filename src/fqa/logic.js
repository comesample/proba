// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { surfaceOf } from "./data.js";
import { FLAKY_WINDOW } from "../common/FlakyTable.jsx";
import { JUDGE_K, KIND_BG, judgeWeb, kindsOf, productKind } from "../common/causeLogic.js";
import { mergedTc } from "./suiteLogic.js";
/* 이벤트 트리거는 정보성(읽기전용) — 감지 방식은 대상·환경 "배포 감지"에서 정의된 값을 상속만 표시.
   기능 테스트는 '배포된 앱'을 상대로 하므로 배포 완료가 유일하게 유효한 이벤트다.
   (커밋·PR 시점엔 코드가 배포돼 있지 않아 직전 빌드를 테스트하게 된다 — 트리거로 성립하지 않음) */
const fqaEvents = (env, label) => {
  const mode = (env && (env.deploy || {}).mode) || "수동";
  const detect = mode === "배포 웹훅 알림"
    ? "배포 웹훅 알림 · 대상·환경에서 정의 (상속)"
    : mode === "수동"
    ? "수동 — 자동 감지 없음 · 이 이벤트는 발동하지 않습니다 (대상·환경에서 변경)"
    : "버전 엔드포인트 폴링 · " + ((env && (env.deploy || {}).verPath) || "$.version") + " · 대상·환경에서 정의 (상속)";
  return [
    { key: "deploy", label: "배포 시", desc: "계획의 대상·환경에 새 빌드가 배포되면 회귀를 자동 실행합니다", short: "배포",
      fields: [
        { k: "target", type: "readonly", label: "대상·환경", value: label || "계획의 대상·환경 (상속)" },
        { k: "detect", type: "readonly", label: "감지 방식", value: detect },
      ] },
  ];
};
const DEFAULT_SCHED = { mode: "manual", freq: "weekly", time: "09:00", dow: 1, dom: 1, cron: "0 9 * * 1", tz: "Asia/Seoul", active: true, ev: {}, summary: "예약 없음" };
const schedKey = (s) => { s = s || {}; return JSON.stringify([s.mode, s.freq, s.time, s.dow, s.dom, s.cron, s.tz, s.active, Object.keys(s.ev || {}).filter((k) => s.ev[k]).sort()]); };
const FQA_MEMBERS = ["QA Lead", "김QA", "이QA", "박QA", "미지정"];

/* ───────── 태그 ─────────
   케이스 분류 · 검색용 — 실행 대상은 스위트가 정한다(계획에 태그 필터 없음: 중간 케이스가 빠지면 흐름이 끊긴다).
   고정 3종. 자유 입력을 열면 기능 영역 태그(@login·@payment)가 들어와 스위트와 이중 관리가 된다.
     · 기능 영역 → 스위트
     · 접점(web/api) → surfacesOf()가 파생
     · 불안정 → quarantined 필드
   늘리는 건 상수 한 줄이면 되지만, 불어난 태그를 정리하는 일은 아무도 하지 않는다. */
const TAGS = ["smoke", "regression", "critical"];
const TAG_DESC = { smoke: "배포 직후 핵심 경로", regression: "전체 회귀", critical: "실패 시 배포 중단" };
const tagList = (s) => String(s || "").split(",").map((x) => x.trim().replace(/^@/, "")).filter(Boolean);
/* 필터는 OR — 하나라도 일치하면 대상 (Playwright --grep 관례) */
const tagMatch = (c, filter) => { const f = tagList(filter); if (!f.length) return true; const t = tagList(c.tags); return f.some((x) => t.includes(x)); };

/* 케이스의 최근 결과·이력·결함 수는 케이스에 저장하지 않고 실행 이력/결함에서 파생한다
   🔑 한 회차에 같은 케이스가 여러 스위트에서 돌면 하나로 합친다(suiteLogic.mergedTc).
      건너뜀은 '판정 없음' 이라 이력에서 뺀다 · 부분 실행(실패한 스위트 다시 실행)은 집계 · 이력 판단에서 뺀다 */
const tcOf = (r, id) => mergedTc(r, id);
const runsFor = (runs, id) => (runs || [])
  .filter((r) => r.status === "완료" && !r.partial && (tcOf(r, id) || {}).v && tcOf(r, id).v !== "SKIP")
  .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
/* ── 불안정 판정 — MQA caseHistory 와 같은 규칙 (불안정 화면 · 대시보드 공통) ──
   최근 FLAKY_WINDOW 회 · TC별 · 버전(run.ver)을 구분한다
     · 같은 버전 안에서 통과/실패 혼재, 또는 재시도 통과(WARN) = 불안정
     · 연속 2회 실패, 또는 버전이 바뀐 뒤 계속 실패 = 지속 실패
     · 담당자가 제품 결함으로 확정한 실패가 있으면 결함
     · 2회 이상 실행된 TC만 분류한다 — 1회의 재시도 통과로 불안정이라 단정하지 않는다 */
const ST_KO = { PASS: "통과", FAIL: "실패", WARN: "재시도 통과" };
const caseFlaky = (runs, cases, defects) => (cases || []).map((c) => {
  const w = runsFor(runs, c.id).slice(0, FLAKY_WINDOW).reverse().map((r) => ({ st: ST_KO[tcOf(r, c.id).v] || "통과", run: r.id, ver: r.ver && r.ver !== "-" ? r.ver : "버전 미상", judged: (r.judged || {})[c.id] }));
  if (w.length < 2) return null;
  const fails = w.filter((x) => x.st === "실패").length, warns = w.filter((x) => x.st === "재시도 통과").length;
  const lastVer = w[w.length - 1].ver; const cur = w.filter((x) => x.ver === lastVer);
  const mixed = warns > 0 || [...new Set(w.map((x) => x.ver))].some((v) => { const xs = w.filter((x) => x.ver === v); return xs.some((x) => x.st !== "실패") && xs.some((x) => x.st === "실패"); });
  let trail = 0; for (let i = w.length - 1; i >= 0; i--) { if (w[i].st === "실패") trail++; else break; }
  const regressed = cur.length > 0 && cur.every((x) => x.st === "실패") && w.some((x) => x.ver !== lastVer && x.st !== "실패");
  const hasDefect = (defects || []).some((d) => d.tc === c.id && d.domain === "FQA");
  const defect = w.some((x) => x.st === "실패" && x.judged === productKind("FQA"));   // 담당자가 제품 결함으로 확정한 실패
  const kind = defect ? "결함" : trail >= 2 || regressed ? "지속 실패" : mixed ? "불안정" : fails ? "실패" : "안정";
  return { id: c.id, name: c.name, w, runs: w.length, fails, warns, trail, regressed, kind, hasDefect, quarantined: !!c.quarantined };
}).filter((h) => h && ["불안정", "지속 실패", "결함"].includes(h.kind)).sort((a, b) => (b.fails + b.warns) / b.runs - (a.fails + a.warns) / a.runs);
const histOf = (runs, id) => runsFor(runs, id).slice(0, 4).map((r) => tcOf(r, id).v).filter(Boolean).reverse();
/* 🔑 이 케이스에 최근 붙은 보정 제안 — 케이스에 저장하지 않고 실행에서 파생한다.
   케이스에 박아 두면 과거 회차의 판정 근거가 지금 값으로 바뀐다(F5 위반).
   결함 등록 경로가 "제품 결함인가, 로케이터가 낡은 것인가" 를 구분하려면 이 정보가 필요하다. */
/* 🔑 이 TC 에 쓸 수 있는 보정 제안인가 — 뱃지·필터·요약·패널이 전부 이 하나를 쓴다.
   따로 판단하면 "뱃지는 보이는데 열면 아무것도 없는" 상태가 생긴다.
   Full-Code 는 제외한다: 코드의 어느 줄을 고칠지 알 수 없어 스텝 치환이 성립하지 않는다. */
/* 🔑 보정 제안 검토 상태의 키 — 케이스가 아니라 "제안" 단위여야 한다.
   케이스로 기억하면, 같은 TC 에서 나중에 다른 로케이터가 깨져 새 제안이 와도
   이미 "승인됨" 이라 승인·거절 버튼이 뜨지 않는다 — 새 제안이 조용히 묻힌다. */
/* 실패 원인 — 2단계(구분 = 누가 고칠 일인가 · 세부 원인) · 담당자 확정 우선 (common/causeLogic · MQA 와 같은 체계)
   CAUSE_ORDER · CAUSE_K · CAUSE_BG 는 '구분' 기준이다 (대시보드 · 회귀 분석 · 배지가 같은 색을 쓴다) */
const CAUSE_ORDER = kindsOf("FQA");
const CAUSE_K = JUDGE_K;
const CAUSE_BG = KIND_BG;
const CAUSE_TX = { "테스트 문제": "text-amber-700", "제품 결함 의심": "text-red-700", "백엔드 결함 의심": "text-rose-800", "환경 문제": "text-slate-600", "확인 필요": "text-slate-500" };
/* 케이스의 최근 실패 원인 — heal 과 같은 이유로 실행에서 파생한다 */
/* 반환: judgeWeb 결과 { kind, cause, by, conf, basis, fixed } — 가장 최근 실패 회차 기준 */
const causeOf = (runs, id) => { const rs = runsFor(runs, id); for (let i = 0; i < rs.length; i++) { const t = tcOf(rs[i], id); if (t && t.v === "FAIL") return judgeWeb(rs[i], t); } return null; };
const healKey = (t) => t.id + "|" + ((t && t.heal && t.heal.from) || "");
const healUsable = (cases, t) => {
  if (!t || !t.heal) return null;
  if (t.cause !== "요소 변경") return null;   /* 0단계가 먼저다 — 분류되지 않은 실패에는 보정을 걸지 않는다 */
  const c = (cases || []).find((x) => x.id === t.id);
  return c && c.level === "Full-Code" ? null : t.heal;
};
const healOf = (runs, cases, id) => { const rs = runsFor(runs, id); for (let i = 0; i < rs.length; i++) { const h = healUsable(cases, tcOf(rs[i], id)); if (h) return h; } return null; };
/* 결함 등록 본문에 붙이는 안내 — 판정을 뒤집지 않고 사실만 알린다(F7·F8). */
const healNote = (h) => (h ? "\n\n[보정 제안 있음] " + h.step + "\n  " + h.from + " → " + h.to + (h.why ? "\n  " + h.why : "") + "\n  ※ 제품 결함이 아니라 로케이터가 낡은 것일 수 있습니다. 등록 전 확인하세요." : "");
const lastOf = (runs, id) => { const rs = runsFor(runs, id); return rs.length ? (tcOf(rs[0], id).v || "-") : "-"; };
const defectsOf = (defects, id) => (defects || []).filter((d) => d.tc === id && d.status !== "Resolved").length;
/* 케이스 구성(웹/API/혼합) = 이 케이스가 환경에 요구하는 접점.
   platform 같은 선언 필드를 두지 않는다 — "API 케이스"라고 선언하고 웹 스텝을 넣으면 거짓이 되므로,
   실제 내용에서 파생한다.
     · Low-Code : 스텝의 act
     · 코드(코드 스텝 · Full-Code) : 호출 형태로 추정 (page.request → API, page.goto/getBy → 웹)
   추정이 안 되면 "-"(판정 불가) — 지어내지 않는다. */
const surfacesOf = (c) => {
  const st = (c && c.steps) || [];
  let web = st.some((s) => surfaceOf(s.act) === "web");
  let api = st.some((s) => surfaceOf(s.act) === "api");
  const src = ((c && c.code) || "") + "\n" + st.filter((s) => s.act === "코드 스텝").map((s) => s.code || "").join("\n");
  if (src.trim()) {
    if (/page\.request\./.test(src)) api = true;
    if (/page\.(goto|getBy|locator|frameLocator)\b/.test(src)) web = true;
  }
  return web && api ? "웹+API" : api ? "API" : web ? "웹" : "-";
};
const SURF_K = { "웹+API": "active", "API": "warn", "웹": "info" };

const envCovers = (env, surf) => {
  const w = !!(env && env.webUrl), a = !!(env && env.apiUrl);
  if (surf === "웹") return w;
  if (surf === "API") return a;
  if (surf === "웹+API") return w && a;
  return true;   // "-" 판정 불가 — 막지 않는다
};
/* 🔑 '케이스 밖' 조건 검사 — 계획 화면(경고)과 실행 요청(차단)이 같은 함수를 쓴다.
   두 곳에 따로 구현하면 반드시 어긋나고, 어긋난 쪽이 조용히 통과시킨다.
   케이스 안(스텝·변수)은 저장 시점에 이미 막혔으므로 여기서 보지 않는다. */
const outerChecks = (cs, env, datasets, suites) => {
  const roles = ((env || {}).accts || []).map((a) => a.role);
  const dsNames = (datasets || []).map((d) => d.name);
  const g = [];
  const add = (why, fixLabel, fixView, list, planLevel) => { if (list.length) g.push({ why, fixLabel, fixView, cases: list, planLevel: !!planLevel }); };
  // 접점 ↔ 환경 — 감당 못 하면 그 접점 케이스는 전건 실패한다. 계획 수준 실패이므로 격리로 풀 일이 아니다.
  add("환경이 케이스의 접점을 감당하지 못합니다 — " + (!(env || {}).apiUrl ? "apiUrl 없음" : "webUrl 없음"), "환경 설정", "fqa-targets",
    cs.filter((c) => !envCovers(env, surfacesOf(c))), true);
  // 계정 역할 — 스위트가 정한다. 풀에 역할이 없으면 주입할 값이 없어 그 스위트의 로그인이 실패한다
  const noRole = (suites || []).filter((s) => s.acctRole && !roles.includes(s.acctRole));
  add("환경 계정 풀에 스위트의 계정 역할이 없습니다 — " + noRole.map((s) => s.name + "(" + s.acctRole + ")").join(", "), "환경 설정", "fqa-targets",
    cs.filter((c) => noRole.some((s) => (s.items || []).includes(c.id))));
  // 데이터셋 — 사라졌으면 행이 0개가 되어 테스트가 0개 생성된다(실패도 통과도 아닌 무동작)
  add("참조하는 데이터셋이 없습니다", "데이터셋", "datasets",
    cs.filter((c) => c.dataset && c.dataset !== "-" && !dsNames.includes(c.dataset)));
  /* 승인 전 · 삭제된 케이스가 든 스위트는 통째로 실행 불가다 — 계획 화면이 스위트별로 이유를 보여준다(suiteLogic.suiteBlock) */
  return g;
};

/* 실효 워커 — 병렬은 스위트 단위다. 워커 하나가 스위트 하나를 자기 브라우저 세션으로 끝까지 돌린다(스위트 안은 항상 순서대로).
   로그인하는 스위트는 워커마다 계정이 하나씩 필요하다(F4) — 같은 계정으로 동시에 로그인하면 세션이 서로를 밀어낸다.
   그래서 역할별로 '그 역할의 스위트 수'와 '그 역할의 계정 수' 중 작은 만큼만 동시에 돈다. 역할이 없는 스위트는 계정을 쓰지 않는다.
   스위트끼리는 순서가 보장되지 않는다 — 서로 무관한 검증만 스위트로 나누는 이유다.
   조용히 내리지 않고 원인을 알린다. 스위트 수가 워커보다 적은 것은 제약이 아니므로 알리지 않는다 */
const effWorkers = (suites, env, setWorkers) => {   // suites = 계획의 실행 가능한 스위트
  const accts = ((env || {}).accts || []);
  const want = setWorkers === "auto" ? 4 : (parseInt(setWorkers, 10) || 1);
  const by = {}; (suites || []).forEach((s) => { const r = s.acctRole || ""; by[r] = (by[r] || 0) + 1; });
  let cap = by[""] || 0, tight = null;
  Object.keys(by).filter((r) => r).forEach((r) => {
    const n = accts.filter((a) => a.role === r).length;
    if (n === 0) return;                       // 역할 자체가 없는 건 사전 검사가 잡는다
    cap += Math.min(by[r], n);
    if (by[r] > n && (!tight || n < tight.n)) tight = { role: r, n };
  });
  const eff = Math.min(want, cap);
  if (!tight || eff >= Math.min(want, (suites || []).length)) return null;
  return { want, eff, role: tight.role, n: tight.n };
};
/* 이 환경이 케이스의 접점을 감당하는가 — 못 하면 실행은 반드시 실패한다 */

/* 다음 TC 번호 — 기존 최댓값 + 1. 실 구현에서는 서버가 전역 시퀀스로 발급한다(충돌 불가).
   목업은 타임스탬프 대신 순번을 흉내 낸다 — TC-206, TC-207 … 처럼 이어진다. */
const nextTcId = (cases, offset = 0) => {
  const max = (cases || []).reduce((m, c) => { const n = parseInt(String(c.id || "").replace(/^TC-/, ""), 10); return Number.isFinite(n) && n > m ? n : m; }, 0);
  return "TC-" + String(max + 1 + offset).padStart(4, "0");
};

/* 대상·환경 선택 — 레코딩/MCP는 "촬영 스튜디오"로만 환경을 쓴다. 선택한 환경은 케이스에 저장되지 않는다. */
const envOpts = (systems) => (systems || []).flatMap((sy) => (sy.envs || []).map((e) => ({ systemId: sy.id, env: e.env, label: sy.name + " · " + e.env, webUrl: e.webUrl || "", apiUrl: e.apiUrl || "" })));
const refKey = (r) => (r ? r.systemId + "|" + r.env : "");
/* 절대 URL → 상대경로 (base·스킴·호스트 제거) — 케이스에는 상대경로만 저장된다 */
const relPath = (u, base) => {
  let s = String(u || "");
  if (base && s.indexOf(base) === 0) s = s.slice(base.length);
  s = s.replace(/^https?:\/\/[^/]+/, "");
  if (!s) return "/";
  return s.charAt(0) === "/" ? s : "/" + s;
};
/* 스위트는 ID 로 가리킨다 — 이름을 바꿔도 소속 · 계획이 끊기지 않는다. 화면에는 이름을 보여준다 */
const suiteNm = (suites, id) => ((suites || []).find((x) => x.id === id) || {}).name || "—";

export { CAUSE_BG, CAUSE_K, CAUSE_ORDER, CAUSE_TX, DEFAULT_SCHED, SURF_K, TAGS, TAG_DESC, caseFlaky, causeOf, effWorkers, envCovers, envOpts, fqaEvents, healKey, healNote, healOf, healUsable, histOf, lastOf, nextTcId, outerChecks, refKey, schedKey, suiteNm, surfacesOf, tagList, tagMatch };
