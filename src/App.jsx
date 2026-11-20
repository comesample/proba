import { useState, useRef, useEffect, createContext, useContext } from "react";
import {
  LayoutDashboard, ClipboardList, MessageSquare, Play, GitCompare, Bug,
  SlidersHorizontal, ShieldCheck, CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, ChevronDown, Plus, Search, Bell, TrendingUp, TrendingDown,
  Sparkles, FileDown, Ghost, Lock, Send, X, Megaphone, Slack, Mail,
  FileText, Calendar, RefreshCw, Trash2, ExternalLink, Plug, Link2,
  Building2, Users, Cpu, CreditCard, ScrollText, Shield, ArrowLeft, UserCog, Tag, Upload, History, Brain, Code2, Video, Layers
} from "lucide-react";
import { FqaRecordScreen, FqaEditorScreen, FqaSuiteScreen, FqaRunScreen, FqaHistoryScreen, FqaResultScreen, FqaDashboardScreen, FqaCasesScreen, FqaTargetScreen, FqaPlanScreen } from "./fqa/screens.jsx";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import { C, vKind } from "./common/theme.js";
import { Badge, ScoreBar, Card, Field, Btn, Input, Select, Toggle, Modal } from "./common/ui.jsx";
import { AppCtx, useApp } from "./common/context.js";
import { ConsoleShell, NewTenantForm, AssignAdminForm, NewModelForm, NewOperatorForm } from "./common/console.jsx";

/* ============================ static data ============================ */
import { SECTIONS, NAV, TREND, METRICS, INIT_CASES, APPROVED_INIT, mkResults, INIT_PLANS, INIT_RUNS, INIT_JUDGES, PROMPT_VARS, INIT_PROMPTS, INIT_DEFECTS, INIT_CHATBOTS, LQA_HIDDEN } from "./lqa/data.js";
/* 로고 — 실서비스에서 복사. 🔑 "/images/…" 절대 경로는 vite base("/proba/") 때문에 404 — import 로 불러 빌드가 경로를 맞추게 한다 */
import logoUrl from "./assets/proba-logo.png";
import { DOMAINS, COMMON_SECTIONS, MEMBERS_ITEM, INIT_TENANTS, INIT_USERS, INIT_MODELS, INIT_VARIABLES, INIT_DATASETS } from "./common/data.js";
import { VariablesScreen } from "./common/variables.jsx";
import { DatasetsScreen } from "./common/datasets.jsx";
import { FQA_SECTIONS, INIT_FQA_CASES, INIT_FQA_SUITES, INIT_FQA_SYSTEMS, INIT_FQA_RUNS, INIT_FQA_PLANS, FQA_HIDDEN } from "./fqa/data.js";
import { MqaTargetScreen } from "./mqa/targetScreen.jsx";
import { MqaSuiteScreen } from "./mqa/suiteScreen.jsx";
import { usesCase as SL_uses } from "./mqa/suiteLogic.js";
import { MqaDashboardScreen, MqaPlanScreen, MqaRunScreen, MqaHistoryScreen, MqaResultScreen } from "./mqa/flow.jsx";
import { MqaCasesScreen } from "./mqa/cases.jsx";
import { MqaDevicesScreen } from "./mqa/devicesScreen.jsx";
import { MQA_SECTIONS, INIT_MQA_CASES, INIT_MQA_SUITES, INIT_MQA_SYSTEMS, INIT_MQA_RUNNERS, INIT_MQA_RUNS, INIT_MQA_PLANS, MQA_HIDDEN } from "./mqa/data.js";
import { NQA_SECTIONS, INIT_NQA_SYSTEMS, INIT_NQA_SCENARIOS, INIT_NQA_RUNS } from "./nqa/data.js";
import { NqaDashboardScreen, NqaTargetScreen, NqaScenarioScreen, NqaRunScreen, NqaHistoryScreen } from "./nqa/screens.jsx";
import { PQA_SECTIONS, INIT_PERF_APPS, INIT_PERF_SCENARIOS, INIT_PERF_PLANS, INIT_PERF_RUNS } from "./pqa/data.js";
import { PqaTargetScreen, PqaScenarioScreen, PqaPlanScreen, PqaRunScreen, PqaHistoryScreen, PqaTrendScreen, PqaDashboardScreen } from "./pqa/screens.jsx";
import { NewPlanForm, AiGenForm, NewCaseForm, JiraForm, AddPromptForm, PlanCasesForm, JiraConfigForm, AddChatbotForm, Targets, Dashboard, Plans, RunHistory, CategoryManager, ImportCasesForm, Cases, LqaRunScreen, LqaResultScreen, Compare, Defects, Report, Settings, InviteMemberForm, MembersView } from "./lqa/screens.jsx";

/* ============================ context ============================ */

const SEED_USERS = ["이민준", "최서연", "김지훈", "박지영"];
const stampSeeds = (arr) => (arr || []).map((o, i) => { if (o.createdAt) return o; const z = (n) => String(n).padStart(2, "0"); return { createdBy: SEED_USERS[i % 4], createdAt: "2026-" + z(1 + (i % 6)) + "-" + z(1 + (i % 27)) + " " + z(9 + (i % 8)) + ":" + z((i * 7) % 60), updatedBy: SEED_USERS[(i + 2) % 4], updatedAt: "2026-" + z(4 + (i % 3)) + "-" + z(1 + ((i * 3) % 27)) + " " + z(10 + (i % 7)) + ":" + z((i * 11) % 60), ...o }; });
/* 케이스 시드에 리비전을 채운다 — 현재본도 이력에 들어 있어야 한다(최초 작성 = rev 1).
   TC-055처럼 versions를 직접 정의한 시드는 그 뒤에 현재 rev를 얹는다. */
/* MQA 케이스의 리비전 보존 필드 — FQA 케이스에는 없어서 undefined 로 남는다 */
const mqaX = (c) => (c.proc ? { proc: c.proc || [], prodCaution: !!c.prodCaution, pre: c.pre || "" } : undefined);   // 스위트·시작 상태는 케이스가 아니라 스위트가 가진다
const seedCases = (arr) => stampSeeds(arr).map((c) => {
  const rev = c.rev || 1;
  const head = { rev, at: c.updatedAt, by: c.updatedBy, note: "", level: c.level, steps: c.steps || [], code: c.code || "", name: c.name, tags: c.tags || "", dataset: c.dataset || "-", acctRole: c.acctRole || "", x: mqaX(c) };
  return { ...c, rev, versions: [head, ...(c.versions || [])] };
});

export default function App() {
  const [view, setView] = useState("dashboard");
  const [fqaTab, setFqaTab] = useState("상세");
  const [env, setEnv] = useState("전체");
  const [reportCfg, setReportCfg] = useState({ ch: { slack: true, teams: false, email: true }, cond: "fail", scope: "통합 (전체 도메인)", rsched: { on: true, freq: "weekly", time: "09:00", dow: 1, dom: 1 } });
  /* 발송 이력 — 모든 도메인이 같은 이력에 남긴다 (리포트 · 알림 화면 · MQA 회귀 리포트 공유 · 자동 알림) */
  const [reportHist, setReportHist] = useState([
    { t: "14:36", ch: "Slack", txt: "[AI 품질] 결제/환불 상담 평가 완료 — PASS율 79% (▲)", ok: true },
    { t: "09:25", ch: "Email", txt: "주간 품질 리포트 발송 (수신 6명)", ok: true },
  ]);
  const [toasts, setToasts] = useState([]);
  const [notifs, setNotifs] = useState([
    { icon: "play", text: "결제/환불 상담 평가 완료 — PASS율 79%", t: "14:36", to: { domain: "LQA", view: "lqa-result", run: "R-2056" } },
    { icon: "bug", text: "DEF-1842 자동 등록 (PII)", t: "14:36", to: { domain: "LQA", view: "defects", select: { kind: "defect", key: "DEF-1842" } } },
  ]);
  const [bellOpen, setBellOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [cases, setCases] = useState(stampSeeds(INIT_CASES));
  const [categories, setCategories] = useState(["주문/배송", "멤버십/구독", "결제/환불", "회원/계정", "안전성"]);
  const [plans, setPlans] = useState(stampSeeds(INIT_PLANS));
  const [runs, setRuns] = useState(INIT_RUNS);
  /* 🔑 결과 상세가 어느 실행을 열지 — 1회성 의도가 아니라 지속 state 로 둔다(FQA 의 fqaResultRun 과 같은 규약).
     1회성이면 화면을 떠났다 돌아올 때마다 빈 화면이 되고, 5~10분 걸리는 평가에서는
     이력을 매번 다시 뒤져야 한다. From 은 뒤로가기 라벨("평가 실행"/"실행 이력"/"대시보드")을 만든다. */
  const [lqaResultRun, setLqaResultRun] = useState(null);
  const [lqaResultFrom, setLqaResultFrom] = useState("history");
  const [defects, setDefects] = useState(INIT_DEFECTS);
  const [fqaCases, setFqaCases] = useState(seedCases(INIT_FQA_CASES));
  const [fqaSuites, setFqaSuites] = useState(stampSeeds(INIT_FQA_SUITES));
  const [fqaSystems, setFqaSystems] = useState(stampSeeds(INIT_FQA_SYSTEMS));
  const [nqaSystems, setNqaSystems] = useState(stampSeeds(INIT_NQA_SYSTEMS));
  const [nqaScenarios, setNqaScenarios] = useState(stampSeeds(INIT_NQA_SCENARIOS));
  const [perfApps, setPerfApps] = useState(INIT_PERF_APPS);
  const [perfScenarios, setPerfScenarios] = useState(INIT_PERF_SCENARIOS);
  const [perfPlans, setPerfPlans] = useState(INIT_PERF_PLANS);
  const [perfRuns, setPerfRuns] = useState(INIT_PERF_RUNS);
  const [nqaRuns, setNqaRuns] = useState(INIT_NQA_RUNS);
  const [variables, setVariables] = useState(INIT_VARIABLES);
  const [datasets, setDatasets] = useState(stampSeeds(INIT_DATASETS));
  const [fqaRuns, setFqaRuns] = useState(INIT_FQA_RUNS);
  const [fqaPlans, setFqaPlans] = useState(stampSeeds(INIT_FQA_PLANS));
  /* 🔑 보정 제안 검토 상태 — 화면 로컬로 두면 결과 화면을 벗어나는 순간 사라진다.
     특히 "거절" 은 스스로 에디터로 이동하므로 기록되자마자 소멸했다.
     제안이 몇 % 맞았는지가 자가보정의 유일한 효용 지표라 이건 반드시 남아야 한다. */
  const [healState, setHealState] = useState({});
  const [fqaResultRun, setFqaResultRun] = useState("FRUN-502");
  /* 디버그 환경 — 에디터의 단건 실행에만 쓴다.
     케이스에는 저장하지 않는다(케이스는 환경 독립). 세션 동안만 기억한다. */
  const [debugEnv, setDebugEnv] = useState(null);   // { systemId, env }
  const [fqaEditTc, setFqaEditTc] = useState(null);
  const [nqaScnFocus, setNqaScnFocus] = useState(null);
  const [fqaSuiteFocus, setFqaSuiteFocus] = useState(null); // 스위트 → 케이스 화면으로 필터 걸고 이동
  const [jiraConfig, setJiraConfig] = useState({ connected: true, deploy: "Cloud", url: "onmarket.atlassian.net", email: "qa@onmarket.io", token: "${jira_token}", project: "SHOP", issueType: "Bug", assignee: "QA Lead", labels: "lqa, chatbot", titleTpl: "[챗봇] {{tcId}} 평가 실패 ({{score}}점)", dedup: true, sevMap: { Critical: "Highest", Major: "High", Minor: "Medium" } });
  const [fqaResultFrom, setFqaResultFrom] = useState("fqa-history");
  /* ── MQA 기능 QA (앱) — 격리된 기획 브랜치. 웹 FQA 와 완전 분리된 state ── */
  const [mqaCases, setMqaCases] = useState(seedCases(INIT_MQA_CASES));
  const [mqaSuites, setMqaSuites] = useState(stampSeeds(INIT_MQA_SUITES));
  const [mqaSystems, setMqaSystems] = useState(stampSeeds(INIT_MQA_SYSTEMS));
  /* 테스트 기기 — 러너(사용자 PC 상주) · 연결된 단말. 단말 점유(busy)는 1단말 1잡 — 작업이 끝나면 반드시 반납한다 */
  const [mqaRunners, setMqaRunners] = useState(INIT_MQA_RUNNERS);
  /* 작업 조건 — 마지막으로 고른 작업 환경 · 작업 단말. 케이스에 저장하지 않는다(FQA 디버그 환경과 같은 원칙). 세션 동안만 기억 */
  const [mqaWork, setMqaWork] = useState({ env: "", devId: "" });
  const [mqaRuns, setMqaRuns] = useState(INIT_MQA_RUNS);
  const [mqaPlans, setMqaPlans] = useState(stampSeeds(INIT_MQA_PLANS));
  const [mqaResultRun, setMqaResultRun] = useState(null);
  const [mqaEditTc, setMqaEditTc] = useState(null);
  const [mqaSuiteFocus, setMqaSuiteFocus] = useState(null);
  const [mqaResultFrom, setMqaResultFrom] = useState("mqa-history");
  const [judges, setJudges] = useState(INIT_JUDGES);
  const [prompts, setPrompts] = useState(INIT_PROMPTS);
  const [chatbots, setChatbots] = useState(stampSeeds(INIT_CHATBOTS));
  const [pendingSelect, setPendingSelect] = useState(null);
  /* 역할 전환은 데모용 — 기본은 Owner(고객사 QA 리더) 시점이다 */
  const ROLE_OPTS = [{ id: "admin", label: "Super Admin" }, { id: "tadmin", label: "Owner" }, { id: "user", label: "Member" }];
  const [role, setRole] = useState("tadmin");
  const [roleMenu, setRoleMenu] = useState(false);   // 사람 아이콘 하위 드롭다운 열림
  const [space, setSpace] = useState("product");
  const [domain, setDomain] = useState("LQA");
  const [nqaWs, setNqaWs] = useState(null);   // NQA 워크스페이스: null(미선택) / perf(앱 성능) / load(부하) — 상단 버튼을 고를 때 확정
  const [tenants, setTenants] = useState(INIT_TENANTS);
  const [tenantId, setTenantId] = useState("t1");
  const [users, setUsers] = useState(INIT_USERS);
  const [models, setModels] = useState(INIT_MODELS);
  const tid = useRef(0);

  const toast = (msg, kind = "info") => {
    const id = ++tid.current; setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  };
  const now = () => new Date().toTimeString().slice(0, 5);
  const notify = (n) => setNotifs((x) => [{ ...n, t: now() }, ...x].slice(0, 12));
  const USER_BY_ROLE = { admin: "한도윤", tadmin: "박지영", user: "이민준" };
  const currentUser = USER_BY_ROLE[role] || "이민준";
  const auditNow = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
  const withCreate = (o) => { const t = auditNow(); return { createdBy: currentUser, createdAt: t, updatedBy: currentUser, updatedAt: t, ...o }; };
  const withUpdate = (patch) => ({ ...patch, updatedBy: currentUser, updatedAt: auditNow() });
  /* 케이스의 그 시점 전체 스냅샷 = tc_revision 한 행 */
  const revSnap = (c, rev, note) => ({
    rev, at: c.updatedAt || auditNow(), by: c.updatedBy || currentUser, note: note || "",
    level: c.level, steps: c.steps || [], code: c.code || "",
    name: c.name, tags: c.tags || "", dataset: c.dataset || "-", acctRole: c.acctRole || "",
    x: mqaX(c),   // MQA 전용 필드(자연어 절차·사전조건 원문) — FQA 는 읽지 않는다. 관리 수준·코드는 level·code 로 FQA 와 공유
  });
  /* 🔑 미저장 변경 보호 — dirty 상태는 각 화면 안에 있고 사이드바는 그것을 모른다.
     화면이 setNavGuard로 등록하고, 모든 이동 경로가 goTo를 거치게 한다.
     ref를 쓰는 이유: 리렌더를 유발하지 않고, 클릭 시점의 최신 값을 본다.
     이동에 성공하면 가드를 비운다 — 화면이 정리를 빠뜨려도 다음 이동에서 자동 해소된다. */
  const navGuardRef = useRef(null);
  const setNavGuard = (msg) => { navGuardRef.current = msg || null; };
  /* 🔑 알림 클릭 이동 — 알림은 "무슨 일이 났다" 만 말하고, 어디로 갈지는 알림이 들고 있어야 한다.
     도메인부터 바꾸는 이유: LQA 와 FQA 는 view id 체계가 다르다("history" vs "fqa-history").
     도메인을 안 바꾸고 setView 만 하면 그 도메인에 없는 화면이라 빈 화면이 된다.
     목적지가 없는 알림도 누를 수 있다 — 클릭이 곧 "확인함" 이라 목록에서 빠진다. */
  const openNotif = (n) => {
    setBellOpen(false);
    /* 🔑 누른 알림은 목록에서 뺀다 — 이 목록은 영구 이력이 아니라 "아직 안 본 것들" 이다
       ('모두 지우기' 가 있는 것도 같은 뜻이다). 그래야 빨간 점이 신호로 산다.
       알림이 가리키는 대상(실행 결과·결함)은 각자 화면에 그대로 남으므로 잃는 것이 없다. */
    setNotifs((x) => x.filter((v) => v !== n));
    if (!n.to) return;
    if (!goTo(n.to.view)) return;                       // 미저장 변경 가드를 우회하지 않는다
    if (n.to.domain && n.to.domain !== domain) setDomain(n.to.domain);
    /* 🔑 목록이 아니라 그 항목을 연다 — 알림이 이미 어느 건인지 말했는데
       목록만 열면 사용자가 그걸 다시 찾아야 한다(결함 화면 주석도 같은 말을 한다).
       도메인마다 "특정 항목 열기" 수단이 이미 따로 있어 그대로 쓴다. */
    /* 실행 알림은 도메인마다 "그 실행을 여는 전역 state" 가 따로 있다 — to.domain 으로 가른다.
       LQA 도 FQA 와 같은 규약(지속 state)을 쓴다. 한쪽만 고치면 그 도메인 알림이 빈 화면을 연다. */
    if (n.to.run) {
      if (n.to.domain === "LQA") { setLqaResultRun(n.to.run); setLqaResultFrom("history"); }
      else if (n.to.domain === "MQA") { setMqaResultRun(n.to.run); setMqaResultFrom("mqa-history"); }
      else { setFqaResultRun(n.to.run); setFqaResultFrom("fqa-history"); }
    }
    if (n.to.select) setPendingSelect(n.to.select);                                  // 결함 · 챗봇 · 계획
  };
  /* 🔑 메뉴 재클릭 신호 — 지금 보고 있는 메뉴를 다시 누르면 view 가 같아 아무 일도 안 일어난다.
     편집기·가져오기처럼 화면 안에 하위 단계가 있는 화면은 이 값이 바뀌면 목록으로 돌아간다.
     (전에는 미저장 확인창만 뜨고 화면이 그대로 남았고, 그 사이 가드가 지워져 이후 이동이 무방비였다) */
  const [navTick, setNavTick] = useState(0);
  const goTo = (v) => { if (navGuardRef.current && !window.confirm(navGuardRef.current)) return false; navGuardRef.current = null; setView(v); return true; };
  /* 🔑 FQA 화면 간 이동 단일 출처.
     전에는 화면마다 nav 람다를 따로 넘겨서 인자 규약이 셋으로 갈려 있었다 —
     nav(rid) · nav(v, rid) · nav(v, tc). 같은 컴포넌트(FqaResultScreen)가 모드에 따라
     다른 규약을 쓰고 있어서, 조건 하나만 어긋나도 rid 자리에 화면 이름이 들어간다.
     규약을 nav(목적지, 인자) 하나로 고정하고 인자의 뜻은 목적지가 정한다.
     setView 가 아니라 goTo 를 쓰므로 미저장 변경 가드를 우회하지 않는다. */
  const fqaNav = (v, arg) => {
    if (!goTo(v)) return;
    if (arg && v === "fqa-result-detail") { setFqaResultRun(arg); setFqaResultFrom(view); }
    if (arg && v === "fqa-cases") setFqaEditTc(arg);
  };
  const mqaNav = (v, arg) => {
    if (!goTo(v)) return;
    if (arg && v === "mqa-result-detail") { setMqaResultRun(arg); setMqaResultFrom(view); }
    if (arg && v === "mqa-cases") setMqaEditTc(arg);
  };
  const api = {
    currentUser, setNavGuard, goTo, navTick,
    goto: setView, env, setEnv, reportCfg, setReportCfg, reportHist, addReportHist: (rows) => setReportHist((x) => [...(Array.isArray(rows) ? rows : [rows]), ...x]), toast, notify, openModal: (type, data) => setModal({ type, data }),
    cases, addCases: (arr) => setCases((c) => [...arr.map(withCreate), ...c]),
    setCaseStatus: (id, status) => setCases((c) => c.map((x) => (x.id === id ? { ...x, ...withUpdate({ status }) } : x))),
    updateCase: (id, patch) => setCases((c) => c.map((x) => (x.id === id ? { ...x, ...withUpdate(patch) } : x))),
    removeCase: (id) => setCases((c) => c.filter((x) => x.id !== id)),
    categories, addCategory: (n) => setCategories((x) => (x.includes(n) ? x : [n, ...x])), removeCategory: (n) => setCategories((x) => x.filter((c) => c !== n)),
    plans, addPlan: (p) => { setPlans((x) => [withCreate(p), ...x]); setPendingSelect({ kind: "plan", id: p.id }); }, updatePlan: (id, patch) => setPlans((x) => x.map((p) => (p.id === id ? { ...p, ...withUpdate(patch) } : p))), removePlan: (id) => setPlans((x) => x.filter((p) => p.id !== id)),
    /* removeRun — 중지·취소는 레코드를 지운다(FQA removeFqaRun · PQA removePerfRun 과 같은 규약).
       🔑 '중지됨' 상태를 만들지 않는 이유: 끝나지 않은 실행은 확정된 사실이 없다.
          이력에 남기면 점수·PASS율이 빈 행이 쌓이고, 회귀 비교·대시보드 통계가
          매번 그 행을 예외 처리해야 한다. */
    runs, addRun: (r) => setRuns((x) => [r, ...x]), updateRun: (id, patch) => setRuns((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r))), removeRun: (id) => setRuns((x) => x.filter((r) => r.id !== id)),
    lqaResultRun, setLqaResultRun, lqaResultFrom, setLqaResultFrom,
    defects, addDefect: (d) => setDefects((x) => [withCreate(d), ...x]), setDefectStatus: (key, status) => setDefects((x) => x.map((d) => (d.key === key ? { ...d, ...withUpdate({ status }) } : d))), setDefectAssignee: (key, assignee) => setDefects((x) => x.map((d) => (d.key === key ? { ...d, ...withUpdate({ assignee }) } : d))), updateDefect: (key, patch) => setDefects((x) => x.map((d) => (d.key === key ? { ...d, ...withUpdate(patch) } : d))),
    /* ── 케이스 리비전 ────────────────────────────────────────────
       tc_revision 테이블에 "저장될 때마다 새 행"을 넣는다. 현재본도 이력에 들어 있다.
         · diff가 아니라 전체 스냅샷 (스텝 20개·코드 100줄 규모 — 용량은 무의미, diff 저장은 임의 비교를 막는다)
         · 개수를 자르지 않는다 — 실행 이력이 특정 리비전을 참조하면 잘라낸 순간 추적이 끊긴다
       실 구현: tc_revision(case_id, rev, level, steps JSONB, code TEXT, name, suite, tags, …, author, created_at)
                INSERT 한 번 + SELECT 한 번. diff 계산은 화면이 한다(서버는 스냅샷만 준다). */
    fqaCases,
    addFqaCase: (c) => setFqaCases((x) => {
      const base = withCreate({ rev: 1, ...c });
      return [{ ...base, versions: [revSnap(base, 1)] }, ...x];   // 최초 작성 = rev 1
    }),
    updateFqaCase: (id, patch) => setFqaCases((x) => x.map((c) => (c.id === id ? { ...c, ...withUpdate(patch) } : c))),
    setFqaCaseStatus: (id, status) => setFqaCases((x) => x.map((c) => (c.id === id ? { ...c, ...withUpdate({ status }) } : c))),
    removeFqaCase: (id) => { setFqaCases((x) => x.filter((c) => c.id !== id)); setFqaSuites((x) => x.map((su) => ((su.items || []).includes(id) ? { ...su, items: su.items.filter((i) => i !== id) } : su))); },
    /* 저장 = 새 리비전 INSERT.
       baseRev = 편집을 시작한 시점의 rev — 그 사이 남이 저장했으면 거부한다(낙관적 잠금).
       반환값: true = 저장됨, false = 충돌 */
    commitFqaCase: (id, patch, opt) => {
      const { baseRev, note } = opt || {};
      let ok = true;
      setFqaCases((x) => x.map((c) => {
        if (c.id !== id) return c;
        const cur = c.rev || 1;
        if (baseRev != null && baseRev !== cur) { ok = false; return c; }   // 남이 먼저 저장했다
        const next = { ...c, ...withUpdate(patch), rev: cur + 1 };
        return { ...next, versions: [revSnap(next, cur + 1, note), ...(c.versions || [])] };
      }));
      return ok;
    },
    fqaSuites, addFqaSuite: (su) => setFqaSuites((x) => [withCreate(su), ...x]), updateFqaSuite: (id, patch) => setFqaSuites((x) => x.map((su) => (su.id === id ? { ...su, ...withUpdate(patch) } : su))), removeFqaSuite: (id) => setFqaSuites((x) => x.filter((su) => su.id !== id)),
    fqaSystems, addFqaSystem: (sy) => setFqaSystems((x) => [withCreate(sy), ...x]), updateFqaSystem: (id, patch) => setFqaSystems((x) => x.map((sy) => (sy.id === id ? { ...sy, ...withUpdate(patch) } : sy))), removeFqaSystem: (id) => setFqaSystems((x) => x.filter((sy) => sy.id !== id)),
    nqaSystems, addNqaSystem: (sy) => setNqaSystems((x) => [withCreate(sy), ...x]), updateNqaSystem: (id, patch) => setNqaSystems((x) => x.map((sy) => (sy.id === id ? { ...sy, ...withUpdate(patch) } : sy))), removeNqaSystem: (id) => setNqaSystems((x) => x.filter((sy) => sy.id !== id)),
    nqaScenarios, addNqaScenario: (s) => setNqaScenarios((x) => [withCreate(s), ...x]), updateNqaScenario: (id, patch) => setNqaScenarios((x) => x.map((s) => (s.id === id ? { ...s, ...withUpdate(patch) } : s))), removeNqaScenario: (id) => setNqaScenarios((x) => x.filter((s) => s.id !== id)),
    nqaRuns, addNqaRun: (r) => setNqaRuns((x) => [r, ...x]), updateNqaRun: (id, patch) => setNqaRuns((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r))), removeNqaRun: (id) => setNqaRuns((x) => x.filter((r) => r.id !== id)),
    perfApps, addPerfApp: (a) => setPerfApps((x) => [a, ...x]), updatePerfApp: (id, patch) => setPerfApps((x) => x.map((a) => (a.id === id ? { ...a, ...patch } : a))), removePerfApp: (id) => setPerfApps((x) => x.filter((a) => a.id !== id)),
    perfScenarios, addPerfScenario: (s) => setPerfScenarios((x) => [s, ...x]), updatePerfScenario: (id, patch) => setPerfScenarios((x) => x.map((s) => (s.id === id ? { ...s, ...patch } : s))), removePerfScenario: (id) => setPerfScenarios((x) => x.filter((s) => s.id !== id)),
    perfPlans, addPerfPlan: (p) => setPerfPlans((x) => [p, ...x]), updatePerfPlan: (id, patch) => setPerfPlans((x) => x.map((p) => (p.id === id ? { ...p, ...patch } : p))), removePerfPlan: (id) => setPerfPlans((x) => x.filter((p) => p.id !== id)),
    perfRuns, addPerfRun: (r) => setPerfRuns((x) => [r, ...x]), updatePerfRun: (id, patch) => setPerfRuns((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r))), removePerfRun: (id) => setPerfRuns((x) => x.filter((r) => r.id !== id)),
    variables, addVariable: (v) => setVariables((x) => [v, ...x]), updateVariable: (id, patch) => setVariables((x) => x.map((v) => (v.id === id ? { ...v, ...patch } : v))), removeVariable: (id) => setVariables((x) => x.filter((v) => v.id !== id)),
    datasets, addDataset: (d) => setDatasets((x) => [withCreate(d), ...x]), updateDataset: (id, patch) => setDatasets((x) => x.map((d) => (d.id === id ? { ...d, ...withUpdate(patch) } : d))), removeDataset: (id) => setDatasets((x) => x.filter((d) => d.id !== id)),
    fqaRuns, addFqaRun: (r) => setFqaRuns((x) => [r, ...x]), updateFqaRun: (id, patch) => setFqaRuns((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r))), removeFqaRun: (id) => setFqaRuns((x) => x.filter((r) => r.id !== id)),
    fqaPlans, addFqaPlan: (pl) => setFqaPlans((x) => [withCreate(pl), ...x]), updateFqaPlan: (id, patch) => setFqaPlans((x) => x.map((pl) => (pl.id === id ? { ...pl, ...withUpdate(patch) } : pl))), removeFqaPlan: (id) => setFqaPlans((x) => x.filter((pl) => pl.id !== id)),
    fqaResultRun, setFqaResultRun,
    /* ── 기능 QA (앱) — 격리 컨텍스트 ── */
    mqaCases,
    addMqaCase: (c) => setMqaCases((x) => { const base = withCreate({ rev: 1, ...c }); return [{ ...base, versions: [revSnap(base, 1)] }, ...x]; }),
    updateMqaCase: (id, patch) => setMqaCases((x) => x.map((c) => (c.id === id ? { ...c, ...withUpdate(patch) } : c))),
    setMqaCaseStatus: (id, status) => setMqaCases((x) => x.map((c) => (c.id === id ? { ...c, ...withUpdate({ status }) } : c))),
    /* 케이스를 지우면 스위트에서도 빠진다 — 지우기 전 확인창이 영향받는 스위트를 알린다 (cases.jsx delCase) */
    removeMqaCase: (id) => { setMqaCases((x) => x.filter((c) => c.id !== id)); setMqaSuites((x) => x.map((su) => (SL_uses(su, id) ? { ...su, items: (su.items || []).filter((i) => i !== id) } : su))); },
    commitMqaCase: (id, patch, opt) => { const { baseRev, note } = opt || {}; let ok = true; setMqaCases((x) => x.map((c) => { if (c.id !== id) return c; const cur = c.rev || 1; if (baseRev != null && baseRev !== cur) { ok = false; return c; } const next = { ...c, ...withUpdate(patch), rev: cur + 1 }; return { ...next, versions: [revSnap(next, cur + 1, note), ...(c.versions || [])] }; })); return ok; },
    mqaSuites, addMqaSuite: (su) => setMqaSuites((x) => [withCreate(su), ...x]), updateMqaSuite: (id, patch) => setMqaSuites((x) => x.map((su) => (su.id === id ? { ...su, ...withUpdate(patch) } : su))), removeMqaSuite: (id) => setMqaSuites((x) => x.filter((su) => su.id !== id)),
    mqaRunners, mqaWork, setMqaWork: (patch) => setMqaWork((w) => ({ ...w, ...patch })),
    addMqaRunner: (r) => setMqaRunners((x) => [...x, r]),
    updateMqaRunner: (id, patch) => setMqaRunners((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    removeMqaRunner: (id) => setMqaRunners((x) => x.filter((r) => r.id !== id)),
    updateMqaDevice: (devId, patch) => setMqaRunners((x) => x.map((r) => ({ ...r, devices: (r.devices || []).map((d) => (d.id === devId ? { ...d, ...patch } : d)) }))),
    lockMqaDevice: (devId, by) => setMqaRunners((x) => x.map((r) => ({ ...r, devices: (r.devices || []).map((d) => (d.id === devId ? { ...d, busy: by } : d)) }))),
    releaseMqaDevice: (devId) => setMqaRunners((x) => x.map((r) => ({ ...r, devices: (r.devices || []).map((d) => (d.id === devId ? { ...d, busy: null } : d)) }))),
    mqaSystems, addMqaSystem: (sy) => setMqaSystems((x) => [withCreate(sy), ...x]), updateMqaSystem: (id, patch) => setMqaSystems((x) => x.map((sy) => (sy.id === id ? { ...sy, ...withUpdate(patch) } : sy))), removeMqaSystem: (id) => setMqaSystems((x) => x.filter((sy) => sy.id !== id)),
    mqaRuns, addMqaRun: (r) => setMqaRuns((x) => [r, ...x]), updateMqaRun: (id, patch) => setMqaRuns((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r))), removeMqaRun: (id) => setMqaRuns((x) => x.filter((r) => r.id !== id)),
    mqaPlans, addMqaPlan: (pl) => setMqaPlans((x) => [withCreate(pl), ...x]), updateMqaPlan: (id, patch) => setMqaPlans((x) => x.map((pl) => (pl.id === id ? { ...pl, ...withUpdate(patch) } : pl))), removeMqaPlan: (id) => setMqaPlans((x) => x.filter((pl) => pl.id !== id)),
    mqaResultRun, setMqaResultRun,
    mqaEditTc, setMqaEditTc,
    mqaSuiteFocus, setMqaSuiteFocus,
    healState, setHeal: (id, st) => setHealState((h) => Object.assign({}, h, { [id]: st })),
    debugEnv, setDebugEnv,
    fqaEditTc, setFqaEditTc,
    nqaScnFocus, setNqaScnFocus,
    fqaSuiteFocus, setFqaSuiteFocus,
    jiraConfig, setJiraConfig,
    judges, toggleJudge: (name) => setJudges((x) => x.map((j) => (j.name === name ? { ...j, enabled: !j.enabled } : j))),
    prompts, addPrompt: (p) => setPrompts((x) => [p, ...x]), updatePrompt: (name, patch) => setPrompts((x) => x.map((pp) => (pp.name === name ? { ...pp, ...patch } : pp))), removePrompt: (name) => setPrompts((x) => x.filter((pp) => pp.name !== name)),
    pendingSelect, setPendingSelect,
    chatbots, addChatbot: (c) => { setChatbots((x) => [withCreate(c), ...x]); setPendingSelect({ kind: "chatbot", id: c.id }); }, updateChatbot: (id, patch) => setChatbots((x) => x.map((c) => (c.id === id ? { ...c, ...withUpdate(patch) } : c))), removeChatbot: (id) => setChatbots((x) => x.filter((c) => c.id !== id)),
    setChatbotStatus: (id, status) => setChatbots((x) => x.map((c) => (c.id === id ? { ...c, ...withUpdate({ status }) } : c))),
    role, setRole, space, setSpace, domain, setDomain, tenants, tenantId, setTenantId,
    addTenant: (t) => setTenants((x) => [t, ...x]),
    setTenantStatus: (id, status) => setTenants((x) => x.map((t) => (t.id === id ? { ...t, status } : t))),
    setTenantAdmin: (id, admin) => setTenants((x) => x.map((t) => (t.id === id ? { ...t, admin } : t))),
    users, addUser: (u) => setUsers((x) => [u, ...x]),
    setUserStatus: (id, status) => setUsers((x) => x.map((u) => (u.id === id ? { ...u, status } : u))),
    setUserRole: (id, role) => setUsers((x) => x.map((u) => (u.id === id ? { ...u, role } : u))),
    removeUser: (id) => setUsers((x) => x.filter((u) => u.id !== id)),
    models, addModel: (m) => setModels((x) => [m, ...x]),
    setModelStatus: (id, status) => setModels((x) => x.map((m) => (m.id === id ? { ...m, status } : m))),
  };
  const ALL_SECTIONS = [...SECTIONS, ...FQA_SECTIONS, ...MQA_SECTIONS, ...NQA_SECTIONS, ...PQA_SECTIONS, ...COMMON_SECTIONS];
  const nqaViewIds = new Set(NQA_SECTIONS.flatMap((s) => s.items.map((i) => i.id)));   // 부하 전용 화면 id
  /* 앱 성능 · 부하는 같은 NQA 도메인의 두 워크스페이스 — 지금 화면으로 정한다.
     알림 · 데이터셋 이동처럼 상단 버튼을 거치지 않고 들어와도 상단 강조 · 사이드바가 맞게 */
  const viewWs = nqaViewIds.has(view) ? "load" : String(view).startsWith("perf-") ? "perf" : null;
  const ws = viewWs || nqaWs;
  useEffect(() => { if (viewWs && viewWs !== nqaWs) setNqaWs(viewWs); }, [viewWs]);   // 공통 화면(변수 등)으로 넘어가도 유지
  const cur = [...ALL_SECTIONS.flatMap((s) => s.items), ...FQA_HIDDEN, ...MQA_HIDDEN, ...LQA_HIDDEN, MEMBERS_ITEM].find((n) => n.id === view) || NAV[0];
  const curSection = ((ALL_SECTIONS.find((s) => s.items.some((i) => i.id === view)) || {}).group) || (FQA_HIDDEN.find((i) => i.id === view) || {}).group || (MQA_HIDDEN.find((i) => i.id === view) || {}).group || (LQA_HIDDEN.find((i) => i.id === view) || {}).group;
  const tenantName = (tenants.find((t) => t.id === tenantId) || {}).name;
  const screens = { dashboard: <Dashboard />, plans: <Plans />, cases: <Cases />, run: <LqaRunScreen />, "lqa-result": <LqaResultScreen />, history: <RunHistory />, compare: <Compare />, variables: <VariablesScreen />, datasets: <DatasetsScreen />, defects: <Defects />, report: <Report />, targets: <Targets />, settings: <Settings />, members: <MembersView />, "fqa-dashboard": <FqaDashboardScreen nav={fqaNav} />, "fqa-targets": <FqaTargetScreen />, "fqa-suites": <FqaSuiteScreen />, "fqa-cases": <FqaCasesScreen />, "fqa-plan": <FqaPlanScreen />, "fqa-run": <FqaRunScreen nav={fqaNav} />, "fqa-history": <FqaHistoryScreen nav={fqaNav} />, "fqa-regression": <FqaResultScreen mode="회귀" nav={fqaNav} />, "fqa-flaky": <FqaResultScreen mode="불안정" nav={fqaNav} />, "fqa-result-detail": <FqaResultScreen mode="상세" runId={fqaResultRun} back={() => setView(fqaResultFrom || "fqa-history")} backLabel={{ "fqa-run": "실행", "fqa-history": "실행 이력", "fqa-dashboard": "대시보드", "fqa-regression": "회귀 비교" }[fqaResultFrom] || "뒤로"} />, "mqa-dashboard": <MqaDashboardScreen nav={mqaNav} />, "mqa-targets": <MqaTargetScreen />, "mqa-devices": <MqaDevicesScreen />, "mqa-suites": <MqaSuiteScreen />, "mqa-cases": <MqaCasesScreen />, "mqa-plan": <MqaPlanScreen />, "mqa-run": <MqaRunScreen nav={mqaNav} />, "mqa-history": <MqaHistoryScreen nav={mqaNav} />, "mqa-regression": <MqaResultScreen mode="회귀" nav={mqaNav} />, "mqa-flaky": <MqaResultScreen mode="불안정" nav={mqaNav} />, "mqa-result-detail": <MqaResultScreen mode="상세" nav={mqaNav} runId={mqaResultRun} back={() => setView(mqaResultFrom || "mqa-history")} backLabel={{ "mqa-run": "실행", "mqa-history": "실행 이력", "mqa-dashboard": "대시보드", "mqa-regression": "회귀 비교" }[mqaResultFrom] || "뒤로"} />, "nqa-dashboard": <NqaDashboardScreen nav={(v) => setView(v)} />, "nqa-targets": <NqaTargetScreen />, "nqa-scenarios": <NqaScenarioScreen />, "nqa-run": <NqaRunScreen nav={(v) => setView(v)} />, "nqa-history": <NqaHistoryScreen />,"perf-targets": <PqaTargetScreen />, "perf-scenarios": <PqaScenarioScreen />, "perf-plan": <PqaPlanScreen />, "perf-run": <PqaRunScreen />, "perf-history": <PqaHistoryScreen />, "perf-trend": <PqaTrendScreen />, "perf-dashboard": <PqaDashboardScreen /> };
  const tk = { ok: "border-emerald-200 bg-emerald-50 text-emerald-800", warn: "border-amber-200 bg-amber-50 text-amber-800", err: "border-red-200 bg-red-50 text-red-800", info: "border-slate-200 bg-white text-slate-800" };
  const nIcon = { play: Play, bug: Bug, send: Send };

  return (
    <AppCtx.Provider value={api}>
      {/* 바깥 틀 — 실서비스(proba-fe PageLayout)와 같은 구성: 그라데이션 배경 위 좌측 메뉴 + 떠 있는 본문 판(상단 바 · 제목줄 · 본문) */}
      {/* 배경 그라데이션은 style 로 직접 준다 — 좌측 메뉴 글자가 흰색이라, 배경이 빠지면 메뉴가 통째로 안 보인다 */}
      <div className={"flex h-screen text-ink " + (space === "product" ? "py-3 pr-3" : "bg-slate-50")} style={space === "product" ? { backgroundImage: "linear-gradient(180deg, #0f2027 0%, #2c5364 100%)" } : undefined}>
        {space === "product" && (<>
        {/* ── 좌측 메뉴 ── */}
        <aside className="flex w-56 shrink-0 flex-col text-white/70">
          <div className="flex shrink-0 items-center gap-2 py-2 pl-4"><img src={logoUrl} alt="PROBA" className="h-12 w-auto" /><span className="rounded-md border border-amber-300/60 bg-amber-300/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200">목업</span></div>
          <nav className="min-h-0 flex-1 overflow-y-auto pb-4 pr-3">
            {[...(domain === "FQA" ? FQA_SECTIONS : domain === "MQA" ? MQA_SECTIONS : domain === "NQA" ? (ws === "load" ? NQA_SECTIONS : PQA_SECTIONS) : SECTIONS), ...COMMON_SECTIONS, ...(role === "tadmin" ? [{ group: "관리", items: [MEMBERS_ITEM] }] : [])].map((sec) => (
              <div key={sec.group} className="mb-1 pl-4">
                <p className="pb-2 pt-4 text-[13px] font-medium tracking-wide text-line">{sec.group}</p>
                <ul className="space-y-0.5">
                  {sec.items.map((n) => { const Icon = n.icon; const on = view === n.id; return (
                    <li key={n.id}>
                      <button onClick={() => { if (n.id === "members") { setView("members"); return; } if (goTo(n.id)) setNavTick((t) => t + 1); }} aria-current={on ? "page" : undefined}
                        className={"relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors " + (on ? "bg-white/10 font-medium text-white" : "text-white/60 hover:bg-white/5 hover:text-white")}>
                        {on && <span className="absolute -left-4 top-0 h-full w-[3px] bg-brand" />}
                        <Icon size={18} className={"shrink-0 " + (on ? "text-white" : "text-white/60")} /><span className="truncate">{n.label}</span>
                      </button>
                    </li>
                  ); })}
                </ul>
              </div>
            ))}
          </nav>
          {role === "admin" && (
            <div className="px-3 pb-2"><button onClick={() => setSpace("console")} className="flex w-full items-center gap-2 rounded-lg border border-white/20 px-3 py-2.5 text-sm text-amber-300 hover:bg-white/5"><Shield size={16} />관리자 콘솔</button></div>
          )}
        </aside>
        {/* ── 본문 판 ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-canvas shadow-lg">
          {/* 상단 바 — 도메인 선택 · 조직 · 알림 · 역할(데모) */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-canvas px-4">
            {/* 테스트 도메인 — 선택 상자. 앱 성능 · 부하는 NQA 도메인의 두 워크스페이스(ws) */}
            <select value={domain === "NQA" ? "NQA" + (ws || "perf") : domain} title="테스트 도메인"
              onChange={(e) => { const d = DOMAINS.find((x) => x.id + (x.ws || "") === e.target.value); if (!d) return;
                if (!goTo(d.ws === "load" ? "nqa-dashboard" : d.ws === "perf" ? "perf-dashboard" : d.id === "FQA" ? "fqa-dashboard" : d.id === "MQA" ? "mqa-dashboard" : "dashboard")) return;
                setDomain(d.id); if (d.ws) setNqaWs(d.ws); }}
              className="w-40 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink outline-none hover:bg-canvas">
              {DOMAINS.map((d) => <option key={d.id + (d.ws || "")} value={d.id + (d.ws || "")} disabled={!d.ready}>{d.label}</option>)}
            </select>
            <div className="flex shrink-0 items-center gap-1.5 text-sm">
              <div className="flex items-center" title="테넌트(조직)">{role === "admin" ? <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); toast("테넌트 전환: " + ((tenants.find((t) => t.id === e.target.value) || {}).name), "info"); }} className="w-40 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink outline-none hover:bg-canvas">{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select> : /* 🔑 Super Admin 만 조직을 전환한다. 나머지는 자기 조직 하나뿐이라 고를 게 없다.
                       전환 상자와 같은 모양을 두면 누를 수 있는 것처럼 보인다 — 글자만 남긴다. */
                  <span className="flex h-9 items-center gap-1.5 px-2 text-sm font-medium text-ink"><Building2 size={14} className="text-subtle" />{tenantName}</span>}</div>
              <div className="relative">
                <button onClick={() => { setBellOpen(!bellOpen); setRoleMenu(false); }} title="알림" className="relative flex size-9 items-center justify-center rounded-lg border border-line bg-white text-subtle hover:bg-canvas"><Bell size={16} />{/* 🔑 개수를 세지 않는다 — 12개까지 쌓이는 목록이라 숫자가 커져도 행동이 달라지지 않는다.
                                       "새 알림이 있다" 만 알리면 되고, 무엇인지는 열어서 본다. */}
                  {notifs.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}</button>
                {bellOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5"><span className="text-sm font-semibold text-slate-800">알림</span><button onClick={() => { setNotifs([]); }} className="text-xs text-slate-500 hover:text-slate-600">모두 지우기</button></div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifs.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">알림이 없습니다.</div>}
                      {notifs.map((n, i) => { const NI = nIcon[n.icon] || Bell; return (
                        <div key={i} onClick={() => openNotif(n)} className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-2.5 hover:bg-slate-50"><NI size={15} className="mt-0.5 text-sky-500" /><div className="flex-1"><div className="text-sm text-slate-700">{n.text}</div><div className="text-xs text-slate-500">{n.t}</div></div></div>
                      ); })}
                    </div>
                    <button onClick={() => { setBellOpen(false); setView("report"); }} className="w-full py-2.5 text-center text-xs font-semibold text-sky-600 hover:bg-slate-50">리포트 · 알림 설정 →</button>
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => { setRoleMenu((v) => !v); setBellOpen(false); }} title={"역할 전환 (데모) · 현재 " + ((ROLE_OPTS.find((r) => r.id === role) || {}).label)} className={"flex size-9 items-center justify-center rounded-lg border border-line text-subtle " + (roleMenu ? "bg-canvas" : "bg-white hover:bg-canvas")}><UserCog size={16} /></button>
                {roleMenu && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <div className="px-3 pb-1 pt-0.5 text-slate-500" style={{ fontSize: 10 }}>역할 전환 (데모)</div>
                    {ROLE_OPTS.map((r) => (
                      <button key={r.id} onClick={() => { setRole(r.id); setRoleMenu(false); }} className={"flex w-full items-center px-3 py-1.5 text-sm " + (role === r.id ? "bg-sky-50 font-semibold text-sky-700" : "text-slate-600 hover:bg-slate-100")}>{r.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </header>
          {/* 제목줄 — 청록 아이콘 타일 + 제목 + 메뉴 분류 (실서비스 PageHeader) */}
          <div className="flex shrink-0 items-center gap-3 px-5 py-[10px]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-white"><cur.icon size={20} /></span>
            <div className="min-w-0"><h1 className="text-[15px] font-semibold text-black">{cur.label}</h1><p className="truncate text-xs text-subtle">{curSection}</p></div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2" style={{ scrollbarGutter: "stable" }}>{screens[view]}</div>
        </div>
        </>)}
        {space === "console" && <ConsoleShell />}

        {/* modals */}
        {modal && (() => {
          const close = () => setModal(null);
          const map = {
            newPlan: ["새 평가 계획", <NewPlanForm close={close} data={modal.data} />],
            aiGen: ["AI 발화 생성", <AiGenForm close={close} />],
            newCase: ["테스트케이스 " + (modal.data ? "수정" : "등록"), <NewCaseForm close={close} data={modal.data} />],
            catMgr: ["카테고리 관리", <CategoryManager close={close} />],
            importCases: ["Excel 일괄 업로드", <ImportCasesForm close={close} />],
            jira: ["결함 등록", <JiraForm close={close} data={modal.data} />, true],
            addPrompt: ["Prompt 템플릿 " + (modal.data ? "편집" : "추가"), <AddPromptForm close={close} data={modal.data} />],
            planCases: ["평가 계획 케이스 선택", <PlanCasesForm close={close} data={modal.data} />, true],
            addChatbot: ["챗봇 " + (modal.data ? "편집" : "연결 추가"), <AddChatbotForm close={close} data={modal.data} />, false],
            jiraConfig: ["Jira 연동 설정", <JiraConfigForm close={close} />, true],
            newTenant: ["조직 추가", <NewTenantForm close={close} />],
            assignAdmin: ["Owner 지정", <AssignAdminForm close={close} data={modal.data} />],
            inviteMember: ["멤버 초대", <InviteMemberForm close={close} />],
            newModel: ["AI 모델 등록", <NewModelForm close={close} />],
            newOperator: ["Super Admin 추가", <NewOperatorForm close={close} />],
          };
          const [title, body, wide] = map[modal.type] || ["", null, false];
          return <Modal title={title} onClose={close} wide={wide}>{body}</Modal>;
        })()}

        {/* toasts */}
        <div className="fixed bottom-5 right-5 z-50 space-y-2">
          {toasts.map((t) => (
            <div key={t.id} className={"flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-lg " + (tk[t.kind] || tk.info)}>
              {t.kind === "ok" ? <CheckCircle2 size={16} className="text-emerald-300" /> : t.kind === "err" ? <XCircle size={16} className="text-red-300" /> : t.kind === "warn" ? <AlertTriangle size={16} className="text-amber-300" /> : <Bell size={16} className="text-slate-300" />}
              {t.msg}
            </div>
          ))}
        </div>
      </div>
    </AppCtx.Provider>
  );
}
