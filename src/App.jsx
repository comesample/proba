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
import { DOMAINS, COMMON_SECTIONS, MEMBERS_ITEM, INIT_TENANTS, INIT_USERS, INIT_MODELS, INIT_VARIABLES, INIT_DATASETS } from "./common/data.js";
import { VariablesScreen } from "./common/variables.jsx";
import { DatasetsScreen } from "./common/datasets.jsx";
import { FQA_SECTIONS, INIT_FQA_CASES, INIT_FQA_SUITES, INIT_FQA_SYSTEMS, INIT_FQA_RUNS, INIT_FQA_PLANS, FQA_HIDDEN } from "./fqa/data.js";
import { NQA_SECTIONS, NQA_SUBTYPES, INIT_NQA_SYSTEMS, INIT_NQA_SCENARIOS, INIT_NQA_RUNS } from "./nqa/data.js";
import { NqaDashboardScreen, NqaTargetScreen, NqaScenarioScreen, NqaRunScreen, NqaHistoryScreen } from "./nqa/screens.jsx";
import { PQA_SECTIONS, INIT_PERF_APPS, INIT_PERF_SCENARIOS, INIT_PERF_PLANS, INIT_PERF_RUNS } from "./pqa/data.js";
import { PqaTargetScreen, PqaScenarioScreen, PqaPlanScreen, PqaRunScreen, PqaHistoryScreen, PqaTrendScreen, PqaDashboardScreen } from "./pqa/screens.jsx";
import { NewPlanForm, AiGenForm, NewCaseForm, JiraForm, AddPromptForm, PlanCasesForm, JiraConfigForm, AddChatbotForm, Targets, Dashboard, Plans, RunHistory, CategoryManager, ImportCasesForm, Cases, LqaRunScreen, LqaResultScreen, Compare, Defects, Report, Settings, InviteMemberForm, MembersView } from "./lqa/screens.jsx";

/* ============================ context ============================ */

const SEED_USERS = ["이민준", "최서연", "김지훈", "박지영"];
const stampSeeds = (arr) => (arr || []).map((o, i) => { if (o.createdAt) return o; const z = (n) => String(n).padStart(2, "0"); return { createdBy: SEED_USERS[i % 4], createdAt: "2026-" + z(1 + (i % 6)) + "-" + z(1 + (i % 27)) + " " + z(9 + (i % 8)) + ":" + z((i * 7) % 60), updatedBy: SEED_USERS[(i + 2) % 4], updatedAt: "2026-" + z(4 + (i % 3)) + "-" + z(1 + ((i * 3) % 27)) + " " + z(10 + (i % 7)) + ":" + z((i * 11) % 60), ...o }; });
/* 케이스 시드에 리비전을 채운다 — 현재본도 이력에 들어 있어야 한다(최초 작성 = rev 1).
   TC-055처럼 versions를 직접 정의한 시드는 그 뒤에 현재 rev를 얹는다. */
const seedCases = (arr) => stampSeeds(arr).map((c) => {
  const rev = c.rev || 1;
  const head = { rev, at: c.updatedAt, by: c.updatedBy, note: "", level: c.level, steps: c.steps || [], code: c.code || "", name: c.name, suite: c.suite, tags: c.tags || "", dataset: c.dataset || "-", acctRole: c.acctRole || "" };
  return { ...c, rev, versions: [head, ...(c.versions || [])] };
});

export default function App() {
  const [view, setView] = useState("dashboard");
  const [fqaTab, setFqaTab] = useState("상세");
  const [env, setEnv] = useState("전체");
  const [reportCfg, setReportCfg] = useState({ ch: { slack: true, teams: false, email: true }, cond: "fail", scope: "통합 (전체 도메인)", rsched: { on: true, freq: "weekly", time: "09:00", dow: 1, dom: 1 } });
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
  const [nqaWs, setNqaWs] = useState(null);   // 성능 QA 워크스페이스: null(미선택) / perf(앱 성능) / load(부하) — 드롭다운에서 고를 때 확정
  const [nqaMenu, setNqaMenu] = useState(false);   // '성능 QA' 상단 버튼 하위 드롭다운 열림
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
    name: c.name, suite: c.suite, tags: c.tags || "", dataset: c.dataset || "-", acctRole: c.acctRole || "",
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
      else { setFqaResultRun(n.to.run); setFqaResultFrom("fqa-history"); }
    }
    if (n.to.select) setPendingSelect(n.to.select);                                  // 결함 · 챗봇 · 계획
  };
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
  const api = {
    currentUser, setNavGuard, goTo,
    goto: setView, env, setEnv, reportCfg, setReportCfg, toast, notify, openModal: (type, data) => setModal({ type, data }),
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
    removeFqaCase: (id) => setFqaCases((x) => x.filter((c) => c.id !== id)),
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
  const ALL_SECTIONS = [...SECTIONS, ...FQA_SECTIONS, ...NQA_SECTIONS, ...PQA_SECTIONS, ...COMMON_SECTIONS];
  const nqaViewIds = new Set(NQA_SECTIONS.flatMap((s) => s.items.map((i) => i.id)));   // 성능 QA(부하) 전용 화면 id
  const cur = [...ALL_SECTIONS.flatMap((s) => s.items), ...FQA_HIDDEN, ...LQA_HIDDEN, MEMBERS_ITEM].find((n) => n.id === view) || NAV[0];
  const curSection = ((ALL_SECTIONS.find((s) => s.items.some((i) => i.id === view)) || {}).group) || (FQA_HIDDEN.find((i) => i.id === view) || {}).group || (LQA_HIDDEN.find((i) => i.id === view) || {}).group;
  const tenantName = (tenants.find((t) => t.id === tenantId) || {}).name;
  const screens = { dashboard: <Dashboard />, plans: <Plans />, cases: <Cases />, run: <LqaRunScreen />, "lqa-result": <LqaResultScreen />, history: <RunHistory />, compare: <Compare />, variables: <VariablesScreen />, datasets: <DatasetsScreen />, defects: <Defects />, report: <Report />, targets: <Targets />, settings: <Settings />, members: <MembersView />, "fqa-dashboard": <FqaDashboardScreen nav={fqaNav} />, "fqa-targets": <FqaTargetScreen />, "fqa-suites": <FqaSuiteScreen />, "fqa-cases": <FqaCasesScreen />, "fqa-plan": <FqaPlanScreen />, "fqa-run": <FqaRunScreen nav={fqaNav} />, "fqa-history": <FqaHistoryScreen nav={fqaNav} />, "fqa-regression": <FqaResultScreen mode="회귀" nav={fqaNav} />, "fqa-flaky": <FqaResultScreen mode="불안정" nav={fqaNav} />, "fqa-result-detail": <FqaResultScreen mode="상세" runId={fqaResultRun} back={() => setView(fqaResultFrom || "fqa-history")} backLabel={{ "fqa-run": "실행", "fqa-history": "실행 이력", "fqa-dashboard": "대시보드", "fqa-regression": "회귀 비교" }[fqaResultFrom] || "뒤로"} />, "nqa-dashboard": <NqaDashboardScreen nav={(v) => setView(v)} />, "nqa-targets": <NqaTargetScreen />, "nqa-scenarios": <NqaScenarioScreen />, "nqa-run": <NqaRunScreen nav={(v) => setView(v)} />, "nqa-history": <NqaHistoryScreen />,"perf-targets": <PqaTargetScreen />, "perf-scenarios": <PqaScenarioScreen />, "perf-plan": <PqaPlanScreen />, "perf-run": <PqaRunScreen />, "perf-history": <PqaHistoryScreen />, "perf-trend": <PqaTrendScreen />, "perf-dashboard": <PqaDashboardScreen /> };
  const tk = { ok: "border-emerald-200 bg-emerald-50 text-emerald-800", warn: "border-amber-200 bg-amber-50 text-amber-800", err: "border-red-200 bg-red-50 text-red-800", info: "border-slate-200 bg-white text-slate-800" };
  const nIcon = { play: Play, bug: Bug, send: Send };

  return (
    <AppCtx.Provider value={api}>
      <div className="flex h-screen bg-slate-50 text-slate-700" style={{ fontFamily: "'Malgun Gothic', system-ui, sans-serif" }}>
        {space === "product" && (
      <div className="flex flex-col flex-1 min-w-0">
        {/* ── 상단 앱바 (로고 · 검증 영역 · 전역 컨트롤) ── */}
        <div className="flex items-center justify-between gap-4 px-5 h-14 shrink-0 border-b border-slate-400/40 bg-slate-300">
          <div className="flex items-center gap-2 shrink-0"><div className="w-7 h-7 rounded-lg bg-sky-700 flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 48 48" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M24 8 V24" /><path d="M8 24 H40" /><path d="M24 24 L14 40 H34 Z" /></svg></div><span className="font-bold text-slate-800">PROBA</span><span className="text-slate-500" style={{ fontSize: 10 }}>Prove every release</span></div>
          <div className="flex items-center gap-3 text-sm shrink-0">
              <div className="flex items-center gap-1 border-r border-slate-400/40 pr-3">
                {DOMAINS.map((d) => d.id === "NQA" ? (
                  <div key={d.id} className="relative shrink-0">
                    <button onClick={() => setNqaMenu((v) => !v)} className={"rounded-lg px-3 py-1.5 text-sm font-semibold " + (domain === "NQA" ? "bg-white text-sky-700 shadow-sm" : nqaMenu ? "bg-slate-200 text-slate-800" : "text-slate-600 hover:bg-slate-200")}>{d.label}</button>
                    {nqaMenu && (
                      <div className="absolute left-0 top-full z-30 mt-1 w-24 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                        {NQA_SUBTYPES.map((s) => { const on = domain === "NQA" && nqaWs === s.id; return s.ready ? (
                          <button key={s.id} onClick={() => { if (!goTo(s.id === "load" ? "nqa-dashboard" : "perf-dashboard")) return; setDomain("NQA"); setNqaWs(s.id); setNqaMenu(false); }} className={"flex w-full items-center px-3 py-1.5 text-sm " + (on ? "bg-sky-50 text-sky-700 font-semibold" : "text-slate-600 hover:bg-slate-100")}>{s.label}</button>
                        ) : (
                          <button key={s.id} disabled title="향후 확장 예정" className="flex w-full cursor-not-allowed items-center px-3 py-1.5 text-sm text-slate-300">{s.label}</button>
                        ); })}
                      </div>
                    )}
                  </div>
                ) : (
                  <button key={d.id} onClick={() => { if (!d.ready) { toast(d.label + "는 준비 중입니다 (확장 예정)", "info"); return; } if (!goTo(d.id === "FQA" ? "fqa-dashboard" : "dashboard")) return; setDomain(d.id); setNqaMenu(false); }} className={"shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold " + (domain === d.id ? "bg-white text-sky-700 shadow-sm" : d.ready ? "text-slate-600 hover:bg-slate-200" : "text-slate-500")}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5" title="테넌트(조직)"><Building2 size={13} className="text-slate-500" />{role === "admin" ? <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); toast("테넌트 전환: " + ((tenants.find((t) => t.id === e.target.value) || {}).name), "info"); }} className="bg-white border border-slate-400 rounded-lg px-2.5 py-1.5 text-slate-700 text-xs">{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select> : /* 🔑 Super Admin 만 조직을 전환한다. 나머지는 자기 조직 하나뿐이라 고를 게 없다.
                       전환 상자와 같은 테두리를 두면 누를 수 있는 것처럼 보인다 — 글자만 남긴다. */
                  <span className="py-1.5 text-xs font-medium text-slate-700">{tenantName}</span>}</div>
              <div className="relative">
                <button onClick={() => { setBellOpen(!bellOpen); setRoleMenu(false); }} className="relative text-slate-500 hover:text-slate-800"><Bell size={18} />{/* 🔑 개수를 세지 않는다 — 12개까지 쌓이는 목록이라 숫자가 커져도 행동이 달라지지 않는다.
                                       "새 알림이 있다" 만 알리면 되고, 무엇인지는 열어서 본다. */}
                  {notifs.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500" />}</button>
                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl z-30">
                    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">알림</span><button onClick={() => { setNotifs([]); }} className="text-xs text-slate-500 hover:text-slate-600">모두 지우기</button></div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifs.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">알림이 없습니다.</div>}
                      {notifs.map((n, i) => { const NI = nIcon[n.icon] || Bell; return (
                        <div key={i} onClick={() => openNotif(n)} className="px-4 py-2.5 border-b border-slate-100 flex items-start gap-3 cursor-pointer hover:bg-slate-50"><NI size={15} className="text-sky-500 mt-0.5" /><div className="flex-1"><div className="text-sm text-slate-700">{n.text}</div><div className="text-xs text-slate-500">{n.t}</div></div></div>
                      ); })}
                    </div>
                    <button onClick={() => { setBellOpen(false); setView("report"); }} className="w-full text-center text-xs font-semibold text-sky-600 py-2.5 hover:bg-slate-50">리포트 · 알림 설정 →</button>
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => { setRoleMenu((v) => !v); setBellOpen(false); }} title={"역할 전환 (데모) · 현재 " + ((ROLE_OPTS.find((r) => r.id === role) || {}).label)} className={"flex items-center gap-0.5 rounded-lg px-2 py-1.5 " + (roleMenu ? "bg-slate-200 text-slate-800" : "text-slate-500 hover:bg-slate-200 hover:text-slate-800")}><UserCog size={16} /><ChevronDown size={12} /></button>
                {roleMenu && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <div className="px-3 pb-1 pt-0.5 text-slate-500" style={{ fontSize: 10 }}>역할 전환 (데모)</div>
                    {ROLE_OPTS.map((r) => (
                      <button key={r.id} onClick={() => { setRole(r.id); setRoleMenu(false); }} className={"flex w-full items-center px-3 py-1.5 text-sm " + (role === r.id ? "bg-sky-50 text-sky-700 font-semibold" : "text-slate-600 hover:bg-slate-100")}>{r.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
        </div>
        {/* ── 사이드바(메뉴) + 본문 ── */}
        <div className="flex flex-1 min-h-0">
          <aside className="w-60 shrink-0 border-r border-slate-400/40 bg-slate-300 flex flex-col">
            <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
              {[...(domain === "FQA" ? FQA_SECTIONS : domain === "NQA" ? (nqaWs === "load" ? NQA_SECTIONS : PQA_SECTIONS) : SECTIONS), ...COMMON_SECTIONS].map((sec) => (
                <div key={sec.group}>
                  <div className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{sec.group}</div>
                  <div className="space-y-1">
                    {sec.items.map((n) => { const Icon = n.icon; const on = view === n.id; return (
                      <button key={n.id} onClick={() => goTo(n.id)} className={"w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm " + (on ? "bg-white text-sky-700 font-semibold shadow-sm" : "text-slate-700 hover:bg-slate-200 hover:text-slate-900")}><Icon size={16} />{n.label}</button>
                    ); })}
                  </div>
                </div>
              ))}
              {role === "tadmin" && (
                <div>
                  <div className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">관리</div>
                  <div className="space-y-1">
                    <button onClick={() => setView("members")} className={"w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm " + (view === "members" ? "bg-white text-sky-700 font-semibold shadow-sm" : "text-slate-700 hover:bg-slate-200 hover:text-slate-900")}><UserCog size={16} />조직 관리</button>
                  </div>
                </div>
              )}
            </nav>
            {role === "admin" && (
              <div className="px-3 pb-2"><button onClick={() => setSpace("console")} className="w-full flex items-center gap-2 rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-sm text-amber-700 hover:bg-amber-50"><Shield size={16} />관리자 콘솔</button></div>
            )}
          </aside>
          <main className="flex-1 flex flex-col overflow-hidden">
            <header className="flex items-center px-6 py-3.5 border-b border-slate-200/60 bg-white">
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-0.5">{curSection}</div>
                <div className="flex items-center gap-2"><cur.icon size={18} className="text-sky-500" /><h1 className="text-lg font-bold text-slate-800">{cur.label}</h1></div>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarGutter: "stable" }}>{screens[view]}</div>
          </main>
        </div>
      </div>
      )}
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
