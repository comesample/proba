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
import { flatDevices, deviceBlock, devLabel, pickDefault, osName } from "./devices.js";
import { DeviceSelect } from "./workPickers.jsx";
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
  add("환경이 케이스의 접점을 감당하지 못합니다 — " + (!(env || {}).apiUrl ? "apiUrl 없음" : "webUrl 없음"), "환경 설정", "mqa-targets",
    cs.filter((c) => !envCovers(env, surfacesOf(c))), true);
  // 계정 역할 — 풀에 역할이 없으면 주입할 값이 없다
  add("환경 계정 풀에 해당 역할이 없습니다", "환경 설정", "mqa-targets",
    cs.filter((c) => c.acctRole && !roles.includes(c.acctRole)));
  // 데이터셋 — 사라졌으면 행이 0개가 되어 테스트가 0개 생성된다(실패도 통과도 아닌 무동작)
  add("참조하는 데이터셋이 없습니다", "데이터셋", "datasets",
    cs.filter((c) => c.dataset && c.dataset !== "-" && !dsNames.includes(c.dataset)));
  /* 전제조건 케이스 — 사라졌거나 승인이 풀렸으면 로그인 없이 돌아 전건 실패한다.
     전제조건 케이스를 고치면 승인이 풀리므로(저장 시 검토중) 여기서 걸린다. 그게 의도다. */
  add("전제조건 케이스가 없거나 승인되지 않았습니다", "테스트케이스", "mqa-cases",
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

export function MqaRecordScreen({ onDone, onEdit }) {
  const { mqaSuites, mqaSystems, mqaCases } = useApp();
  const [msg, flash] = useToast();
  const opts = envOpts(mqaSystems).filter((o) => o.webUrl);
  const [ref, setRef] = useState(opts[0] ? { systemId: opts[0].systemId, env: opts[0].env } : null);
  const cur = opts.find((o) => refKey(o) === refKey(ref)) || opts[0] || {};
  const base = cur.webUrl || "";
  const [path, setPath] = useState("/");
  /* 녹화 해상도 — 반응형 사이트는 화면 크기에 따라 DOM이 달라지므로 녹화 시점에 정해야 한다.
     케이스에는 저장하지 않는다(실행 해상도는 실행 계획이 정함). */
  const [vp, setVp] = useState(REC_VIEWPORTS[0]);
  // 스위트·TC명은 캡처 결과를 보고 등록 시점에 정한다
  const [suite, setSuite] = useState((mqaSuites[0] || {}).name || "");
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
    const c = { id: nextTcId(mqaCases), origin: "레코딩", name: name || "레코딩 TC", suite, tags: "", status: "초안", level: "Low-Code", dataset: "-", steps };
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
                <div className="w-44 shrink-0"><Field label="스위트"><Select value={suite} onChange={(e) => setSuite(e.target.value)}>{mqaSuites.map((x) => <option key={x.id}>{x.name}</option>)}</Select></Field></div>
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

export function MqaApiImportScreen({ onDone }) {
  const { addMqaCase, mqaSuites, mqaCases } = useApp();
  const [msg, flash] = useToast();
  const apiSuites = mqaSuites || [];
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
  const commit = () => { if (!picked.size) { flash("요청을 선택하세요"); return; } const sel = rows.filter((r) => picked.has(r._k)); sel.forEach((ep, i) => addMqaCase({ id: nextTcId(mqaCases, i), origin: "API 임포트", name: ep.name, suite, tags, status: "초안", level: "Low-Code", dataset: "-", steps: apiSteps(ep) })); if (onDone) onDone(sel.length + "건 API 케이스 초안 등록 · 목록에서 에디터로 보강하세요"); };
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
export function MqaEditorScreen({ entry = "Low-Code", tc, onDirty, onOpen }) {
  const { commitMqaCase, addMqaCase, mqaSuites, mqaCases, mqaRuns, mqaSystems, datasets, debugEnv, setDebugEnv, setNavGuard } = useApp();
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
  const [suite, setSuite] = useState(tc ? tc.suite : ((mqaSuites[0] || {}).name || ""));
  const [name, setName] = useState((tc && tc.name) || "");
  const [tags, setTags] = useState((tc && tc.tags) || "");
  const [dataset, setDataset] = useState(tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "");
  const [acctRole, setAcctRole] = useState((tc && tc.acctRole) || "");
  const [preCase, setPreCase] = useState((tc && tc.preCase) || "");
  // 운영주의 — 운영 환경에서 실데이터를 변경/삭제하는 케이스. 태그와 별개 플래그.
  const [prodCaution, setProdCaution] = useState(!!(tc && tc.prodCaution));
  // 등록된 모든 환경의 계정 역할 (케이스는 역할만 고르고, 실제 계정은 실행 계획의 환경이 주입)
  const roleOpts = [...new Set((mqaSystems || []).flatMap((sy) => (sy.envs || []).flatMap((e) => (e.accts || []).map((a) => a.role))).filter(Boolean))];
  // 계정 변수 사용 여부 — Full-Code는 V['계정 ID'] 형태로 나타난다
  /* 스텝이 계정 변수를 직접 쓰는가 — 로그인 자체를 검증하는 케이스가 여기 해당한다.
     🔴 문자열 검사라 변수 이름 규칙에 기능이 매달려 있다. 전제조건 로그인을 쓰는 케이스는 이 검사에 안 걸리므로
     실 구현에서는 값을 구조({ref:"acct"})로 저장해 이름과 무관하게 판별해야 한다. */
  const usesAcct = steps.some((s) => /\$\{계정/.test((s.val || "") + (s.loc || "") + (s.code || ""))) || /계정 (ID|비밀번호)/.test(code || "");
  /* 전제조건 후보 = 승인된 다른 케이스. 별도 '로그인 프로필' 엔티티를 두지 않는다 —
     로그인도 케이스이므로 레코딩·리비전·디버그 실행·승인 워크플로가 그대로 따라온다.
     🔑 전제조건을 가진 케이스는 후보에서 뺀다 — 중첩을 허용하면 순환이 생긴다(1단계만). */
  const preOpts = (mqaCases || []).filter((c) => c.id !== (tc && tc.id) && c.status === "승인" && !c.preCase
    // Full-Code 제외 — 전제조건은 globalSetup에서 도는 함수여야 하는데 사용자 코드는 test()로 감싸여 있어 벗길 수 없다
    && c.level !== "Full-Code"
    // 데이터셋 제외 — 행마다 로그인한다는 뜻이 되어 성립하지 않는다
    && (!c.dataset || c.dataset === "-"));
  const [dragIdx, setDragIdx] = useState(null);
  const [codeOpen, setCodeOpen] = useState({});
  const toggleCode = (i) => setCodeOpen((m) => ({ ...m, [i]: !m[i] }));
  const reorder = (from, to) => { setSteps((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m); return arr; }); setCodeOpen({}); };
  const vi = LV.indexOf(view);
  const [snap, setSnap] = useState(() => JSON.stringify({ steps: initSteps, code: initCode, committed: ei, suite: tc ? tc.suite : ((mqaSuites[0] || {}).name || ""), name: (tc && tc.name) || "", tags: (tc && tc.tags) || "", dataset: tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "", acctRole: (tc && tc.acctRole) || "", preCase: (tc && tc.preCase) || "", prodCaution: !!(tc && tc.prodCaution) }));
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
  const usedAsPre = (mqaCases || []).filter((c) => c.preCase === (tc && tc.id));
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
  const dbgOpts = envOpts(mqaSystems).filter((o) => envCovers(o, surf));
  const dbg = dbgOpts.find((o) => refKey(o) === refKey(debugEnv)) || dbgOpts[0] || null;
  const dbgEnvRec = (() => { const sy = (mqaSystems || []).find((s) => s.id === (dbg || {}).systemId); return sy ? (sy.envs || []).find((e) => e.env === dbg.env) : null; })();
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
    const last = tc ? lastOf(mqaRuns, tc.id) : "-";
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
    if (!mqaCases.some((c) => c.id === tc.id)) {
      addMqaCase({ id: tc.id, ...body(), status: "검토중" });
      baseRev.current = 1; setStatus("검토중");
      setSnap(JSON.stringify({ steps, code, committed, suite, name, tags, dataset, acctRole, preCase, prodCaution }));
      flash("검토중으로 저장됨");
      return true;
    }
    const ok = commitMqaCase(tc.id, { ...body(), status: "검토중" }, { baseRev: baseRev.current });
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
    const nid = nextTcId(mqaCases);
    const copy = { id: nid, ...body(), name: name + " (사본)", status: "검토중" };
    addMqaCase(copy);
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
              <Select value={suite} onChange={(e) => setSuite(e.target.value)}>{mqaSuites.map((sx) => <option key={sx.id} value={sx.name}>{sx.name}</option>)}</Select>
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
export function MqaSuiteScreen() {
  const [msg, flash] = useToast();
  const { mqaSuites: suites, addMqaSuite, updateMqaSuite, removeMqaSuite, mqaCases, updateMqaCase, setMqaEditTc, goto, setNavGuard } = useApp();
  const casesOf = (name) => mqaCases.filter((c) => c.suite === name);
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
    if (name !== selSuite.name) casesOf(selSuite.name).forEach((c) => updateMqaCase(c.id, { suite: name }));
    updateMqaSuite(selSuite.id, { name, desc: ds }); setDraft({}); flash("스위트가 수정되었습니다");
  };
  // 혼합 여부는 소속 케이스의 스텝에서 파생 — 스위트는 platform을 갖지 않는다
  const mixOf = (name) => {
    const cs = mqaCases.filter((c) => c.suite === name);
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
    addMqaSuite({ ...form, name, id }); setSel(id); setDraft({}); setOpen(false); flash("스위트가 추가되었습니다");
  };
  const del = (s) => {
    if (tcOf(s.name) > 0) { flash("사용 중인 스위트는 삭제 불가 (" + tcOf(s.name) + "건)"); return; }
    removeMqaSuite(s.id); setDraft({}); flash("삭제됨");
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
                <div className="mt-1.5 flex items-center gap-1.5"><span className="text-xs text-slate-500">TC {tcOf(s.name)} · 승인 {casesOf(s.name).filter((c) => c.status === "승인").length}</span></div>
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
                <div className="flex items-center gap-2 text-xs text-slate-500">소속 <span className="font-semibold text-sky-600">{casesOf(selSuite.name).length}</span>건 · 승인 {casesOf(selSuite.name).filter((c) => c.status === "승인").length}건 <span className="text-slate-400">— 실행 계획은 승인된 케이스만 돌립니다</span></div>
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
                      <Badge kind={c.level === "Full-Code" ? "warn" : "active"}>{c.level || "Low-Code"}</Badge>
                      <Badge kind={stK[c.status] || "draft"}>{c.status}</Badge>
                      <button onClick={() => { setMqaEditTc(c.id); goto("mqa-cases"); }} className="shrink-0 pt-0.5 text-slate-500 hover:text-sky-600">편집</button>
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
/* ═══════════ 6~8. 실행 · 이력 · 결과 · 대시보드 → mqa/flow.jsx (단말 기준 재설계) ═══════════ */
/* ═══════════ 9. 테스트케이스 → mqa/cases.jsx 로 이동 (앱 기준 재설계) ═══════════ */
/* ═══════════ 10. 대상·환경 (대상(앱) → 환경) ═══════════
   FQA 대상·환경과 같은 뼈대 — 좌: 대상 목록 / 우: 헤더(이름·상태·확인·저장 + 환경 탭) / 카드.
   FQA 의 '접점(웹/API URL)' 자리에 '앱(플랫폼별)' 이 들어간다.
   → Web/App 통합 시 대상·환경은 공유하고 접점 종류(웹·API·Android·iOS)만 늘어난다.
   MVP 범위
     · 플랫폼은 Android 만 (iOS 는 자리만 — 데이터에 platform 필드를 처음부터 둔다)
     · 실행 경로는 '실행 PC' 하나 — 이 화면에서 고르지 않는다 (기기·실행 PC 는 '테스트 기기' 메뉴)
     · 새 버전은 '직접 올리기' 만 — 빌드 시스템 자동 전송은 고객사 파이프라인 작업이 전제라 이후 지원
   환경 이름은 실행 계획의 참조 키(targetRef.env) — 대상 안에서 유니크해야 한다 */
const ENV_NAMES = ["스테이징", "운영", "개발"];
const PLATFORMS = [{ id: "Android", ready: true, ext: ".apk" }, { id: "iOS", ready: false, ext: ".ipa" }];
const mqaStamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
const verCode = (v) => { const [a, b, c] = String(v).split(".").map((n) => parseInt(n, 10) || 0); return a * 10000 + b * 100 + c; };
/* 앱 파일 판독 — 실 구현은 업로드 시 서버가 APK 의 AndroidManifest 를 읽는다 (aapt2 dump badging 등).
     · 앱 ID(package) · versionName(표시용, 자유 문자열) · versionCode(정수, 새 빌드일수록 큼) · minSdk(최소 지원 OS)
     · 🔑 정렬·중복·최신 판단은 versionCode 로 한다 — versionName 은 "3.2.0-rc1", "2026.10" 처럼 형식이 제각각이다
     · 앱 ID 가 대상과 다른 파일은 거부한다 (다른 앱의 파일)
   목업은 파일명에서 versionName 을 찾고(없으면 최신의 다음 값), versionCode 는 그 숫자부에서 만든다. */
const SDK_OS = { 24: "7.0", 26: "8.0", 28: "9", 29: "10", 30: "11", 31: "12", 33: "13", 34: "14", 35: "15" };
const osOf = (sdk) => "Android " + (SDK_OS[sdk] || "API " + sdk) + " 이상";
const readAppFile = (name, app, sysId) => {
  const m = name.match(/(\d+\.\d+\.\d+(?:[-_][A-Za-z0-9]+)?)/);
  const latest = (app.builds || [])[0];
  let ver = m ? m[1] : "1.0.0";
  if (!m && latest) { const [a, b, c] = latest.ver.split(/[.\-_]/).map(Number); ver = [a, b, (c || 0) + 1].join("."); }
  return { ver, code: verCode(ver.split(/[-_]/)[0]), appId: app.appId || "com.example.app" + sysId, minSdk: (latest && latest.minSdk) || 26 };
};
const ST_K = { "확인됨": "pass", "미확인": "warn", "실패": "fail" };
const newEnv = (name, appId) => ({ env: name, prod: name === "운영", status: "미확인", ver: "-", accts: [], deploy: { mode: "수동" }, app: { platform: "Android", appId: appId || "", builds: [], defBuild: null } });

export function MqaTargetScreen() {
  const [msg, flash] = useToast();
  const { mqaSystems: systems, addMqaSystem, updateMqaSystem, removeMqaSystem, mqaPlans, setNavGuard, currentUser, mqaRunners = [], lockMqaDevice, releaseMqaDevice, goTo, mqaWork = {}, setMqaWork } = useApp();
  const [sel, setSel] = useState(0);
  const [envIdx, setEnvIdx] = useState(0);
  const [check, setCheck] = useState(null);      // 앱 실행 확인 결과 (화면 표시용)
  const [modal, setModal] = useState(null);      // "target" | "env"
  const [block, setBlock] = useState(null);      // 참조 중이라 삭제가 막힌 경우
  const [pending, setPending] = useState(null);  // 올린 파일 확인 대기
  const [tf, setTf] = useState({ name: "", env: "스테이징" });
  const [ef, setEf] = useState({ env: "개발" });
  const [draft, setDraft] = useState({});
  const [nameDraft, setNameDraft] = useState(null);
  const fileRef = useRef(null);
  /* 신규 조직은 대상 0건으로 시작한다 — sys.envs 접근 전에 막는다 */
  const sys = systems[sel] || systems[0] || null;
  const env = sys ? (sys.envs[envIdx] || sys.envs[0]) : null;
  const app = (env && env.app) || { platform: "Android", appId: "", builds: [], defBuild: null };
  const defB = (app.builds || []).find((b) => b.id === app.defBuild) || null;
  const secretRef = (val, setVal, ph) => <VarRefInput value={val} onChange={setVal} placeholder={ph} />;
  /* 저장 버튼으로 반영되는 것 = 대상 이름 · 테스트 계정 (draft).
     앱 파일 작업(올리기·기본 지정·삭제)은 즉시 반영한다 — 파일을 올리고 저장을 잊으면 파일이 사라지는 게 더 나쁘다. */
  const cfg = { accts: [], ...env, ...draft };
  const setEnvCfg = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = Object.keys(draft).length > 0 || (nameDraft !== null && nameDraft !== ((sys || {}).name || ""));
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  useEffect(() => { setDraft({}); setNameDraft(null); setCheck(null); }, [(sys || {}).id]);
  const guardSwitch = (fn) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; setDraft({}); setNameDraft(null); fn(); };
  const choose = (i) => guardSwitch(() => { setSel(i); setEnvIdx(0); setCheck(null); });
  const patchEnv = (patch) => updateMqaSystem(sys.id, { envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, ...patch } : e)) });
  const patchApp = (patch, extra) => patchEnv({ app: { ...app, ...patch }, ...(extra || {}) });
  const saveCfg = () => { updateMqaSystem(sys.id, { ...(nameDraft !== null ? { name: nameDraft } : {}), envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, ...draft } : e)) }); setDraft({}); setNameDraft(null); flash("설정 저장됨"); };

  /* ── 참조 무결성 — 실행 계획이 쓰고 있는 대상·환경은 지울 수 없다 ── */
  const usedEnvs = ((sys || {}).envs || []).map((e) => e.env);
  const envOpts = ENV_NAMES.filter((n) => !usedEnvs.includes(n));
  const plansUsing = (systemId, envName) => (mqaPlans || []).filter((p) => { const r = p.targetRef || {}; return r.systemId === systemId && (envName == null || r.env === envName); });
  const delTarget = (sy) => {
    const used = plansUsing(sy.id, null);
    if (used.length) { setBlock({ what: sy.name + " 대상", plans: used }); return; }
    if (!window.confirm(sy.name + " 대상을 삭제할까요?\n\n올려 둔 앱 파일과 테스트 계정도 함께 삭제됩니다.")) return;
    guardSwitch(() => { removeMqaSystem(sy.id); setSel(0); setEnvIdx(0); setCheck(null); flash(sy.name + " 삭제됨"); });
  };
  const delEnv = () => {
    if (sys.envs.length <= 1) { flash("대상에는 환경이 최소 1개 필요합니다 — 대상을 지우려면 대상 삭제를 쓰세요"); return; }
    const used = plansUsing(sys.id, env.env);
    if (used.length) { setBlock({ what: sys.name + " · " + env.env + " 환경", plans: used }); return; }
    if (!window.confirm(env.env + " 환경을 삭제할까요?")) return;
    guardSwitch(() => { updateMqaSystem(sys.id, { envs: sys.envs.filter((_, i) => i !== envIdx) }); setEnvIdx(0); setCheck(null); flash(env.env + " 환경 삭제됨"); });
  };
  const addTarget = () => {
    if (!tf.name.trim()) { flash("대상 이름을 입력하세요"); return; }
    if (systems.some((s) => s.name === tf.name.trim())) { flash("같은 이름의 대상이 이미 있습니다"); return; }
    const ns = { id: Date.now(), name: tf.name.trim(), platforms: ["Android"], envs: [newEnv(tf.env, "")] };
    guardSwitch(() => { addMqaSystem(ns); setSel(0); setEnvIdx(0); setModal(null); setCheck(null); flash("대상이 추가되었습니다 — 앱 설치 파일을 올려 주세요"); });
  };
  const addEnv = () => {
    if (!ef.env || usedEnvs.includes(ef.env)) { flash("추가할 수 있는 환경이 없습니다"); return; }
    const appId = (sys.envs.map((e) => (e.app || {}).appId).find(Boolean)) || "";   // 같은 앱 — 환경마다 빌드만 다르다
    guardSwitch(() => { updateMqaSystem(sys.id, { envs: [...sys.envs, newEnv(ef.env, appId)] }); setEnvIdx(sys.envs.length); setModal(null); setCheck(null); flash(ef.env + " 환경이 추가되었습니다"); });
  };

  /* ── 앱 설치 파일 ── */
  const pickFile = () => { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".aab")) { flash("AAB 파일은 아직 지원하지 않습니다 — APK 파일로 올려 주세요"); return; }
    if (!lower.endsWith(".apk")) { flash("Android 앱 설치 파일(.apk)만 올릴 수 있습니다"); return; }
    const info = readAppFile(f.name, app, sys.id);
    if ((app.builds || []).some((b) => b.code === info.code)) { flash("빌드 번호 " + info.code + " 은(는) 이미 올라와 있습니다 — 같은 빌드입니다"); return; }
    setPending({ file: f.name, size: f.size, ...info, makeDefault: !defB || info.code > defB.code, note: "" });
  };
  const confirmUpload = () => {
    const p = pending;
    const b = { id: "B" + Date.now(), ver: p.ver, code: p.code, minSdk: p.minSdk, file: p.file, size: p.size, at: mqaStamp(), by: currentUser || "—", note: p.note };
    const builds = [b, ...(app.builds || [])].sort((x, y) => y.code - x.code);
    patchApp({ appId: p.appId, builds, ...(p.makeDefault ? { defBuild: b.id } : {}) }, p.makeDefault ? { ver: p.ver, status: "미확인" } : {});
    setPending(null); setCheck(null);
    flash("v" + p.ver + " 올림" + (p.makeDefault ? " · 기본 테스트 버전으로 지정 — 앱 실행 확인을 다시 해 주세요" : ""));
  };
  const makeDefault = (b) => { patchApp({ defBuild: b.id }, { ver: b.ver, status: "미확인" }); setCheck(null); flash("기본 테스트 버전 → v" + b.ver); };
  const delBuild = (b) => {
    if (b.id === app.defBuild) { flash("기본 테스트 버전은 삭제할 수 없습니다 — 다른 버전을 기본으로 지정한 뒤 삭제하세요"); return; }
    if (!window.confirm("v" + b.ver + " 파일을 삭제할까요?")) return;
    patchApp({ builds: app.builds.filter((x) => x.id !== b.id) }); flash("v" + b.ver + " 삭제됨");
  };

  /* ── 앱 실행 확인 — 테스트 기기의 단말에 기본 버전을 설치 → 실행 → 첫 화면 캡처.
     올린 파일이 실제로 설치·실행되는지가 이 화면에서 확인할 수 있는 유일한 '연결' 이다.
     단말은 확인하는 동안 점유한다 (1단말 1작업). 쓸 수 없는 단말이면 사유를 보여주고 시작하지 않는다 ── */
  const devs = flatDevices(mqaRunners);
  const devId = mqaWork.devId || "";
  const setDevId = (v) => setMqaWork({ devId: v });   // 테스트케이스의 작업 단말과 같은 선택을 공유한다
  const dev = devs.find((x) => x.id === devId) || pickDefault(devs, defB);
  const runCheck = () => {
    if (!defB) { setCheck({ s: "err", m: "기본 테스트 버전이 없습니다 — 앱 설치 파일을 먼저 올리세요" }); patchEnv({ status: "실패" }); return; }
    const b = deviceBlock(dev, defB);
    if (b) { setCheck({ s: "err", m: b, dev: true }); return; }   // 단말 문제는 앱 문제가 아니다 — 환경 상태를 '실패'로 바꾸지 않는다
    lockMqaDevice(dev.id, "앱 실행 확인 " + sys.name);
    setCheck({ s: "run", device: devLabel(dev) });
    setTimeout(() => {
      releaseMqaDevice(dev.id);
      const r = { at: mqaStamp(), device: dev.model + " · " + osName(dev.sdk), ver: defB.ver };
      setCheck({ s: "ok", ...r });
      patchEnv({ status: "확인됨", lastCheck: r });
    }, 1200);
  };
  const last = check && check.s === "ok" ? check : (env || {}).lastCheck && (env || {}).status === "확인됨" ? env.lastCheck : null;

  const header = (
    <PageToolbar desc="대상(앱) → 환경(스테이징·운영·개발) · 앱 설치 파일 · 테스트 계정" />
  );
  const targetModal = modal && (
    <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{modal === "target" ? "대상 추가" : "환경 추가"}</h3><button onClick={() => setModal(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
        <div className="space-y-3.5 p-5">
          {modal === "target" && (<>
            <Field label="대상 이름"><Input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} placeholder="예: 샘플 쇼핑 앱" /></Field>
            <Field label="플랫폼">
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((p) => (
                  <button key={p.id} disabled={!p.ready} title={p.ready ? "" : "향후 지원 예정"} className={"flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs " + (p.ready ? "border-sky-500 bg-sky-50 text-sky-700" : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400")}>
                    <span className="flex items-center gap-1.5 font-medium"><Smartphone size={13} />{p.id}</span><span>{p.ready ? "선택됨" : "준비 중"}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="첫 환경"><Select value={tf.env} onChange={(e) => setTf({ ...tf, env: e.target.value })}>{ENV_NAMES.map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500">앱 설치 파일은 대상을 만든 뒤 환경별로 올립니다.</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addTarget}>추가</Btn></div>
          </>)}
          {modal === "env" && (<>
            <Field label="환경" hint="이미 등록된 환경은 선택할 수 없습니다"><Select value={ef.env} onChange={(e) => setEf({ env: e.target.value })}>{envOpts.map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500">같은 앱의 다른 환경입니다 — 환경마다 테스트할 앱 버전과 계정을 따로 둡니다.</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addEnv}>추가</Btn></div>
          </>)}
        </div>
      </div>
    </div></Portal>
  );

  if (!sys) return (
    <div className="space-y-4">
      {header}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징" }); setModal("target"); }}>대상 추가</Btn>
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 대상이 없습니다.</div>
        </div>
        <div className="col-span-9">
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Smartphone size={26} className="text-slate-400" />
            <div className="mt-3 text-sm font-medium text-slate-700">테스트할 앱을 먼저 등록하세요</div>
            <div className="mt-1.5 max-w-md text-xs text-slate-500">대상(앱)과 환경을 만들고 앱 설치 파일을 올리면 테스트케이스를 만들고 실행할 수 있습니다.</div>
            <div className="mt-4"><Btn kind="primary" icon={Plus} onClick={() => { setTf({ name: "", env: "스테이징" }); setModal("target"); }}>대상 추가</Btn></div>
          </Card>
        </div>
      </div>
      {targetModal}
      <Toast msg={msg} />
    </div>
  );

  return (
    <div className="space-y-4">
      {header}
      <input ref={fileRef} type="file" accept=".apk,.aab" className="hidden" onChange={onFile} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징" }); setModal("target"); }}>대상 추가</Btn>
          {systems.map((sy, i) => (
            <Card key={sy.id} className={"cursor-pointer p-3 " + (sel === i ? SEL_CARD : SEL_IDLE)}>
              <div onClick={() => choose(i)}>
                <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Smartphone size={13} className="text-slate-500" />{sy.name}</span><button onClick={(e) => { e.stopPropagation(); delTarget(sy); }} className="text-slate-500 hover:text-red-600" title="대상 삭제"><X size={12} /></button></div>
                <div className="mt-1.5 flex flex-wrap gap-1">{sy.envs.map((e) => <Badge key={e.env} kind={e.prod ? "warn" : "info"}>{e.env}</Badge>)}</div>
              </div>
            </Card>
          ))}
        </div>

        <div className="col-span-9 space-y-3">
          {/* 헤더 — 이름·상태·플랫폼 / 앱 실행 확인·설정 저장 / 환경 탭 (FQA 와 같은 배치) */}
          <Card className="space-y-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="w-56 shrink-0"><Input value={nameDraft ?? sys.name} onChange={(e) => setNameDraft(e.target.value)} className="text-base font-semibold" /></div>
                <Badge kind={ST_K[env.status] || "warn"}>{env.status === "확인됨" ? "실행 확인됨" : env.status === "실패" ? "확인 실패" : "실행 미확인"}</Badge>
                {PLATFORMS.map((p) => <span key={p.id} title={p.ready ? "" : "향후 지원 예정"}><Badge kind={p.ready ? "active" : "draft"}>{p.id}{p.ready ? "" : " · 준비 중"}</Badge></span>)}
              </div>
              <div className="flex shrink-0 items-center gap-2">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<span className="text-xs text-slate-500">단말</span><div style={{ width: 290 }} title="앱 실행 확인에 쓸 단말 — 테스트케이스의 작업 단말과 같은 선택입니다"><DeviceSelect devs={devs} value={dev ? dev.id : ""} onChange={setDevId} build={defB} /></div><Btn icon={Play} onClick={runCheck} disabled={check && check.s === "run"}>{check && check.s === "run" ? "확인 중…" : "앱 실행 확인"}</Btn><Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2.5">
              <span className="mr-1 text-xs text-slate-500">환경</span>
              {sys.envs.map((e, i) => (<button key={e.env} onClick={() => guardSwitch(() => { setEnvIdx(i); setCheck(null); })} className={"rounded-lg px-3 py-1.5 text-xs font-medium " + (envIdx === i ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-800")}>{e.env}{e.prod ? " ●" : ""}</button>))}
              {envOpts.length > 0 && <button onClick={() => { setEf({ env: envOpts[0] }); setModal("env"); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">+ 환경</button>}
              {sys.envs.length > 1 && <button onClick={delEnv} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:text-red-600" title="현재 환경 삭제">− 환경</button>}
              {env.prod && <span className="ml-1 text-xs text-amber-700">● 운영 — 실제 사용자 데이터가 있는 환경입니다</span>}
            </div>
            {check && check.s === "run" && <div className="flex items-center gap-2 border-t border-slate-200 pt-2.5 text-xs text-slate-600"><RefreshCw size={14} className="animate-spin" />{check.device}에 v{defB ? defB.ver : ""} 설치 → 실행 → 첫 화면 확인 중…</div>}
            {check && check.s === "err" && <div className="flex items-start gap-2 border-t border-slate-200 pt-2.5 text-xs text-red-700"><XCircle size={14} className="mt-0.5 shrink-0" /><span className="flex-1">{check.m}</span>{check.dev && <button onClick={() => goTo("mqa-devices")} className="shrink-0 text-sky-600">테스트 기기로</button>}</div>}
            {last && (
              <div className="flex items-center gap-3 border-t border-slate-200 pt-2.5">
                <div className="flex h-16 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 text-slate-400" title="첫 화면 캡처"><Smartphone size={14} /></div>
                <div className="text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={14} />v{last.ver} 설치 · 실행 · 첫 화면 확인</div>
                  <div className="mt-0.5 text-slate-500">{last.device} · {last.at}</div>
                </div>
              </div>
            )}
          </Card>
          <div className="text-xs text-slate-500">생성 {sys.createdBy || "—"} · {sys.createdAt || "—"} · 수정 {sys.updatedBy || "—"} · {sys.updatedAt || "—"}</div>

          <div className="grid grid-cols-2 items-start gap-3">
            {/* 앱 (Android) — FQA '접점' 자리. 파일 작업은 즉시 반영 */}
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Smartphone size={15} className="text-sky-600" />앱 (Android) <span className="text-xs font-normal text-slate-500">· 접점</span></div>
                <span className="text-xs text-slate-500">파일 작업은 즉시 반영</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs">
                <span className="text-slate-500">앱 ID</span>
                {app.appId ? <span className="font-mono text-slate-700">{app.appId}</span> : <span className="text-slate-500">첫 파일을 올리면 자동 확인</span>}
              </div>
              {(app.builds || []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center">
                  <div className="text-xs text-slate-500">이 환경에서 테스트할 앱 설치 파일이 없습니다</div>
                  <div className="mt-3"><Btn kind="primary" icon={Upload} onClick={pickFile}>앱 설치 파일 올리기</Btn></div>
                </div>
              ) : (<>
                <div className="space-y-1.5">
                  {app.builds.map((b) => {
                    const isDef = b.id === app.defBuild;
                    return (
                      <div key={b.id} className={"rounded-lg border px-3 py-2 " + (isDef ? "border-sky-300 bg-sky-50" : "border-slate-200")}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2"><span className="font-mono text-sm font-semibold text-slate-800">v{b.ver}</span><span className="font-mono text-xs text-slate-500">({b.code})</span>{isDef && <Badge kind="active">기본 테스트 버전</Badge>}</div>
                          <div className="flex shrink-0 items-center gap-2">
                            {!isDef && <button onClick={() => makeDefault(b)} className="text-xs text-sky-600 hover:underline">기본으로</button>}
                            {!isDef && <button onClick={() => delBuild(b)} className="text-slate-400 hover:text-red-600" title="파일 삭제"><Trash2 size={13} /></button>}
                          </div>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">{osOf(b.minSdk || 26)} · {b.file} · {fmtSize(b.size)}</div>
                        <div className="truncate text-xs text-slate-500">{b.at} · {b.by}</div>
                        {b.note && <div className="mt-0.5 text-xs text-slate-600">{b.note}</div>}
                      </div>
                    );
                  })}
                </div>
                <Btn icon={Upload} className="w-full" onClick={pickFile}>새 버전 올리기</Btn>
              </>)}
              <div className="text-xs text-slate-500">버전·빌드 번호·앱 ID·최소 지원 OS는 파일에서 자동으로 읽습니다. 괄호 안 숫자가 빌드 번호이고, 최신 판단은 빌드 번호로 합니다. 실행 계획에서 버전을 지정하지 않으면 <span className="text-slate-700">기본 테스트 버전</span>으로 실행합니다.</div>
            </Card>

            {/* 테스트 계정 — FQA 계정 풀과 동일. 로그인은 '흐름'이므로 케이스가 수행하고, 환경은 '누구로' 만 제공한다 */}
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">테스트 계정</div>
                <button onClick={() => setEnvCfg({ accts: [...(cfg.accts || []), { role: "", acct: "", secretRef: "" }] })} className="text-xs text-sky-600">+ 계정</button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-1 text-xs text-slate-500"><span className="w-20 shrink-0">역할</span><span className="w-28 shrink-0">계정 ID</span><span className="flex-1">비밀번호 (변수 참조)</span><span className="w-4" /></div>
                {(cfg.accts || []).map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-20 shrink-0"><Input value={a.role || ""} onChange={(e) => setEnvCfg({ accts: cfg.accts.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} placeholder="일반" /></div>
                    <div className="w-28 shrink-0"><Input value={a.acct || ""} onChange={(e) => setEnvCfg({ accts: cfg.accts.map((x, j) => (j === i ? { ...x, acct: e.target.value } : x)) })} placeholder="qa_user02" className="font-mono text-xs" /></div>
                    <div className="min-w-0 flex-1">{secretRef(a.secretRef, (val) => setEnvCfg({ accts: cfg.accts.map((x, j) => (j === i ? { ...x, secretRef: val } : x)) }), "${stg_test_pw}")}</div>
                    <button onClick={() => setEnvCfg({ accts: cfg.accts.filter((_, j) => j !== i) })} className="shrink-0 text-slate-500 hover:text-red-600" title="계정 삭제"><X size={12} /></button>
                  </div>
                ))}
                {(!cfg.accts || cfg.accts.length === 0) && <div className="px-1 py-2 text-xs text-slate-500">이 환경의 계정이 없습니다 — + 계정으로 추가</div>}
              </div>
              <div className="text-xs text-slate-500">케이스의 <span className="text-slate-700">실행 계정 역할</span>과 같은 역할의 계정이 <span className="font-mono text-sky-600">{"${계정 ID}"}</span>·<span className="font-mono text-sky-600">{"${계정 비밀번호}"}</span>로 주입됩니다.{env.prod && " 운영 환경은 테스트 전용(합성) 계정만 쓰세요."}</div>
            </Card>
          </div>
        </div>
      </div>

      {targetModal}

      {/* 올린 파일 확인 — 자동으로 읽은 값을 보여주고 기본 버전 지정 여부만 묻는다 */}
      {pending && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPending(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">앱 설치 파일 확인</h3><button onClick={() => setPending(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 p-5 text-sm">
              <div className="space-y-1.5 rounded-lg bg-slate-100 p-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">파일</span><span className="truncate pl-3 text-slate-700">{pending.file} · {fmtSize(pending.size)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">버전</span><span className="font-mono text-slate-800">v{pending.ver} <span className="text-slate-500">· 빌드 번호 {pending.code}</span></span></div>
                <div className="flex justify-between"><span className="text-slate-500">최소 지원 OS</span><span className="text-slate-800">{osOf(pending.minSdk)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">앱 ID</span><span className="font-mono text-slate-800">{pending.appId}</span></div>
                <div className="text-slate-500">위 값은 파일에서 자동으로 읽었습니다.</div>
                <div className="flex justify-between"><span className="text-slate-500">환경</span><span className="text-slate-700">{sys.name} · {env.env}</span></div>
              </div>
              <Field label="메모 (선택)"><Input value={pending.note} onChange={(e) => setPending({ ...pending, note: e.target.value })} placeholder="예: 보안 기능 해제 테스트 빌드" /></Field>
              <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={pending.makeDefault} onChange={(e) => setPending({ ...pending, makeDefault: e.target.checked })} />이 버전을 기본 테스트 버전으로 지정</label>
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setPending(null)}>취소</Btn><Btn kind="primary" icon={Upload} onClick={confirmUpload}>올리기</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}

      {block && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBlock(null)}>
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5"><AlertTriangle size={16} className="text-amber-600" /><h3 className="font-semibold text-slate-900">삭제할 수 없습니다</h3></div>
            <div className="space-y-3 p-5 text-sm">
              <div className="text-slate-700"><span className="font-semibold text-amber-700">{block.what}</span>을(를) 참조하는 실행 계획이 <span className="font-semibold text-amber-700">{block.plans.length}건</span> 있습니다.</div>
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">{block.plans.map((p) => (<div key={p.id} className="flex items-center gap-2 text-xs"><ClipboardList size={12} className="text-slate-500" /><span className="text-slate-700">{p.name}</span></div>))}</div>
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
/* ═══════════ 실행 계획 → mqa/flow.jsx ═══════════ */
