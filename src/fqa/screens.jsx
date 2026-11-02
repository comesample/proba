import { useState, useEffect, useRef, Fragment } from "react";
import {
  Video, Square, Globe, Play, Upload, FileText, Download, Terminal,
  Wrench, Search, RefreshCw, Save, Copy, Plus, CheckCircle2, X, Send, ChevronLeft,
  Code2, ArrowRight, Lock, GripVertical, Layers, Calendar, Bug, Clock, History, XCircle, AlertTriangle,
  LayoutDashboard, TrendingUp, Activity, ClipboardList, Pencil,
  Smartphone, ChevronRight, ChevronDown, Server, Trash2, Tag,
} from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Card, Badge, Btn, Seg, Field, Input, Select, Modal, Toast, useToast, PageToolbar, backTo, RunTime, nowStamp, Portal, SEL_CARD, SEL_IDLE, SEL_ROW } from "../common/ui.jsx";
import { ScheduleConfig } from "../common/ScheduleConfig.jsx";
import { useApp } from "../common/context.js";
import { C, TOOLTIP } from "../common/theme.js";
import { VarRefInput } from "../common/VarRefInput.jsx";
import { DatasetPicker } from "../common/DatasetPicker.jsx";
import { STEP_ACTS, surfaceOf } from "./data.js";
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

/* ───────── primitives (lqa-demo 톤) ───────── */
const taCls = "w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500";
/* badge는 '이 화면이 만들어 내는 케이스의 성격' — 없으면 표시하지 않는다 */
const Hdr = ({ icon: Icon, title, desc, badge }) => (
  <div className="mb-1 flex items-center gap-2">
    <Icon size={16} className="text-sky-600" /><span className="text-sm font-semibold text-slate-900">{title}</span>
    {badge && <Badge kind="active">{badge}</Badge>}{desc && <span className="text-xs text-slate-500">{desc}</span>}
  </div>
);
const FQA_MEMBERS = ["QA Lead", "김QA", "이QA", "박QA", "미지정"];

/* ───────── 태그 ─────────
   스위트(업무 흐름)와 직교하는 축 — "이 케이스를 어떤 실행에 포함시킬 것인가".
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

const TagPicker = ({ value, onChange }) => {
  const cur = tagList(value);
  const toggle = (t) => onChange((cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(","));
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAGS.map((t) => (
        <button key={t} onClick={() => toggle(t)} title={TAG_DESC[t]} className={"rounded-full border px-2.5 py-0.5 text-xs " + (cur.includes(t) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200")}>{t}</button>
      ))}
    </div>
  );
};

/* 케이스의 최근 결과·이력·결함 수는 케이스에 저장하지 않고 실행 이력/결함에서 파생한다 */
const runsFor = (runs, id) => (runs || [])
  .filter((r) => r.status === "완료" && (r.tcs || []).some((t) => t.id === id))
  .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
const histOf = (runs, id) => runsFor(runs, id).slice(0, 4).map((r) => ((r.tcs || []).find((t) => t.id === id) || {}).v).filter(Boolean).reverse();
/* 🔑 이 케이스에 최근 붙은 보정 제안 — 케이스에 저장하지 않고 실행에서 파생한다.
   케이스에 박아 두면 과거 회차의 판정 근거가 지금 값으로 바뀐다(F5 위반).
   결함 등록 경로가 "제품 결함인가, 로케이터가 낡은 것인가" 를 구분하려면 이 정보가 필요하다. */
/* 🔑 이 TC 에 쓸 수 있는 보정 제안인가 — 뱃지·필터·요약·패널이 전부 이 하나를 쓴다.
   따로 판단하면 "뱃지는 보이는데 열면 아무것도 없는" 상태가 생긴다.
   Full-Code 는 제외한다: 코드의 어느 줄을 고칠지 알 수 없어 스텝 치환이 성립하지 않는다. */
/* 🔑 보정 제안 검토 상태의 키 — 케이스가 아니라 "제안" 단위여야 한다.
   케이스로 기억하면, 같은 TC 에서 나중에 다른 로케이터가 깨져 새 제안이 와도
   이미 "승인됨" 이라 승인·거절 버튼이 뜨지 않는다 — 새 제안이 조용히 묻힌다. */
/* 실패 원인(0단계) — 러너가 에러 문장 규칙으로 붙인 딱지. 색은 "누가 고칠 일인가" 로 나눈다.
   로케이터·타이밍은 우리(QA)가, 검증은 개발이, 환경은 인프라가 고친다. */
const CAUSE_ORDER = ["로케이터", "검증", "타이밍", "환경", "기타"];
const CAUSE_K = { "로케이터": "active", "검증": "fail", "타이밍": "warn", "환경": "info", "기타": "draft" };
const CAUSE_BG = { "로케이터": "bg-sky-500", "검증": "bg-red-500", "타이밍": "bg-amber-500", "환경": "bg-slate-400", "기타": "bg-slate-300" };
const CAUSE_TX = { "로케이터": "text-sky-700", "검증": "text-red-700", "타이밍": "text-amber-700", "환경": "text-slate-600", "기타": "text-slate-500" };
/* 케이스의 최근 실패 원인 — heal 과 같은 이유로 실행에서 파생한다 */
const causeOf = (runs, id) => { const rs = runsFor(runs, id); for (let i = 0; i < rs.length; i++) { const t = (rs[i].tcs || []).find((x) => x.id === id); if (t && t.cause) return t.cause; } return null; };
const healKey = (t) => t.id + "|" + ((t && t.heal && t.heal.from) || "");
const healUsable = (cases, t) => {
  if (!t || !t.heal) return null;
  if (t.cause !== "로케이터") return null;   /* 0단계가 먼저다 — 분류되지 않은 실패에는 보정을 걸지 않는다 */
  const c = (cases || []).find((x) => x.id === t.id);
  return c && c.level === "Full-Code" ? null : t.heal;
};
const healOf = (runs, cases, id) => { const rs = runsFor(runs, id); for (let i = 0; i < rs.length; i++) { const h = healUsable(cases, (rs[i].tcs || []).find((x) => x.id === id)); if (h) return h; } return null; };
/* 결함 등록 본문에 붙이는 안내 — 판정을 뒤집지 않고 사실만 알린다(F7·F8). */
const healNote = (h) => (h ? "\n\n[보정 제안 있음] " + h.step + "\n  " + h.from + " → " + h.to + (h.why ? "\n  " + h.why : "") + "\n  ※ 제품 결함이 아니라 로케이터가 낡은 것일 수 있습니다. 등록 전 확인하세요." : "");
const lastOf = (runs, id) => { const rs = runsFor(runs, id); return rs.length ? (((rs[0].tcs || []).find((t) => t.id === id) || {}).v || "-") : "-"; };
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
const outerChecks = (cs, env, datasets, allCases) => {
  const roles = ((env || {}).accts || []).map((a) => a.role);
  const dsNames = (datasets || []).map((d) => d.name);
  const byId = (id) => (allCases || []).find((x) => x.id === id);
  const g = [];
  const add = (why, fixLabel, fixView, list, planLevel) => { if (list.length) g.push({ why, fixLabel, fixView, cases: list, planLevel: !!planLevel }); };
  // 접점 ↔ 환경 — 감당 못 하면 그 접점 케이스는 전건 실패한다. 계획 수준 실패이므로 격리로 풀 일이 아니다.
  add("환경이 케이스의 접점을 감당하지 못합니다 — " + (!(env || {}).apiUrl ? "apiUrl 없음" : "webUrl 없음"), "환경 설정", "fqa-targets",
    cs.filter((c) => !envCovers(env, surfacesOf(c))), true);
  // 계정 역할 — 풀에 역할이 없으면 주입할 값이 없다
  add("환경 계정 풀에 해당 역할이 없습니다", "환경 설정", "fqa-targets",
    cs.filter((c) => c.acctRole && !roles.includes(c.acctRole)));
  // 데이터셋 — 사라졌으면 행이 0개가 되어 테스트가 0개 생성된다(실패도 통과도 아닌 무동작)
  add("참조하는 데이터셋이 없습니다", "데이터셋", "datasets",
    cs.filter((c) => c.dataset && c.dataset !== "-" && !dsNames.includes(c.dataset)));
  /* 전제조건 케이스 — 사라졌거나 승인이 풀렸으면 로그인 없이 돌아 전건 실패한다.
     전제조건 케이스를 고치면 승인이 풀리므로(저장 시 검토중) 여기서 걸린다. 그게 의도다. */
  add("전제조건 케이스가 없거나 승인되지 않았습니다", "테스트케이스", "fqa-cases",
    cs.filter((c) => c.preCase && (byId(c.preCase) || {}).status !== "승인"));
  return g;
};

/* 실효 워커 — 워커 슬롯이 곧 계정이므로(F4) 워커 수가 역할별 계정 수를 넘을 수 없다.
   넘으면 같은 계정으로 동시 로그인해 세션이 서로를 밀어낸다. 조용히 내리지 않고 원인을 알린다. */
const effWorkers = (cs, env, setWorkers) => {
  const used = [...new Set(cs.map((c) => c.acctRole).filter(Boolean))];
  const accts = ((env || {}).accts || []);
  if (!used.length) return null;
  const cnt = (r) => accts.filter((a) => a.role === r).length;
  const tight = used.map((r) => ({ role: r, n: cnt(r) })).sort((a, b) => a.n - b.n)[0];
  const want = setWorkers === "auto" ? 4 : (parseInt(setWorkers, 10) || 1);
  if (tight.n === 0) return null;             // 역할 자체가 없는 건 사전 검사가 잡는다
  if (tight.n >= want) return null;
  return { want, eff: tight.n, role: tight.role };
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

/* ═══════════ 1. 레코딩 (CLI + Playwright codegen) ═══════════

   구현 전제 — 공식 CLI만 사용한다(내부 API 없음):
     1) 웹에서 세션 생성 → 명령어 발급
     2) 사용자가 터미널에서  npx proba-cli record --session <id>
     3) CLI가 세션 정보를 받아  npx playwright codegen [플래그] <base+시작경로> -o out.spec.ts  실행
        · --load-storage  : 이전 녹화에서 저장한 로그인 상태 재사용
        · --save-storage  : 이번 로그인 상태를 로컬(~/.proba)에만 저장 — 플랫폼에 올리지 않는다
        · --viewport-size / --ignore-https-errors : 환경 설정에서 주입
     4) 브라우저에서 조작 · 툴바로 검증 추가 → 창을 닫으면 codegen 종료
     5) CLI가 out.spec.ts를 AST로 파싱 → 스텝으로 변환 → 플랫폼에 업로드
        · 로케이터 생성·고유성 보장은 Playwright가 한다 (우리가 만들지 않는다)
        · 파싱하지 못한 줄은 '코드 스텝'으로 보존 → 손실 0
     6) 웹에서 검토 후 등록

   v1 한계(정직하게 화면에 표시):
     · 실시간 스트리밍 아님 — 녹화 종료 후 일괄 수신
     · Basic Auth 미지원 (codegen에 해당 플래그가 없음)
     · Node.js 18+ 필요 · 첫 실행 시 브라우저 바이너리 다운로드                */

/* codegen 출력 파싱 결과(데모) — 실제로는 CLI가 AST 파싱해 올려준다.
   · 계정 값은 CLI가 세션의 계정 풀과 대조해 ${계정 ID}로 치환한다.
   · 비밀번호 필드(로케이터에 password 힌트)는 ${계정 비밀번호}로 치환하고 원본 값은 버린다
     → 평문 시크릿이 케이스에 남지 않는다.
   · 변환하지 못한 문장은 코드 스텝으로 원본 보존. */
const REC_CAPTURED = [
  { act: "이동", loc: "/login", val: "-" },
  { act: "입력", loc: "[data-testid=username]", val: "${계정 ID}" },
  { act: "입력", loc: "[data-testid=password]", val: "${계정 비밀번호}" },
  { act: "체크", loc: "role=checkbox[자동 로그인]", val: "체크" },
  { act: "클릭", loc: "role=button[로그인]", val: "-" },
  { act: "화면 검증", loc: "text=환영합니다", val: "visible = true" },
  { act: "코드 스텝", loc: "", val: "", code: "const page1Promise = page.waitForEvent('popup');\nawait page.getByRole('link', { name: '이용약관' }).click();\nconst page1 = await page1Promise;" },
];
const REC_VIEWPORTS = ["1920×1080", "1440×900", "1280×720", "375×812 (모바일)"];

export function FqaRecordScreen({ onDone, onEdit }) {
  const { fqaSuites, fqaSystems, fqaCases } = useApp();
  const [msg, flash] = useToast();
  const opts = envOpts(fqaSystems).filter((o) => o.webUrl);
  const [ref, setRef] = useState(opts[0] ? { systemId: opts[0].systemId, env: opts[0].env } : null);
  const cur = opts.find((o) => refKey(o) === refKey(ref)) || opts[0] || {};
  const base = cur.webUrl || "";
  const [path, setPath] = useState("/");
  /* 녹화 해상도 — 반응형 사이트는 화면 크기에 따라 DOM이 달라지므로 녹화 시점에 정해야 한다.
     케이스에는 저장하지 않는다(실행 해상도는 실행 계획이 정함). */
  const [vp, setVp] = useState(REC_VIEWPORTS[0]);
  // 스위트·TC명은 캡처 결과를 보고 등록 시점에 정한다
  const [suite, setSuite] = useState((fqaSuites[0] || {}).name || "");
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("setup"); // setup | waiting | recording | done
  const [sid, setSid] = useState("");
  const [steps, setSteps] = useState([]);

  /* 명령어는 서버가 조립해 발급한다 —
       · CLI 버전: 플랫폼 API 스키마에 묶이므로 @latest가 아니라 호환 버전을 박는다
       · 세션 토큰: 대상 환경 정보를 받아가고 스텝을 올리는 '사실상 인증'이므로
                    단명(10분) · 1회용 · 128bit 이상. 짧은 ID는 대입 가능해 위험하다.        */
  /* npm 패키지는 스코프 없는 proba-cli — npx 한 줄로 끝나야 하므로 짧은 쪽을 골랐다.
     스코프(@org/cli)는 조직을 바꾸면 패키지 이름까지 바뀌지만, 스코프 없는 이름은 조직 소유로 옮겨도 그대로다.
     전역 설치 시 명령어는 package.json 의 bin 이 정한다 → proba (vercel/eslint 와 같은 관례) */
  /* 실제 배포 버전과 반드시 일치해야 한다 — 화면의 명령어를 복사해 실행하는 구조라
     없는 버전을 적으면 사용자 터미널에서 "No matching version" 이 난다.
     0.1 은 0.1.x 범위 — 패치는 자동으로 따라오고 마이너는 고정된다. */
  const CLI_VER = "0.1";
  const cmd = "npx proba-cli@" + CLI_VER + " record --session " + sid;

  // 목업용 토큰 — 실제로는 서버가 발급한다(128bit·10분·1회용). 클라 Math.random은 데모 표시용일 뿐.
  const newToken = () => {
    const A = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = ""; for (let i = 0; i < 22; i++) s += A[Math.floor(Math.random() * A.length)];
    return "s_" + s;
  };
  const startSession = () => {
    if (!base) { flash("웹 URL이 설정된 대상·환경이 없습니다"); return; }
    setSid(newToken()); setSteps([]); setPhase("waiting");
    // 목업 시뮬: 잠시 후 CLI가 붙어 브라우저가 열린 것으로 본다
    setTimeout(() => setPhase((p) => (p === "waiting" ? "recording" : p)), 2500);
  };
  const cancel = () => { setPhase("setup"); setSid(""); setSteps([]); };
  // 목업 시뮬 — 실제로는 CLI가 세션 토큰으로 스텝을 업로드하면 이 화면이 받는다
  const simulate = () => { setSteps(REC_CAPTURED); setPhase("done"); flash("스텝 " + REC_CAPTURED.length + "개 수신 (데모 시뮬)"); };
  const stK2 = { setup: ["info", "세션 없음"], waiting: ["warn", "● CLI 연결 대기"], recording: ["live", "● 녹화 중"], done: ["pass", "수신 완료"] };
  /* 캡처 결과는 곧바로 저장하지 않는다 — 에디터로 넘겨 스텝 다듬기·검증·태그를 거친 뒤 저장한다.
     여기서는 케이스를 만들지 않는다(에디터가 첫 저장 때 생성). origin으로 '레코딩 생성'을 남긴다. */
  const openInEditor = () => {
    const c = { id: nextTcId(fqaCases), origin: "레코딩", name: name || "레코딩 TC", suite, tags: "", status: "초안", level: "Low-Code", dataset: "-", steps };
    onEdit ? onEdit(c) : onDone && onDone("레코딩 완료");
  };
  return (
    <div className="space-y-4">
      <Hdr icon={Video} title="레코딩" badge="Web · Playwright" desc="로컬 CLI + Playwright codegen · 조작 캡처 → 스텝" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 space-y-4">
          <Card className="p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">녹화 세션</span>
              <Badge kind={stK2[phase][0]}>{stK2[phase][1]}</Badge>
            </div>

            <Field label="대상 · 환경">
              <Select value={refKey(ref)} disabled={phase !== "setup"} onChange={(e) => { const o = opts.find((x) => refKey(x) === e.target.value); if (o) setRef({ systemId: o.systemId, env: o.env }); }}>
                {opts.length === 0 && <option>웹 URL이 설정된 대상 없음</option>}
                {opts.map((o) => <option key={refKey(o)} value={refKey(o)}>{o.label}</option>)}
              </Select>
            </Field>
            {/* base URL을 접두사로 붙여 전체 주소가 한눈에 읽히게 — 실제 저장은 상대경로만 */}
            <Field label="시작 경로">
              <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-slate-100 focus-within:border-sky-500">
                <span className="flex max-w-[55%] shrink-0 items-center truncate border-r border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-500" title={base}>{base || "대상 없음"}</span>
                <input value={path} onChange={(e) => setPath(e.target.value)} disabled={phase !== "setup"} placeholder="/login" className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-mono text-xs text-slate-800 outline-none disabled:text-slate-500" />
              </div>
            </Field>
            {/* 반응형 사이트는 해상도에 따라 DOM이 달라진다 — 녹화 해상도를 실행 해상도와 맞추는 게 안전하다 */}
            <Field label="녹화 해상도" hint="실행 해상도와 다르면 반응형 화면에서 로케이터가 달라질 수 있습니다">
              <Select value={vp} disabled={phase !== "setup"} onChange={(e) => setVp(e.target.value)}>
                {REC_VIEWPORTS.map((v) => <option key={v}>{v}</option>)}
              </Select>
            </Field>
            {phase === "setup" ? (
              <Btn kind="primary" icon={Video} className="w-full" onClick={startSession}>녹화 세션 시작</Btn>
            ) : (
              <>
                <div className="rounded-lg border border-sky-200 bg-slate-50 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Terminal size={13} className="text-sky-600" />터미널에서 실행</span>
                    <span className="text-xs text-slate-500">10분 후 만료 · 1회용</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 truncate rounded border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-sky-700">{cmd}</div>
                    <Btn icon={Copy} onClick={() => { try { navigator.clipboard.writeText(cmd); } catch (e) {} flash("명령어를 복사했습니다"); }}>복사</Btn>
                  </div>
                </div>
                {/* 로컬 파일(로그인 상태 저장 여부)은 웹이 알 수 없다 — 상태로 표시하지 않고 동작만 설명한다 */}
                <div className="space-y-1 text-xs text-slate-500">
                  <div>· <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-600">Node.js</a> 18 이상이 설치되어 있어야 합니다</div>
                  <div>· 첫 실행 시 <span className="text-slate-500">Chromium</span>을 자동으로 내려받습니다 (최초 1회 · 2~3분)</div>
                  <div>· 이전 녹화에서 로그인했다면 그 상태로 열립니다. 처음이면 브라우저에서 직접 로그인하세요.</div>
                  <div>· 브라우저 툴바에서 <span className="text-slate-500">요소를 클릭</span>하면 검증 스텝을 추가할 수 있습니다.</div>
                </div>
                <Btn className="w-full" onClick={cancel}>세션 취소</Btn>
              </>
            )}
          </Card>
        </div>

        <div className="col-span-7">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-800">캡처 결과 {steps.length > 0 && <span className="text-xs font-normal text-slate-500">스텝 {steps.length}개</span>}</span>
              <Badge kind="draft">초안</Badge>
            </div>
            {steps.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-slate-500">
                {phase === "waiting" ? (
                  <>
                    <div className="mb-1 flex items-center justify-center gap-2 text-slate-500"><RefreshCw size={14} className="animate-spin text-sky-600" />CLI 연결을 기다리는 중…</div>
                    <div className="text-xs text-slate-500">터미널에서 위 명령어를 실행하세요.</div>
                  </>
                ) : phase === "recording" ? (
                  <>
                    <div className="mb-1 flex items-center justify-center gap-2 text-red-700"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />브라우저에서 녹화 중…</div>
                    <div className="text-xs text-slate-500">조작을 마치고 <span className="text-slate-500">브라우저 창을 닫으면</span> 스텝이 여기에 도착합니다.</div>
                    <button onClick={simulate} className="mt-4 text-xs text-slate-500 underline decoration-dotted hover:text-slate-500">＊ 데모 — 캡처 결과 수신 시뮬레이션</button>
                  </>
                ) : "녹화 세션을 시작하세요."}
              </div>
            ) : (
              <div className="space-y-1 p-3">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">{i + 1}</span>
                    {s.act === "코드 스텝" ? (
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-1.5"><span className="font-medium text-sky-600">코드 스텝</span><Badge kind="warn">파싱 불가 · 원본 보존</Badge></div>
                        <pre className="overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-sky-700">{s.code}</pre>
                      </div>
                    ) : (
                      <>
                        <span className={"w-20 shrink-0 font-medium " + (s.act.includes("검증") ? "text-amber-700" : "text-slate-800")}>{s.act}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-slate-500">{s.loc}</span>
                        <span className="shrink-0 text-slate-700">{s.val !== "-" ? s.val : ""}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* 스위트·TC명은 녹화 결과를 보고 정한다. 이후 스텝 다듬기·태그·검증은 에디터에서. */}
            {steps.length > 0 && (
              <div className="flex items-end gap-3 border-t border-slate-200 px-4 py-3">
                <div className="w-44 shrink-0"><Field label="스위트"><Select value={suite} onChange={(e) => setSuite(e.target.value)}>{fqaSuites.map((x) => <option key={x.id}>{x.name}</option>)}</Select></Field></div>
                <div className="min-w-0 flex-1"><Field label="TC 이름"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 로그인 정상 동작" /></Field></div>
                <Btn icon={Video} onClick={startSession}>다시 녹화</Btn>
                <Btn kind="primary" icon={Code2} onClick={openInEditor}>에디터에서 다듬기</Btn>
              </div>
            )}
          </Card>
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}


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
const VER_FIELDS = [["name", "이름"], ["suite", "스위트"], ["tags", "태그"], ["dataset", "데이터셋"], ["preCase", "전제조건 케이스"], ["acctRole", "실행 계정 역할"], ["level", "관리 수준"]];
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

export function FqaApiImportScreen({ onDone }) {
  const { addFqaCase, fqaSuites, fqaCases } = useApp();
  const [msg, flash] = useToast();
  const apiSuites = fqaSuites || [];
  const [suite, setSuite] = useState((apiSuites[0] && apiSuites[0].name) || "API 연동");
  /* 임포트 단위로 공통인 태그(대개 regression)를 여기서 한 번에 건다.
     엔드포인트마다 갈리는 태그(smoke·critical)는 목록의 일괄 태그 지정에서 조정한다 —
     이 화면이 케이스 에디터를 흉내내기 시작하면 끝이 없다. */
  const [tags, setTags] = useState("");
  const [src, setSrc] = useState("OpenAPI 파일"); // OpenAPI 파일 | OpenAPI URL | cURL | HAR
  const [curlText, setCurlText] = useState("");
  const [specUrl, setSpecUrl] = useState("");   // 비워 둔다 — 예시는 placeholder로
  const [phase, setPhase] = useState("idle");
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const secretTotal = rows.reduce((n, r) => n + (r.secrets || 0), 0);
  // 소스 전환 시 결과 초기화
  const switchSrc = (v) => { setSrc(v); setRows([]); setPicked(new Set()); setErr(""); setFileName(""); setPhase("idle"); };
  const setResult = (parsed, name) => {
    const keyed = parsed.map((r, i) => ({ ...r, _k: i }));
    setErr(keyed.length ? "" : "요청을 찾지 못했습니다 — 내용을 확인하세요."); setRows(keyed); setPicked(new Set()); if (name != null) setFileName(name); setPhase("done");
  };
  const onFile = (file) => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      let obj;
      try { obj = JSON.parse(rd.result); }
      catch (e) { setErr("JSON 파싱 실패 — " + (src === "HAR" ? ".har 파일" : "openapi.json") + "을 올리세요."); setRows([]); setFileName(file.name); setPhase("done"); return; }
      // 파일 소스: HAR 또는 OpenAPI 파일
      if (src === "HAR") {
        if (!(obj.log && obj.log.entries)) { setErr("HAR 형식이 아닙니다 (log.entries 없음)."); setRows([]); setFileName(file.name); setPhase("done"); return; }
        setResult(parseHar(obj), file.name);
      } else {
        if (!detectSpec(obj)) { setErr("OpenAPI 형식이 아닙니다 (openapi/swagger 키 없음)."); setRows([]); setFileName(file.name); setPhase("done"); return; }
        setResult(parseOpenApi(obj), file.name);
      }
    };
    rd.readAsText(file);
  };
  // 샘플로 시연 — 소스별 샘플 데이터로 결과를 채운다(모든 탭 공통 보조 링크)
  const loadSample = () => { setPhase("running"); setErr(""); setFileName("샘플"); setTimeout(() => { setResult(src === "cURL" ? parseCurl(SAMPLE_CURL) : src === "HAR" ? parseHar(SAMPLE_HAR) : parseOpenApi(SAMPLE_OPENAPI), "샘플"); }, 400); };
  // OpenAPI URL — 실제로는 서버가 가져온다(브라우저 직접 fetch는 CORS 제한). 여기선 URL 검증만.
  const loadUrl = () => { if (!specUrl.trim()) { setErr("스펙 URL을 입력하세요 (또는 아래 '샘플로 시연')"); return; } setPhase("running"); setErr(""); setTimeout(() => setResult(parseOpenApi(SAMPLE_OPENAPI), specUrl), 500); };
  const runCurl = () => { if (!curlText.trim()) { setErr("cURL을 붙여넣으세요 (또는 아래 '샘플로 시연')"); return; } const r = parseCurl(curlText); if (!r.length) { setErr("cURL을 인식하지 못했습니다 — 'curl '로 시작해야 합니다."); setRows([]); setPhase("done"); return; } setResult(r); };
  const toggle = (k) => setPicked((pv) => { const n = new Set(pv); n.has(k) ? n.delete(k) : n.add(k); return n; });
  // 다건 임포트 → 목록에 '초안'으로 쌓는다. 각 케이스는 목록에서 에디터로 열어 보강한다.
  const commit = () => { if (!picked.size) { flash("요청을 선택하세요"); return; } const sel = rows.filter((r) => picked.has(r._k)); sel.forEach((ep, i) => addFqaCase({ id: nextTcId(fqaCases, i), origin: "API 임포트", name: ep.name, suite, tags, status: "초안", level: "Low-Code", dataset: "-", steps: apiSteps(ep) })); if (onDone) onDone(sel.length + "건 API 케이스 초안 등록 · 목록에서 에디터로 보강하세요"); };
  return (
    <>
      <Hdr icon={FileText} title="API 임포트" badge="API" desc="OpenAPI · cURL · HAR → 요청·검증 케이스 골격" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 space-y-4">
          <Card className="p-4 space-y-3">
            {/* 각 탭은 '실제 액션 하나' + 공통 '샘플로 시연' 링크. 실 개발 시 링크만 지우면 된다. */}
            <Seg options={["OpenAPI 파일", "OpenAPI URL", "cURL", "HAR"]} value={src} onChange={switchSrc} />
            {src === "cURL" ? (
              <>
                <Field label="cURL 붙여넣기" hint="개발자도구 · Postman에서 'Copy as cURL'"><textarea value={curlText} onChange={(e) => setCurlText(e.target.value)} rows={6} placeholder={SAMPLE_CURL} className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" /></Field>
                <Btn kind="primary" icon={RefreshCw} className="w-full" onClick={runCurl}>요청 분석</Btn>
              </>
            ) : src === "OpenAPI URL" ? (
              <>
                <Field label="스펙 URL" hint="대개 /openapi.json · /swagger.json 로 노출"><Input value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} placeholder="https://api.example.com/openapi.json" /></Field>
                <Btn kind="primary" icon={RefreshCw} className="w-full" onClick={loadUrl}>{phase === "running" ? "불러오는 중…" : "스펙 불러오기"}</Btn>
                <div className="text-xs text-slate-500">서버가 URL을 가져와 파싱합니다.</div>
              </>
            ) : (
              <>
                <label className={"flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-7 text-center hover:bg-slate-100 " + (err ? "border-red-300 bg-red-50 hover:border-red-400" : "border-slate-300 bg-white hover:border-sky-600")}>
                  <Upload size={20} className={err ? "text-red-600" : "text-sky-600"} />
                  <span className="text-sm text-slate-700">{err ? "다른 파일 선택" : (src === "HAR" ? "HAR 파일 선택" : "스펙 파일 선택")}</span>
                  <span className="text-xs text-slate-500">{src === "HAR" ? "network export · .har" : "openapi.json · swagger.json"}</span>
                  <input type="file" accept={src === "HAR" ? ".har,.json" : ".json,.yaml,.yml"} className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; onFile(f); }} />
                </label>
                {fileName && fileName !== "샘플" && !err && phase === "done" && <div className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 size={13} />{fileName} · {rows.length}개 감지</div>}
              </>
            )}
            {/* 모든 탭 공통 보조 링크 — 입력 없이 동작을 확인. 실 개발 시 이 줄만 제거. */}
            <div className="text-center"><button type="button" onClick={loadSample} className="text-xs text-slate-500 underline decoration-dotted hover:text-sky-600">샘플 {src.replace("OpenAPI ", "")}로 시연</button></div>
            <Field label="등록 스위트"><Select value={suite} onChange={(e) => setSuite(e.target.value)}>{apiSuites.map((x) => <option key={x.id}>{x.name}</option>)}{apiSuites.length === 0 && <option>API 연동</option>}</Select></Field>
            <Field label="태그" hint="선택한 요청 전부에 동일하게 붙습니다. 케이스별 조정은 목록에서 합니다."><TagPicker value={tags} onChange={setTags} /></Field>
            {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{err}</div>}
            <div className="text-xs text-slate-500">요청+상태 검증 골격을 만듭니다. 본문·검증은 에디터에서 보강합니다.{(src === "cURL" || src === "HAR") && <span className="text-amber-700"> 인증·비밀번호는 <span className="font-mono">${"{…}"}</span>로 마스킹됩니다.</span>}</div>
          </Card>
        </div>
        <div className="col-span-7">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800">감지된 요청{rows.length > 0 && <Badge kind="info">{src.startsWith("OpenAPI") ? "OpenAPI" : src}</Badge>}{fileName === "샘플" && rows.length > 0 && <Badge kind="draft">샘플</Badge>}{secretTotal > 0 && <Badge kind="warn">🔒 시크릿 {secretTotal} 마스킹</Badge>}</div>{phase === "done" && rows.length > 0 && <span className="text-xs text-slate-500">{rows.length}개 · 선택 {picked.size}</span>}</div>
            {phase !== "done" || rows.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-slate-500">{phase === "running" ? "분석하는 중…" : src === "cURL" ? "cURL을 붙여넣고 \"요청 분석\"을 누르세요" : src === "OpenAPI URL" ? "스펙 URL을 확인하고 \"스펙 불러오기\"를 누르세요" : src === "HAR" ? "HAR 파일을 선택하세요" : "스펙 파일을 선택하세요"}</div>
            ) : (
              <>
                <div className="border-b border-slate-200 bg-white px-4 py-2"><button onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r._k)))} className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">{picked.size === rows.length ? "전체 해제" : "전체 선택"}</button></div>
                <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                  {rows.map((r) => { const k = r._k; return (
                    <div key={k} onClick={() => toggle(k)} className="flex cursor-pointer items-center gap-3 border-b border-slate-200 px-4 py-2.5 hover:bg-slate-100">
                      <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} className="accent-sky-600" />
                      <Badge kind={M_K[r.m] || "info"}>{r.m}</Badge>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{r.path}</span>
                      {/* OpenAPI는 summary가 유용, cURL/HAR은 이름이 'M path'라 중복 → 생략 */}
                      {r.name && r.name !== r.m + " " + r.path && <span className="truncate text-sm text-slate-700" style={{ maxWidth: 140 }}>{r.name}</span>}
                      <span className="shrink-0 text-xs text-slate-500">{r.asrt}</span>
                    </div>
                  ); })}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3"><Btn kind="primary" icon={Plus} disabled={!picked.size} onClick={commit}>초안으로 등록</Btn></div>
              </>
            )}
          </Card>
          <div className="mt-2 text-xs text-slate-500">선택한 엔드포인트가 <span className="text-slate-700">초안</span> 케이스로 등록됩니다. 목록에서 에디터로 열어 요청 본문·검증을 채운 뒤 검토·승인합니다.</div>
        </div>
      </div>
      <Toast msg={msg} />
    </>
  );
}
export function FqaEditorScreen({ entry = "Low-Code", tc, onDirty, onOpen }) {
  const { commitFqaCase, addFqaCase, fqaSuites, fqaCases, fqaRuns, fqaSystems, datasets, debugEnv, setDebugEnv, setNavGuard } = useApp();
  const [msg, flash] = useToast();
  const [status, setStatus] = useState(tc && tc.status ? tc.status : "검토중");
  const stEK = { "승인": "pass", "검토중": "warn", "초안": "draft" };
  const [qa, setQa] = useState(null);
  const [runRes, setRunRes] = useState(null);
  const ei = Math.max(0, LV.indexOf(entry));
  const [committed, setCommitted] = useState(ei);
  const [view, setView] = useState(entry);
  // 에디터는 언제나 케이스와 함께 열린다 — 스텝이 비어 있으면 비어 있는 채로(직접 작성)
  const initSteps = (tc && tc.steps) || [];
  const [steps, setSteps] = useState(initSteps);
  // Full-Code 코드는 케이스에 저장된다. 없으면 스텝에서 생성한 것을 초기값으로.
  const initCode = (tc && tc.code) || stepsToCode(initSteps, tc || {});
  const [code, setCode] = useState(initCode);
  const [suite, setSuite] = useState(tc ? tc.suite : ((fqaSuites[0] || {}).name || ""));
  const [name, setName] = useState((tc && tc.name) || "");
  const [tags, setTags] = useState((tc && tc.tags) || "");
  const [dataset, setDataset] = useState(tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "");
  const [acctRole, setAcctRole] = useState((tc && tc.acctRole) || "");
  const [preCase, setPreCase] = useState((tc && tc.preCase) || "");
  // 운영주의 — 운영 환경에서 실데이터를 변경/삭제하는 케이스. 태그와 별개 플래그.
  const [prodCaution, setProdCaution] = useState(!!(tc && tc.prodCaution));
  // 등록된 모든 환경의 계정 역할 (케이스는 역할만 고르고, 실제 계정은 실행 계획의 환경이 주입)
  const roleOpts = [...new Set((fqaSystems || []).flatMap((sy) => (sy.envs || []).flatMap((e) => (e.accts || []).map((a) => a.role))).filter(Boolean))];
  // 계정 변수 사용 여부 — Full-Code는 V['계정 ID'] 형태로 나타난다
  /* 스텝이 계정 변수를 직접 쓰는가 — 로그인 자체를 검증하는 케이스가 여기 해당한다.
     🔴 문자열 검사라 변수 이름 규칙에 기능이 매달려 있다. 전제조건 로그인을 쓰는 케이스는 이 검사에 안 걸리므로
     실 구현에서는 값을 구조({ref:"acct"})로 저장해 이름과 무관하게 판별해야 한다. */
  const usesAcct = steps.some((s) => /\$\{계정/.test((s.val || "") + (s.loc || "") + (s.code || ""))) || /계정 (ID|비밀번호)/.test(code || "");
  /* 전제조건 후보 = 승인된 다른 케이스. 별도 '로그인 프로필' 엔티티를 두지 않는다 —
     로그인도 케이스이므로 레코딩·리비전·디버그 실행·승인 워크플로가 그대로 따라온다.
     🔑 전제조건을 가진 케이스는 후보에서 뺀다 — 중첩을 허용하면 순환이 생긴다(1단계만). */
  const preOpts = (fqaCases || []).filter((c) => c.id !== (tc && tc.id) && c.status === "승인" && !c.preCase
    // Full-Code 제외 — 전제조건은 globalSetup에서 도는 함수여야 하는데 사용자 코드는 test()로 감싸여 있어 벗길 수 없다
    && c.level !== "Full-Code"
    // 데이터셋 제외 — 행마다 로그인한다는 뜻이 되어 성립하지 않는다
    && (!c.dataset || c.dataset === "-"));
  const [dragIdx, setDragIdx] = useState(null);
  const [codeOpen, setCodeOpen] = useState({});
  const toggleCode = (i) => setCodeOpen((m) => ({ ...m, [i]: !m[i] }));
  const reorder = (from, to) => { setSteps((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m); return arr; }); setCodeOpen({}); };
  const vi = LV.indexOf(view);
  const [snap, setSnap] = useState(() => JSON.stringify({ steps: initSteps, code: initCode, committed: ei, suite: tc ? tc.suite : ((fqaSuites[0] || {}).name || ""), name: (tc && tc.name) || "", tags: (tc && tc.tags) || "", dataset: tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "", acctRole: (tc && tc.acctRole) || "", preCase: (tc && tc.preCase) || "", prodCaution: !!(tc && tc.prodCaution) }));
  const dirty = snap !== JSON.stringify({ steps, code, committed, suite, name, tags, dataset, acctRole, preCase, prodCaution });
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const versions = (tc && tc.versions) || [];
  const curRev = (tc && tc.rev) || 1;
  /* 내가 편집을 시작한 리비전 — 저장 시 낙관적 잠금의 기준.
     그 사이 다른 사람이 저장했으면 rev가 어긋나므로 덮어쓰기를 막는다. 저장에 성공하면 갱신된다. */
  const baseRev = useRef(curRev);
  const [verSel, setVerSel] = useState(versions[1] ? versions[1].rev : (versions[0] ? versions[0].rev : null));
  const verObj = versions.find((v) => v.rev === verSel) || null;
  // 비교 대상 = 저장된 현재 리비전 (편집 중 내용이 아니라 커밋된 것끼리 비교한다)
  const headObj = versions.find((v) => v.rev === curRev) || null;
  const selDs = (datasets || []).find((d) => d.name === dataset);
  const dsCols = selDs ? selDs.columns : [];
  /* row 변수 참조 — Low-Code는 스텝에서, Full-Code는 코드에서 찾는다.
     코드가 rows를 도는데 데이터셋이 없으면 rows=[] → 테스트가 0개 생성된다(실패도 통과도 아닌 무동작). */
  const rowSrc = committed === 1 ? (code || "") : steps.map((s) => (s.val || "") + " " + (s.loc || "") + " " + (s.code || "")).join(" ");
  const usedRowVars = [...new Set((rowSrc.match(/\$\{row\.([a-zA-Z0-9_]+)\}|\brow\.([a-zA-Z0-9_]+)/g) || []).map((x) => x.replace(/^\$\{row\.|\}$|^row\./g, "")))];
  const usesRows = usedRowVars.length > 0 || /\bof\s+rows\b/.test(rowSrc);
  const missingDsCols = dataset ? usedRowVars.filter((v) => !dsCols.includes(v)) : [];
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty]);
  const editable = vi === committed;
  const readonly = vi < committed;
  /* 코드 생성의 입력은 '편집 중인 케이스'다 — 저장된 tc를 쓰면 미저장 이름·데이터셋이 코드에서 빠진다.
     ※ 실 구현에서는 생성기를 서버가 소유한다(프론트·서버 이중 구현은 반드시 어긋난다). */
  const asCase = () => ({ ...(tc || {}), name: name.trim() || (tc && tc.name) || "", dataset: dataset || "-" });
  const preview = () => stepsToCode(steps, asCase());
  /* 🔑 이 케이스를 전제조건으로 쓰는 케이스들 — 그러면 생성기가 두 형태를 내야 한다.
     케이스로 실행: test(...)  /  전제조건으로 실행: globalSetup에서 도는 async 함수.
     스텝 본문은 같고 껍데기만 다르다. 통으로 test()를 만들면 전제조건으로 못 쓴다(F1). */
  const usedAsPre = (fqaCases || []).filter((c) => c.preCase === (tc && tc.id));
  const preForm = () => {
    const body = stepsToCode(steps, asCase()).split("\n").filter((l) => /^\s{2}/.test(l)).map((l) => l.slice(2)).join("\n");
    return "// globalSetup — 역할·슬롯 조합마다 1회\nexport async function setup(page, V) {\n" + body + "\n}";
  };
  const descend = () => {
    if (!window.confirm("Full-Code로 변환하면 스텝 편집은 읽기 전용이 되고, 되돌릴 수 없습니다.\n(변경 이력에서 이전 리비전으로 복원하는 방법만 남습니다)\n\n변환할까요?")) return;
    setCode(preview()); setCommitted(1); setView("Full-Code");
    flash("Full-Code로 변환됨 — 이제 코드가 관리 기준입니다");
  };

  /* ── 디버그 실행 ──
     케이스는 환경을 모른다. 그래서 디버그용 환경을 여기서 고른다 —
     이 선택은 케이스에 저장되지 않고 세션에만 남는다(실행 계획의 targetRef와 무관).
     편집 중인 내용을 그대로 돌리며, 실행 이력·품질 게이트에는 집계되지 않는다. */
  // 접점은 편집 중인 내용에서 파생 (Full-Code면 코드에서 추정)
  const surf = surfacesOf({ steps, code: committed === 1 ? code : "" });
  const isFull = committed === 1;
  /* 저장·실행을 막는 오류 —
       Low-Code : 스텝 자체의 결함
       공통     : 데이터셋 불일치 (없는 컬럼 참조 / rows를 쓰는데 데이터셋 없음) */
  const errs = [
    ...(isFull ? [] : stepErrors(steps)),
    ...missingDsCols.map((c) => "데이터셋 '" + dataset + "'에 '" + c + "' 컬럼이 없습니다"),
    ...(usesRows && !dataset ? ["데이터셋이 없는데 " + (isFull ? "코드가 rows를 참조합니다" : "스텝이 ${row.…}를 참조합니다") + " — 실행해도 0건이 됩니다"] : []),
  ];
  const saveErr = errs.length ? errs[0] : "";
  // 케이스의 접점을 감당하는 환경만 — API 스텝이 있는데 apiUrl이 없으면 반드시 실패한다
  const dbgOpts = envOpts(fqaSystems).filter((o) => envCovers(o, surf));
  const dbg = dbgOpts.find((o) => refKey(o) === refKey(debugEnv)) || dbgOpts[0] || null;
  const dbgEnvRec = (() => { const sy = (fqaSystems || []).find((s) => s.id === (dbg || {}).systemId); return sy ? (sy.envs || []).find((e) => e.env === dbg.env) : null; })();
  const dbgAccts = (dbgEnvRec && dbgEnvRec.accts) || [];
  const acctOk = !usesAcct || (acctRole ? dbgAccts.some((a) => a.role === acctRole) : dbgAccts.length > 0);
  // 디버그 실행 고유 오류 — 환경·계정. 스텝/데이터셋 오류(errs)는 하단 패널이 전담하므로 여기서 문구로 반복하지 않는다.
  const envErr =
    !dbg ? "이 케이스의 접점(" + surf + ")에 맞는 대상·환경이 없습니다"
    : !acctOk ? (acctRole ? "이 환경에 '" + acctRole + "' 역할의 계정이 없습니다" : "이 환경의 계정 풀이 비어 있습니다")
    : (!isFull && steps.length === 0) ? "스텝이 없습니다"
    : "";
  const runBlocked = !!envErr || errs.length > 0;   // 실행 차단 = 환경 문제 또는 스텝/데이터셋 오류
  const runOne = () => {
    if (runBlocked) return;
    setRunRes(null); setQa("run");
    const last = tc ? lastOf(fqaRuns, tc.id) : "-";
    setTimeout(() => setRunRes(isFull ? simCode(code, last) : simRun(steps, tc, last)), 900);
  };

  /* Low-Code는 스텝이 진실 — code를 저장하면 스텝과 어긋난 낡은 코드가 DB에 남는다(실행 시 서버가 스텝에서 생성한다).
     Full-Code는 code가 진실 — 스텝은 참고용으로 그대로 둔다(변환 시점의 흔적). */
  // origin(생성 경로)은 최초 생성 때 정해지고 이후 바뀌지 않는다 — 편집·변환·복제와 무관한 '출생' 정보
  const body = () => ({ steps, code: isFull ? code : "", level: LV[committed], suite, name: name.trim(), tags, dataset: dataset || "-", preCase, acctRole: (preCase || usesAcct) ? acctRole : "", prodCaution, origin: (tc && tc.origin) || "직접 작성" });
  /* 저장 = 새 리비전 INSERT. baseRev로 낙관적 잠금 — 그 사이 남이 저장했으면 거부한다. */
  /* 충돌 후 탈출구 — 최신본을 다시 읽어 편집 상태를 갈아끼운다.
     이게 없으면 baseRev가 낡은 채로 남아 다시 저장해도 또 충돌한다(영원히 저장 불가). */
  const reload = () => {
    const c = tc || {};
    setSteps(c.steps || []); setCode(c.code || ""); setCommitted(Math.max(0, LV.indexOf(c.level)));
    setView(c.level || "Low-Code"); setName(c.name || ""); setTags(c.tags || ""); setSuite(c.suite || "");
    setDataset(c.dataset && c.dataset !== "-" ? c.dataset : ""); setAcctRole(c.acctRole || ""); setPreCase(c.preCase || ""); setProdCaution(!!c.prodCaution);
    setStatus(c.status || "검토중");
    baseRev.current = c.rev || 1;
    setSnap(JSON.stringify({ steps: c.steps || [], code: c.code || "", committed: Math.max(0, LV.indexOf(c.level)), suite: c.suite || "", name: c.name || "", tags: c.tags || "", dataset: c.dataset && c.dataset !== "-" ? c.dataset : "", acctRole: c.acctRole || "", preCase: c.preCase || "", prodCaution: !!c.prodCaution }));
    flash("rev " + (c.rev || 1) + " 최신본을 불러왔습니다");
  };
  /* 저장하면 상태는 검토중으로 수렴한다 — 내용이 바뀌었으니 다시 검토 대상이 된다.
       초안  → 검토중 (작성 완료, 검토 요청)
       검토중 → 검토중 (유지)
       승인  → 검토중 (승인 해제 · 재검토 필요)
     API 임포트의 '초안'은 편집 없이 대량 생성된 골격 — 에디터에서 저장할 때 비로소 검토중이 된다. */
  const save = () => {
    if (!name.trim()) { flash("TC 이름을 입력하세요"); return false; }
    if (saveErr) { flash(saveErr); return false; }
    const wasApproved = status === "승인";
    // 아직 목록에 없는 케이스(직접 작성)면 첫 저장 = 생성 → 검토중
    if (!fqaCases.some((c) => c.id === tc.id)) {
      addFqaCase({ id: tc.id, ...body(), status: "검토중" });
      baseRev.current = 1; setStatus("검토중");
      setSnap(JSON.stringify({ steps, code, committed, suite, name, tags, dataset, acctRole, preCase, prodCaution }));
      flash("검토중으로 저장됨");
      return true;
    }
    const ok = commitFqaCase(tc.id, { ...body(), status: "검토중" }, { baseRev: baseRev.current });
    if (!ok) {
      // 내 편집을 덮어쓰지 않는다 — 최신을 불러올지(내 변경 폐기) 사용자가 정한다
      if (window.confirm("다른 사람이 이 케이스를 수정했습니다 (rev " + baseRev.current + " → rev " + curRev + ").\n\n최신본을 불러올까요?\n지금 편집 중인 내용은 사라집니다. (취소하면 변경 이력에서 차이를 확인할 수 있습니다)")) reload();
      else setQa("ver");
      return false;
    }
    baseRev.current = curRev + 1;
    setStatus("검토중");
    setSnap(JSON.stringify({ steps, code, committed, suite, name, tags, dataset, acctRole, preCase, prodCaution }));
    flash(wasApproved ? "rev " + (curRev + 1) + " 저장 · 승인 해제(검토중)" : "rev " + (curRev + 1) + " 검토중으로 저장");
    return true;
  };
  /* 복제 — 사본은 '지금 편집 중인 내용'을 받는다. 원본에 미저장 변경이 있으면 먼저 저장한다. */
  const duplicate = () => {
    if (dirty) {
      if (!window.confirm("저장하지 않은 변경이 있습니다.\n원본을 저장하고 사본을 열까요?")) return;
      if (!save()) return;
    }
    const nid = nextTcId(fqaCases);
    const copy = { id: nid, ...body(), name: name + " (사본)", status: "검토중" };
    addFqaCase(copy);
    if (onOpen) { onOpen({ ...copy, rev: 1 }); flash(nid + " 사본을 열었습니다"); }
    else flash(nid + " 사본 생성 · 목록에 추가");
  };
  return (
    <div className="space-y-4">
      <Hdr icon={Code2} title="테스트케이스 에디터" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">태그</div>
            <TagPicker value={tags} onChange={setTags} />
            <div className="mt-1.5 text-xs text-slate-500">실행 계획이 태그로 대상을 고릅니다.</div>
          </Card>
          {/* 운영주의 — 태그와 별개 플래그. 운영 환경 실행 시 경고(막지 않고 알린다). */}
          <Card className="p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={prodCaution} onChange={(e) => setProdCaution(e.target.checked)} className="accent-amber-500" />
              <span className="text-sm text-slate-800">운영주의</span>
            </label>
            <div className="mt-1.5 text-xs text-slate-500">데이터 변경/삭제 — 운영 환경 테스트 시 주의</div>
          </Card>
          {/* 🔑 전제조건 — 로그인은 대부분의 케이스에서 '검증 대상'이 아니라 '들어가기 위한 절차'다.
              스텝으로 넣으면 케이스마다 같은 다섯 줄이 복사되고, 워커마다 로그인해서 계정이 충돌한다(F4).
              별도 '로그인 프로필' 엔티티를 만들지 않고 케이스를 그대로 가리킨다 —
              그래야 레코딩·리비전·디버그 실행·승인 워크플로가 공짜로 따라오고, 로그인 자체도 테스트 대상이 된다.
              로그인을 검증하는 케이스(TC-0031)는 '없음'으로 두고 스텝으로 직접 쓴다. */}
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">전제조건</div>
            <Select value={preCase} onChange={(e) => setPreCase(e.target.value)}>
              <option value="">없음 (비로그인 흐름 · 로그인 자체 검증)</option>
              {preOpts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}
            </Select>
            {(preCase || usesAcct) && (
              <div className="mt-2">
                <Select value={acctRole} onChange={(e) => setAcctRole(e.target.value)}>
                  <option value="">기본 (풀의 첫 계정)</option>
                  {roleOpts.map((r) => <option key={r}>{r}</option>)}
                </Select>
                <div className="mt-1.5 text-xs text-slate-500">
                  {preCase
                    ? <>이 역할의 계정으로 <span className="font-mono text-sky-600">{preCase}</span>을 먼저 수행한 세션에서 시작합니다. 스텝에 로그인을 쓰지 않습니다.<br />전제조건 수행은 <span className="text-slate-500">집계에 세지 않습니다</span> — 실패하면 이 케이스가 <span className="text-slate-500">전제조건 실패</span>로 기록됩니다.</>
                    : <>스텝이 계정 변수를 사용합니다 — 이 역할의 계정이 <span className="font-mono text-sky-600">{"${계정 ID}"}</span>·<span className="font-mono text-sky-600">{"${계정 비밀번호}"}</span>에 주입됩니다.</>}
                </div>
              </div>
            )}
            {/* 승인된 케이스만 후보다 — 초안을 전제로 쓰면 실행이 불안정해진다.
                전제조건 케이스를 수정하면 승인이 풀리므로 이 케이스도 실행이 막힌다(F9). 그게 의도다. */}
            <div className="mt-1.5 text-xs text-slate-500">승인된 Low-Code 케이스만 고를 수 있습니다.</div>
            {preOpts.length === 0 && <div className="mt-1 text-xs text-amber-600">해당하는 케이스가 없습니다.</div>}
          </Card>
          {/* 케이스가 행마다 반복 실행된다 — 부하용 대량 데이터셋(NQA 몫)은 고를 수 없다 */}
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">데이터셋 (데이터 드리븐)</div>
            <DatasetPicker value={dataset} onChange={setDataset} noneLabel="없음 (단일 실행)" maxRows={DS_MAX_ROWS} />
            {selDs && <div className="mt-1.5 text-xs text-slate-500">컬럼 <span className="font-mono text-slate-700">{selDs.columns.join(", ")}</span> · <span className="font-mono text-sky-600">{"${row.컬럼}"}</span>로 참조 · <span className="text-amber-700">{(selDs.rowCount != null ? selDs.rowCount : selDs.rows.length).toLocaleString()}회 반복</span></div>}
          </Card>
          <Card className="p-3">
            <div className="space-y-1.5">
              <Btn className="w-full" icon={Copy} onClick={duplicate}>복제</Btn>
              <Btn className="w-full" icon={History} onClick={() => setQa("ver")}>변경 이력{versions.length > 0 && <span className="ml-1 text-slate-500">({versions.length})</span>}</Btn>
            </div>
          </Card>
        </div>
        <div className="col-span-9 space-y-3">
          {/* 케이스의 정체 — ID · 소속 스위트 · 이름 · 리비전 · 상태 */}
          <Card className="flex items-center gap-2 p-3">
            <span className="shrink-0 font-mono text-sm text-sky-600">{tc ? tc.id : ""}</span>
            <div className="shrink-0" style={{ width: 160 }}>
              <Select value={suite} onChange={(e) => setSuite(e.target.value)}>{fqaSuites.map((sx) => <option key={sx.id} value={sx.name}>{sx.name}</option>)}</Select>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="TC 이름" className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 outline-none hover:border-slate-300 focus:border-sky-500 focus:bg-slate-100" />
            {/* 관리 수준은 현재 committed 기준 — entry(진입 시점)로 표시하면 변환 후에도 옛 값이 남는다 */}
            <div className="flex shrink-0 items-center gap-2"><span className="font-mono text-xs text-slate-500">rev {curRev}</span><Badge kind={isFull ? "warn" : "active"}>{LV[committed]} 관리</Badge><Badge kind={stEK[status] || "warn"}>{status}</Badge></div>
          </Card>

          {/* 왼쪽: 관리 수준(Low-Code → Full-Code · 단방향) / 오른쪽: 디버그 실행.
              스텝·코드를 고치며 반복해서 누르는 자리라 편집기 바로 위에 둔다.
              디버그 환경은 케이스에 저장되지 않는다(실행 계획의 대상·환경과 무관). */}
          <div className="flex items-center gap-1.5">
            {LV.map((l, i) => {
              // Full-Code인데 스텝이 없으면(=직접 Full-Code로 작성) Low-Code 과거가 없다 — 탭을 잠근다.
              // eject된 케이스는 스텝이 남아 있어 읽기 전용으로 열람 가능.
              const off = i > committed || (i === 0 && committed === 1 && steps.length === 0);
              return (
              <Fragment key={l}>
                <button disabled={off} onClick={() => !off && setView(l)} className={"rounded-lg border px-3 py-1.5 text-xs " + (view === l ? "border-sky-500 bg-sky-100 text-sky-700" : !off ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200" : "border-slate-200 bg-white text-slate-500 cursor-not-allowed")}>
                  {l}
                </button>
                {i < LV.length - 1 && <ArrowRight size={14} className={i < committed ? "text-sky-600" : "text-slate-700"} />}
              </Fragment>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              {envErr && <span className="text-xs text-amber-700" title={envErr}>⚠ {envErr}</span>}
              <div style={{ width: 190 }}>
                <Select value={refKey(dbg)} onChange={(e) => { const o = dbgOpts.find((x) => refKey(x) === e.target.value); if (o) setDebugEnv({ systemId: o.systemId, env: o.env }); }}>
                  {dbgOpts.length === 0 && <option>맞는 환경 없음</option>}
                  {dbgOpts.map((o) => <option key={refKey(o)} value={refKey(o)}>{o.label}</option>)}
                </Select>
              </div>
              <Btn kind="primary" icon={Play} disabled={runBlocked} title={envErr || (errs.length ? "스텝 오류를 먼저 해결하세요" : "편집 중인 내용으로 이 환경에서 한 번 실행 — 실행 이력·품질 게이트에 집계되지 않습니다")} onClick={runOne}>디버그 실행</Btn>
            </div>
          </div>

          <Card className="overflow-hidden">
            {readonly && (
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-amber-700"><Lock size={13} />읽기 전용 — 이 케이스는 Full-Code로 관리됩니다. 되돌리려면 변경 이력에서 복원하세요.</div>
            )}

            {view === "Low-Code" && (
              <div>
                <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
                  <Badge kind={SURF_K[surfacesOf({ steps })] || "info"}>{surfacesOf({ steps })}</Badge>
                  <span className="ml-auto text-xs text-slate-500">경로는 <span className="font-mono text-slate-500">상대경로</span> — base URL은 실행 계획의 환경에서 주입</span>
                </div>
                <div>
                  {steps.length === 0 && <div className="px-3 py-10 text-center text-sm text-slate-500">스텝이 없습니다. 아래 <span className="text-sky-600">+ 스텝 추가</span>로 시작하세요.</div>}
                  {steps.map((s, i) => {
                    const setStep = (patch) => setSteps(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    const isCode = s.act === "코드 스텝";
                    const isReq = s.act === "요청";
                    const isResp = s.act === "응답 검증";
                    const isAssert = s.act === "화면 검증";
                    const reqSum = s.save ? "저장 " + s.save : s.body ? "본문 있음" : "";
                    return (
                    <div key={i} className={"border-b border-slate-200 " + (dragIdx === i ? "opacity-40" : "")}>
                      <div
                        onDragOver={editable ? (e) => e.preventDefault() : undefined}
                        onDrop={editable ? () => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); } : undefined}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm">
                        <span draggable={editable} onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)} className={editable ? "cursor-grab" : ""} title={editable ? "드래그로 순서 변경" : undefined}><GripVertical size={14} className={editable ? "text-slate-500" : "text-slate-800"} /></span>
                        <span className="w-4 text-xs text-slate-500">{i + 1}</span>
                        {editable ? (
                          <>
                            <select value={s.act} onChange={(e) => { const v = e.target.value; const init = v === "코드 스텝" ? { act: v, code: s.code || "await page.locator('').click();" } : v === "요청" ? { act: v, loc: reqJoin("GET", "") } : v === "응답 검증" ? { act: v, loc: "상태코드", val: "200" } : v === "화면 검증" ? { act: v, val: "visible = true" } : { act: v }; setStep(init); if (v === "코드 스텝") setCodeOpen((m) => ({ ...m, [i]: true })); }} className="w-32 shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500">{STEP_ACTS.map((a) => <option key={a}>{a}</option>)}</select>

                            {isCode && (
                              <button onClick={() => toggleCode(i)} className="flex flex-1 items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-left text-xs text-sky-600 hover:border-sky-500"><Code2 size={12} />{codeOpen[i] ? "코드 접기 ▲" : "코드 편집 ▼"}<span className="ml-1 truncate font-mono text-slate-500">{(s.code || "").split("\n")[0]}</span></button>
                            )}

                            {/* 요청 — 메서드는 고르고 경로만 적는다 */}
                            {isReq && (() => { const { m, path } = reqParts(s.loc); const bodyOk = hasBody(m); return (
                              <>
                                {/* 메서드를 본문 없는 것으로 바꾸면 남아 있던 본문을 버린다 — 저장돼 봐야 무시된다 */}
                                <select value={m} onChange={(e) => { const nm = e.target.value; setStep({ loc: reqJoin(nm, path), ...(hasBody(nm) ? {} : { body: "" }) }); }} className="w-20 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-sky-600 outline-none focus:border-sky-500">{REQ_METHODS.map((x) => <option key={x}>{x}</option>)}</select>
                                <input value={path} onChange={(e) => setStep({ loc: reqJoin(m, e.target.value) })} placeholder={LOC_PH["요청"]} className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                <button onClick={() => toggleCode(i)} className="flex w-36 shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-left text-xs text-sky-600 hover:border-sky-500"><Send size={12} />{(bodyOk ? "본문·헤더·저장 " : "헤더·저장 ") + (codeOpen[i] ? "▲" : "▼")}</button>
                              </>
                            ); })()}

                            {/* 응답 검증 — 대상(상태코드 | 본문 필드) × 조건(존재 | 값 일치) */}
                            {isResp && (() => { const st = isStatusTarget(s.loc); const cond = respCond(s.val); const raw = (String(s.val || "").match(/"([\s\S]*)"/) || [])[1] || ""; return (
                              <>
                                <select value={st ? "상태코드" : "본문 필드"} onChange={(e) => setStep(e.target.value === "상태코드" ? { loc: "상태코드", val: "200" } : { loc: "$.orderId", val: "존재" })} className="w-24 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>상태코드</option><option>본문 필드</option></select>
                                {st ? (
                                  <input type="number" value={s.val} onChange={(e) => setStep({ val: e.target.value })} placeholder="200" className="w-24 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" />
                                ) : (
                                  <>
                                    <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder="$.orderId" className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                    <select value={cond} onChange={(e) => setStep({ val: e.target.value === "존재" ? "존재" : '"' + raw + '"' })} className="w-20 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>존재</option><option>값 일치</option></select>
                                    {cond === "값 일치" && <input value={raw} onChange={(e) => setStep({ val: '"' + e.target.value + '"' })} placeholder="결제완료" className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />}
                                  </>
                                )}
                                {st && <span className="flex-1" />}
                              </>
                            ); })()}

                            {/* 화면 검증 — 검증 종류를 고른다. 값은 종류가 필요로 할 때만. */}
                            {isAssert && (() => { const pa = parseAssert(s.val); const def = assertDef(pa.k); return (
                              <>
                                <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder="[data-testid=welcome]" className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                <select value={pa.k} onChange={(e) => { const d = assertDef(e.target.value); setStep({ val: d.build(d.arg ? pa.arg : "") }); }} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-amber-700 outline-none focus:border-sky-500">{ASSERTS.map((a) => <option key={a.k}>{a.k}</option>)}</select>
                                {def.arg && <input type={def.arg === "num" ? "number" : "text"} value={pa.arg} onChange={(e) => setStep({ val: def.build(e.target.value) })} placeholder={def.ph} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />}
                              </>
                            ); })()}

                            {/* 그 밖 (이동·입력·클릭·선택·체크·키 누르기) */}
                            {!isCode && !isReq && !isResp && !isAssert && (
                              <>
                                <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder={LOC_PH[s.act] || "[data-testid=login-btn]"} className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                {s.act === "체크" ? (
                                  <select value={/해제/.test(s.val || "") ? "해제" : "체크"} onChange={(e) => setStep({ val: e.target.value })} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>체크</option><option>해제</option></select>
                                ) : (s.act === "클릭" || s.act === "이동") ? (
                                  <span className="w-28 shrink-0" />
                                ) : (
                                  <input value={s.val} onChange={(e) => setStep({ val: e.target.value })} placeholder={VAL_PH[s.act] || "값"} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />
                                )}
                              </>
                            )}
                            <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="shrink-0 text-slate-500 hover:text-red-600" title="스텝 삭제"><X size={13} /></button>
                          </>
                        ) : (
                          <>
                            <span className={"w-28 font-medium " + (isCode ? "text-sky-600" : s.act.includes("검증") ? "text-amber-700" : "text-slate-800")}>{s.act}</span>
                            {isCode ? <span className="flex-1 truncate font-mono text-xs text-slate-500">{(s.code || "").split("\n")[0]}</span> : <><span className="flex-1 font-mono text-xs text-slate-500">{s.loc}</span><span className="text-xs text-slate-500">{isReq ? reqSum : s.val}</span></>}
                          </>
                        )}
                      </div>
                      {isCode && (codeOpen[i] || !editable) && (
                        <div className="px-10 pb-2.5">
                          <textarea value={s.code || ""} onChange={(e) => setStep({ code: e.target.value })} readOnly={!editable} rows={4} placeholder="await page.getByTestId('x').click();" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-sky-700 outline-none focus:border-sky-500" />
                        </div>
                      )}
                      {isReq && (codeOpen[i] || !editable) && (
                        <div className="grid grid-cols-2 gap-3 px-10 pb-3">
                          {/* 본문은 POST·PUT·PATCH만 — GET/DELETE의 body는 서버가 무시한다 */}
                          {hasBody(reqParts(s.loc).m) && (
                            <div className="col-span-2">
                              <div className="mb-1 text-xs text-slate-500">요청 본문 (JSON)</div>
                              <textarea value={s.body || ""} onChange={(e) => setStep({ body: e.target.value })} readOnly={!editable} rows={3} placeholder={'{ "payment": "card" }'} className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-sky-700 outline-none focus:border-sky-500" />
                            </div>
                          )}
                          <div>
                            <div className="mb-1 text-xs text-slate-500">추가 헤더 (선택 · 한 줄에 하나)</div>
                            <textarea value={s.headers || ""} onChange={(e) => setStep({ headers: e.target.value })} readOnly={!editable} rows={2} placeholder="Idempotency-Key: ${주문키}" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                            <div className="mt-1 text-xs text-slate-500">인증 헤더는 환경에서 주입 — 여기 적지 않습니다.</div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-500">응답 저장 (스텝 간 전달)</div>
                            <input value={s.save || ""} onChange={(e) => setStep({ save: e.target.value })} readOnly={!editable} placeholder="orderId = $.orderId" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                            <div className="mt-1 text-xs text-slate-500">이후 스텝에서 <span className="font-mono text-sky-600">{"${orderId}"}</span>로 사용 · 쉼표로 여러 개 · 이름은 영문·숫자·_</div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
                {editable && (
                  <div className="flex items-center gap-3 border-t border-slate-200 px-3 py-2">
                    <button onClick={() => setSteps([...steps, steps.length === 0 ? { act: "이동", loc: "/", val: "-" } : { act: "클릭", loc: "", val: "-" }])} className="shrink-0 text-xs text-sky-600">+ 스텝 추가</button>
                    <span className="truncate text-xs text-slate-500">로케이터 {LOC_HINT}</span>
                  </div>
                )}
              </div>
            )}

            {view === "Full-Code" && (
              <div className="p-3">
                <div className="mb-2 text-xs text-slate-500">Playwright · TypeScript</div>
                <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={16} className={taCls} style={{ fontFamily: "monospace" }} />
              </div>
            )}
            {/* 전제조건으로 쓰이는 케이스는 생성기가 두 형태를 낸다 — 껍데기만 다르고 본문은 같다 */}
            {usedAsPre.length > 0 && view === "Low-Code" && (
              <div className="border-t border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge kind="active">전제조건으로 사용 {usedAsPre.length}건</Badge>
                  <span className="font-mono text-slate-500">{usedAsPre.slice(0, 4).map((c) => c.id).join(", ")}{usedAsPre.length > 4 && " 외 " + (usedAsPre.length - 4) + "건"}</span>
                </div>
                <div className="mb-1.5 text-slate-500" style={{ fontSize: 11 }}>같은 스텝이 <span className="text-slate-500">케이스용 <span className="font-mono">test(...)</span></span> 와 <span className="text-slate-500">전제조건용 <span className="font-mono">async 함수</span></span> 두 형태로 생성됩니다. 실행 시작 시 이 함수로 세션을 만들어 위 케이스들이 재사용합니다.</div>
                <pre className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-slate-500" style={{ fontSize: 11 }}>{preForm()}</pre>
              </div>
            )}

            {errs.length > 0 && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-2">
                {errs.slice(0, 5).map((e, i) => <div key={i} className="text-xs text-amber-700">⚠ {e}</div>)}
                {errs.length > 5 && <div className="text-xs text-amber-600">외 {errs.length - 5}건</div>}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              {committed < 1 && view === LV[committed] && (
                <Btn icon={ArrowRight} disabled={!!errs.length || steps.length === 0} onClick={descend}>Full-Code로 변환</Btn>
              )}
              {/* 저장하면 검토중으로 수렴 — 라벨이 결과를 말해준다 */}
              <Btn kind="primary" icon={Save} disabled={!dirty || !!saveErr} title={saveErr || undefined} onClick={save}>{dirty ? "검토중으로 저장" : "저장됨"}</Btn>
            </div>
          </Card>
        </div>
      </div>
      {qa && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setQa(null)}>
          <div className={"w-full rounded-xl border border-slate-200 bg-white shadow-xl " + (qa === "ver" ? "max-w-4xl" : "max-w-md")} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{qa === "run" ? "디버그 실행" : "변경 이력"} <span className="font-mono text-xs text-sky-600">{tc ? tc.id : ""}</span>{qa === "ver" && <span className="ml-2 text-xs font-normal text-slate-500">현재 rev {curRev}</span>}</h3><button onClick={() => setQa(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 p-5 text-sm">
              {qa === "ver" && (versions.length === 0 ? (
                <div className="text-xs text-slate-500">저장 이력이 없습니다 — 저장할 때마다 직전 리비전이 여기에 쌓입니다.</div>
              ) : (
                <div className="flex gap-3" style={{ height: 420 }}>
                  {/* 리비전 목록 */}
                  <div className="w-52 shrink-0 space-y-1.5 overflow-y-auto">
                    {versions.map((v, i) => (
                      <button key={v.rev} onClick={() => setVerSel(v.rev)} className={"w-full rounded-lg border px-2.5 py-2 text-left " + (verSel === v.rev ? SEL_CARD : "border-slate-200 bg-slate-50 hover:bg-white")}>
                        <div className="flex items-center gap-1.5 text-xs"><span className="font-mono text-sky-600">rev {v.rev}</span><Badge kind={v.level === "Full-Code" ? "warn" : "active"}>{v.level}</Badge>{v.rev === curRev && <span className="ml-auto text-xs text-slate-500">현재</span>}{i === versions.length - 1 && v.rev !== curRev && <span className="ml-auto text-xs text-slate-500">최초</span>}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{v.at}</div>
                        <div className="text-xs text-slate-500">{v.by}</div>
                      </button>
                    ))}
                  </div>
                  {/* 현재본과의 차이 */}
                  <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {!verObj || !headObj ? <div className="py-16 text-center text-xs text-slate-500">리비전을 선택하세요.</div> : verObj.rev === curRev ? (
                      <div className="py-16 text-center text-xs text-slate-500">현재 리비전입니다. 이전 리비전을 선택하면 차이가 표시됩니다.</div>
                    ) : (() => {
                      const fd = fieldDiff(verObj, headObj);
                      const sd = lcsDiff(verObj.steps || [], headObj.steps || [], stepKey).filter((d) => d.t !== "same");
                      const cd = lcsDiff((verObj.code || "").split("\n"), (headObj.code || "").split("\n"), (x) => x);
                      const cdChanged = cd.some((d) => d.t !== "same");
                      const none = fd.length === 0 && sd.length === 0 && !cdChanged;
                      return (
                        <div className="space-y-3">
                          <div className="text-xs text-slate-500">rev {verObj.rev} <ArrowRight size={11} className="inline text-slate-400" /> rev {curRev} <span className="text-slate-500">(현재)</span></div>
                          {none && <div className="py-12 text-center text-xs text-slate-500">이 리비전과 현재 내용이 같습니다.</div>}
                          {fd.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">속성</div>
                              <div className="space-y-1">
                                {fd.map((d) => (
                                  <div key={d.k} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs">
                                    <span className="w-20 shrink-0 text-slate-500">{d.label}</span>
                                    <span className="text-red-700 line-through">{d.from}</span>
                                    <ArrowRight size={11} className="shrink-0 text-slate-400" />
                                    <span className="text-emerald-700">{d.to}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {sd.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">스텝</div>
                              <div className="overflow-hidden rounded border border-slate-200">
                                {sd.map((d, i) => (
                                  <div key={i} className={"flex gap-2 px-2 py-1 font-mono text-xs " + DIFF_CLS[d.t]}><span className="w-3 shrink-0">{DIFF_MARK[d.t]}</span><span className="min-w-0 flex-1 truncate">{stepText(d.v)}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
                          {cdChanged && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">코드</div>
                              <div className="overflow-hidden rounded border border-slate-200">
                                {cd.map((d, i) => (
                                  <div key={i} className={"flex gap-2 px-2 py-0.5 font-mono text-xs " + DIFF_CLS[d.t]}><span className="w-3 shrink-0">{DIFF_MARK[d.t]}</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{d.v || " "}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
                          <Btn className="w-full" icon={History} onClick={() => { setSteps(verObj.steps || []); setCode(verObj.code || ""); setCommitted(Math.max(0, LV.indexOf(verObj.level))); setView(verObj.level || "Low-Code"); setName(verObj.name || name); setSuite(verObj.suite || suite); setTags(verObj.tags || ""); setDataset(verObj.dataset && verObj.dataset !== "-" ? verObj.dataset : ""); setAcctRole(verObj.acctRole || ""); setQa(null); flash("rev " + verObj.rev + " 내용으로 되돌림 — 저장하면 rev " + (curRev + 1) + "이 됩니다"); }}>이 리비전으로 되돌리기</Btn>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
              {qa === "run" && (runRes === null ? (
                <div className="flex items-center gap-2 text-slate-500"><RefreshCw size={14} className="text-sky-600" />실행 중…</div>
              ) : (
                <>
                  <div className="flex items-center gap-2"><Badge kind={runRes.verdict === "PASS" ? "pass" : "fail"}>{runRes.verdict}</Badge><span className="text-xs text-slate-500">{dbg ? dbg.label : ""}</span></div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    {runRes.steps.map((s, i) => (
                      <div key={i} className={"flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs last:border-0 " + (s.ok ? "" : "bg-red-50")}>{s.ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <XCircle size={13} className="text-red-600" />}<span className={"shrink-0 " + (s.ok ? "text-slate-700" : "text-red-700")}>{s.act}</span><span className="flex-1 truncate font-mono text-slate-500">{s.loc}</span></div>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500">＊ 목업 시뮬레이션</div>
                </>
              ))}
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}


/* ═══════════ 5. 테스트 스위트 관리 ═══════════ */
const SF0 = { name: "", desc: "" };
export function FqaSuiteScreen() {
  const [msg, flash] = useToast();
  const { fqaSuites: suites, addFqaSuite, updateFqaSuite, removeFqaSuite, fqaCases, updateFqaCase, setFqaEditTc, goto, setNavGuard } = useApp();
  const casesOf = (name) => fqaCases.filter((c) => c.suite === name);
  const tcOf = (name) => casesOf(name).length;
  const [sel, setSel] = useState(suites[0] ? suites[0].id : null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({});
  const stK = { "승인": "pass", "검토중": "warn", "초안": "draft" };
  const selSuite = suites.find((x) => x.id === sel) || suites[0] || null;
  const rows = selSuite ? casesOf(selSuite.name).filter((c) => !q || (c.id + " " + c.name + " " + (c.tags || "")).toLowerCase().includes(q.toLowerCase())) : [];
  const pick = (id) => { setSel(id); setDraft({}); };
  const nm = draft.name != null ? draft.name : (selSuite ? selSuite.name : "");
  const ds = draft.desc != null ? draft.desc : (selSuite ? (selSuite.desc || "") : "");
  const dirty = !!selSuite && (nm !== selSuite.name || ds !== (selSuite.desc || ""));
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const saveSuite = () => {
    const name = nm.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (name !== selSuite.name && suites.some((s) => s.id !== selSuite.id && s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    // 스위트 이름을 바꾸면 소속 케이스(c.suite)까지 함께 갱신 — 소속이 끊기지 않게
    if (name !== selSuite.name) casesOf(selSuite.name).forEach((c) => updateFqaCase(c.id, { suite: name }));
    updateFqaSuite(selSuite.id, { name, desc: ds }); setDraft({}); flash("스위트가 수정되었습니다");
  };
  // 혼합 여부는 소속 케이스의 스텝에서 파생 — 스위트는 platform을 갖지 않는다
  const mixOf = (name) => {
    const cs = fqaCases.filter((c) => c.suite === name);
    const has = (fn) => cs.some((c) => (c.steps || []).some(fn));
    const web = has((s) => surfaceOf(s.act) === "web");
    const api = has((s) => surfaceOf(s.act) === "api");
    return web && api ? "웹+API" : api ? "API" : web ? "웹" : "-";
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(SF0);
  const openAdd = () => { setForm(SF0); setOpen(true); };
  const save = () => {
    const name = form.name.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    const id = Date.now();
    addFqaSuite({ ...form, name, id }); setSel(id); setDraft({}); setOpen(false); flash("스위트가 추가되었습니다");
  };
  const del = (s) => {
    if (tcOf(s.name) > 0) { flash("사용 중인 스위트는 삭제 불가 (" + tcOf(s.name) + "건)"); return; }
    removeFqaSuite(s.id); setDraft({}); flash("삭제됨");
  };
  const mixK = { "웹+API": "active", "API": "warn", "웹": "info" };
  return (
    <div className="space-y-4">
      <PageToolbar desc="업무 흐름 묶음" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={openAdd}>스위트 추가</Btn>
          {suites.map((s) => (
            <Card key={s.id} className={"p-3 " + (selSuite && selSuite.id === s.id ? SEL_CARD : SEL_IDLE)}>
              <div className="cursor-pointer" onClick={() => pick(s.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-medium text-slate-800">{s.name}</div>{s.desc && <div className="truncate text-xs text-slate-500">{s.desc}</div>}</div>
                  <button onClick={(e) => { e.stopPropagation(); del(s); }} className="shrink-0 text-slate-500 hover:text-red-600"><X size={13} /></button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">{mixOf(s.name) !== "-" && <Badge kind={mixK[mixOf(s.name)] || "info"}>{mixOf(s.name)}</Badge>}<span className="text-xs text-slate-500">TC {tcOf(s.name)}</span></div>
              </div>
            </Card>
          ))}
          {suites.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">스위트가 없습니다.</div>}
        </div>
        <div className="col-span-9 space-y-4">
          {selSuite ? (
            <>
              <Card className="space-y-2.5 p-4">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><Input value={nm} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="스위트 이름" /></div>
                  {dirty && <span className="shrink-0 text-xs text-amber-700">미저장 변경</span>}
                  <Btn kind="primary" icon={Save} onClick={saveSuite} disabled={!dirty}>저장</Btn>
                </div>
                <Input value={ds} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="설명 (선택)" />
                <div className="flex items-center gap-2 text-xs text-slate-500">소속 <span className="font-semibold text-sky-600">{casesOf(selSuite.name).length}</span>건{mixOf(selSuite.name) !== "-" && <Badge kind={mixK[mixOf(selSuite.name)] || "info"}>{mixOf(selSuite.name)}</Badge>}</div>
              </Card>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <span className="shrink-0 text-sm font-semibold text-slate-800">포함 테스트케이스 <span className="text-xs font-normal text-slate-500">{casesOf(selSuite.name).length}건</span></span>
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5" style={{ maxWidth: 300 }}>
                    <Search size={14} className="text-slate-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TC·이름·태그 검색" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" />
                    {q && <span className="shrink-0 text-xs text-slate-500">{rows.length}</span>}
                  </div>
                </div>
                <div className="overflow-y-auto p-2" style={{ maxHeight: 520 }}>
                  {rows.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-100">
                      <span className="w-24 shrink-0 pt-0.5 font-mono text-sky-600">{c.id}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-slate-800">{c.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-slate-500">
                          {tagList(c.tags).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{t}</span>)}
                          <span>수정 {c.updatedBy || "—"} · {c.updatedAt || "—"}</span>
                        </div>
                      </div>
                      <Badge kind={SURF_K[surfacesOf(c)] || "info"}>{surfacesOf(c)}</Badge>
                      <Badge kind={stK[c.status] || "draft"}>{c.status}</Badge>
                      <button onClick={() => { setFqaEditTc(c.id); goto("fqa-cases"); }} className="shrink-0 pt-0.5 text-slate-500 hover:text-sky-600">편집</button>
                    </div>
                  ))}
                  {rows.length === 0 && <div className="py-10 text-center text-xs text-slate-500">{casesOf(selSuite.name).length === 0 ? "이 스위트에 포함된 테스트케이스가 없습니다." : "검색 결과가 없습니다."}</div>}
                </div>
              </Card>
            </>
          ) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              {suites.length === 0 ? (<>
                <Layers size={26} className="text-slate-400" />
                <div className="mt-3 text-sm font-medium text-slate-700">테스트 스위트를 먼저 만드세요</div>
                <div className="mt-1.5 max-w-md text-xs text-slate-500">스위트는 업무 흐름 단위로 케이스를 묶습니다. 실행 계획이 스위트를 골라 실행하므로, 케이스는 스위트에 속해야 실행됩니다.</div>
              </>) : <div className="text-xs text-slate-500">왼쪽에서 스위트를 선택하세요.</div>}
            </Card>
          )}
        </div>
      </div>

      {open && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">스위트 추가</h3><button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              <Field label="이름"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 결제 / 주문" /></Field>
              <Field label="설명 (선택)"><Input value={form.desc || ""} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="이 스위트가 검증하는 업무 흐름" /></Field>
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setOpen(false)}>취소</Btn><Btn kind="primary" icon={Save} onClick={save}>추가</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}

      <Toast msg={msg} />
    </div>
  );
}
/* ═══════════ 6. 실행 관리 ═══════════ */
const RUN_LOG = [
  { lv: "INFO", t: "FRUN-512 시작 · Chromium 1920×1080" },
  { lv: "TC", t: "TC-031 로그인 성공 확인" },
  { lv: "STEP", t: "fill [data-testid=username]" },
  { lv: "STEP", t: "click role=button[로그인]" },
  { lv: "PASS", t: "TC-031 PASS (0.7s)" },
  { lv: "TC", t: "TC-203 OTP 재발송" },
  { lv: "RETRY", t: "TC-203 1차 실패 → 재시도 (1/2)" },
  { lv: "PASS", t: "TC-203 PASS (재시도 후, 2.1s)" },
  { lv: "TC", t: "TC-156 쿠폰 적용" },
  { lv: "FAIL", t: "TC-156 상태 미반영 (8.4s)" },
  { lv: "ERROR", t: "TC-401 대상 응답 없음 · ECONNREFUSED (러너 오류)" },
];
export function FqaRunScreen({ nav }) {
  const { fqaRuns, addFqaRun, updateFqaRun, removeFqaRun, fqaCases, updateFqaCase, fqaSuites, fqaSystems, fqaPlans, datasets, goto, notify } = useApp();
  const [msg, flash] = useToast();
  const [lvl, setLvl] = useState("ALL");
  const [tab, setTab] = useState("진행");
  const [fSt, setFSt] = useState("전체 상태");
  const [fPlan, setFPlan] = useState("전체 계획");
  const sK = { "실행 중": "warn", "대기 중": "info", "완료": "pass", "오류": "fail", "실패": "fail" };
  // 예약 스케줄 = 오늘 시각에 발동하도록 스케줄된 활성 계획 수 (예보 — 발동하면 큐에 '대기'로 쌓인다)
  const _now = new Date();
  const _dow = _now.getDay(), _dom = _now.getDate(), _isWeekday = _dow >= 1 && _dow <= 5;
  const _nowMin = _now.getHours() * 60 + _now.getMinutes();
  const _tMin = (t) => { const p = String(t || "00:00").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); };
  // 예약 스케줄 = 오늘 '아직 발동 전(현재 시각 이후)'인 시간 스케줄 계획 수. 이미 지난 발동은 실행/완료 쪽에 있어야 하므로 제외.
  // 계획 화면과 같은 소스(스케줄 객체)만 본다 — sched 요약 문자열 폴백 없음.
  const firesToday = (p) => {
    if (p.status !== "활성") return false;
    const s = p.schedule;
    if (!s || s.mode !== "schedule" || !s.active) return false;
    if (s.freq === "hourly") return _now.getHours() < 23;   // 남은 정각이 오늘 안에 있음
    const upcoming = _tMin(s.time) > _nowMin;                // 예정 시각이 아직 안 지났나
    if (s.freq === "daily") return upcoming;
    if (s.freq === "weekdays") return _isWeekday && upcoming;
    if (s.freq === "weekly") return s.dow === _dow && upcoming;
    if (s.freq === "monthly") return s.dom === _dom && upcoming;
    return false;
  };
  const scheduledToday = fqaPlans.filter(firesToday).length;
  const lvK = { INFO: "text-slate-500", TC: "text-sky-600", STEP: "text-slate-500", PASS: "text-emerald-700", FAIL: "text-red-700", RETRY: "text-amber-700", ERROR: "text-red-600" };
  const logs = RUN_LOG.filter((l) => lvl === "ALL" || l.lv === lvl);
  const tK = { "수동": "info", "스케줄": "pass", "이벤트": "warn" };
  const hK = { "완료": "pass", "실패": "fail" };
  const planNames = fqaPlans.map((p) => p.name);
  const runnableNames = fqaPlans.filter((p) => p.status === "활성").map((p) => p.name);
  const match = (r) => (fSt === "전체 상태" || r.status === fSt) && (fPlan === "전체 계획" || r.plan === fPlan);
  const rows = fqaRuns.filter((r) => r.status === "실행 중" || r.status === "대기 중").filter(match).sort((a, b) => { const rk = (s) => (s === "실행 중" ? 0 : 1); if (rk(a.status) !== rk(b.status)) return rk(a.status) - rk(b.status); return parseInt(a.id.split("-")[1] || "0", 10) - parseInt(b.id.split("-")[1] || "0", 10); });
  const liveRun = fqaRuns.find((r) => r.status === "실행 중");
  const cnt = (fn) => fqaRuns.filter(fn).length;
  const today = nowStamp().slice(0, 10);
  const dateOf = (r) => String((r.endedAt && r.endedAt !== "-") ? r.endedAt : (r.startedAt || "")).slice(0, 10);
  const KPI = [["실행 중", cnt((r) => r.status === "실행 중"), "text-amber-600"], ["대기", cnt((r) => r.status === "대기 중"), "text-slate-900"], ["예약 스케줄", scheduledToday, "text-sky-600"], ["완료", cnt((r) => r.status === "완료" && dateOf(r) === today), "text-emerald-600"], ["오류", cnt((r) => r.status === "오류" && dateOf(r) === today), "text-red-600"]];
  const nextId = () => "FRUN-" + (fqaRuns.reduce((m, r) => Math.max(m, parseInt((r.id.split("-")[1] || "0"), 10)), 500) + 1);
  // 계획의 대상·환경은 ID 참조 → 접점(웹/API)을 조회해 실행 옵션 표시에 사용
  const envRefOf = (plan) => { const sy = (fqaSystems || []).find((s) => s.id === ((plan.targetRef || {}).systemId)); const e = sy ? (sy.envs || []).find((x) => x.env === (plan.targetRef || {}).env) : null; return { sy, e, label: sy ? sy.name + " · " + (plan.targetRef || {}).env : "미지정" }; };
  const surfLabel = (plan) => { const { e } = envRefOf(plan); if (!e) return "-"; const w = !!e.webUrl, a = !!e.apiUrl; return w && a ? "웹+API" : a ? "API" : w ? "웹" : "-"; };
  const suiteNames = (plan) => (plan.suites || []);
  // 실행 대상: 계획이 고른 스위트들의 승인 케이스 (스위트 활성 게이트 없음 — 계획 선택이 유일한 기준)
  const buildTcs = (plan) => {
    // 스위트(업무 흐름) ∩ 태그(실행 목적) ∩ 승인 — 태그가 비면 스위트 전체
    const inSuite = (c) => suiteNames(plan).includes(c.suite) && !c.quarantined && tagMatch(c, plan.tags);
    const src = fqaCases.filter((c) => inSuite(c) && c.status === "승인");   // 승인 케이스만 실행 — 초안·검토중은 대상 아님(계획 경고와 일치)
    const retry = plan.retry != null ? plan.retry : 0;
    return src.map((c) => {
      const base = lastOf(fqaRuns, c.id) === "FAIL" ? "FAIL" : "PASS";
      // flaky = 1차 실패 후 재시도로 통과 — 재시도(retry>0)가 있어야 성립. 통과지만 불안정 → WARN.
      // 보정(heal)은 여기서 만들지 않는다 — 보정은 "실패한 뒤 제안"이라 판정을 바꾸지 않는다.
      const flaky = retry > 0 && base === "PASS" && Math.random() < 0.18;
      return { id: c.id, name: c.name, v: flaky ? "WARN" : base, flaky: flaky || undefined, dur: (Math.round((Math.random() * 3 + 0.3) * 10) / 10) + "s" };
    });
  };
  /* 🔑 사전 검사 — '케이스 밖' 조건만 본다.
     케이스 안(스텝 완성도·save 변수)은 저장 시점에 이미 막혔으므로 여기서 다시 보지 않는다.
     여기가 실행을 막는 유일한 지점이다. 실 구현에서는 서버 API 계층에 둔다 —
     화면 실행 · 정기 스케줄 · CI 웹훅 세 경로가 모두 지나가는 곳은 거기뿐이다. */
  const planCasesOf = (plan) => fqaCases.filter((c) => suiteNames(plan).includes(c.suite) && !c.quarantined && tagMatch(c, plan.tags) && c.status === "승인");
  const precheck = (plan) => { const { e } = envRefOf(plan); return outerChecks(planCasesOf(plan), e, datasets, fqaCases); };
  const [pcModal, setPcModal] = useState(null);
  /* 🔴 문제 케이스만 빼고 돌리지 않는다 — 일부만 돈 회차가 품질 게이트를 통과하면
     검증이 사라진 것을 아무도 모른다. 빼는 결정은 사람이 '격리'로 내린다. */
  const quarantine = (list) => { list.forEach((c) => updateFqaCase(c.id, { quarantined: true })); setPcModal(null); flash(list.length + "건 격리됨 — 실행 대상에서 빠집니다. 다시 실행하세요"); };
  const gatePlan = (plan) => { if (plan.status !== "활성") { flash(plan.name + " — 초안 계획은 실행할 수 없습니다. 계획을 활성화하세요"); return false; } if (!suiteNames(plan).length) { flash(plan.name + " — 스위트가 선택되지 않았습니다"); return false; } if (!buildTcs(plan).length) { flash(plan.name + " — 실행할 승인 케이스가 없습니다 (스위트·태그·승인 상태 확인)"); return false; } const pc = precheck(plan); if (pc.length) { setPcModal({ plan, groups: pc }); return false; } return true; };
  // 실행 시점의 대상·환경·빌드 버전을 run에 스탬프 — "이 회귀가 어느 빌드에서 나왔나"를 추적하기 위함
  const stampOf = (plan) => { const { e, label } = envRefOf(plan); return { target: label, ver: (e && e.ver && e.ver !== "-") ? e.ver : "-" }; };
  const [runPlan, setRunPlan] = useState(runnableNames[0] || "");
  const [selRunId, setSelRunId] = useState(null);
  const selRun = fqaRuns.find((r) => r.id === selRunId && (r.status === "실행 중" || r.status === "대기 중")) || liveRun || rows[0] || null;
  // 실행 = 큐 맨끝에 '대기'로 적재만. 픽업·실행·완료는 아래 큐 프로세서가 담당(앞선 작업이 없어야 실행).
  const runNow = (plan) => { if (!gatePlan(plan)) return; const tcs = buildTcs(plan); const total = tcs.length; const id = nextId(); const { e } = envRefOf(plan); addFqaRun({ id, planId: plan.id, plan: plan.name, name: plan.name, suite: suiteNames(plan).join(" · "), ...stampOf(plan), pw: "1.50.0", brVer: "132.0.6834.83", brow: (e && e.webUrl) ? ((plan.brow && plan.brow[0]) || "Chromium") : "", trig: "수동", by: "QA Engineer", status: "대기 중", prog: 0, progt: "대기", dur: "-", at: "방금 전", gate: plan.gate != null ? plan.gate : 95, total, pass: 0, fail: 0, warn: 0, tcs }); setSelRunId(id); flash(plan.name + " 실행 요청 · " + id + " — 큐 맨끝에 적재"); };
  // 큐 프로세서(단일 러너 FIFO) — 러너가 비면(실행 중 0) 대기 큐의 맨앞(가장 오래된)을 픽업해 실행→완료
  const procRef = useRef({});
  useEffect(() => {
    if (fqaRuns.some((r) => r.status === "실행 중")) return;
    const waiting = fqaRuns.filter((r) => r.status === "대기 중");
    if (!waiting.length) return;
    const next = waiting.reduce((a, b) => (parseInt(a.id.split("-")[1] || "0", 10) <= parseInt(b.id.split("-")[1] || "0", 10) ? a : b));
    if (procRef.current[next.id]) return;
    procRef.current[next.id] = true;
    const total = next.total || 0;
    const fail = (next.tcs || []).filter((t) => t.v === "FAIL").length;
    const warn = (next.tcs || []).filter((t) => t.v === "WARN").length;   // flaky(재시도 통과)
    updateFqaRun(next.id, { status: "실행 중", prog: 12, progt: Math.max(1, Math.round(total * 0.12)) + "/" + total, dur: "0분 03초", startedAt: nowStamp() });
    setTimeout(() => updateFqaRun(next.id, { prog: 42, progt: Math.max(1, Math.round(total * 0.42)) + "/" + total, dur: "0분 06초" }), 3000);
    setTimeout(() => updateFqaRun(next.id, { prog: 74, progt: Math.max(1, Math.round(total * 0.74)) + "/" + total, dur: "0분 10초" }), 6000);
    /* 🔑 실행이 끝났다는 사실은 화면을 보고 있지 않은 사람에게도 가야 한다.
       LQA·NQA 는 보내는데 FQA 만 안 보내고 있었다. 목적지는 그 실행의 결과 화면이다. */
    setTimeout(() => {
      updateFqaRun(next.id, { status: "완료", prog: 100, progt: total + "/" + total, dur: "0분 " + (12 + total) + "초", endedAt: nowStamp(), pass: total - fail - warn, warn, fail });
      if (notify) notify({ icon: "play", text: (next.plan || next.name) + " 완료 — PASS " + (total - fail - warn) + " / FAIL " + fail, to: { domain: "FQA", view: "fqa-result-detail", run: next.id } });
    }, 9000);
  }, [fqaRuns]);
  const cancelRun = (r) => { if (!window.confirm(r.id + " 실행을 큐에서 취소할까요?")) return; removeFqaRun(r.id); if (selRunId === r.id) setSelRunId(null); flash(r.id + " 취소됨 — 큐에서 제거"); };
  const stopRun = (r) => { if (!window.confirm(r.id + " 실행을 중지할까요? — 러너에 취소 신호를 보내고 큐에서 제거합니다")) return; removeFqaRun(r.id); if (selRunId === r.id) setSelRunId(null); flash(r.id + " 중지됨 — 러너 취소 · 큐에서 제거"); };
  const PlanInfo = ({ name }) => { const pl = fqaPlans.find((p) => p.name === name); if (!pl) return null; const { label } = envRefOf(pl); return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">계획에서 상속 · 대상 <span className="text-slate-700">{label}</span> <Badge kind={SURF_K[surfLabel(pl)] || "info"}>{surfLabel(pl)}</Badge> · 스위트 <span className="text-slate-700">{suiteNames(pl).join(", ") || "없음"}</span></div>; };
  return (
    <div className="space-y-4">
      <PageToolbar desc="진행 중 · 실행 큐 (지금 실행 중·대기)" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {KPI.slice(0, 2).map((k) => (<Card key={k[0]} className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div></Card>))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div style={{ width: 116 }}><Select value={fSt} onChange={(e) => setFSt(e.target.value)}><option>전체 상태</option><option>실행 중</option><option>대기 중</option></Select></div>
            <div className="flex-1" />
            <div style={{ width: 200 }}><Select value={runPlan} onChange={(e) => setRunPlan(e.target.value)} disabled={!runnableNames.length}>{runnableNames.length ? runnableNames.map((n) => <option key={n}>{n}</option>) : <option value="">활성 계획 없음</option>}</Select></div>
            <Btn kind="primary" icon={Play} disabled={!runnableNames.length} onClick={() => { const pl = fqaPlans.find((x) => x.name === runPlan); if (!pl) { flash("실행할 계획을 선택하세요"); return; } runNow(pl); }}>실행</Btn>
          </div>
          {!runnableNames.length && <div className="text-xs text-amber-600">활성 상태의 실행 계획이 없습니다 — 계획을 활성화해야 실행할 수 있습니다.</div>}
          <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">실행</th><th className="font-medium">상태</th><th className="font-medium">진행</th><th className="font-medium">소요</th><th></th></tr></thead>
                <tbody>
                  {rows.length === 0 && (<tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">진행 중이거나 대기 중인 실행이 없습니다</td></tr>)}
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setSelRunId(r.id)} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100 " + ((selRun && selRun.id === r.id) ? SEL_ROW : "")}>
                      <td className="px-4 py-3"><div className="font-mono text-xs text-sky-600">{r.id}</div><div className="text-slate-800">{r.name}</div><div className="text-xs text-slate-500">{r.suite}</div></td>
                      <td><Badge kind={sK[r.status] || "info"}>{r.status}</Badge></td>
                      <td style={{ minWidth: 90 }}>{r.status === "대기 중" ? <span className="text-xs text-slate-500">{r.progt}</span> : <div><div className="mb-0.5 text-xs text-slate-500">{r.progt}</div><div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: r.prog + "%" }} /></div></div>}</td>
                      <td className="text-xs text-slate-500">{r.dur}</td>
                      <td className="pr-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{r.status === "실행 중" ? <button onClick={() => stopRun(r)} className="text-xs text-slate-500 hover:text-red-600">중지</button> : <button onClick={() => cancelRun(r)} className="text-xs text-slate-500 hover:text-red-600">취소</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
        </div>
        <div className="col-span-6 space-y-3">
          <div>
            <div className="grid grid-cols-3 gap-3">
              {KPI.slice(2).map((k) => (<Card key={k[0]} className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div></Card>))}
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500" style={{ marginBottom: 38 }}>오늘 · {today}</div>
          </div>
          <Card className="overflow-hidden">
              {!selRun ? (
                <div className="flex items-center justify-center p-8 text-xs text-slate-500" style={{ minHeight: 160 }}>왼쪽에서 실행을 선택하세요.</div>
              ) : selRun.status === "실행 중" ? (
                <>
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{selRun.name}</div><div className="font-mono text-xs text-sky-600">{selRun.id}</div></div>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-red-700"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />LIVE</span>
                  </div>
                  <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2 text-xs text-slate-500"><span>진행 <span className="text-slate-800">{selRun.progt}</span></span><div className="h-1.5 flex-1 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: selRun.prog + "%" }} /></div><span>경과 <span className="text-slate-800">{selRun.dur}</span></span></div>
                  <div className="flex flex-wrap gap-1 border-b border-slate-200 px-2 py-1.5">
                    {["ALL", "INFO", "TC", "STEP", "PASS", "FAIL", "RETRY", "ERROR"].map((l) => (<button key={l} onClick={() => setLvl(l)} className={"rounded px-1.5 py-0.5 text-xs " + (lvl === l ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-800")}>{l}</button>))}
                  </div>
                  <div className="overflow-y-auto p-2 font-mono text-xs" style={{ maxHeight: "58vh" }}>
                    {logs.map((l, i) => (<div key={i} className="flex gap-2 py-0.5"><span className={"w-9 shrink-0 font-semibold " + (lvK[l.lv] || "text-slate-500")}>{l.lv}</span><span className="text-slate-500">{l.t}</span></div>))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{selRun.name}</div><div className="font-mono text-xs text-sky-600">{selRun.id}</div></div>
                    <button onClick={() => cancelRun(selRun)} className="shrink-0 text-xs text-slate-500 hover:text-red-600">취소</button>
                  </div>
                  <div className="space-y-2 p-4 text-xs text-slate-500">
                    <div className="flex items-center gap-2"><Badge kind={sK[selRun.status] || "info"}>{selRun.status}</Badge><span className="text-slate-500">러너 배정 대기</span></div>
                    <PlanInfo name={selRun.plan} />
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      {pcModal && (
        <Modal title="사전 검사 실패 — 실행할 수 없습니다" onClose={() => setPcModal(null)} wide>
          <div className="mb-3 text-xs text-slate-500">{pcModal.plan.name} · 아래 케이스를 고치거나 격리해야 실행됩니다. 격리하면 그 케이스는 실행되지 않고 게이트 집계에서도 빠집니다 — 검증이 사라지는 것이므로 임시 조치로만 쓰세요.</div>
          <div className="space-y-2">
            {pcModal.groups.map((g, i) => (
              <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-red-700">{g.why}</div>
                    <div className="mt-1 font-mono text-slate-500" style={{ fontSize: 11 }}>{g.cases.slice(0, 6).map((c) => c.id).join(", ")}{g.cases.length > 6 && " 외 " + (g.cases.length - 6) + "건"}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {/* 계획 수준 실패는 격리로 풀 일이 아니다 — 그 접점 케이스가 전부 걸리므로 환경을 고쳐야 한다 */}
                    {!g.planLevel && <Btn onClick={() => quarantine(g.cases)}>격리 {g.cases.length}건</Btn>}
                    <Btn onClick={() => { setPcModal(null); goto(g.fixView); }}>{g.fixLabel}</Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-slate-500" style={{ fontSize: 11 }}>이 검사는 실행 요청마다 다시 수행됩니다 — 계획을 만든 뒤에도 환경·계정·데이터셋은 바뀝니다.</div>
            {/* 고친 뒤 실행 화면을 다시 찾아올 필요가 없게 한다 — 통과하면 그대로 실행되고, 아니면 이 모달이 다시 뜬다 */}
            <Btn kind="primary" icon={Play} onClick={() => { const pl = pcModal.plan; setPcModal(null); runNow(pl); }}>다시 실행</Btn>
          </div>
        </Modal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
export function FqaHistoryScreen({ nav }) {
  const { fqaRuns, fqaPlans } = useApp();
  const [msg, flash] = useToast();
  const [fSt, setFSt] = useState("전체 상태");
  const [fPlan, setFPlan] = useState("전체 계획");
  const planNames = fqaPlans.map((p) => p.name);
  const planNow = (r) => (fqaPlans.find((p) => p.id === r.planId) || {}).name;      // 계획의 현재(최종) 이름
  const planLabel = (r) => planNow(r) || r.plan || r.name;
  const tK = { "수동": "info", "스케줄": "pass", "이벤트": "warn" };
  const hK = { "완료": "pass", "오류": "fail" };
  const vK = { "통과": "pass", "실패": "fail", "경고": "warn" };
  const verdict = (r) => { if (r.status !== "완료") return "-"; const tc = r.tcs || []; const hasFail = r.fail > 0 || tc.some((t) => t.v === "FAIL"); const hasWarn = r.warn > 0 || tc.some((t) => t.v === "WARN"); return hasFail ? "실패" : hasWarn ? "경고" : "통과"; };
  const openRun = (r) => { if (r.status === "오류") { flash(r.id + " 오류로 종료 — 상세 결과 없음"); return; } if (nav) nav("fqa-result-detail", r.id); };
  const match = (r) => (fSt === "전체 상태" || r.status === fSt) && (fPlan === "전체 계획" || r.plan === fPlan);
  const hist = fqaRuns.filter((r) => r.status === "완료" || r.status === "오류").filter(match);
  return (
    <div className="space-y-4">
      <PageToolbar desc="완료된 실행 이력 · 행 클릭 시 결과 상세" />
      <div className="flex items-center gap-2">
        <div style={{ width: 120 }}><Select value={fSt} onChange={(e) => setFSt(e.target.value)}><option>전체 상태</option><option>완료</option><option>오류</option></Select></div>
        <div style={{ width: 200 }}><Select value={fPlan} onChange={(e) => setFPlan(e.target.value)}><option>전체 계획</option>{planNames.map((n) => (<option key={n}>{n}</option>))}</Select></div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">실행</th><th className="font-medium">계획</th><th className="font-medium">빌드</th><th className="font-medium">대상·환경</th><th className="font-medium">트리거</th><th className="font-medium">시각</th><th className="font-medium">상태</th><th className="font-medium">판정</th><th className="pr-4 font-medium">결과</th></tr></thead>
          <tbody>
            {hist.length === 0 && (<tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">조건에 맞는 이력이 없습니다</td></tr>)}
            {hist.map((r) => (
              <tr key={r.id} onClick={() => openRun(r)} className="cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-sky-600">{r.id}</td>
                <td className="text-slate-800">{planLabel(r)}{planNow(r) && r.plan && planNow(r) !== r.plan && <span className="ml-1.5 text-xs text-slate-500">· 당시 “{r.plan}”</span>}</td>
                <td className="font-mono text-xs text-slate-500">{r.ver && r.ver !== "-" ? r.ver : <span className="text-slate-500">-</span>}</td>
                <td className="text-xs text-slate-500">{r.target || "-"}</td>
                <td><Badge kind={tK[r.trig]}>{r.trig}</Badge></td>
                <td><RunTime start={r.startedAt} end={r.endedAt} /></td>
                <td><Badge kind={hK[r.status]}>{r.status}</Badge></td>
                <td>{verdict(r) === "-" ? <span className="text-xs text-slate-500">-</span> : <Badge kind={vK[verdict(r)]}>{verdict(r)}</Badge>}</td>
                <td className="pr-4 text-xs text-slate-500">{r.status === "완료" ? r.pass + "/" + r.total : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Toast msg={msg} />
    </div>
  );
}
/* ═══════════ 7. 결과 상세 ═══════════ */
export function FqaResultScreen({ runId, mode = "상세", back, nav, backLabel }) {
  const { fqaRuns, defects, addDefect, openModal, fqaPlans, fqaCases, updateFqaCase, commitFqaCase, setFqaEditTc, jiraConfig, setPendingSelect, goto, healState, setHeal } = useApp();
  const [msg, flash] = useToast();
  const [filt, setFilt] = useState("전체");
  const [selId, setSelId] = useState(null);
  const [rowsAll, setRowsAll] = useState(false);   // 데이터 구동 케이스 — 기본은 실패 행만(30행 케이스가 화면을 덮지 않도록)
  const [selRow, setSelRow] = useState(null);      // 선택 행 — 스텝 타임라인·증적이 이 행을 따라간다
  const [etab, setEtab] = useState("스크린샷");
  const healSt = (t) => healState[healKey(t)] || "검토 대기";
  /* 🔑 "다시 실행하세요" 라고 하지 않는다 — 이 화면에는 그 버튼이 없고, 붙여서도 안 된다.
     계획 전체를 돌리면 승인한 케이스가 아닌 다른 실패에 결과가 묻히고,
     승인한 케이스만 돌리려면 계획 없는 단건 실행이라는 새 유형이 생긴다.
     자동화 실행의 단위는 계획이므로, 확인 시점도 계획의 다음 회차로 둔다. */
  const HEAL_MSG = {
    "승인됨": "제안 로케이터가 TC 스텝에 반영되었습니다(리비전 생성). 이 계획의 다음 실행 결과로 확인됩니다.",
    "직접 수정함": "제안을 쓰지 않았습니다 — 에디터에서 직접 수정하세요.",
    "적용 실패": "제안한 로케이터가 케이스 스텝에 없어 반영되지 않았습니다. 에디터에서 직접 수정하세요.",
  };
  /* 🔑 로케이터를 바꾸면 그건 "테스트가 바뀐 것"이므로 리비전을 남긴다(F7).
     안 남기면 다음 회귀 비교에서 "제품이 깨진 건가 테스트가 바뀐 건가" 를 구분할 수 없다. */
  const approveHeal = (t) => {
    const c = fqaCases.find((x) => x.id === t.id);
    /* 🔑 적용할 스텝을 못 찾으면 '승인됨' 으로 넘기지 않는다.
       Full-Code 라 steps 가 없거나, heal.from 이 어느 스텝과도 안 맞으면 치환이 0건이다.
       그때 조용히 성공 처리하면 사용자는 고쳐진 줄 알고 그대로 다시 돌린다 — 가장 위험한 실패다. */
    const hit = c && c.steps ? c.steps.filter((st) => st.loc === t.heal.from).length : 0;
    if (!hit) {
      setHeal(healKey(t), "적용 실패");
      flash(t.id + " 보정 적용 실패 — 제안한 로케이터가 케이스에 없습니다. 에디터에서 직접 수정하세요");
      return;
    }
    if (c && c.steps) commitFqaCase(t.id, { steps: c.steps.map((st) => (st.loc === t.heal.from ? Object.assign({}, st, { loc: t.heal.to }) : st)) }, { note: "보정 제안 승인 — " + t.heal.from + " → " + t.heal.to });
    setHeal(healKey(t), "승인됨");
    flash(t.id + " 보정 승인 · 로케이터 갱신 (리비전 생성)");
  };
  /* 제안을 안 쓰기로 했다면 다음 행동은 "직접 고치기" 다 — 여기서 끊기면 사용자가 잊는다.
     아무것도 누르지 않으면 "검토 대기" 로 남는다(판단 보류). */
  const rejectHeal = (t) => {
    setHeal(healKey(t), "직접 수정함");
    flash(t.id + " 제안 미사용 — 에디터에서 " + t.heal.from + " 스텝을 직접 수정하세요");
    /* nav 를 쓰면 안 된다 — mode="상세" 로 뜨는 이 화면에는 nav 가 전달되지 않고,
       화면마다 nav 의 인자 규약도 다르다(어떤 곳은 runId, 어떤 곳은 view+tc).
       에디터 진입은 setFqaEditTc + goto 가 단일 경로다(스위트 화면도 같은 방식). */
    setFqaEditTc(t.id);
    goto("fqa-cases");
  };
  const run = fqaRuns.find((r) => r.id === runId) || fqaRuns.find((r) => r.id === "FRUN-502") || fqaRuns[0] || { id: "-", tcs: [], total: 0, pass: 0, fail: 0, warn: 0, dur: "-" };
  const jr = (() => { if (!(jiraConfig && jiraConfig.connected !== false)) return {}; const pl = (fqaPlans || []).find((p) => p.name === run.plan); return (pl && pl.jira && pl.jira.override) ? pl.jira : jiraConfig; })(); // 결함 라우팅: 미연동 시 내부 결함
  const dkey = (base) => (jr.project || "DEF") + "-" + base;
  const tcs = run.tcs || [];
  const cur = tcs.find((t) => t.id === selId) || tcs[0] || null;
  /* 선택 행 — 케이스를 바꾸면 그 케이스의 첫 실패 행으로 자연히 옮겨간다(별도 초기화 불필요) */
  const curRows = Array.isArray(cur && cur.rows) ? cur.rows : [];
  const curRow = curRows.find((r) => r.i === selRow) || curRows.find((r) => r.v === "FAIL") || curRows[0] || null;
  const passRate = run.total ? Math.round(((run.pass + (run.warn || 0)) / run.total) * 1000) / 10 : 0;
  const gval = run.gate != null ? run.gate : 95;
  const gate = run.fail > 0 || passRate < gval ? "FAIL" : "PASS";
  /* 증적 탭은 '실행'이 아니라 '케이스의 접점'을 따른다 — 웹·API 케이스가 섞인 실행에서
     API 케이스를 열었는데 스크린샷 탭이 뜨면 없는 증적을 찾게 된다.
     실 구현에서는 실행 시점의 접점이 결과에 스탬프되어야 한다(케이스는 실행 뒤에도 바뀐다). */
  const curCase = fqaCases.find((c) => c.id === ((cur || {}).id));
  const curSurf = curCase ? surfacesOf(curCase) : (run.brow ? "웹" : "API");
  /* 🔑 Full-Code는 스텝 상세가 나오지 않는다 — 스텝 경계는 test.step()으로만 생기고,
     사용자 코드에 그것이 없으면 러너는 테스트 단위 결과만 받는다. 있는 척하지 않는다.
     케이스를 못 찾으면(삭제·이름변경) Low-Code로 본다 — 타임라인을 숨기는 쪽이 더 큰 오해를 만든다. */
  const fullCode = !!(curCase && curCase.level === "Full-Code");
  /* trace가 1급이다 — 액션마다 DOM 스냅샷·네트워크·콘솔이 들어 있어 뷰어에서 타임트래블이 된다.
     영상은 trace의 필름스트립과 겹치므로 계획에서 명시적으로 켠 경우에만 탭에 나온다. */
  const hasVideo = !!run.video && run.video !== "녹화 안 함";
  const evTabs = curSurf === "API" ? ["요청", "응답", "HAR", "로그"]
    : curSurf === "웹+API" ? ["trace", "스크린샷", "콘솔 로그", "요청", "응답", "HAR"].concat(hasVideo ? ["영상"] : [])
    : ["trace", "스크린샷", "콘솔 로그"].concat(hasVideo ? ["영상"] : []);
  const evTab = evTabs.includes(etab) ? etab : evTabs[0];
  const _dur = (seed, base) => { let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973; return (base + (h % 500)).toLocaleString() + "ms"; };
  /* row가 주어지면 그 행의 실행으로 본다 — 데이터 구동 케이스는 행마다 결과가 다르므로
     케이스 단위 타임라인만 보여주면 "몇 행이 어느 스텝에서 깨졌나"를 알 수 없다. */
  const stepsFor = (t, row) => {
    if (!t) return [];
    if (row && row.v === "SKIP") return [{ act: "미실행", info: "앞선 행에서 중단되어 실행되지 않았습니다", dur: "-", ok: true, skip: true }];
    const id = t.id || "TC";
    const seg = (run.suite || "app").split(" ")[0].split("/")[0];
    if (row) {
      const dv = Object.entries(row.data || {}).map(([k, v]) => k + "=" + v).join(" · ");
      const rl = row.dur || "-";
      const base = !run.brow
        ? [{ act: "요청 전송", info: dv, dur: _dur(id + row.i + "a", 300), ok: true },
           { act: "응답 수신", info: row.v === "FAIL" ? "상태/스키마 불일치" : "200 OK · 스키마 준수", dur: _dur(id + row.i + "b", 200), ok: true }]
        : [{ act: "페이지 이동", info: "goto · /" + seg.toLowerCase(), dur: _dur(id + row.i + "a", 300), ok: true },
           { act: "데이터 주입", info: dv, dur: _dur(id + row.i + "b", 120), ok: true },
           { act: t.name, info: "액션 수행 → " + id + " [" + row.i + "행]", dur: _dur(id + row.i + "c", 500), ok: true }];
      base.push(row.v === "FAIL"
        ? { act: "결과 검증 실패", info: row.err || "기대 결과 불일치", dur: rl, ok: false }
        : { act: "결과 검증", info: "통과", dur: rl, ok: true });
      return base;
    }
    const hl = healUsable(fqaCases, t);   // 뱃지·패널과 같은 판단을 쓴다
    const last = Math.round((parseFloat(t.dur) || 1) * 1000).toLocaleString() + "ms";
    const s = !run.brow
      ? [
          { act: "요청 전송", info: (t.name || id) + " · REST 요청", dur: _dur(id + "a", 300), ok: true },
          { act: "응답 수신", info: t.v === "FAIL" ? "상태/스키마 불일치" : "200 OK · 스키마 준수", dur: _dur(id + "b", 200), ok: true },
        ]
      : [
          { act: "브라우저 열기", info: (run.brow || "Chromium").toLowerCase().split("+")[0] + " · 세션 시작", dur: _dur(id + "a", 1400), ok: true },
          { act: "페이지 이동", info: "goto · /" + seg.toLowerCase(), dur: _dur(id + "b", 300), ok: true },
          /* 🔑 보정은 실행 중에 적용되지 않는다 — 로케이터를 못 찾으면 그 자리에서 실패하고,
             판정이 확정된 뒤에 같은 페이지에서 대안 후보만 찾아 기록한다(진행하지 않는다). */
          { act: t.name, info: hl ? "로케이터 " + hl.from + " 를 찾지 못함 · 대안 후보 탐색" : "액션 수행 → " + id, dur: _dur(id + "c", 500), ok: !hl },
        ];
    s.push(
      t.v === "FAIL"
        ? { act: hl ? "로케이터 없음" : "결과 검증 실패", info: hl ? hl.step + " — 대안 후보를 찾았습니다. 결과 화면에서 확인하세요" : t.name + " — 기대 결과 불일치 (재시도 2회)", dur: last, ok: false }
        : t.v === "WARN"
        ? { act: "결과 검증 (경고)", info: t.name + " — 통과, 임계 근접 경고", dur: last, ok: true, warn: true }
        : { act: "결과 검증", info: t.name + " — 통과", dur: last, ok: true }
    );
    return s;
  };
  const SUM = [["전체 TC", run.total, "text-slate-900"], ["통과", run.pass, "text-emerald-600"], ["실패", run.fail, "text-red-600"], ["경고", run.warn, "text-amber-600"]].concat(!run.brow ? [] : [["보정 제안", tcs.filter((t) => healUsable(fqaCases, t)).length, "text-sky-600"]]);
  /* 중복 결함 판정 키 = (도메인, 대상 제품, TC).
     같은 TC라도 대상 제품이 다르면 다른 결함이다. 환경(스테이징/운영)은 발견 위치일 뿐 결함의 축이 아니다.
     '열린' 결함이 있으면 재등록 금지. Resolved만 있으면 재발이므로 재등록 허용. */
  const runTarget = String(run.target || "").split(" · ")[0]; // "온마켓 · 스테이징" → "온마켓"
  const defectsOfTc = (id) => defects.filter((d) => d.tc === id && d.domain === "FQA" && (d.target || "") === runTarget);
  const openDefectOf = (id) => defectsOfTc(id).find((d) => d.status !== "Resolved");
  const isRegression = (id) => !openDefectOf(id) && defectsOfTc(id).length > 0;
  /* 🔑 아직 결함에 안 걸린 실패 행 — 버튼 노출 조건과 등록 모달의 기본 선택이 같은 계산을 써야 한다.
     따로 계산하면 "등록할 게 없는데 버튼이 보이는" 상태가 된다. 행 식별은 스냅샷 해시가 아니라
     목업이므로 데이터 직렬화로 대신한다(실 구현은 data_hash). */
  const regKeysOf = (id) => defectsOfTc(id).flatMap((d) => (d.rows || []).map((r) => JSON.stringify(r.data || {})));
  const openFailRows = (t) => { if (!t || !Array.isArray(t.rows)) return []; const k = regKeysOf(t.id); return t.rows.filter((r) => r.v === "FAIL" && !k.includes(JSON.stringify(r.data || {}))); };
  // 등록할 것이 남았는가 — 행 케이스는 미등록 실패 행 기준, 일반 케이스는 열린 결함 유무 기준
  const canRegister = (t) => { if (!t || t.v !== "FAIL") return false; return Array.isArray(t.rows) && t.rows.length ? openFailRows(t).length > 0 : !openDefectOf(t.id); };
  const regDefect = (t) => {
    /* 데이터 구동 케이스는 실패 행마다 원인이 다를 수 있으므로 케이스당 1건으로 막지 않는다.
       어느 행을 묶을지는 사용자가 모달에서 고른다(시스템이 자동으로 분리·병합하지 않는다). */
    const failRows = Array.isArray(t.rows) ? t.rows.filter((r) => r.v === "FAIL") : [];
    if (!canRegister(t)) { flash(t.id + " 등록할 실패 행이 없습니다 — 이미 모두 결함에 연결되어 있습니다"); return; }
    openModal("jira", {
      domain: "FQA", sev: "Major", tc: t.id, target: runTarget, labels: "fqa, functional" + (t.cause ? ", cause:" + t.cause : "") + (healUsable(fqaCases, t) ? ", locator-changed" : ""),
      rows: failRows, ds: t.ds || "",
      regRows: defectsOfTc(t.id).flatMap((d) => (d.rows || []).map((r) => JSON.stringify(r.data || {}))),
      title: (isRegression(t.id) ? "[재발] " : "") + t.name + " 기능 실패",
      desc: "기능 케이스: " + t.name + " (" + t.id + ")\n대상 제품: " + runTarget + (t.cause ? "\n실패 원인(자동 분류): " + t.cause : "") + healNote(healUsable(fqaCases, t)),
      steps: "1. 케이스 '" + t.name + "' 실행\n2. 단언(assertion) 검증",
      expected: t.expected || "케이스에 정의된 기대 결과 충족",
      actual: healUsable(fqaCases, t) ? "로케이터 " + healUsable(fqaCases, t).from + " 를 찾지 못함 — 보정 제안 있음" : "단언 불일치 — 케이스 실패",
      env: runTarget,
      artifacts: [{ k: "shot", label: "스크린샷", file: "screenshot.png", size: "220 KB" }, { k: "har", label: "네트워크 HAR", file: "session.har", size: "1.2 MB" }, { k: "trace", label: "Playwright 트레이스", file: "trace.zip", size: "3 MB" }],
    });
  };
  const FLAKY = fqaCases.filter((c) => histOf(fqaRuns, c.id).length >= 1).map((c) => {
    const h = histOf(fqaRuns, c.id); const fails = h.filter((v) => v === "FAIL").length; const passes = h.filter((v) => v === "PASS").length; const warns = h.filter((v) => v === "WARN").length;
    const flips = h.slice(1).reduce((n, v, i) => n + (v !== h[i] ? 1 : 0), 0);
    let trail = 0; for (let i = h.length - 1; i >= 0; i--) { if (h[i] === "FAIL") trail++; else break; }
    const rate = Math.round((fails / h.length) * 100);
    const persistent = h.length >= 3 && fails / h.length >= 0.6 && trail >= 2;
    /* 불안정 = 재시도 통과(WARN) 또는 PASS/FAIL 교차.
       🔑 표본 수 조건은 두 경로에 똑같이 건다 — 1회 실행의 재시도 통과 하나로
          "이 케이스는 불안정하다"고 단정하면 안 된다(화면에 적어 둔 기준과도 어긋난다). */
    const flaky = !persistent && h.length >= 3 && (warns > 0 || (fails > 0 && passes > 0));
    const streak = persistent ? ("최근 " + trail + "회 연속 실패 · " + rate + "% 실패") : (warns > 0 ? ("재시도 통과(flaky) " + warns + "회" + (flips >= 1 ? " · PASS/FAIL 교차 " + flips + "회" : "")) : ("PASS/FAIL 교차 " + flips + "회 · " + rate + "% 실패"));
    return { heal: healOf(fqaRuns, fqaCases, c.id), cause: causeOf(fqaRuns, c.id), id: c.id, name: c.name, suite: c.suite, runs: h.length, fails, rate, flips, warns, unstable: fails + warns, urate: Math.round(((fails + warns) / h.length) * 100), flaky, persistent, quarantined: !!c.quarantined, streak };
  }).filter((r) => r.flaky || r.persistent);
  const flakyN = FLAKY.filter((r) => r.flaky).length;
  const persistN = FLAKY.filter((r) => r.persistent).length;
  const hasDefFQA = (id) => defects.some((d) => d.tc === id && d.domain === "FQA");
  const regFail = (r) => {
    if (hasDefFQA(r.id)) { flash(r.id + " 이미 결함 등록됨"); return; }
    /* 이 화면의 [결함 등록] 은 결과 화면을 거치지 않는다 — 보정 제안을 여기서 안 실으면
       로케이터가 낡아 생긴 지속 실패가 제품 결함으로 등록된다. */
    openModal("jira", {
      domain: "FQA", sev: "Major", tc: r.id, labels: "fqa, flaky, persistent" + (r.cause ? ", cause:" + r.cause : "") + (r.heal ? ", locator-changed" : ""),
      title: "지속 실패: " + r.name,
      desc: "케이스 '" + r.name + "' (" + r.id + ")\n최근 " + r.runs + "회 중 " + r.fails + "회 실패 (" + r.rate + "%)\n" + (r.streak || "") + healNote(r.heal),
      steps: "1. 케이스 '" + r.name + "' 반복 실행\n2. 실패 재현 확인",
      expected: "케이스 통과",
      actual: (r.heal ? "로케이터 " + r.heal.from + " 를 찾지 못함 — 보정 제안 있음 · " : "") + "지속 실패 — " + (r.streak || (r.rate + "% 실패")),
      artifacts: [{ k: "shot", label: "스크린샷", file: "screenshot.png", size: "220 KB" }, { k: "trace", label: "Playwright 트레이스", file: "trace.zip", size: "3 MB" }],
    });
  };
  const toggleQuar = (r) => { updateFqaCase(r.id, { quarantined: !r.quarantined }); flash(r.id + (r.quarantined ? " 격리 해제 — 실행 대상에 복귀" : " 격리(quarantine) — 실행 대상에서 제외")); };
  const vK = { PASS: "pass", FAIL: "fail", HEAL: "active", WARN: "warn" };
  /* 데이터 구동 케이스의 행 요약 — 판정·집계는 케이스 단위(1건)이고 행은 보조 표기다.
     rows가 없는 케이스는 기존 동작 그대로다(빈 문자열 반환). */
  const rowSum = (t) => { const rs = t && t.rows; if (!Array.isArray(rs) || !rs.length) return ""; const p = rs.filter((r) => r.v === "PASS").length; const s = rs.filter((r) => r.v === "SKIP").length; return rs.length + "행 중 " + p + "행 통과" + (s ? " · " + s + "행 미실행" : ""); };
  const shown = tcs.filter((t) => filt === "전체" || (filt === "실패만" && t.v === "FAIL") || (filt === "통과만" && t.v === "PASS") || (filt === "보정 제안" && healUsable(fqaCases, t)));
  // 실행은 계획을 id로 참조(planId) — 이름이 바뀌어도 이력이 안 끊긴다. 레거시 런(planId 없음)은 이름으로 매칭.
  const finishedOf = (pid) => fqaRuns.filter((r) => (r.planId != null ? r.planId === pid : r.plan === ((fqaPlans.find((p) => p.id === pid) || {}).name)) && r.status === "완료").sort((x, y) => parseInt(y.id.split("-")[1] || "0", 10) - parseInt(x.id.split("-")[1] || "0", 10));
  const [regPlan, setRegPlan] = useState((fqaPlans && fqaPlans[0]) ? fqaPlans[0].id : null);
  const _ir = finishedOf(regPlan);
  const [bId, setBId] = useState(_ir[0] ? _ir[0].id : "");
  const [aId, setAId] = useState(_ir[1] ? _ir[1].id : (_ir[0] ? _ir[0].id : ""));
  useEffect(() => { const rs = finishedOf(regPlan); setBId(rs[0] ? rs[0].id : ""); setAId(rs[1] ? rs[1].id : (rs[0] ? rs[0].id : "")); }, [regPlan]);
  const planRuns = finishedOf(regPlan);
  const runA = fqaRuns.find((r) => r.id === aId);
  const runB = fqaRuns.find((r) => r.id === bId);
  const rate = (r) => (r && r.total ? Math.round((r.pass / r.total) * 1000) / 10 : 0);
  const rank = { FAIL: 0, WARN: 1, HEAL: 1, PASS: 2 };
  const cls = (a, b) => (!a || !b ? { k: "-", c: "text-slate-500" } : a === b ? { k: "유지", c: "text-slate-500" } : ((rank[b] == null ? 2 : rank[b]) > (rank[a] == null ? 2 : rank[a]) ? { k: "개선", c: "text-emerald-600" } : { k: "퇴행", c: "text-red-600" }));
  const _nameOf = (id) => { const t = [...((runB && runB.tcs) || []), ...((runA && runA.tcs) || [])].find((x) => x.id === id); return t ? t.name : id; };
  const mapA = Object.fromEntries(((runA && runA.tcs) || []).map((t) => [t.id, t.v]));
  const mapB = Object.fromEntries(((runB && runB.tcs) || []).map((t) => [t.id, t.v]));
  /* 회차별 케이스 리비전 — 퇴행의 원인이 제품인지 케이스 수정인지를 가르는 유일한 단서다.
     rev가 바뀐 퇴행은 케이스를 먼저 봐야 하고, rev가 같은 퇴행이라야 제품 회귀를 의심할 수 있다. */
  const revA = Object.fromEntries(((runA && runA.tcs) || []).map((t) => [t.id, t.rev]));
  const revB = Object.fromEntries(((runB && runB.tcs) || []).map((t) => [t.id, t.rev]));
  const regRows = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].map((id) => ({ id, name: _nameOf(id), a: mapA[id], b: mapB[id], ra: revA[id], rb: revB[id] }));
  /* 러너·브라우저가 바뀐 회차끼리의 비교는 제품 회귀로 단정할 수 없다 — 회차 단위 사실이므로 한 번만 계산한다.
     케이스 rev와 같은 원칙: 판정을 뒤집지 않고 사실만 덧붙인다. */
  const runDiff = (() => {
    if (!runA || !runB) return "";
    if ((runA.brow || "") !== (runB.brow || "")) return "브라우저 변경";
    if (runA.pw && runB.pw && runA.pw !== runB.pw) return "러너 변경";
    return "";
  })();
  const summ = regRows.reduce((acc, r) => { const k = cls(r.a, r.b).k; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  return (
    <div className="space-y-4">
      {mode === "상세" ? (
        <PageToolbar desc={back ? <span><button onClick={back} className="text-sky-600 hover:underline">{backLabel || "실행 이력"}</button> <span className="text-slate-500">›</span> <span className="text-slate-700 font-medium">{run.id} 결과</span></span> : "결과 상세"}>
          {back && <Btn icon={ChevronLeft} onClick={back}>{backTo(backLabel || "실행 이력")}</Btn>}
        </PageToolbar>
      ) : (
        <PageToolbar desc={mode === "회귀" ? "회귀 비교 · 실행(계획) 기준" : "불안정(Flaky) · 테스트케이스 기준"} />
      )}
      {mode === "상세" && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-sm text-sky-600">{run.id}</span><span className="text-sm font-medium text-slate-800">{(fqaPlans.find((p) => p.id === run.planId) || {}).name || run.plan}</span>{run.fail > 0 ? <Badge kind="fail">실패 {run.fail}건</Badge> : <Badge kind="pass">전체 통과</Badge>}<span className="text-xs text-slate-500">{!run.brow ? "API" : (run.brow || "Chromium")} · {run.suite}</span>{run.ver && run.ver !== "-" && <Badge kind="info">빌드 {run.ver}</Badge>}
              {/* 🔑 러너 버전 스탬프 — 없으면 "제품이 깨진 건가 브라우저가 올라간 건가"를 구분할 수 없다.
                  케이스 rev와 같은 목적이다. 브라우저 버전은 Playwright 버전에 종속이지만 매핑표를 외우게 하지 않는다. */}
              {run.pw && <span className="font-mono text-slate-500" style={{ fontSize: 11 }} title={"Playwright " + run.pw + " · Chromium " + (run.brVer || "-")}>pw {run.pw}</span>}</div>
            <div className="flex gap-2"><Btn icon={Download} onClick={() => flash("Excel")}>Excel</Btn><Btn icon={Download} onClick={() => flash("PDF")}>PDF</Btn></div>
          </Card>
          <div className={"grid gap-3 " + (!run.brow ? "grid-cols-5" : "grid-cols-6")}>
            {SUM.map((k) => (<Card key={k[0]} className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div></Card>))}
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-slate-900">{run.dur}</div><div className="mt-0.5 text-xs text-slate-500">소요</div></Card>
          </div>
          <Card className="flex flex-wrap items-center gap-3 p-3 text-sm"><span className={"font-semibold " + (gate === "FAIL" ? "text-red-700" : "text-emerald-700")}>품질 게이트: {gate}</span><span className="text-slate-500">기준 {gval}% · 실제 <span className={"font-semibold " + (gate === "FAIL" ? "text-red-700" : "text-emerald-700")}>{passRate}%</span></span>{run.brow && (<><span className="text-slate-500">·</span><span className="text-slate-500">보정 제안 {tcs.filter((t) => healUsable(fqaCases, t)).length}건</span></>)}</Card>
          {tcs.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">{run.status === "실행 중" || run.status === "대기 중" ? "실행이 진행 중입니다 — 완료 후 케이스 결과가 표시됩니다." : "이 실행에는 케이스 상세 결과가 없습니다."}</Card>
          ) : (
          <div className="grid grid-cols-5 gap-4">
            <Card className="col-span-2 overflow-hidden">
              <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-3 py-2">
                {(!run.brow ? ["전체", "실패만", "통과만"] : ["전체", "실패만", "통과만", "보정 제안"]).map((t) => (<button key={t} onClick={() => setFilt(t)} className={"rounded-full px-2.5 py-1 text-xs " + (filt === t ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{t}</button>))}
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                {shown.map((t) => (
                  <div key={t.id} onClick={() => setSelId(t.id)} className={"flex items-center justify-between border-b border-slate-200 px-4 py-2.5 cursor-pointer hover:bg-slate-100 " + (cur && cur.id === t.id ? SEL_ROW : "")}>
                    <div><span className="font-mono text-xs text-sky-600">{t.id}</span>{t.rev != null && <span className="ml-1.5 font-mono text-slate-500" style={{ fontSize: 10 }}>rev {t.rev}</span>}<div className="text-xs text-slate-700">{t.name}</div>{(t.cause || rowSum(t)) && <div className="flex items-center gap-1.5" style={{ fontSize: 11 }}>{t.cause && <span className={CAUSE_TX[t.cause] || "text-slate-500"}>원인 · {t.cause}</span>}{t.cause && rowSum(t) && <span className="text-slate-300">·</span>}{rowSum(t) && <span className="text-slate-500">{rowSum(t)}</span>}</div>}</div>
                    <div className="flex items-center gap-2">{t.v === "FAIL" && openDefectOf(t.id) && <Bug size={12} className="text-red-600" />}<span className="text-xs text-slate-500">{t.dur}</span>{healUsable(fqaCases, t) && <Badge kind="active">보정</Badge>}<Badge kind={vK[t.v]}>{t.v}</Badge></div>
                  </div>
                ))}
              </div>
            </Card>
            {cur && (
            <Card className="col-span-3 p-4">
              <div className="mb-3 flex items-center justify-between"><span className="font-mono text-sky-600">{cur.id}</span><div className="flex items-center gap-2"><Badge kind={vK[cur.v]}>{cur.v}</Badge>{healUsable(fqaCases, cur) && <Badge kind="active">보정</Badge>}<Btn icon={RefreshCw} onClick={() => flash(cur.id + " 재실행")}>재실행</Btn>{cur.v === "FAIL" && openDefectOf(cur.id) && <Btn icon={Bug} onClick={() => { setPendingSelect({ kind: "defect", key: openDefectOf(cur.id).key }); goto("defects"); }}>결함 보기 · {openDefectOf(cur.id).key}</Btn>}
                {/* 행이 있는 케이스는 열린 결함이 있어도 다른 행에 대해 추가 등록할 수 있다 */}
                {canRegister(cur) && <Btn kind="danger" icon={Bug} onClick={() => regDefect(cur)}>{isRegression(cur.id) ? "재발 결함 등록" : "결함 등록"}</Btn>}</div></div>
              <div className="mb-3 text-sm text-slate-700">{cur.name}</div>
              {/* 🔑 실행 결과의 리비전 스탬프 — 없으면 "제품이 깨진 건가 케이스가 바뀐 건가"를 구분할 수 없어 회귀 분석이 거짓말을 한다.
                  케이스가 그 뒤에 수정되었으면 이 결과를 현재 케이스로 재현할 수 없다는 뜻이므로 그렇게 알린다. */}
              {cur.rev != null && curCase && (curCase.rev || 1) !== cur.rev && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>이 결과는 <span className="font-mono">rev {cur.rev}</span> 로 실행되었고 케이스는 현재 <span className="font-mono">rev {curCase.rev || 1}</span> 입니다 — 지금 다시 돌리면 다른 결과가 나올 수 있습니다. <span className="text-amber-600/80">테스트케이스에서 변경 이력을 확인하세요.</span></span>
                </div>
              )}
              {/* 🔑 Full-Code 는 제외한다 — 아래 안내 문구와 같은 규칙이다.
                  코드의 어느 줄을 고쳐야 하는지 알 수 없으므로 스텝 치환이 성립하지 않는다. */}
              {healUsable(fqaCases, cur) && (
                <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <div className="flex items-center justify-between"><span className="text-xs font-semibold text-sky-700">자가보정 제안 (로케이터 자동 복구)</span><Badge kind={healSt(cur) === "승인됨" ? "pass" : healSt(cur) === "적용 실패" ? "fail" : "warn"}>{healSt(cur)}</Badge></div>
                  <div className="mt-2 text-xs text-slate-500">{cur.heal.step}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs"><span className="text-red-700 line-through">{cur.heal.from}</span><span className="text-slate-500">→</span><span className="text-emerald-700">{cur.heal.to}</span></div>
                  {/* 🔑 신뢰도 %를 쓰지 않는다 — 규칙 점수의 합일 뿐인데 사람은 확률로 읽는다.
                      "왜 이 후보인가" 를 문장으로 주는 편이 판단에 쓸모 있다. */}
                  {cur.heal.why && <div className="mt-1 text-xs text-slate-500">{cur.heal.why}</div>}
                  {healSt(cur) === "검토 대기" ? <div className="mt-2 flex gap-2"><Btn kind="primary" icon={CheckCircle2} onClick={() => approveHeal(cur)}>승인 · 로케이터 반영</Btn><Btn icon={Pencil} onClick={() => rejectHeal(cur)}>직접 수정</Btn></div> : <div className={"mt-2 text-xs " + (healSt(cur) === "적용 실패" ? "text-red-700" : "text-slate-500")}>{HEAL_MSG[healSt(cur)]}</div>}
                </div>
              )}
              {Array.isArray(cur.rows) && cur.rows.length > 0 && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">행 결과 <span className="font-normal text-slate-500">· 데이터셋 {cur.ds || "-"} · {rowSum(cur)}</span>{cur.stopped && <span className="ml-2 text-amber-700">· {cur.stopped}</span>}</span>
                    <button onClick={() => setRowsAll(!rowsAll)} className="text-xs text-sky-600 hover:text-sky-600">{rowsAll ? "실패 행만" : "전체 " + cur.rows.length + "행 보기"}</button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {(rowsAll ? cur.rows : cur.rows.filter((r) => r.v !== "PASS")).map((r) => (
                      <div key={r.i} onClick={() => setSelRow(r.i)} className={"cursor-pointer rounded border px-2.5 py-1.5 text-xs " + (curRow && curRow.i === r.i ? SEL_CARD : r.v === "FAIL" ? "border-red-200 bg-red-50 hover:border-red-300" : "border-slate-200 bg-slate-100 hover:border-slate-400")}>
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-slate-500">{r.i}행</span>
                          <span className="flex-1 truncate font-mono text-slate-700">{Object.entries(r.data || {}).map(([k, v]) => k + "=" + v).join(" · ")}</span>
                          <span className="text-slate-500">{r.dur || "-"}</span>
                          <Badge kind={r.v === "PASS" ? "pass" : r.v === "FAIL" ? "fail" : "draft"}>{r.v === "SKIP" ? "미실행" : r.v}</Badge>
                        </div>
                        {r.err && <div className="mt-1 text-red-700" style={{ paddingLeft: 38 }}>{r.err}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-slate-500" style={{ fontSize: 11 }}>판정은 케이스 단위 1건이다 — 한 행이라도 실패하면 FAIL. 행 데이터는 실행 시점 스냅샷이다. 행을 클릭하면 아래 스텝·증적이 그 행으로 바뀐다.</div>
                </div>
              )}
              <div className="mb-2 text-xs font-semibold text-slate-500">{fullCode ? "실행 결과" : "스텝 실행 타임라인"}{curRow && <span className="ml-1.5 font-normal text-sky-600">· {curRow.i}행</span>}</div>
              {fullCode ? (
                /* 코드가 정본인 케이스 — 스텝 경계가 없으므로 테스트 단위 판정과 에러만 준다 */
                <div className="space-y-1.5">
                  {(() => { const v = curRow ? curRow.v : cur.v, d = curRow ? curRow.dur : cur.dur, e = curRow ? curRow.err : null;
                    if (v === "SKIP") return <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><AlertTriangle size={14} className="text-slate-500" /><span className="font-medium text-slate-800">미실행</span><span className="flex-1 font-mono text-slate-500">앞선 행에서 중단되어 실행되지 않았습니다</span></div>;
                    return <div className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " + (v === "FAIL" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-100")}>
                      {v === "FAIL" ? <XCircle size={14} className="text-red-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
                      <span className={"font-medium " + (v === "FAIL" ? "text-red-700" : "text-slate-800")}>{v === "FAIL" ? "테스트 실패" : "테스트 통과"}</span>
                      <span className="flex-1 font-mono text-slate-500">{e || (v === "FAIL" ? "에러 스택은 증적에서 확인" : cur.name)}</span>
                      <span className="text-slate-500">{d || "-"}</span>
                    </div>; })()}
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500" style={{ fontSize: 11 }}>
                    Full-Code 케이스는 스텝 상세가 없습니다 — 스텝 경계는 <span className="font-mono text-slate-500">test.step()</span> 으로만 만들어집니다. 코드에 없으면 러너도 알 수 없으므로 지어내지 않습니다. 같은 이유로 <span className="text-slate-700">보정 제안은 Low-Code 케이스에만</span> 제공됩니다 — 코드의 어느 줄을 고쳐야 하는지 알 수 없기 때문입니다.
                  </div>
                </div>
              ) : (
              <div className="space-y-1.5">
                {stepsFor(cur, curRow).map((st, i) => (
                  <div key={i} className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " + (!st.ok ? "border-red-200 bg-red-50" : st.skip ? "border-slate-200 bg-white" : st.warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-100")}>
                    {!st.ok ? <XCircle size={14} className="text-red-600" /> : st.skip ? <AlertTriangle size={14} className="text-slate-500" /> : st.warn ? <AlertTriangle size={14} className="text-amber-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
                    <span className={"font-medium " + (!st.ok ? "text-red-700" : st.warn ? "text-amber-800" : "text-slate-800")}>{st.act}</span>
                    <span className="flex-1 font-mono text-slate-500">{st.info}</span>
                    <span className="text-slate-500">{st.dur}</span>
                  </div>
                ))}
              </div>
              )}
              <div className="mt-3">
                <div className="flex items-center justify-between border-b border-slate-200">
                  <div className="flex gap-1.5">
                    {evTabs.map((t) => (<button key={t} onClick={() => setEtab(t)} className={"px-2.5 py-1.5 text-xs " + (evTab === t ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-500 hover:text-slate-700")}>{t}</button>))}
                  </div>
                  {/* 증적은 '한 번이라도 실패한 행'만 보관한다 — 통과·미실행 행에는 내려받을 것이 없다 */}
                  {!(curRow && curRow.v !== "FAIL") && <button onClick={() => flash((curRow ? cur.id + " " + curRow.i + "행" : cur.id) + " · " + evTab + " 다운로드")} className="flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-sky-600 hover:text-sky-600"><Download size={12} />{evTab} 다운로드</button>}
                </div>
                {curRow && curRow.v !== "FAIL" ? (
                  <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-slate-500">{curRow.i}행은 {curRow.v === "SKIP" ? "실행되지 않아" : "통과해"} 보관된 증적이 없습니다 · 증적은 한 번이라도 실패한 행만 보관합니다</div>
                ) : (
                <div className="flex h-24 items-center justify-center text-xs text-slate-500">{(() => { const nm = cur.id + (curRow ? "_row" + curRow.i : "");
                  if (evTab === "trace") return nm + "_trace.zip · 4.2MB · Playwright Trace Viewer로 열기";
                  if (evTab === "HAR") return nm + ".har · 네트워크 전체 기록 · 1.1MB";
                  if (evTab === "요청") return nm + " · 요청 원문 · 메서드·URL·헤더·바디";
                  if (evTab === "응답") return nm + " · 응답 " + (cur.v === "FAIL" ? "4xx · 불일치" : "200 OK") + " · body.json";
                  if (evTab === "로그") return nm + " · HTTP trace · 헤더 · 타이밍";
                  if (evTab === "스크린샷") return nm + (cur.v === "FAIL" ? "_fail" : "_pass") + ".png · 1.4MB";
                  if (evTab === "영상") return run.id.toLowerCase().replace("-", "_") + "_" + nm.toLowerCase() + ".webm · 12MB";
                  return nm + " · console/network 로그"; })()}</div>
                )}
                {/* 언제 사라지는지 알려준다 — 결함에 걸린 증적은 기간과 무관하게 남는다(참조 기준, 기간 기준이 아님) */}
                <div className="mt-1.5 text-slate-500" style={{ fontSize: 11 }}>증적 보존 30일{defectsOfTc(cur.id).length > 0 && <span className="text-slate-500"> · 결함에 연결되어 결함 종료 시까지 유지됩니다</span>}</div>
              </div>
            </Card>
            )}
          </div>
          )}
        </>
      )}
      {mode === "회귀" && (
        <>
          <Card className="p-3"><Field label="실행 계획 (비교 맥락)"><Select value={regPlan == null ? "" : regPlan} onChange={(e) => setRegPlan(+e.target.value)}>{fqaPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field></Card>
          {planRuns.length < 2 ? (
            <Card className="p-8 text-center text-sm text-slate-500">이 계획에는 비교할 완료된 실행이 2건 이상 필요합니다 (현재 {planRuns.length}건).</Card>
          ) : (
          <>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4"><div className="mb-1 text-xs text-slate-500">A — 기준(baseline)</div><Select value={aId} onChange={(e) => setAId(e.target.value)}>{planRuns.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.at} · {rate(r)}%</option>)}</Select><div className="mt-3 text-4xl font-bold text-slate-700">{rate(runA)}%</div></Card>
            <Card className="border-sky-300 p-4"><div className="mb-1 text-xs text-slate-500">B — 비교(target)</div><Select value={bId} onChange={(e) => setBId(e.target.value)}>{planRuns.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.at} · {rate(r)}%</option>)}</Select><div className="mt-3 text-4xl font-bold text-sky-600">{rate(runB)}%</div></Card>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-center"><div className="text-2xl font-bold text-emerald-600">{summ["개선"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">개선</div></Card>
            <Card className="p-4 text-center"><div className="text-2xl font-bold text-red-600">{summ["퇴행"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">퇴행 (회귀)</div></Card>
            <Card className="p-4 text-center"><div className="text-2xl font-bold text-slate-700">{summ["유지"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">유지</div></Card>
          </div>
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">케이스 회귀 분석 <span className="font-normal text-slate-500">· {aId} → {bId}</span>{runDiff && <span className="ml-2 font-normal text-amber-600" style={{ fontSize: 12 }}>· {runDiff} — 판정 차이를 제품 회귀로 단정할 수 없습니다</span>}<span className="ml-2 font-normal text-slate-500" style={{ fontSize: 11 }}>행을 클릭하면 {bId} 결과 상세로 이동합니다</span></div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">ID</th><th className="font-medium">TC</th><th className="font-medium">A</th><th></th><th className="font-medium">B</th><th className="font-medium">변화</th></tr></thead>
              <tbody>
                {regRows.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">두 실행 모두 케이스 단위 결과가 없습니다.</td></tr>)}
                {regRows.map((r) => { const v = cls(r.a, r.b); const revd = r.ra != null && r.rb != null && r.ra !== r.rb; const rv = (n) => (n == null ? null : <span className="ml-1.5 font-mono text-slate-500" style={{ fontSize: 10 }}>rev {n}</span>); return (
                  <tr key={r.id} onClick={() => nav && nav("fqa-result-detail", bId)} title={bId + " 결과 상세로 이동"} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:brightness-125 " + (v.k === "퇴행" ? "bg-red-50" : "")}>
                    <td className="px-4 py-2.5 font-mono text-sky-600">{r.id}</td><td className="text-slate-700">{r.name}</td><td className="whitespace-nowrap">{r.a ? <Badge kind={vK[r.a]}>{r.a}</Badge> : <span className="text-xs text-slate-500">없음</span>}{rv(r.ra)}</td><td className="text-slate-500">→</td><td className="whitespace-nowrap">{r.b ? <Badge kind={vK[r.b]}>{r.b}</Badge> : <span className="text-xs text-slate-500">없음</span>}{rv(r.rb)}</td>
                    {/* rev가 다르면 판정 변화의 원인을 제품으로 단정할 수 없다 — 그 사실만 덧붙이고 결론은 내리지 않는다 */}
                    <td className={"font-semibold whitespace-nowrap " + v.c}>{v.k}{revd && <span className="ml-1.5 font-normal text-amber-600" style={{ fontSize: 11 }}>· 케이스 변경</span>}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </Card>
          </>
          )}
        </>
      )}
      {mode === "불안정" && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">최근 실행 이력 기준(TC별 누적)</span>
            <span className="text-slate-500">·</span>
            <span className="text-amber-700">Flaky {flakyN}건</span>
            <span className="text-red-700">지속 실패 {persistN}건</span>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">TC</th><th className="font-medium">문제 빈도</th><th className="font-medium">유형</th><th className="font-medium">최근 추세</th><th></th></tr></thead>
              <tbody>
                {FLAKY.length === 0 && (<tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">불안정·지속 실패로 분류된 TC가 없습니다.</td></tr>)}
                {FLAKY.map((r) => (
                  <tr key={r.id} className="border-b border-slate-200 text-slate-700 hover:bg-slate-100">
                    <td className="px-4 py-3"><div className="font-mono text-xs text-sky-600">{r.id}</div><div className="flex items-center gap-1.5 text-slate-800">{r.name}{r.quarantined && <Badge kind="draft">격리됨</Badge>}</div><div className="text-xs text-slate-500">{r.suite}</div></td>
                    <td className="pr-4" style={{ minWidth: 150 }}><div className="mb-0.5 text-xs text-slate-500">{r.unstable}/{r.runs}회 · {r.urate}%</div><div className="h-1.5 rounded bg-slate-100" style={{ width: 130 }}><div className="h-1.5 rounded" style={{ width: r.urate + "%", background: r.flaky ? C.warn : C.err }} /></div></td>
                    <td><div className="flex flex-wrap items-center gap-1">{r.flaky ? <Badge kind="warn">Flaky</Badge> : <Badge kind="fail">지속 실패</Badge>}{r.cause && <Badge kind={CAUSE_K[r.cause] || "draft"}>{r.cause}</Badge>}{r.heal && <Badge kind="active">보정</Badge>}</div></td>
                    <td className="text-xs text-slate-500">{r.streak}</td>
                    <td className="pr-4 text-right whitespace-nowrap">{/* 🔑 격리 여부를 먼저 본다. flaky 로만 분기하면 격리된 케이스가 지속 실패로
                        재분류되는 순간 해제 버튼이 사라져 되돌릴 방법이 없어진다(앱에 다른 해제 경로가 없다). */}
                    {r.quarantined
                      ? <button onClick={() => toggleQuar(r)} className="mr-3 text-xs text-sky-600 hover:text-sky-700">격리 해제</button>
                      : r.flaky
                        ? <button onClick={() => toggleQuar(r)} className="mr-3 text-xs text-amber-700 hover:text-amber-800">격리</button>
                        : (hasDefFQA(r.id) ? <span className="mr-3 text-xs text-slate-500">등록됨</span> : <button onClick={() => regFail(r)} className="mr-3 text-xs text-red-700 hover:text-red-800">결함 등록</button>)}<button onClick={() => (nav ? nav("fqa-cases", r.id) : flash(r.id + " 테스트케이스로 이동"))} className="text-xs text-slate-500 hover:text-sky-600">TC 보기</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="text-xs text-slate-500">판정 기준: <span className="text-slate-500">최근 실행 4회</span>를 TC별 누적 · 결과 교차(PASS/FAIL 혼재)=<span className="text-amber-700">Flaky→격리</span>, 연속 실패=<span className="text-red-700">지속 실패→결함</span>. 격리된 TC는 <span className="text-slate-700">실행 대상에서 빠지며</span>, 그동안 이력이 쌓이지 않으므로 복귀는 사람이 판단해 해제해야 합니다. <span className="text-slate-500">※ 3회 이상 실행된 TC만 분류합니다.</span></div>
        </>
      )}
      <Toast msg={msg} />
    </div>
  );
}
/* ═══════════ 8. FQA 대시보드 ═══════════ */
const barColor = (p) => (p >= 90 ? C.sky : p >= 80 ? C.warn : C.err);
export function FqaDashboardScreen({ nav }) {
  const { fqaRuns, fqaCases, fqaSuites, fqaPlans, defects, healState } = useApp();
  const [msg, flash] = useToast();
  const toISO = (d) => { const z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
  const [today] = useState(() => toISO(new Date()));
  const [defFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return toISO(d); });
  const [planF, setPlanF] = useState("전체");
  const [from, setFrom] = useState(defFrom);
  const [to, setTo] = useState(today);
  const minFromOf = (t) => { const d = new Date(t); d.setMonth(d.getMonth() - 6); return toISO(d); };
  const setRange = (nf, nt) => { if (nf > nt) nf = nt; const mf = minFromOf(nt); if (nf < mf) { nf = mf; flash("기간은 최대 6개월까지 지정할 수 있습니다"); } setFrom(nf); setTo(nt); };
  const dOf = (r) => String(r.startedAt || r.endedAt || "").slice(0, 10);
  const inPlan = (r) => planF === "전체" || r.planId === planF;
  const inPeriod = (r) => { const ds = dOf(r); if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return true; return ds >= from && ds <= to; };
  const fruns = fqaRuns.filter((r) => inPlan(r) && inPeriod(r));   // 계획·기간으로 스코프한 실행 집합
  const filtered = planF !== "전체" || from !== defFrom || to !== today;
  const sK = { "실행 중": "warn", "대기 중": "info", "완료": "pass", "오류": "fail" };
  const rate = (r) => (r && r.total ? Math.round((r.pass / r.total) * 1000) / 10 : 0);
  const byDate = (a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || ""));
  const finished = fruns.filter((r) => r.status === "완료").slice().sort(byDate);
  const lastRun = finished[0];
  const recent = fruns.slice().sort(byDate).slice(0, 5);
  const totalTc = fqaCases.length;
  const approved = fqaCases.filter((c) => c.status === "승인").length;
  const flakyRows = fqaCases.filter((c) => histOf(fruns, c.id).length >= 1).map((c) => {
    const h = histOf(fruns, c.id); const fails = h.filter((v) => v === "FAIL").length; const passes = h.filter((v) => v === "PASS").length; const warns = h.filter((v) => v === "WARN").length;
    let trail = 0; for (let i = h.length - 1; i >= 0; i--) { if (h[i] === "FAIL") trail++; else break; }
    const rt = Math.round((fails / h.length) * 100);
    const persistent = h.length >= 3 && fails / h.length >= 0.6 && trail >= 2;
    /* 불안정 화면(1964)과 같은 식이어야 한다 — 두 화면이 같은 TC 를 다르게 분류하면 안 된다 */
    const flaky = !persistent && h.length >= 3 && (warns > 0 || (fails > 0 && passes > 0));
    return { id: c.id, name: c.name, runs: h.length, fails, rate: rt, flaky, persistent };
  }).filter((r) => r.flaky || r.persistent);
  const unstableN = flakyRows.length;
  const topFail = flakyRows.slice().sort((a, b) => b.rate - a.rate).slice(0, 4);
  const openDef = defects.filter((d) => (d.domain || "LQA") === "FQA" && d.status !== "Resolved").length;
  const suiteHealth = fqaSuites.map((su) => {
    const cs = fqaCases.filter((c) => c.suite === su.name);
    const rated = cs.filter((c) => ["PASS", "FAIL", "WARN"].includes(lastOf(fruns, c.id)));
    const pass = rated.length ? Math.round((cs.filter((c) => ["PASS", "WARN"].includes(lastOf(fruns, c.id))).length / rated.length) * 100) : null;
    return { name: su.name, tc: cs.length, pass };
  });
  // 추이 = 완료 실행을 일자별로 집계 (실행 수 + 평균 PASS율) — 하드코딩 없이 실행에서 파생
  const byDay = {}; finished.forEach((r) => { const d = dOf(r); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return; (byDay[d] = byDay[d] || []).push(rate(r)); });
  const trend = Object.keys(byDay).sort().map((d) => ({ d: d.slice(5).replace("-", "/"), runs: byDay[d].length, pass: Math.round(byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length) }));
  // 브라우저별 = 완료 실행을 '실행 브라우저(run.brow)'로 집계 (웹 실행만; API 실행은 brow 없음)
  const browMap = {}; finished.filter((r) => r.brow).forEach((r) => (browMap[r.brow] = browMap[r.brow] || []).push(rate(r)));
  const browRows = Object.keys(browMap).sort().map((b) => ({ b, p: Math.round(browMap[b].reduce((a, x) => a + x, 0) / browMap[b].length), runs: browMap[b].length }));
  const planNow = (id) => (fqaPlans.find((p) => p.id === id) || {}).name;
  /* 🔑 보정 제안 지표 — 자가보정이 도움인지 소음인지 판단하는 유일한 신호는 채택률이다.
     제안 건수는 실행에서 파생하고(케이스에 저장하지 않는다), 검토 결과만 healState 에서 읽는다.
     승인률이 낮으면 제안을 늘릴 게 아니라 제안 규칙을 고쳐야 한다는 뜻이다. */
  const healIds = Array.from(new Set(finished.reduce((a, r) => a.concat((r.tcs || []).filter((t) => healUsable(fqaCases, t)).map(healKey)), [])));
  const healPend = healIds.filter((k) => !healState[k]).length;
  const healOk = healIds.filter((k) => healState[k] === "승인됨").length;
  /* 🔑 실패 원인 분포 — "무엇을 고칠까" 가 아니라 "어디에 투자할까" 를 답한다.
     로케이터 비중이 낮으면 자가보정은 곁다리다. 이 숫자 없이 정하면 근거가 없다.
     실행에서 파생하므로 기간·계획 필터를 그대로 따른다. */
  const causeCnt = {};
  finished.forEach((r) => (r.tcs || []).forEach((t) => { if (t.cause) causeCnt[t.cause] = (causeCnt[t.cause] || 0) + 1; }));
  const causeTot = Object.keys(causeCnt).reduce((a, k) => a + causeCnt[k], 0);
  const causeRows = CAUSE_ORDER.filter((k) => causeCnt[k]).map((k) => ({ k, n: causeCnt[k], p: Math.round((causeCnt[k] / causeTot) * 100) }));
  const KPI = [
    ["자동화 TC", totalTc, "text-slate-900", "저장소 등록"],
    ["PASS율(최근 실행)", lastRun ? rate(lastRun) + "%" : "—", "text-emerald-600", lastRun ? lastRun.id : "실행 없음"],
    ["승인 TC", approved + "/" + totalTc, "text-sky-600", "승인/전체"],
    ["불안정 TC", unstableN, "text-amber-600", "Flaky+지속 실패"],
    ["미해결 결함", openDef, "text-red-600", "기능 · Open"],
    ["보정 제안", healPend, "text-sky-600", healIds.length ? "미검토 · 승인 " + healOk + "/" + healIds.length : "제안 없음"],
  ];
  return (
    <div className="space-y-4">
      <PageToolbar desc="자동화 현황 · 스위트 건강도 (실행·케이스·결함에서 파생)">
        <div style={{ width: 200 }}><Select value={planF} onChange={(e) => setPlanF(e.target.value === "전체" ? "전체" : +e.target.value)}><option value="전체">전체 계획</option>{fqaPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <input type="date" value={from} min={minFromOf(to)} max={to} onChange={(e) => setRange(e.target.value, to)} className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-sky-500" />
        <span className="text-slate-500">~</span>
        <input type="date" value={to} min={from} max={today} onChange={(e) => setRange(from, e.target.value)} className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-sky-500" />
      </PageToolbar>
      {filtered && <div className="text-xs text-slate-500">필터: {planF === "전체" ? "전체 계획" : planNow(planF)} · {from} ~ {to} · 실행 {fruns.length}건</div>}
      <div className="grid grid-cols-6 gap-3">
        {KPI.map((k) => (<Card key={k[0]} className="p-4"><div className="text-xs text-slate-500">{k[0]}</div><div className={"mt-1 text-3xl font-bold " + k[2]}>{k[1]}</div><div className="mt-1 text-xs text-slate-500">{k[3]}</div></Card>))}
      </div>
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800">실패 원인 분포 <span className="text-xs font-normal text-slate-500">완료 실행 기준</span></span>
          <span className="text-xs text-slate-500">러너가 에러 문장 규칙으로 자동 분류</span>
        </div>
        {causeTot === 0 ? (
          <div className="rounded-lg bg-slate-100 px-3 py-4 text-center text-xs text-slate-500">기간 내 실패·경고가 없습니다</div>
        ) : (
          <>
            <div className="flex h-2 overflow-hidden rounded bg-slate-100">
              {causeRows.map((c) => (<div key={c.k} style={{ width: c.p + "%" }} className={CAUSE_BG[c.k]} title={c.k + " " + c.n + "건"} />))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {causeRows.map((c) => (
                <span key={c.k} className="flex items-center gap-1.5">
                  <span className={"inline-block h-2 w-2 rounded-sm " + CAUSE_BG[c.k]} />
                  <span className={CAUSE_TX[c.k]}>{c.k}</span>
                  <span className="text-slate-500">{c.n}건 · {c.p}%</span>
                </span>
              ))}
            </div>
          </>
        )}
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><TrendingUp size={15} className="text-sky-600" />실행·PASS율 추이 <span className="font-normal text-slate-500">· 완료 실행 일자별</span></div>
        {trend.length === 0 ? (
          <div className="py-14 text-center text-xs text-slate-500">기간 내 완료된 실행이 없습니다.</div>
        ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={trend}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="d" stroke={C.axis} fontSize={11} />
            <YAxis yAxisId="l" stroke={C.axis} fontSize={11} allowDecimals={false} />
            <YAxis yAxisId="r" orientation="right" domain={[0, 100]} stroke={C.axis} fontSize={11} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="l" dataKey="runs" name="실행 수" fill={C.skyFill} radius={[3, 3, 0, 0]} barSize={22} />
            <Line yAxisId="r" type="monotone" dataKey="pass" name="PASS율(%)" stroke={C.sky} strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </Card>
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Activity size={15} className="text-sky-600" />스위트 건강도 (케이스 최근 결과 기준)</div>
          <div className="space-y-2.5">
            {suiteHealth.map((s) => (
              <div key={s.name}>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-700">{s.name} <span className="text-slate-500">· {s.tc} TC</span></span>{s.pass == null ? <span className="text-slate-500">미실행</span> : <span className="font-semibold" style={{ color: barColor(s.pass) }}>{s.pass}%</span>}</div>
                <div className="h-2 rounded bg-slate-100">{s.pass != null && <div className="h-2 rounded" style={{ width: s.pass + "%", background: barColor(s.pass) }} />}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">브라우저별 PASS율 <span className="font-normal text-slate-500">· 실행 브라우저 기준</span></div>
          <div className="space-y-3">
            {browRows.length === 0 && <div className="rounded-lg bg-slate-100 px-3 py-6 text-center text-xs text-slate-500">웹 실행 이력이 없습니다</div>}
            {browRows.map((r) => (
              <div key={r.b}>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-700">{r.b} <span className="text-slate-500">· {r.runs}회</span></span><span className="font-semibold" style={{ color: barColor(r.p) }}>{r.p}%</span></div>
                <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded" style={{ width: r.p + "%", background: barColor(r.p) }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">실행한 브라우저만 집계 · API 실행은 제외합니다.</div>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><AlertTriangle size={15} className="text-amber-600" />빈발 실패 Top</span><button onClick={() => (nav ? nav("fqa-flaky") : flash("불안정으로 이동"))} className="text-xs text-sky-600">전체 보기</button></div>
          <div className="space-y-2">
            {topFail.length === 0 && <div className="rounded-lg bg-slate-100 px-3 py-6 text-center text-xs text-slate-500">불안정·지속 실패 TC가 없습니다</div>}
            {topFail.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
                <div><span className="font-mono text-xs text-sky-600">{h.id}</span> <span className="text-slate-800">{h.name}</span><div className="text-xs text-slate-500">최근 {h.runs}회 중 {h.fails}회 실패 · {h.rate}%</div></div>
                {h.flaky ? <Badge kind="warn">Flaky</Badge> : <Badge kind="fail">지속 실패</Badge>}
              </div>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><span className="text-sm font-semibold text-slate-800">최근 실행</span><Btn icon={History} onClick={() => (nav ? nav("fqa-history") : flash("실행 이력으로"))}>실행 이력으로</Btn></div>
          <table className="w-full text-sm">
            <tbody className="text-slate-700">
              {recent.length === 0 && <tr><td className="px-4 py-6 text-center text-xs text-slate-500">실행 이력이 없습니다</td></tr>}
              {recent.map((r) => (
                <tr key={r.id} onClick={() => nav && nav("fqa-result-detail", r.id)} className="cursor-pointer border-b border-slate-200 hover:bg-slate-100"><td className="px-4 py-2.5 font-mono text-xs text-sky-600">{r.id}</td><td className="text-slate-800">{planNow(r.planId) || r.plan || r.name}</td><td className="text-xs text-slate-500">{r.progt}</td><td className="pr-4 text-right"><Badge kind={sK[r.status]}>{r.status}</Badge></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
/* ═══════════ 9. 테스트케이스 (통합 저장소) ═══════════ */
export function FqaCasesScreen() {
  const { fqaCases, fqaSuites, addFqaCase, setFqaCaseStatus, removeFqaCase, commitFqaCase, fqaEditTc, setFqaEditTc, fqaSuiteFocus, setFqaSuiteFocus, goTo, navTick } = useApp();
  const editorDirty = useRef(false);
  /* 좌측 메뉴 '테스트케이스' 재클릭 → 목록으로 (미저장 확인은 goTo 가 이미 했다). 처음 마운트 때는 무시 */
  const tick0 = useRef(navTick);
  useEffect(() => { if (navTick === tick0.current) return; editorDirty.current = false; setMode("목록"); setOpen(null); setBlank(null); setAddOpen(false); }, [navTick]);
  useEffect(() => { if (fqaEditTc) { const c = fqaCases.find((x) => x.id === fqaEditTc); if (c) { setSel(c); setMode("edit"); } setFqaEditTc(null); } }, [fqaEditTc]);
  const [msg, flash] = useToast();
  const [mode, setMode] = useState(() => (fqaEditTc && fqaCases.some((x) => x.id === fqaEditTc)) ? "edit" : "목록");
  const [addOpen, setAddOpen] = useState(false);
  const [blank, setBlank] = useState(null);   // 직접 작성 모달 { name, suite }
  const [newPlat, setNewPlat] = useState("Web");
  const [q, setQ] = useState("");
  const [stf, setStf] = useState("전체");
  const [suiteF, setSuiteF] = useState("전체");
  const [tagF, setTagF] = useState("전체");
  const [platF, setPlatF] = useState("전체");
  // 스위트 화면의 "전체 N건 보기" — 해당 스위트로 필터를 걸고 목록을 연다
  useEffect(() => { if (fqaSuiteFocus) { setMode("목록"); setSuiteF(fqaSuiteFocus); setQ(""); setStf("전체"); setTagF("전체"); setPlatF("전체"); setFqaSuiteFocus(null); } }, [fqaSuiteFocus]);
  const [sel, setSel] = useState(() => (fqaEditTc ? fqaCases.find((x) => x.id === fqaEditTc) || null : null));
  const [open, setOpen] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const stK = { "승인": "pass", "검토중": "warn", "초안": "draft" };
  const lvK2 = { "Low-Code": "active", "Full-Code": "warn" };
  const lvLabel = (c) => c.level;
  // 수정 최신순 — 방금 만들거나 고친 케이스가 위로. (updatedAt 없는 시드는 뒤로)
  const list = fqaCases.filter((c) => (stf === "전체" || c.status === stf) && (suiteF === "전체" || c.suite === suiteF) && (tagF === "전체" || tagList(c.tags).includes(tagF)) && (platF === "전체" || surfacesOf(c) === platF) && (c.id + c.name + c.suite + c.tags).toLowerCase().includes(q.toLowerCase()))
    .slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const delCase = (c, after) => { if (!window.confirm(c.id + " 삭제할까요? 되돌릴 수 없습니다.")) return; removeFqaCase(c.id); if (after) after(); flash(c.id + " 삭제됨"); };
  const togglePick = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = list.length > 0 && list.every((c) => picked.has(c.id));
  const toggleAll = () => { if (allPicked) setPicked(new Set()); else setPicked(new Set(list.map((c) => c.id))); };
  const bulkSet = (st) => { picked.forEach((id) => setFqaCaseStatus(id, st)); flash(picked.size + "건 " + st + " 처리"); setPicked(new Set()); };
  const bulkDel = () => { if (!window.confirm(picked.size + "건을 삭제할까요? 되돌릴 수 없습니다.")) return; picked.forEach((id) => removeFqaCase(id)); flash(picked.size + "건 삭제됨"); setPicked(new Set()); };
  /* 일괄 스위트·태그 변경.
     🔑 상태(status)와 달리 스위트·태그는 VER_FIELDS 에 있는 '리비전 대상' 필드다.
        updateFqaCase 로 조용히 바꾸면 케이스 변경 이력에 흔적이 남지 않는다 — commitFqaCase 로 리비전을 남긴다.
     🔑 스위트가 틀리면 실행 계획이 그 케이스를 아예 잡지 않는다(실패가 아니라 누락). 그래서 되돌릴 길이 있어야 한다. */
  const pickedCases = () => fqaCases.filter((c) => picked.has(c.id));
  const [suiteModal, setSuiteModal] = useState(null);   // 일괄 스위트 변경: 이동할 스위트명
  const [tagModal, setTagModal] = useState(null);       // 일괄 태그: { [caseId]: "tag,tag" } 초안
  const openSuiteModal = () => setSuiteModal((fqaSuites[0] || {}).name || "");
  const applySuite = () => {
    const to = suiteModal, tgt = pickedCases().filter((c) => c.suite !== to);
    if (!to) { flash("이동할 스위트를 고르세요"); return; }
    if (!tgt.length) { flash("이미 모두 " + to + " 입니다"); setSuiteModal(null); return; }
    tgt.forEach((c) => commitFqaCase(c.id, { suite: to }, { note: "일괄 스위트 변경" }));
    flash(tgt.length + "건 → " + to); setSuiteModal(null); setPicked(new Set());
  };
  const openTagModal = () => { const d = {}; pickedCases().forEach((c) => { d[c.id] = c.tags || ""; }); setTagModal(d); };
  const tagOn = (id, t) => tagList(tagModal[id]).includes(t);
  const togTag = (id, t) => setTagModal((d) => { const cur = tagList(d[id]); return { ...d, [id]: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(",") }; });
  /* 열 머리 = 전체 토글. 하나라도 꺼져 있으면 전부 켜고, 전부 켜져 있으면 전부 끈다.
     임포트 직후처럼 'regression 을 전부에' 다는 경우가 대부분이라 이게 없으면 결국 하나씩 누르게 된다. */
  const colAll = (t) => Object.keys(tagModal || {}).every((id) => tagList(tagModal[id]).includes(t));
  const togCol = (t) => setTagModal((d) => { const all = Object.keys(d).every((id) => tagList(d[id]).includes(t)); const o = {}; Object.keys(d).forEach((id) => { const cur = tagList(d[id]); o[id] = (all ? cur.filter((x) => x !== t) : (cur.includes(t) ? cur : [...cur, t])).join(","); }); return o; });
  const applyTags = () => {
    const tgt = pickedCases().filter((c) => (c.tags || "") !== (tagModal[c.id] || ""));
    if (!tgt.length) { flash("변경된 태그가 없습니다"); setTagModal(null); return; }
    tgt.forEach((c) => commitFqaCase(c.id, { tags: tagModal[c.id] || "" }, { note: "일괄 태그 변경" }));
    flash(tgt.length + "건 태그 변경"); setTagModal(null); setPicked(new Set());
  };
  const Back = () => <button onClick={() => { if (editorDirty.current && !window.confirm("저장하지 않은 변경이 있습니다. 목록으로 나가시겠습니까?")) return; editorDirty.current = false; setMode("목록"); }} className="mb-3 inline-flex items-center gap-1 text-xs text-sky-600"><ChevronLeft size={14} />테스트케이스 목록</button>;
  /* 직접 작성 — 빈 케이스를 만들고 에디터를 연다.
     스크립트로 시작하면 Full-Code로 진입한다(외부에서 쓰던 코드를 그대로 붙여넣는 경로). */
  const createBlank = () => {
    const name = (blank.name || "").trim();
    if (!name) { flash("TC 이름을 입력하세요"); return; }
    // 목록에 넣지 않는다 — 다른 경로처럼 첫 저장 때 생성된다(열기만 하고 안 쓰면 남지 않음)
    const c = { id: nextTcId(fqaCases), origin: "직접 작성", name, suite: blank.suite, tags: "", status: "초안", level: blank.level, dataset: "-", steps: [] };
    if (blank.level === "Full-Code") c.code = stepsToCode([], c);   // 주입 계약이 담긴 골격
    setBlank(null); setSel(c); setMode("edit");
  };
  if (mode === "레코딩") return <div><Back /><FqaRecordScreen onEdit={(c) => { setSel(c); setMode("edit"); }} onDone={(m) => { setMode("목록"); flash(m); }} /></div>;
  if (mode === "api-import") return <div><Back /><FqaApiImportScreen onDone={(m) => { setMode("목록"); flash(m); }} /></div>;
  // 편집 대상은 스토어에서 다시 찾는다 — sel은 스냅샷이라, 저장 후 새 리비전이 에디터에 반영되지 않는다
  const selCase = sel ? (fqaCases.find((c) => c.id === sel.id) || sel) : null;
  // key={id} — 복제로 다른 케이스를 열면 에디터를 새로 마운트해 편집 상태를 갈아끼운다
  if (mode === "edit") return <div><Back /><FqaEditorScreen key={selCase ? selCase.id : "new"} entry={selCase ? selCase.level : "Low-Code"} tc={selCase} onDirty={(d) => { editorDirty.current = d; }} onOpen={(c) => { editorDirty.current = false; setSel(c); }} /></div>;
  return (
    <div className="space-y-4">
      <PageToolbar desc="기능 TC 저장소 · 생성·편집·관리" />
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><Search size={15} className="text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TC·스위트·태그 검색" className="flex-1 bg-transparent text-sm text-slate-800 outline-none" /></div>
        <div style={{ width: 150 }}><Select value={suiteF} onChange={(e) => setSuiteF(e.target.value)}><option>전체</option>{fqaSuites.map((x) => <option key={x.id}>{x.name}</option>)}</Select></div>
        <div style={{ width: 120 }}><Select value={tagF} onChange={(e) => setTagF(e.target.value)}><option>전체</option>{TAGS.map((t) => <option key={t}>{t}</option>)}</Select></div>
        <div style={{ width: 110 }}><Select value={platF} onChange={(e) => setPlatF(e.target.value)}><option>전체</option><option>웹</option><option>API</option><option>웹+API</option></Select></div>
        <div style={{ width: 110 }}><Select value={stf} onChange={(e) => setStf(e.target.value)}><option>전체</option><option>승인</option><option>검토중</option><option>초안</option></Select></div>
        <div className="relative">
          <Btn kind="primary" icon={Plus} onClick={() => setAddOpen(!addOpen)} disabled={fqaSuites.length === 0} title={fqaSuites.length === 0 ? "스위트를 먼저 만드세요 — 케이스는 스위트에 속해야 계획이 잡습니다" : ""}>새 TC</Btn>
          {addOpen && (
            <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-300 bg-white py-1 shadow-xl">
              {/* 모든 경로는 '실행 가능한 스텝'을 만든다 — 스텝 없는 TC는 만들지 않는다 */}
              {[["직접 작성", Pencil, "빈 케이스", true], ["레코딩 (웹)", Video, "레코딩", true], ["API 임포트", FileText, "api-import", true]].map(([l, Ic, m, ok]) => (
                <button key={l} disabled={!ok} onClick={() => { if (!ok) return; setAddOpen(false); if (m === "빈 케이스") { setBlank({ name: "", suite: (fqaSuites[0] || {}).name || "", level: "Low-Code" }); return; } setMode(m); }} className={"flex w-full items-center gap-2 px-3 py-2 text-sm " + (ok ? "text-slate-800 hover:bg-slate-100" : "cursor-not-allowed text-slate-500")}><Ic size={14} className={ok ? "text-sky-600" : "text-slate-400"} />{l}{!ok && <span className="ml-auto text-slate-500" style={{ fontSize: 10 }}>준비 중</span>}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {picked.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm">
          <span className="flex-1 text-sky-700">{picked.size}건 선택됨</span>
          <Btn kind="primary" icon={CheckCircle2} onClick={() => bulkSet("승인")}>선택 승인</Btn>
          <Btn onClick={() => bulkSet("검토중")}>검토중으로</Btn>
          <Btn icon={Layers} onClick={openSuiteModal}>스위트 변경</Btn>
          <Btn icon={Tag} onClick={openTagModal}>태그 지정</Btn>
          <Btn kind="danger" icon={Trash2} onClick={bulkDel}>선택 삭제</Btn>
          <Btn onClick={() => setPicked(new Set())}>선택 해제</Btn>
        </div>
      )}
      {/* ── 일괄 스위트 변경 ── 선택분이 여러 스위트에 흩어져 있을 수 있으니 현재 분포를 먼저 보여준다 */}
      {suiteModal !== null && (
        <Modal title={"스위트 일괄 변경 · " + picked.size + "건"} onClose={() => setSuiteModal(null)}>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">현재 스위트</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(pickedCases().reduce((a, c) => { a[c.suite || "—"] = (a[c.suite || "—"] || 0) + 1; return a; }, {})).map(([k, v]) => (
                  <span key={k} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600">{k} <span className="text-slate-500">{v}</span></span>
                ))}
              </div>
            </div>
            <Field label="이동할 스위트" hint="선택한 케이스 전부가 이 스위트로 옮겨집니다. 변경 이력에 리비전으로 남습니다.">
              <Select value={suiteModal} onChange={(e) => setSuiteModal(e.target.value)}>{fqaSuites.map((su) => <option key={su.id} value={su.name}>{su.name}</option>)}</Select>
            </Field>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setSuiteModal(null)}>취소</Btn><Btn kind="primary" onClick={applySuite}>적용</Btn></div>
          </div>
        </Modal>
      )}
      {/* ── 일괄 태그 지정 ── 케이스별로 켜고 끈다. 열 머리를 누르면 전체 일괄. */}
      {tagModal && (
        <Modal wide title={"태그 지정 · " + picked.size + "건"} onClose={() => setTagModal(null)}>
          <div className="space-y-3">
            <div className="text-xs text-slate-500">칸을 눌러 케이스별로 켜고 끕니다. <span className="text-slate-700">열 머리</span>를 누르면 전체에 한 번에 적용됩니다.</div>
            <div className="overflow-y-auto rounded-lg border border-slate-200" style={{ maxHeight: 380 }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                    <th className="py-2 pl-3 pr-2 font-medium">케이스</th>
                    {TAGS.map((t) => (
                      <th key={t} className="w-24 px-2 py-1.5 text-center">
                        <button onClick={() => togCol(t)} title={TAG_DESC[t] + " · 전체 토글"} className={"w-full rounded-full border px-2 py-0.5 text-xs " + (colAll(t) ? "border-sky-600 bg-sky-100 text-sky-700 font-semibold" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100")}>{t}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pickedCases().map((c) => (
                    <tr key={c.id} className="border-b border-slate-200">
                      <td className="py-1.5 pl-3 pr-2"><span className="font-mono text-xs text-slate-500">{c.id}</span> <span className="text-slate-700">{c.name}</span> <span className="text-xs text-slate-500">· {c.suite}</span></td>
                      {TAGS.map((t) => (
                        <td key={t} className="px-2 py-1.5 text-center">
                          <button onClick={() => togTag(c.id, t)} className={"rounded-full border px-2.5 py-0.5 text-xs " + (tagOn(c.id, t) ? "border-sky-600 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-300 hover:bg-slate-100")}>{tagOn(c.id, t) ? t : "—"}</button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setTagModal(null)}>취소</Btn><Btn kind="primary" onClick={applyTags}>적용</Btn></div>
          </div>
        </Modal>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          {/* 케이스의 속성만 — 실행 결과·결함은 실행의 속성이므로 결과·결함 화면이 본진이다 */}
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="w-8 py-2.5 pl-4"><input type="checkbox" checked={allPicked} onChange={toggleAll} className="accent-sky-600" title="전체 선택" /></th><th className="py-2.5 pr-4 font-medium">ID</th><th className="font-medium">이름</th><th className="font-medium">스위트</th><th className="font-medium">태그</th><th className="font-medium">구성</th><th className="font-medium">관리</th><th className="font-medium">상태</th><th className="font-medium">수정</th><th></th></tr></thead>
          <tbody>
            {/* 아무것도 없는 것과 필터에 걸린 것은 다른 상황이다 — 같은 빈 표를 보여주면 사용자가 원인을 모른다 */}
            {list.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center">
                {fqaCases.length === 0 ? (<>
                  <div className="text-sm font-medium text-slate-700">등록된 테스트케이스가 없습니다</div>
                  {fqaSuites.length === 0 ? (
                    /* 스위트가 먼저다 — 케이스는 스위트에 속해야 계획이 잡는다 */
                    <>
                      <div className="mt-1.5 text-xs text-amber-600">테스트 스위트를 먼저 만드세요. 케이스는 스위트에 속해야 실행 계획이 잡습니다.</div>
                      <Btn className="mt-3" icon={Layers} onClick={() => goTo("fqa-suites")}>테스트 스위트 만들러 가기</Btn>
                    </>
                  ) : (
                    <div className="mt-1.5 text-xs text-slate-500">레코딩으로 만들거나 직접 작성할 수 있습니다. 실행하려면 <span className="text-slate-500">승인</span> 상태여야 합니다.</div>
                  )}
                </>) : (<>
                  <div className="text-sm text-slate-700">조건에 맞는 케이스가 없습니다</div>
                  <div className="mt-1.5 text-xs text-slate-500">검색어·스위트·태그·접점·상태 필터를 확인하세요.</div>
                </>)}
              </td></tr>
            )}
            {list.map((c) => (
              <tr key={c.id} onClick={() => setOpen(c)} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100 " + (picked.has(c.id) ? "bg-slate-100/60" : "")}>
                <td className="pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(c.id)} onChange={() => togglePick(c.id)} className="accent-sky-600" /></td>
                <td className="py-3 pr-4 font-mono text-sky-600">{c.id}</td>
                <td className="text-slate-800">{c.name}</td>
                <td className="text-slate-500">{c.suite}</td>
                <td>{tagList(c.tags).length ? <div className="flex gap-1">{tagList(c.tags).map((t) => <span key={t} className="rounded-full border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t}</span>)}</div> : <span className="text-xs text-slate-500">-</span>}</td>
                <td className="whitespace-nowrap">{surfacesOf(c) === "-" ? <span className="text-xs text-slate-500">-</span> : <Badge kind={SURF_K[surfacesOf(c)] || "info"}>{surfacesOf(c)}</Badge>}{c.preCase && <button onClick={(e) => { e.stopPropagation(); const t = list.find((x) => x.id === c.preCase) || fqaCases.find((x) => x.id === c.preCase); if (t) setOpen(t); }} className="ml-1 font-mono text-slate-500 hover:text-sky-600" style={{ fontSize: 10 }} title={"전제조건 " + c.preCase + " — 클릭하면 그 케이스를 봅니다"}>← {c.preCase}</button>}{c.dataset && c.dataset !== "-" && <span className="ml-1 font-mono text-sky-600" style={{ fontSize: 10 }} title={"데이터셋 " + c.dataset}>⛁ {c.dataset}</span>}</td>
                <td><Badge kind={lvK2[c.level] || "info"}>{lvLabel(c)}</Badge></td>
                <td><Badge kind={stK[c.status]}>{c.status}</Badge></td>
                <td className="pr-2 text-xs text-slate-500 whitespace-nowrap">{c.updatedBy || "—"} · {c.updatedAt || "—"}</td>
                {/* 디버그 실행은 환경을 골라야 한다 — 그 자리는 에디터다 */}
                <td className="pr-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}><button onClick={() => { setSel(c); setMode("edit"); }} className="mr-3 text-xs text-slate-500 hover:text-sky-600">편집</button><button onClick={() => delCase(c)} className="text-slate-500 hover:text-red-600" title="삭제"><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {open && (
        <Portal><div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><span className="font-mono text-sky-600">{open.id}</span><button onClick={() => setOpen(null)} className="text-slate-500 hover:text-slate-700"><X size={20} /></button></div>
            <div className="space-y-4 text-sm">
              <div><div className="text-slate-900">{open.name}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{surfacesOf(open) !== "-" && <Badge kind={SURF_K[surfacesOf(open)] || "info"}>{surfacesOf(open)}</Badge>}<Badge kind="info">{open.suite}</Badge><Badge kind={lvK2[open.level]}>{lvLabel(open)}</Badge><Badge kind={stK[open.status]}>{open.status}</Badge></div></div>
              <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500 space-y-0.5"><div>생성 <span className="text-slate-700">{open.createdBy || "—"}</span> · {open.createdAt || "—"}</div><div>수정 <span className="text-slate-700">{open.updatedBy || "—"}</span> · {open.updatedAt || "—"}</div></div>
              <div><div className="mb-1 text-xs text-slate-500">태그</div>{tagList(open.tags).length ? <div className="flex flex-wrap gap-1.5">{tagList(open.tags).map((t) => <span key={t} className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>)}</div> : <div className="text-xs text-slate-500">없음</div>}</div>
              <div><div className="mb-1 text-xs text-slate-500">데이터셋 (데이터 드리븐)</div><div className="text-xs text-slate-500">{open.dataset && open.dataset !== "-" ? open.dataset : "없음"}</div></div>
              <div><div className="mb-1 text-xs text-slate-500">생성 경로</div><div className="text-xs text-slate-500">{open.origin || "—"}</div></div>
              {/* 실행 결과·결함은 케이스의 속성이 아니다 — 결과·결함 화면이 본진 */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                {(open.status || "검토중") !== "승인"
                  ? <Btn kind="primary" icon={CheckCircle2} onClick={() => { setFqaCaseStatus(open.id, "승인"); setOpen({ ...open, status: "승인" }); flash(open.id + " 승인됨"); }}>승인</Btn>
                  : <Btn icon={RefreshCw} onClick={() => { setFqaCaseStatus(open.id, "검토중"); setOpen({ ...open, status: "검토중" }); flash(open.id + " 검토중으로"); }}>검토중으로</Btn>}
                {/* 실행은 환경을 골라야 한다 — 에디터의 '디버그 실행'이 그 자리다. 여기서 흉내 내지 않는다. */}
                <Btn icon={Code2} onClick={() => { setSel(open); setMode("edit"); setOpen(null); }}>편집(에디터)</Btn>
                <div className="flex-1" />
                <Btn kind="danger" icon={X} onClick={() => delCase(open, () => setOpen(null))}>삭제</Btn>
              </div>
            </div>
          </div>
        </div></Portal>
      )}
      {blank && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBlank(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Pencil size={15} className="text-sky-600" />직접 작성</span>
              <button onClick={() => setBlank(null)} className="text-slate-500 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="space-y-3.5 px-5 py-4">
              <Field label="TC 이름"><Input value={blank.name} onChange={(e) => setBlank({ ...blank, name: e.target.value })} placeholder="예: 쿠폰 중복 적용 차단" /></Field>
              <Field label="스위트"><Select value={blank.suite} onChange={(e) => setBlank({ ...blank, suite: e.target.value })}>{fqaSuites.map((x) => <option key={x.id}>{x.name}</option>)}</Select></Field>
              {/* 외부(VS Code 등)에서 쓰던 스크립트를 그대로 올리는 경로 — 이 경우 Full-Code로 진입한다 */}
              <Field label="작성 방식">
                <div className="grid grid-cols-2 gap-2">
                  {[["Low-Code", "스텝으로 작성", "액션·로케이터를 한 줄씩"], ["Full-Code", "스크립트 붙여넣기", "Playwright 코드를 그대로"]].map(([lv, t, d]) => (
                    <button key={lv} onClick={() => setBlank({ ...blank, level: lv })} className={"rounded-lg border px-3 py-2 text-left " + (blank.level === lv ? "border-sky-500 bg-sky-100" : "border-slate-300 bg-slate-100 hover:bg-slate-200")}>
                      <div className={"text-xs font-medium " + (blank.level === lv ? "text-sky-700" : "text-slate-800")}>{t}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{d}</div>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5"><Btn onClick={() => setBlank(null)}>취소</Btn><Btn kind="primary" icon={Code2} onClick={createBlank}>에디터 열기</Btn></div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
/* ═══════════ 10. 대상·환경 (대상→환경 계층) ═══════════ */
/* 환경 이름은 실행 계획의 참조 키(targetRef.env) — 대상 안에서 유니크해야 한다 */
const ENV_NAMES = ["스테이징", "운영", "개발"];
const TRow = ({ label, on, set, hint }) => (
  <div className="flex items-center justify-between py-1 text-sm text-slate-700"><span>{label}{hint && <span className="ml-1 text-xs text-slate-500">{hint}</span>}</span><TG on={on} onClick={() => set(!on)} /></div>
);
/* 접점 그룹 — 웹/API base URL 두 칸을 하나의 묶음으로 보여준다(둘 중 하나 이상 · 둘 다면 혼합) */
const EndpointGroup = ({ webUrl, apiUrl, set }) => {
  const both = !!webUrl && !!apiUrl;
  return (
    <div className="rounded-lg border border-slate-300 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Globe size={13} className="text-sky-600" />
        <span className="text-xs font-semibold text-slate-700">접점 (Base URL)</span>
        <span className="text-xs text-slate-500">· 둘 중 하나 이상</span>
        {both && <Badge kind="active">혼합 케이스 가능</Badge>}
      </div>
      <div className="space-y-2.5">
        <Field label="웹"><Input value={webUrl} onChange={(e) => set({ webUrl: e.target.value })} placeholder="https://stg.onmarket.io" className="font-mono text-xs" /></Field>
        <Field label="API"><Input value={apiUrl} onChange={(e) => set({ apiUrl: e.target.value })} placeholder="https://api-stg.onmarket.io" className="font-mono text-xs" /></Field>
      </div>
    </div>
  );
};
export function FqaTargetScreen() {
  const [msg, flash] = useToast();
  const { fqaSystems: systems, addFqaSystem, updateFqaSystem, removeFqaSystem, fqaPlans, fqaCases, setNavGuard } = useApp();
  const [sel, setSel] = useState(0);
  const [envIdx, setEnvIdx] = useState(0);
  const [test, setTest] = useState(null);
  const [modal, setModal] = useState(null);
  const [block, setBlock] = useState(null); // 참조 중이라 삭제가 막힌 경우
  const [tf, setTf] = useState({ name: "", env: "스테이징", webUrl: "", apiUrl: "" });
  const [ef, setEf] = useState({ env: "개발", webUrl: "", apiUrl: "" });
  const [draft, setDraft] = useState({});
  const [nameDraft, setNameDraft] = useState(null);
  const stK = { "연결됨": "pass", "미확인": "warn", "오류": "fail" };
  /* 🔴 신규 조직은 대상이 0건으로 시작한다 — sys.envs 접근 전에 막지 않으면 첫 화면에서 터진다.
     지금은 "최소 1개 유지" 가드 덕에 도달하지 않지만, 실 구현에서는 반드시 겪는 상태다. */
  const sys = systems[sel] || systems[0] || null;
  const env = sys ? (sys.envs[envIdx] || sys.envs[0]) : null;
  const secretRef = (val, setVal, ph) => <VarRefInput value={val} onChange={setVal} placeholder={ph} />;
  // 환경 = 한 배포본이 노출하는 접점(webUrl/apiUrl) + 공유 계정 + API 인증
  // 웹 로그인은 환경 설정이 아니다 — UI 흐름이므로 테스트케이스의 스텝이 수행한다.
  // API 스펙(계약)도 환경 설정이 아니다 — 케이스 생성 소스일 뿐이므로 "API 스펙 임포트" 화면에서만 다룬다.
  const CFG_DEF = {
    webUrl: "", apiUrl: "",
    apiAuth: { type: "없음", header: "X-API-Key", secretRef: "" },
    access: { basicAuth: false, baUser: "", baPw: "", tlsIgnore: false },
    deploy: { mode: "수동", verUrl: "", verPath: "$.version", interval: "15분" },
  };
  const cfg = { ...CFG_DEF, ...env, ...draft };
  const setEnvCfg = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setSub = (key, patch) => setEnvCfg({ [key]: { ...(cfg[key] || {}), ...patch } });
  const hasWeb = !!cfg.webUrl;
  const hasApi = !!cfg.apiUrl;
  const apiT = (cfg.apiAuth || {}).type || "없음";
  const verMode = (cfg.deploy || {}).mode || "수동";
  const dirty = Object.keys(draft).length > 0 || (nameDraft !== null && nameDraft !== ((sys || {}).name || ""));
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  // 접점·인증이 바뀌면 이전 연결 결과는 무효 → 미확인으로 되돌린다
  const invalidates = ["webUrl", "apiUrl", "apiAuth", "access"].some((k) => k in draft);
  const saveCfg = () => { updateFqaSystem(sys.id, { ...(nameDraft !== null ? { name: nameDraft } : {}), envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, ...draft, ...(invalidates ? { status: "미확인" } : {}) } : e)) }); setDraft({}); setNameDraft(null); setTest(null); flash("설정 저장됨" + (invalidates ? " · 연결 테스트 필요" : "")); };
  const guardSwitch = (fn) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; setDraft({}); setNameDraft(null); fn(); };
  useEffect(() => { setDraft({}); setNameDraft(null); }, [(sys || {}).id]);
  const envSlug = { "스테이징": "stg", "운영": "prod", "개발": "dev" }[(env || {}).env] || "env";
  const hookUrl = "https://proba.co.kr/api/hooks/t" + ((sys || {}).id || 0) + "-" + envSlug + "-3f9a2c";
  const choose = (i) => guardSwitch(() => { setSel(i); setEnvIdx(0); setTest(null); });
  // 참조 중이면 삭제 불가 — 계획의 targetRef가 조용히 끊어지는 것을 막는다
  /* '최소 1개 유지' 가드는 두지 않는다 — 업무 규칙이 아니라 sys.envs 접근 크래시를 피하려던 장치였다.
     크래시를 막았으므로 0건도 정상 상태다. 신규 조직은 어차피 0건에서 시작한다.
     실제로 막아야 하는 것은 '참조 중인 대상 삭제'이고 그건 아래 plansUsing이 한다. */
  const delTarget = (i, sy) => {
    const used = plansUsing(sy.id, null);
    if (used.length) { setBlock({ what: sy.name + " 대상", plans: used }); return; }
    if (!window.confirm(sy.name + " 대상을 삭제할까요?" + (systems.length <= 1 ? "\n\n마지막 대상입니다 — 삭제하면 케이스를 실행할 대상이 없어집니다." : ""))) return;
    guardSwitch(() => { removeFqaSystem(sy.id); setSel(0); setEnvIdx(0); setTest(null); setNameDraft(null); setDraft({}); flash(sy.name + " 삭제됨"); });
  };
  const delEnv = () => {
    // 환경이 없는 대상은 실행 대상이 될 수 없다 — 이건 크래시 회피가 아니라 업무 규칙이다
    if (sys.envs.length <= 1) { flash("대상에는 환경이 최소 1개 필요합니다 — 대상을 지우려면 대상 삭제를 쓰세요"); return; }
    const used = plansUsing(sys.id, env.env);
    if (used.length) { setBlock({ what: sys.name + " · " + env.env + " 환경", plans: used }); return; }
    if (!window.confirm(env.env + " 환경을 삭제할까요?")) return;
    guardSwitch(() => { updateFqaSystem(sys.id, { envs: sys.envs.filter((_, i) => i !== envIdx) }); setEnvIdx(0); flash(env.env + " 환경 삭제됨"); });
  };
  const delAcct = (idx) => { setEnvCfg({ accts: (cfg.accts || []).filter((_, j) => j !== idx) }); flash("계정 삭제됨"); };
  const updAcct = (idx, patch) => setEnvCfg({ accts: (cfg.accts || []).map((a, j) => (j === idx ? { ...a, ...patch } : a)) });
  const appendAcct = () => setEnvCfg({ accts: [...(cfg.accts || []), { role: "", acct: "", secretRef: "" }] });

  /* 연결 테스트 — 목업이라 실제 HTTP는 못 쏘지만, 설정 유효성만으로 실패 판정이 가능하다.
     그래야 status 배지가 의미를 갖는다. */
  const cfgErrors = () => {
    const e = [];
    if (!hasWeb && !hasApi) e.push("접점(웹 또는 API base URL)이 없습니다");
    if (hasApi) {
      /* 방식이 "없음"이면 아래 세 조건에 걸리지 않아 통과한다 —
         인증 없는 공개 API(헬스체크·공개 조회)와, 접속 조건의 Basic Auth 로 보호되는 API 가 여기 해당한다. */
      const a = cfg.apiAuth || {};
      if (a.type === "API Key" && (!a.header || !a.secretRef)) e.push("API Key — 헤더 이름·키가 필요합니다");
      if (a.type === "Bearer 토큰 (정적)" && !a.secretRef) e.push("Bearer — 토큰이 필요합니다");
      if (a.type === "OAuth 2.0 (Client Credentials)" && (!a.tokenUrl || !a.clientId || !a.clientSecret)) e.push("OAuth — 토큰 엔드포인트·client_id·client_secret이 필요합니다");
    }
    const ac = cfg.access || {};
    if (ac.basicAuth && (!ac.baUser || !ac.baPw)) e.push("Basic Auth — 사용자명·비밀번호가 필요합니다");
    if ((cfg.deploy || {}).mode === "버전 엔드포인트 폴링") {
      const u = (cfg.deploy || {}).verUrl || "";
      if (!u) e.push("배포 감지 — 폴링 대상 URL이 필요합니다");
      else if (!/^https?:\/\//i.test(u)) e.push("배포 감지 — 폴링 대상 URL은 절대 URL이어야 합니다 (https://…)");
    }
    return e;
  };
  const setEnvStatus = (status) => updateFqaSystem(sys.id, { envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, status } : e)) });
  const runTest = () => {
    const errs = cfgErrors();
    setTest({ s: "run" });
    setTimeout(() => {
      if (errs.length) { setTest({ s: "err", m: errs.join(" · ") }); setEnvStatus("오류"); return; }
      const parts = [];
      if (hasWeb) parts.push("웹 200 OK");
      if (hasApi) parts.push("API 200 OK · 인증 유효");
      setTest({ s: "ok", m: parts.join(" / ") });
      setEnvStatus("연결됨");
    }, 800);
  };

  /* 참조 무결성 — 환경 이름은 실행 계획의 참조 키(targetRef.env)다.
     ① 같은 대상 안에서 유니크해야 하고  ② 참조 중이면 삭제할 수 없다. */
  const usedEnvs = ((sys || {}).envs || []).map((e) => e.env);
  const envOpts = ENV_NAMES.filter((n) => !usedEnvs.includes(n));
  const plansUsing = (systemId, envName) => (fqaPlans || []).filter((p) => {
    const r = p.targetRef || {};
    return r.systemId === systemId && (envName == null || r.env === envName);
  });
  const addTarget = () => {
    if (!tf.name.trim()) { flash("대상 이름을 입력하세요"); return; }
    if (!tf.webUrl.trim() && !tf.apiUrl.trim()) { flash("웹 또는 API 접점 중 하나 이상을 입력하세요"); return; }
    const ns = { id: Date.now(), name: tf.name, envs: [{ env: tf.env, webUrl: tf.webUrl, apiUrl: tf.apiUrl, status: "미확인", ver: "-", prod: tf.env === "운영", accts: [] }] };
    guardSwitch(() => { addFqaSystem(ns); setSel(0); setEnvIdx(0); setModal(null); flash("대상이 추가되었습니다"); });
  };
  const addEnv = () => {
    if (!ef.env) { flash("추가할 수 있는 환경이 없습니다 — 이미 모두 등록되었습니다"); return; }
    if (usedEnvs.includes(ef.env)) { flash(ef.env + " 환경은 이미 있습니다"); return; }
    if (!ef.webUrl.trim() && !ef.apiUrl.trim()) { flash("웹 또는 API 접점 중 하나 이상을 입력하세요"); return; }
    guardSwitch(() => { updateFqaSystem(sys.id, { envs: [...sys.envs, { env: ef.env, webUrl: ef.webUrl, apiUrl: ef.apiUrl, status: "미확인", ver: "-", prod: ef.env === "운영", accts: [] }] }); setEnvIdx(sys.envs.length); setModal(null); flash("환경이 추가되었습니다"); });
  };
  // 빈 상태 — 무엇이 없는지와 다음에 할 일을 같이 준다. 여기서 막히면 이후 단계로 못 간다.
  if (!sys) return (
    <div className="space-y-4">
      <PageToolbar desc="대상(제품) → 환경(배포본) · 접점(웹/API) · 인증 · 접근" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징", webUrl: "", apiUrl: "" }); setModal("target"); }}>대상 추가</Btn>
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 대상이 없습니다.</div>
        </div>
        <div className="col-span-9">
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Server size={26} className="text-slate-400" />
            <div className="mt-3 text-sm font-medium text-slate-700">검증 대상을 먼저 등록하세요</div>
            <div className="mt-1.5 max-w-md text-xs text-slate-500">테스트할 제품과 환경(스테이징·운영)을 등록해야 케이스를 만들고 실행할 수 있습니다. 케이스는 환경을 모르고, 실행 시점에 여기서 주입받습니다.</div>
          </Card>
        </div>
      </div>
      {modal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">대상 추가</h3><button onClick={() => setModal(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 px-5 py-4">
              <Field label="대상 이름"><Input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} placeholder="예: 온마켓" /></Field>
              <Field label="첫 환경"><Select value={tf.env} onChange={(e) => setTf({ ...tf, env: e.target.value })}>{ENV_NAMES.map((n) => <option key={n}>{n}</option>)}</Select></Field>
              <EndpointGroup webUrl={tf.webUrl} apiUrl={tf.apiUrl} set={(pp) => setTf({ ...tf, ...pp })} />
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addTarget}>추가</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
  return (
    <div className="space-y-4">
      <PageToolbar desc="대상(제품) → 환경(배포본) · 접점(웹/API) · 인증 · 접근" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징", webUrl: "", apiUrl: "" }); setModal("target"); }}>대상 추가</Btn>
          {systems.map((sy, i) => (
            <Card key={sy.id} className={"cursor-pointer p-3 " + (sel === i ? SEL_CARD : SEL_IDLE)} >
              <div onClick={() => choose(i)}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{sy.name}</span><button onClick={(e) => { e.stopPropagation(); delTarget(i, sy); }} className="text-slate-500 hover:text-red-600" title="대상 삭제"><X size={12} /></button></div>
                <div className="mt-1.5 flex flex-wrap gap-1">{sy.envs.map((e) => <Badge key={e.env} kind={e.prod ? "warn" : "info"}>{e.env}</Badge>)}</div>
              </div>
            </Card>
          ))}
        </div>
        <div className="col-span-9 space-y-3">
          {/* 헤더 — 이름·상태 / 저장·연결 테스트 (LQA 챗봇 연결과 동일한 배치) */}
          <Card className="space-y-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2"><div className="w-56 shrink-0"><Input value={nameDraft ?? sys.name} onChange={(e) => setNameDraft(e.target.value)} className="text-base font-semibold" /></div><span className="shrink-0"><Badge kind={stK[env.status]}>{env.status}</Badge></span>{hasWeb && hasApi && <span className="shrink-0"><Badge kind="active">웹+API</Badge></span>}</div>
              <div className="flex shrink-0 items-center gap-2">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn icon={RefreshCw} onClick={runTest}>{test && test.s === "run" ? "테스트 중…" : "연결 테스트"}</Btn><Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2.5">
              <span className="mr-1 text-xs text-slate-500">환경</span>
              {sys.envs.map((e, i) => (<button key={e.env} onClick={() => guardSwitch(() => { setEnvIdx(i); setTest(null); })} className={"rounded-lg px-3 py-1.5 text-xs font-medium " + (envIdx === i ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-800")}>{e.env}{e.prod ? " ●" : ""}</button>))}
              {envOpts.length > 0 && <button onClick={() => { setEf({ env: envOpts[0], webUrl: "", apiUrl: "" }); setModal("env"); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">+ 환경</button>}
              {sys.envs.length > 1 && <button onClick={delEnv} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:text-red-600" title="현재 환경 삭제">− 환경</button>}
            </div>
            {test && test.s === "ok" && <div className="flex items-center gap-2 border-t border-slate-200 pt-2.5 text-xs text-emerald-700"><CheckCircle2 size={14} />{test.m}</div>}
            {test && test.s === "err" && <div className="flex items-start gap-2 border-t border-slate-200 pt-2.5 text-xs text-red-700"><XCircle size={14} className="mt-0.5 shrink-0" />{test.m}</div>}
          </Card>
          <div className="text-xs text-slate-500">생성 <span className="text-slate-500">{sys.createdBy || "—"}</span> · {sys.createdAt || "—"} · 수정 <span className="text-slate-500">{sys.updatedBy || "—"}</span> · {sys.updatedAt || "—"}</div>

          {/* 좌: 실행에 주입되는 것 (접점 · 계정 · API 인증) / 우: 접속·운영 조건 (접근 제어 · 배포 감지) */}
          <div className="grid grid-cols-2 items-start gap-3">
          <div className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Globe size={15} className="text-sky-600" />접점 (Endpoints) <span className="text-xs font-normal text-slate-500">· 케이스의 상대경로에 주입되는 base URL</span></div>
            <Field label="웹 Base URL"><Input value={cfg.webUrl || ""} onChange={(e) => setEnvCfg({ webUrl: e.target.value })} placeholder="https://stg.onmarket.io" className="font-mono text-xs" /></Field>
            <Field label="API Base URL"><Input value={cfg.apiUrl || ""} onChange={(e) => setEnvCfg({ apiUrl: e.target.value })} placeholder="https://api-stg.onmarket.io" className="font-mono text-xs" /></Field>
          </Card>

          {/* 계정 풀 — 웹 로그인은 '흐름'이므로 케이스가 수행한다. 환경은 '누구로' 만 제공한다. */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">계정 풀</div>
              <button onClick={appendAcct} className="text-xs text-sky-600">+ 계정</button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
                <span className="w-20 shrink-0">역할</span><span className="w-28 shrink-0">계정 ID</span><span className="flex-1">비밀번호 (변수 참조)</span><span className="w-4" />
              </div>
              {(cfg.accts || []).map((aR, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-20 shrink-0"><Input value={aR.role || ""} onChange={(e) => updAcct(i, { role: e.target.value })} placeholder="일반" /></div>
                  <div className="w-28 shrink-0"><Input value={aR.acct} onChange={(e) => updAcct(i, { acct: e.target.value })} placeholder="qa_user02" className="font-mono text-xs" /></div>
                  <div className="min-w-0 flex-1">{secretRef(aR.secretRef, (val) => updAcct(i, { secretRef: val }), "${stg_test_pw}")}</div>
                  <button onClick={() => delAcct(i)} className="shrink-0 text-slate-500 hover:text-red-600" title="계정 삭제"><X size={12} /></button>
                </div>
              ))}
              {(!cfg.accts || cfg.accts.length === 0) && <div className="px-1 py-2 text-xs text-slate-500">이 환경의 계정이 없습니다 — + 계정으로 추가</div>}
            </div>
            <div className="text-xs text-slate-500">케이스의 <span className="text-slate-500">실행 계정 역할</span>과 같은 역할의 계정이 <span className="font-mono text-sky-600">{"${계정 ID}"}</span>·<span className="font-mono text-sky-600">{"${계정 비밀번호}"}</span>로 주입됩니다.</div>
          </Card>


          {hasApi && (
            <Card className="p-4 space-y-3">
              <div className="text-sm font-semibold text-slate-800">API 인증</div>
              <Field label="방식">
                <Select value={apiT} onChange={(e) => setSub("apiAuth", { type: e.target.value })}>
                  <option>없음</option><option>API Key</option><option>Bearer 토큰 (정적)</option><option>OAuth 2.0 (Client Credentials)</option>
                </Select>
              </Field>

              {apiT === "API Key" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="헤더 이름"><Input value={(cfg.apiAuth || {}).header || ""} onChange={(e) => setSub("apiAuth", { header: e.target.value })} placeholder="X-API-Key" className="font-mono text-xs" /></Field>
                  <Field label="키 (변수 참조)">{secretRef((cfg.apiAuth || {}).secretRef, (val) => setSub("apiAuth", { secretRef: val }), "${stg_api_key}")}</Field>
                </div>
              )}

              {apiT === "Bearer 토큰 (정적)" && (
                <Field label="토큰 (변수 참조)" hint="만료되지 않는 장기 토큰만 — 만료 토큰이면 OAuth 2.0">{secretRef((cfg.apiAuth || {}).secretRef, (val) => setSub("apiAuth", { secretRef: val }), "${stg_onmarket_token}")}</Field>
              )}

              {apiT === "OAuth 2.0 (Client Credentials)" && (<>
                <Field label="토큰 엔드포인트"><Input value={(cfg.apiAuth || {}).tokenUrl || ""} onChange={(e) => setSub("apiAuth", { tokenUrl: e.target.value })} placeholder="https://auth-stg.onmarket.io/oauth2/token" className="font-mono text-xs" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="client_id"><Input value={(cfg.apiAuth || {}).clientId || ""} onChange={(e) => setSub("apiAuth", { clientId: e.target.value })} placeholder="proba-qa-runner" className="font-mono text-xs" /></Field>
                  <Field label="client_secret (변수 참조)">{secretRef((cfg.apiAuth || {}).clientSecret, (val) => setSub("apiAuth", { clientSecret: val }), "${stg_oauth_secret}")}</Field>
                </div>
                <Field label="scope (선택)"><Input value={(cfg.apiAuth || {}).scope || ""} onChange={(e) => setSub("apiAuth", { scope: e.target.value })} placeholder="orders.read orders.write" className="font-mono text-xs" /></Field>
              </>)}
            </Card>
          )}
          </div>

          <div className="space-y-3">
          {/* 접속 조건 — 플랫폼 러너가 이 환경에 닿기 위한 조건.
              (자체 실행 러너(Self-Hosted)는 향후 확장 — 지금은 플랫폼 러너가 유일한 실행 주체) */}
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800">접속 조건</div>
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">실행 러너 egress IP <span className="font-mono text-slate-700">203.248.252.0/24</span><button onClick={() => flash("egress IP 대역을 복사했습니다")} className="text-sky-600">복사</button></div>
              <div className="mt-1 text-slate-500">대상 방화벽·IP 화이트리스트에 등록해야 접속됩니다.</div>
            </div>
            <div className="border-t border-slate-200 pt-2">
              <TRow label="Basic Auth (htpasswd)" on={(cfg.access || {}).basicAuth} set={(v) => setSub("access", { basicAuth: v })} />
              {(cfg.access || {}).basicAuth && (
                <div className="mb-1 mt-2 grid grid-cols-2 gap-3">
                  <Field label="사용자명"><Input value={(cfg.access || {}).baUser || ""} onChange={(e) => setSub("access", { baUser: e.target.value })} placeholder="stg" className="font-mono text-xs" /></Field>
                  <Field label="비밀번호 (변수 참조)">{secretRef((cfg.access || {}).baPw, (val) => setSub("access", { baPw: val }), "${stg_basic_pw}")}</Field>
                </div>
              )}
              <TRow label="자체서명 TLS 무시" on={(cfg.access || {}).tlsIgnore} set={(v) => setSub("access", { tlsIgnore: v })} />
            </div>
          </Card>

          {/* 배포 감지 — LQA 챗봇 "모델·배포 소스"와 동일 구조: 3택 + 선택한 방식의 필드만 노출 */}
          <Card className="p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Wrench size={15} className="text-sky-600" />배포 감지 <span className="text-xs font-normal text-slate-500">· 실행 계획의 &quot;배포 시&quot; 트리거가 상속 · 실행 이력에 빌드 기록</span></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="배포 감지 방식"><Select value={verMode} onChange={(e) => setSub("deploy", { mode: e.target.value })}><option>수동</option><option>배포 웹훅 알림</option><option>버전 엔드포인트 폴링</option></Select></Field>
              <Field label="현재 배포 버전">
                {verMode === "수동"
                  ? <Input value={cfg.ver && cfg.ver !== "-" ? cfg.ver : ""} onChange={(e) => setEnvCfg({ ver: e.target.value || "-" })} placeholder="v5.12.0-rc" className="font-mono text-xs" />
                  : <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-700">{cfg.ver && cfg.ver !== "-" ? cfg.ver : "미감지"}</div>}
              </Field>
            </div>

            {verMode === "배포 웹훅 알림" && (
              <div className="space-y-2.5 rounded-lg border border-slate-200 p-3">
                <Field label="수신 웹훅 URL"><div className="flex items-center gap-2"><div className="flex-1 truncate rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-700">{hookUrl}</div><Btn icon={Copy} onClick={() => flash("웹훅 URL을 복사했습니다")}>복사</Btn></div></Field>
                <Field label="서명 시크릿"><div className="flex items-center gap-2"><div className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-500">whsec_••••••••••••</div><Btn icon={Copy} onClick={() => flash("서명 시크릿을 복사했습니다")}>복사</Btn><Btn onClick={() => flash("서명 시크릿이 재발급되었습니다")}>재발급</Btn></div></Field>
                <div className="text-xs text-slate-500">CD가 <span className="font-mono text-slate-500">{'{ "version": "…" }'}</span>를 이 URL로 전송 <span className="text-slate-500">· 마지막 수신 {cfg.ver && cfg.ver !== "-" ? "2시간 전" : "없음"}</span></div>
              </div>
            )}

              {verMode === "버전 엔드포인트 폴링" && (
              <div className="space-y-2.5 rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-3 gap-2">
                  {/* 버전 엔드포인트는 base URL과 다른 호스트일 수 있다 — 상대경로를 허용하면 기준이 모호해진다 */}
                  <div className="col-span-2"><Field label="폴링 대상 URL"><Input value={(cfg.deploy || {}).verUrl || ""} onChange={(e) => setSub("deploy", { verUrl: e.target.value })} placeholder="https://stg-cs.onmarket.io/health" className="font-mono text-xs" /></Field></div>
                  <Field label="폴링 주기"><Select value={(cfg.deploy || {}).interval || "15분"} onChange={(e) => setSub("deploy", { interval: e.target.value })}><option>5분</option><option>15분</option><option>1시간</option><option>6시간</option><option>24시간</option></Select></Field>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1"><Field label="버전 필드 경로 (JSONPath)"><Input value={(cfg.deploy || {}).verPath || ""} onChange={(e) => setSub("deploy", { verPath: e.target.value })} placeholder="$.version" className="font-mono text-xs" /></Field></div>
                  <Btn icon={RefreshCw} onClick={() => { const nv = "v" + (5 + sys.id) + "." + Math.floor(Math.random() * 20) + "." + Math.floor(Math.random() * 9); setEnvCfg({ ver: nv }); flash("버전 조회 완료 · " + nv); }}>지금 확인</Btn>
                </div>
              </div>
            )}
          </Card>
          </div>
          </div>
        </div>
      </div>

      {modal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{modal === "target" ? "대상 추가" : "환경 추가"}</h3><button onClick={() => setModal(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              {modal === "target" && (<>
                <Field label="대상 이름"><Input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} placeholder="예: 온마켓" /></Field>
                <Field label="첫 환경"><Select value={tf.env} onChange={(e) => setTf({ ...tf, env: e.target.value })}>{ENV_NAMES.map((n) => <option key={n}>{n}</option>)}</Select></Field>
                <EndpointGroup webUrl={tf.webUrl} apiUrl={tf.apiUrl} set={(p) => setTf({ ...tf, ...p })} />
                <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addTarget}>추가</Btn></div>
              </>)}
              {modal === "env" && (<>
                {/* 이미 등록된 환경은 목록에서 제외 — 환경 이름은 계획의 참조 키라 중복될 수 없다 */}
                <Field label="환경" hint="이미 등록된 환경은 선택할 수 없습니다"><Select value={ef.env} onChange={(e) => setEf({ ...ef, env: e.target.value })}>{envOpts.map((n) => <option key={n}>{n}</option>)}</Select></Field>
                <EndpointGroup webUrl={ef.webUrl} apiUrl={ef.apiUrl} set={(p) => setEf({ ...ef, ...p })} />
                <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addEnv}>추가</Btn></div>
              </>)}
            </div>
          </div>
        </div></Portal>
      )}

      {/* 참조 무결성 — 실행 계획이 쓰고 있으면 삭제를 막는다 */}
      {block && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBlock(null)}>
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5"><AlertTriangle size={16} className="text-amber-600" /><h3 className="font-semibold text-slate-900">삭제할 수 없습니다</h3></div>
            <div className="space-y-3 p-5 text-sm">
              <div className="text-slate-700"><span className="font-semibold text-amber-700">{block.what}</span>을(를) 참조하는 실행 계획이 <span className="font-semibold text-amber-700">{block.plans.length}건</span> 있습니다.</div>
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {block.plans.map((p) => (<div key={p.id} className="flex items-center gap-2 text-xs"><ClipboardList size={12} className="text-slate-500" /><span className="text-slate-700">{p.name}</span></div>))}
              </div>
              <div className="text-xs text-slate-500">해당 계획의 대상·환경을 먼저 바꾸거나 계획을 삭제한 뒤 다시 시도하세요.</div>
              <div className="flex justify-end pt-1"><Btn kind="primary" onClick={() => setBlock(null)}>확인</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
/* ═══════════ 11. 실행 계획 ═══════════ */
const TG = ({ on, onClick }) => (
  <button onClick={onClick} className={"relative h-5 w-9 rounded-full transition " + (on ? "bg-sky-600" : "bg-slate-200")}><span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} /></button>
);
export function FqaPlanScreen() {
  const { fqaSuites, fqaSystems, fqaCases, fqaRuns, addFqaRun, updateFqaRun, fqaPlans, addFqaPlan, updateFqaPlan, removeFqaPlan, jiraConfig, datasets, setNavGuard, goTo } = useApp();
  const [msg, flash] = useToast();
  // 대상·환경은 ID 참조 { systemId, env } — 이름 변경에도 참조가 깨지지 않는다
  const targetOpts = (fqaSystems || []).flatMap((sy) => (sy.envs || []).map((e) => ({ systemId: sy.id, env: e.env, label: sy.name + " · " + e.env })));
  const keyOf = (ref) => (ref ? ref.systemId + "|" + ref.env : "");
  const envOf = (ref) => { const sy = (fqaSystems || []).find((s) => s.id === (ref || {}).systemId); return sy ? (sy.envs || []).find((e) => e.env === (ref || {}).env) : null; };
  const labelOf = (ref) => { const o = targetOpts.find((t) => keyOf(t) === keyOf(ref)); return o ? o.label : "미지정"; };
  const defRef = targetOpts[0] ? { systemId: targetOpts[0].systemId, env: targetOpts[0].env } : { systemId: 0, env: "" };
  const [addOpen, setAddOpen] = useState(false);
  const [nf, setNf] = useState({ name: "", targetRef: defRef, suites: [], tags: "" });
  const [selId, setSelId] = useState(fqaPlans[0] ? fqaPlans[0].id : null);
  /* 🔴 계획이 0건일 때 가짜 계획(id:0)으로 폼을 렌더하면 안 된다 —
     저장을 눌러도 updateFqaPlan(0, …)이 매칭되지 않아 조용히 무동작이고, 화면은 "저장됨"이라고 말한다.
     화면이 거짓말하느니 빈 상태를 보여주는 편이 낫다. */
  const sel = fqaPlans.find((p) => p.id === selId) || fqaPlans[0] || null;
  const [name, setName] = useState((sel || {}).name || "");
  const [targetRef, setTargetRef] = useState((sel || {}).targetRef || defRef);
  const [suites, setSuites] = useState((sel || {}).suites || []);
  const toggleSuite = (n) => setSuites((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const [tags, setTags] = useState((sel || {}).tags || "");
  const [brow, setBrow] = useState((sel || {}).brow || ["Chromium"]);
  const [res, setRes] = useState((sel || {}).res || "1920×1080");
  const [workers, setWorkers] = useState((sel || {}).workers || "4");
  const [retry, setRetry] = useState((sel || {}).retry != null ? sel.retry : 1);
  const [onfail, setOnfail] = useState((sel || {}).onfail || "계속 진행");
  const [video, setVideo] = useState((sel || {}).video || "녹화 안 함");
  const [apiTimeout, setApiTimeout] = useState((sel || {}).timeout || 30);
  const [gate, setGate] = useState((sel || {}).gate != null ? sel.gate : 95);
  const [planStatus, setPlanStatus] = useState((sel || {}).status || "초안");
  const [sched, setSched] = useState((sel || {}).schedule || DEFAULT_SCHED);
  const [jira, setJira] = useState((sel || {}).jira || { override: false });
  const jgc = jiraConfig || {};
  const enableJira = (on) => setJira(on ? { override: true, project: jira.project || jgc.project || "", issueType: jira.issueType || jgc.issueType || "Bug", assignee: jira.assignee != null ? jira.assignee : (jgc.assignee || ""), labels: jira.labels != null ? jira.labels : (jgc.labels || ""), titleTpl: jira.titleTpl || jgc.titleTpl || "" } : { override: false });
  const setJf = (patch) => setJira((j) => ({ ...j, ...patch }));
  const toggleB = (b) => setBrow(brow.includes(b) ? brow.filter((x) => x !== b) : [...brow, b]);
  // 실행 대상 = 스위트 ∩ 태그 ∩ 승인 (실행 화면의 buildTcs와 같은 규칙)
  const planCases = fqaCases.filter((c) => suites.includes(c.suite) && !c.quarantined && tagMatch(c, tags) && c.status === "승인");
  const planTargets = planCases.length;
  // 실행 옵션·접점은 이 계획이 실제로 테스트하는 케이스에서 파생 — 환경이 제공하는 접점이 아니라
  const planSurf = planCases.map((c) => surfacesOf(c));
  const surf = { web: planSurf.some((s) => s === "웹" || s === "웹+API"), api: planSurf.some((s) => s === "API" || s === "웹+API") };
  /* 대상 케이스가 이 환경에서 실제로 돌 수 있는가 —
     API 케이스인데 환경에 apiUrl이 없으면 전 건 실패한다. 조용히 빼지 않고 경고한다. */
  const uncovered = planCases.filter((c) => !envCovers(envOf(targetRef), surfacesOf(c)));
  /* 실행 요청 시점과 같은 검사를 여기서도 돌린다 — 다만 여기서는 경고일 뿐 막지 않는다.
     목적이 다르다. 여기는 피드백 속도, 실행 요청은 차단. 계획을 다 짜고 나서야 틀린 걸 알면 늦다.
     접점(planLevel)은 아래에 전용 카드가 있으므로 제외한다. */
  const planWarn = outerChecks(planCases, envOf(targetRef), datasets, fqaCases).filter((g) => !g.planLevel);
  /* 워커 슬롯이 곧 계정이다(F4) — 계정보다 워커가 많으면 같은 계정으로 동시 로그인해 세션이 밀린다.
     🔴 실행 '간' 충돌은 여기서 표현하지 못한다 — parallelIndex는 실행 내부 슬롯이라 실행 두 개가
     동시에 돌면 둘 다 슬롯 0을 집는다. 목업은 단일 러너 FIFO라 실행이 하나씩이므로 재현되지 않는다.
     실 구현에서는 '실행 중인 회차 중 같은 대상·환경 + 역할 겹침'을 경고해야 한다(차단 아님). */
  const wLimit = effWorkers(planCases, envOf(targetRef), workers);
  // 운영주의 — 대상이 운영(prod) 환경인데 실데이터를 건드리는 케이스가 섞였을 때 경고(막지 않음)
  const isProdTarget = !!(envOf(targetRef) || {}).prod;
  const cautionCases = isProdTarget ? planCases.filter((c) => c.prodCaution) : [];
  const pick = (p) => { setSelId(p.id); setName(p.name); setTargetRef(p.targetRef || defRef); setSuites(p.suites || []); setTags(p.tags); setBrow(p.brow || ["Chromium"]); setRes(p.res || "1920×1080"); setWorkers(p.workers || "4"); setRetry(p.retry != null ? p.retry : 1); setOnfail(p.onfail || "계속 진행"); setVideo(p.video || "녹화 안 함"); setApiTimeout(p.timeout != null ? p.timeout : 30); setGate(p.gate != null ? p.gate : 95); setPlanStatus(p.status || "초안"); setSched(p.schedule || DEFAULT_SCHED); setJira(p.jira || { override: false }); };
  const saveCfg = () => { const nm = name.trim() || sel.name; updateFqaPlan(sel.id, { name: nm, targetRef, suites, tags, brow, res, workers, retry, onfail, video, timeout: apiTimeout, gate, status: planStatus, jira, schedule: sched, sched: (sched && sched.summary) || "예약 없음" }); flash(nm + " 설정 저장됨"); };
  const dirty = !sel ? false : JSON.stringify({ name, targetRef, suites, tags, brow, res, workers, retry, onfail, video, timeout: apiTimeout, gate, status: planStatus, jira }) !== JSON.stringify({ name: sel.name, targetRef: sel.targetRef || defRef, suites: sel.suites || [], tags: sel.tags, brow: sel.brow || ["Chromium"], res: sel.res || "1920×1080", workers: sel.workers || "4", retry: sel.retry != null ? sel.retry : 1, onfail: sel.onfail || "계속 진행", video: sel.video || "녹화 안 함", timeout: sel.timeout != null ? sel.timeout : 30, gate: sel.gate != null ? sel.gate : 95, status: sel.status || "초안", jira: sel.jira || { override: false } }) || schedKey(sched) !== schedKey((sel || {}).schedule || DEFAULT_SCHED);
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const choosePlan = (p) => { if (p.id === sel.id) return; if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; pick(p); };
  const createPlan = () => { const nm = nf.name.trim(); if (!nm) { flash("계획 이름을 입력하세요"); return; } if (!nf.suites.length) { flash("스위트를 1개 이상 선택하세요"); return; } const id = Math.max(0, ...fqaPlans.map((x) => x.id)) + 1; const np = { id, name: nm, targetRef: nf.targetRef, suites: nf.suites, tags: nf.tags, sched: "예약 없음", status: "초안", brow: ["Chromium"], res: "1920×1080", workers: "4", retry: 1, onfail: "계속 진행", video: "녹화 안 함", timeout: 30, gate: 95 }; addFqaPlan(np); pick(np); setAddOpen(false); setNf({ name: "", targetRef: defRef, suites: [], tags: "" }); flash(nm + " 계획 생성 (초안)"); };
  const delPlan = (pl) => { if (!window.confirm(pl.name + " 계획을 삭제할까요?")) return; removeFqaPlan(pl.id); if (selId === pl.id) { const rest = fqaPlans.filter((x) => x.id !== pl.id); setSelId(rest[0] ? rest[0].id : null); } flash(pl.name + " 삭제됨"); };
  /* 빈 상태 — 계획은 대상·승인 케이스가 있어야 의미가 있다. 선행 조건까지 확인해 어디부터 해야 하는지 알린다. */
  if (!sel) {
    const okTarget = targetOpts.length > 0;
    const okCase = fqaCases.some((c) => c.status === "승인");
    return (
      <div className="space-y-4">
        <PageToolbar desc="대상·스위트·실행옵션·스케줄 정의" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-3">
            <Btn kind="primary" icon={Plus} className="w-full" onClick={() => setAddOpen(true)} disabled={!okTarget}>새 실행 계획</Btn>
            <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 계획이 없습니다.</div>
          </div>
          <div className="col-span-9">
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">실행 계획을 만드세요</div>
              <div className="mt-1.5 max-w-md text-xs text-slate-500">계획은 <span className="text-slate-500">대상·환경</span>과 <span className="text-slate-500">스위트</span>를 묶어 무엇을 어디에 돌릴지 정합니다.</div>
              <div className="mt-4 w-64 space-y-1.5 text-left">
                {[["대상·환경 등록", okTarget], ["승인된 테스트케이스", okCase]].map(([label, ok]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    {ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-amber-600" />}
                    <span className={ok ? "text-slate-500" : "text-amber-700"}>{label}</span>
                    <span className="ml-auto text-slate-500">{ok ? "완료" : "필요"}</span>
                  </div>
                ))}
              </div>
              {!okTarget && <Btn className="mt-3" icon={Server} onClick={() => goTo("fqa-targets")}>대상·환경 등록하러 가기</Btn>}
              {okTarget && !okCase && <div className="mt-3 text-xs text-amber-600">계획은 만들 수 있지만 승인된 케이스가 없으면 실행해도 0건입니다.</div>}
            </Card>
          </div>
        </div>
        <Toast msg={msg} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageToolbar desc="대상·스위트·실행옵션·스케줄 정의" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => setAddOpen(true)}>새 실행 계획</Btn>
          {fqaPlans.map((p) => (
            <Card key={p.id} className={"cursor-pointer p-3 " + (sel.id === p.id ? SEL_CARD : SEL_IDLE)} >
              <div onClick={() => choosePlan(p)}>
                <div className="flex items-center justify-between"><div className="text-sm font-semibold text-slate-900">{p.name}</div><div className="flex items-center gap-1.5"><Badge kind={p.status === "활성" ? "pass" : "draft"}>{p.status}</Badge><button onClick={(e) => { e.stopPropagation(); delPlan(p); }} className="text-slate-500 hover:text-red-600" title="계획 삭제"><X size={13} /></button></div></div>
                <div className="mt-1 text-xs text-slate-500">{labelOf(p.targetRef)}</div>
                <div className="mt-1 text-xs text-slate-500">{(p.suites || []).join(" · ") || "스위트 없음"} · {p.sched}</div>
                <div className="mt-0.5 text-xs text-slate-500">수정 {p.updatedBy || "—"} · {p.updatedAt || "—"}</div>
              </div>
            </Card>
          ))}
        </div>
        <Card className="col-span-9 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0 max-w-sm flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="계획 이름" /></div>
            <div className="flex shrink-0 items-center gap-3"><div className="flex items-center gap-2 text-sm text-slate-700"><span>{planStatus === "활성" ? "활성" : "초안"}</span><TG on={planStatus === "활성"} onClick={() => setPlanStatus(planStatus === "활성" ? "초안" : "활성")} /></div>{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn kind="primary" icon={RefreshCw} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
          </div>
          <div className="mb-4 flex items-center gap-3 text-xs text-slate-500"><span>생성 <span className="text-slate-500">{sel.createdBy || "—"}</span> · {sel.createdAt || "—"}</span><span className="text-slate-500">·</span><span>수정 <span className="text-slate-500">{sel.updatedBy || "—"}</span> · {sel.updatedAt || "—"}</span></div>
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-3.5">
              <Field label="대상·환경" hint={"접점: " + ([surf.web ? "웹" : null, surf.api ? "API" : null].filter(Boolean).join("+") || "없음")}>
                <Select value={keyOf(targetRef)} onChange={(e) => { const o = targetOpts.find((t) => keyOf(t) === e.target.value); if (o) setTargetRef({ systemId: o.systemId, env: o.env }); }}>
                  {targetOpts.map((t) => <option key={keyOf(t)} value={keyOf(t)}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="대상 스위트 (다중 선택)" hint="선택한 스위트의 승인 케이스가 실행 대상">
                <div className="grid grid-cols-2 gap-2">
                  {fqaSuites.map((x) => (
                    <button key={x.id} onClick={() => toggleSuite(x.name)} className={"rounded-lg border px-2 py-1.5 text-left text-xs " + (suites.includes(x.name) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.name}</button>
                  ))}
                </div>
              </Field>
              {suites.length === 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">⚠ 스위트를 1개 이상 선택하세요.</div>}
              <Field label="태그 필터" hint="비우면 스위트 전체 · 하나라도 일치하면 대상">
                <TagPicker value={tags} onChange={setTags} />
              </Field>
              {/* 스위트 ∩ 태그 ∩ 승인 — 실제로 몇 건이 돌지 여기서 확인된다 */}
              <div className={"rounded-lg border px-2.5 py-1.5 text-xs " + (planTargets === 0 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-500")}>
                {planTargets === 0 ? "⚠ 조건에 맞는 승인 케이스가 없습니다 — 실행해도 0건입니다." : <>대상 케이스 <span className="font-semibold text-sky-600">{planTargets}건</span> <span className="text-slate-500">(승인 · 격리 제외)</span></>}
              </div>
              {/* 케이스의 접점 ↔ 환경의 접점 — 여기가 어긋나면 실행은 반드시 실패한다 */}
              {uncovered.length > 0 && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                  ⚠ <span className="font-semibold">{uncovered.length}건</span>은 이 환경에서 돌 수 없습니다 — {[...new Set(uncovered.map((c) => surfacesOf(c)))].join(" · ")} 접점이 필요한데 <span className="font-semibold">{labelOf(targetRef)}</span>에 해당 URL이 없습니다.
                  <div className="mt-0.5 font-mono text-red-600">{uncovered.slice(0, 4).map((c) => c.id).join(", ")}{uncovered.length > 4 ? " 외 " + (uncovered.length - 4) + "건" : ""}</div>
                </div>
              )}
              {/* 운영주의 — 막지 않고 알린다. 운영에 실데이터 테스트를 정당하게 하는 경우도 있으므로. */}
              {/* 실행 요청 시점에 차단될 것들을 여기서 미리 알린다 — 막지는 않는다 */}
              {planWarn.map((g, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                  ⚠ <span className="font-semibold">{g.cases.length}건</span> — {g.why}
                  <div className="mt-0.5 font-mono text-amber-600">{g.cases.slice(0, 4).map((c) => c.id).join(", ")}{g.cases.length > 4 ? " 외 " + (g.cases.length - 4) + "건" : ""}</div>
                  <div className="mt-0.5 text-amber-600/80">실행 요청 시 차단됩니다 — {g.fixLabel}에서 해결하세요.</div>
                </div>
              ))}
              {cautionCases.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                  ⚠ <span className="font-semibold">운영 환경</span>에 <span className="font-semibold">운영주의 {cautionCases.length}건</span>이 포함됩니다 — 실데이터를 변경·삭제할 수 있습니다.
                  <div className="mt-0.5 font-mono text-amber-600">{cautionCases.slice(0, 4).map((c) => c.id).join(", ")}{cautionCases.length > 4 ? " 외 " + (cautionCases.length - 4) + "건" : ""}</div>
                </div>
              )}
              <Field label="품질 게이트 (PASS 기준 %)"><Input type="number" value={gate} onChange={(e) => setGate(+e.target.value || 0)} className="w-28" /></Field>
            </div>
            <div className="space-y-3.5">
              {surf.web && (
                <>
                  <Field label="브라우저 (다중) · 화면 스텝">
                    <div className="grid grid-cols-2 gap-2">
                      {["Chromium", "Firefox", "WebKit", "Mobile Chromium"].map((b) => (
                        <button key={b} onClick={() => toggleB(b)} className={"rounded-lg border px-2 py-1.5 text-xs " + (brow.includes(b) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{b}</button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="해상도"><Select value={res} onChange={(e) => setRes(e.target.value)}><option>1920×1080</option><option>1440×900</option><option>1280×720</option><option>375×812 (모바일)</option></Select></Field>
                    <Field label="영상 녹화"><Select value={video} onChange={(e) => setVideo(e.target.value)}><option>녹화 안 함</option><option>실패 시만</option><option>전체 녹화</option></Select><div className="mt-1 text-slate-500" style={{ fontSize: 11 }}>trace는 항상 기록되어 실패 시 보관됩니다 — 영상은 trace와 겹치므로 필요할 때만 켜세요.</div></Field>
                  </div>
                </>
              )}
              {surf.api && <Field label="요청 타임아웃(초) · 요청 스텝"><Input type="number" value={apiTimeout} onChange={(e) => setApiTimeout(+e.target.value || 0)} className="w-32" /></Field>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="병렬 workers"><Select value={workers} onChange={(e) => setWorkers(e.target.value)}><option>1 (순차)</option><option>2</option><option>4</option><option>auto</option></Select>{wLimit && <div className="mt-1 text-amber-600" style={{ fontSize: 11 }}>실효 {wLimit.eff} — <span className="font-mono">{wLimit.role}</span> 역할 계정이 {wLimit.eff}개입니다. <span className="text-amber-600/80">대상·환경의 계정 풀에서 계정을 추가하면</span> 병렬도가 올라갑니다.</div>}</Field>
                <Field label="재시도"><Input type="number" value={retry} onChange={(e) => setRetry(+e.target.value || 0)} /></Field>
              </div>
              <div className="flex items-center gap-4">
                <Field label="종료 조건"><Select value={onfail} onChange={(e) => setOnfail(e.target.value)}><option>계속 진행</option><option>첫 에러 시 중단</option></Select></Field>
              </div>
              {surf.web && surf.api && <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">이 계획은 <span className="text-slate-700">웹·API 케이스를 모두</span> 포함합니다 — 브라우저 옵션은 화면 스텝에, 타임아웃은 요청 스텝에 적용됩니다.</div>}
            </div>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            {planStatus === "활성" ? (
              <>
                <ScheduleConfig key={sel.id} value={sched} onChange={setSched} events={fqaEvents(envOf(targetRef), labelOf(targetRef))} singleSelect manualHint="자동 실행 없음 — 수동 실행으로만 수행합니다." toast={flash} />
                <div className="mt-3 text-xs text-slate-500">스케줄·이벤트 트리거 실행은 항상 켜진 <span className="text-slate-700">공유/CI 러너</span>에서 무인 수행됩니다 — 저작용 개인 로컬 러너와 분리.</div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">이 계획은 <span className="font-semibold">초안</span>입니다 — 스케줄과 실행 모두 <span className="font-semibold">활성화</span> 후 가능합니다.</div>
            )}
          </div>
          {(jgc.connected !== false) && (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">결함 트래커 (Jira)</div>
              <div className="flex items-center gap-2 text-xs text-slate-500">이 계획 재정의 <TG on={!!jira.override} onClick={() => enableJira(!jira.override)} /></div>
            </div>
            {!jira.override ? (
              <div className="mt-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-500">전역 Jira 설정 사용 · 프로젝트 <span className="text-slate-700">{jgc.project || "—"}</span> · 이슈유형 {jgc.issueType || "—"} <span className="text-slate-500">(결함 화면의 Jira 연동에서 관리)</span></div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="text-xs text-slate-500">연결(URL·인증)은 전역, 이 계획의 결함 라우팅만 재정의합니다.</div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="프로젝트 키"><Input value={jira.project || ""} onChange={(e) => setJf({ project: e.target.value })} placeholder="WEBQA" /></Field>
                  <Field label="이슈 유형"><Select value={jira.issueType || "Bug"} onChange={(e) => setJf({ issueType: e.target.value })}><option>Bug</option><option>Task</option><option>Story</option></Select></Field>
                  <Field label="기본 담당자"><Input value={jira.assignee || ""} onChange={(e) => setJf({ assignee: e.target.value })} placeholder="assignee" /></Field>
                </div>
                <Field label="라벨 (쉼표 구분)"><Input value={jira.labels || ""} onChange={(e) => setJf({ labels: e.target.value })} placeholder="fqa, web" /></Field>
              </div>
            )}
          </div>
          )}
        </Card>
      </div>
      {addOpen && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">새 실행 계획</h3><button onClick={() => setAddOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              <Field label="계획 이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 로그인 회귀 (스테이징)" /></Field>
              <Field label="대상·환경">
                <Select value={keyOf(nf.targetRef)} onChange={(e) => { const o = targetOpts.find((t) => keyOf(t) === e.target.value); if (o) setNf({ ...nf, targetRef: { systemId: o.systemId, env: o.env } }); }}>
                  {targetOpts.map((t) => <option key={keyOf(t)} value={keyOf(t)}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="대상 스위트 (다중 선택)">
                <div className="grid grid-cols-2 gap-2">
                  {fqaSuites.map((x) => (
                    <button key={x.id} onClick={() => setNf({ ...nf, suites: nf.suites.includes(x.name) ? nf.suites.filter((s) => s !== x.name) : [...nf.suites, x.name] })} className={"rounded-lg border px-2 py-1.5 text-left text-xs " + (nf.suites.includes(x.name) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.name}</button>
                  ))}
                </div>
              </Field>
              <Field label="태그 필터" hint="비우면 스위트 전체">
                <TagPicker value={nf.tags} onChange={(v) => setNf({ ...nf, tags: v })} />
              </Field>
              <div className="text-xs text-slate-500">생성 시 <span className="text-slate-700">초안</span> 상태로 추가됩니다 — 실행 옵션·스케줄은 상세 설정에서 이어서 정의합니다.</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5"><Btn onClick={() => setAddOpen(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={createPlan}>계획 생성</Btn></div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
