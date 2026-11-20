// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { autoAlert } from "../common/ReportShare.jsx";
import { Badge, Btn, Card, Modal, PageToolbar, RunTime, SEL_ROW, Select, Toast, nowStamp, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { SURF_K, lastOf, outerChecks, suiteNm, tagMatch } from "./logic.js";
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
  const { fqaRuns, addFqaRun, updateFqaRun, removeFqaRun, fqaCases, updateFqaCase, fqaSuites, fqaSystems, fqaPlans, datasets, goto, notify, reportCfg, addReportHist } = useApp();
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
  const planSuiteIds = (plan) => (plan.suiteIds || []);
  // 실행 대상: 계획이 고른 스위트들의 승인 케이스 (스위트 활성 게이트 없음 — 계획 선택이 유일한 기준)
  const buildTcs = (plan) => {
    // 스위트(업무 흐름) ∩ 태그(실행 목적) ∩ 승인 — 태그가 비면 스위트 전체
    const inSuite = (c) => planSuiteIds(plan).includes(c.suiteId) && !c.quarantined && tagMatch(c, plan.tags);
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
  const planCasesOf = (plan) => fqaCases.filter((c) => planSuiteIds(plan).includes(c.suiteId) && !c.quarantined && tagMatch(c, plan.tags) && c.status === "승인");
  const precheck = (plan) => { const { e } = envRefOf(plan); return outerChecks(planCasesOf(plan), e, datasets, fqaCases); };
  const [pcModal, setPcModal] = useState(null);
  /* 🔴 문제 케이스만 빼고 돌리지 않는다 — 일부만 돈 회차가 품질 게이트를 통과하면
     검증이 사라진 것을 아무도 모른다. 빼는 결정은 사람이 '격리'로 내린다. */
  const quarantine = (list) => { list.forEach((c) => updateFqaCase(c.id, { quarantined: true })); setPcModal(null); flash(list.length + "건 격리됨 — 실행 대상에서 빠집니다. 다시 실행하세요"); };
  const gatePlan = (plan) => { if (plan.status !== "활성") { flash(plan.name + " — 초안 계획은 실행할 수 없습니다. 계획을 활성화하세요"); return false; } if (!planSuiteIds(plan).length) { flash(plan.name + " — 스위트가 선택되지 않았습니다"); return false; } if (!buildTcs(plan).length) { flash(plan.name + " — 실행할 승인 케이스가 없습니다 (스위트·태그·승인 상태 확인)"); return false; } const pc = precheck(plan); if (pc.length) { setPcModal({ plan, groups: pc }); return false; } return true; };
  // 실행 시점의 대상·환경·빌드 버전을 run에 스탬프 — "이 회귀가 어느 빌드에서 나왔나"를 추적하기 위함
  const stampOf = (plan) => { const { e, label } = envRefOf(plan); return { target: label, ver: (e && e.ver && e.ver !== "-") ? e.ver : "-" }; };
  const [runPlan, setRunPlan] = useState(runnableNames[0] || "");
  const [selRunId, setSelRunId] = useState(null);
  const selRun = fqaRuns.find((r) => r.id === selRunId && (r.status === "실행 중" || r.status === "대기 중")) || liveRun || rows[0] || null;
  // 실행 = 큐 맨끝에 '대기'로 적재만. 픽업·실행·완료는 아래 큐 프로세서가 담당(앞선 작업이 없어야 실행).
  const runNow = (plan) => { if (!gatePlan(plan)) return; const tcs = buildTcs(plan); const total = tcs.length; const id = nextId(); const { e } = envRefOf(plan); addFqaRun({ id, planId: plan.id, plan: plan.name, name: plan.name, suite: planSuiteIds(plan).map((x) => suiteNm(fqaSuites, x)).join(" · "), ...stampOf(plan), pw: "1.50.0", brVer: "132.0.6834.83", brow: (e && e.webUrl) ? ((plan.brow && plan.brow[0]) || "Chromium") : "", trig: "수동", by: "QA Engineer", status: "대기 중", prog: 0, progt: "대기", dur: "-", at: "방금 전", gate: plan.gate != null ? plan.gate : 95, total, pass: 0, fail: 0, warn: 0, tcs }); setSelRunId(id); flash(plan.name + " 실행 요청 · " + id + " — 큐 맨끝에 적재"); };
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
      /* 자동 알림 — 공통 발송 조건. '회귀'는 회귀 비교와 같은 기준: 같은 계획의 직전 완료 실행 대비 판정 하락 */
      const RK = { FAIL: 0, WARN: 1, HEAL: 1, PASS: 2 };
      const prev = fqaRuns.filter((r) => r.planId === next.planId && r.status === "완료" && r.id !== next.id).sort((x, y) => parseInt(y.id.split("-")[1] || "0", 10) - parseInt(x.id.split("-")[1] || "0", 10))[0];
      const regN = prev ? (next.tcs || []).filter((t) => { const p = (prev.tcs || []).find((x) => x.id === t.id); return p && RK[t.v] != null && RK[p.v] != null && RK[t.v] < RK[p.v]; }).length : 0;
      const pr = total ? Math.round(((total - fail - warn) / total) * 1000) / 10 : null;
      autoAlert({ reportCfg, addReportHist, domain: "FQA", hasFail: fail > 0, hasReg: regN > 0,
        text: (next.plan || next.name) + " " + next.id + " 완료 — " + (regN ? "퇴행 " + regN + "건 · " : "") + "실패 " + fail + "건" + (pr != null ? " · PASS " + pr + "%" : "") });
    }, 9000);
  }, [fqaRuns]);
  const cancelRun = (r) => { if (!window.confirm(r.id + " 실행을 큐에서 취소할까요?")) return; removeFqaRun(r.id); if (selRunId === r.id) setSelRunId(null); flash(r.id + " 취소됨 — 큐에서 제거"); };
  const stopRun = (r) => { if (!window.confirm(r.id + " 실행을 중지할까요? — 러너에 취소 신호를 보내고 큐에서 제거합니다")) return; removeFqaRun(r.id); if (selRunId === r.id) setSelRunId(null); flash(r.id + " 중지됨 — 러너 취소 · 큐에서 제거"); };
  const PlanInfo = ({ name }) => { const pl = fqaPlans.find((p) => p.name === name); if (!pl) return null; const { label } = envRefOf(pl); return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">계획에서 상속 · 대상 <span className="text-slate-700">{label}</span> <Badge kind={SURF_K[surfLabel(pl)] || "info"}>{surfLabel(pl)}</Badge> · 스위트 <span className="text-slate-700">{planSuiteIds(pl).map((x) => suiteNm(fqaSuites, x)).join(", ") || "없음"}</span></div>; };
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