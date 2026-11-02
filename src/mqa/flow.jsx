// ============================================================
// MQA 실행 흐름 — 실행 계획 · 실행 · 실행 이력 · 결과(상세 · 회귀 · 불안정) · 대시보드
//   한 바퀴 기준(얇게): 각 화면은 핵심 동작 하나가 끝까지 이어지게 만든다. 세부는 이후에 다듬는다.
//   FQA 와 같은 뼈대(좌 목록 / 우 상세)를 쓰되, 브라우저 · 해상도 · 워커 대신 '앱 버전 · 단말' 이 축이다.
//
//   계획 = 대상 앱 · 환경 · 앱 버전 + 스위트 · 태그(승인 케이스만) + 실행 단말 1대 + 재시도 · 게이트 + 예약
//   실행 = 러너가 단말을 점유(1단말 1작업) → 앱 설치 · 실행 → 케이스 순서대로 → 반납
//   예약 = 실행용 · 공용 러너의 단말만. 30분 전 사전 점검, 시각에 쓸 수 없으면 '실행 불가' 로 남긴다(조용히 건너뛰지 않음)
//   목업: 스텝 결과는 caseLogic.simulateStep(앱 버전별 화면) 으로 정한다 — TC-007 은 v3.2.0 에서 실패한다
// ============================================================
import { useState, useEffect } from "react";
import { Plus, X, Save, Play, Square, ClipboardList, CheckCircle2, XCircle, AlertTriangle, Clock, Smartphone, History, ChevronLeft, RefreshCw, Code2, FileText, Calendar, Activity, GitCompare, Download, Monitor } from "lucide-react";
import { Card, Badge, Btn, Field, Input, Select, Toast, useToast, PageToolbar, Portal, SEL_CARD, SEL_IDLE, nowStamp } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import * as L from "./caseLogic.js";
import { flatDevices, deviceBlock, devLabel, osName, runnerState, runnerRole, runnerOfDev } from "./devices.js";
import { envText } from "./workPickers.jsx";

/* ── 공통 판단 (계획 화면 · 실행 화면 · 예약 점검이 같은 함수를 쓴다) ── */
const tagList = (t) => String(t || "").split(/[,\s]+/).filter(Boolean);
export const envOfPlan = (systems, p) => { const sy = (systems || []).find((s) => s.id === p.systemId) || null; const e = sy ? (sy.envs || []).find((x) => x.env === p.env) || null : null; return { sy, e }; };
export const buildOf = (e, buildId) => { const app = (e && e.app) || {}; return (app.builds || []).find((b) => b.id === (buildId || app.defBuild)) || null; };
export const casesOfPlan = (p, cases) => (cases || []).filter((c) => c.systemId === p.systemId && c.status === "승인" && (p.suites || []).includes(c.suite) && (!tagList(p.tags).length || tagList(p.tags).some((t) => tagList(c.tags).includes(t))));
const devOf = (runners, id) => flatDevices(runners).find((d) => d.id === id) || null;
/* 실행을 막는 사유 — 빈 문자열이면 실행 가능. scheduled=true 면 예약 조건(러너 용도)까지 본다.
   editPreempt=true 면 편집 세션이 점유한 단말은 '사용 가능' 으로 본다 (예약 실행이 우선) */
export const planBlock = (p, ctx, scheduled, editPreempt) => {
  const { e } = envOfPlan(ctx.systems, p);
  if (p.status !== "활성") return "계획이 초안입니다 — 활성으로 바꾼 뒤 실행할 수 있습니다";
  if (!e) return "대상·환경을 찾을 수 없습니다";
  const b = buildOf(e, p.buildId);
  if (!b) return e.env + " 환경에 앱 설치 파일이 없습니다";
  if (!casesOfPlan(p, ctx.cases).length) return "조건에 맞는 승인 케이스가 없습니다";
  const d = devOf(ctx.runners, p.devId);
  if (!d) return "실행 단말이 지정되지 않았습니다";
  const r = runnerOfDev(ctx.runners, d.id);
  if (scheduled && runnerRole(r) === "저작용") return d.model + " — 저작용 PC의 단말이라 예약 실행에 쓸 수 없습니다 (테스트 기기에서 용도 변경)";
  const dd = editPreempt && d.state === "사용 중" && /^편집 세션/.test(d.busy || "") ? { ...d, state: "사용 가능" } : d;
  return deviceBlock(dd, b);
};
/* 예약 — 목업은 매일 · 평일 + 시각만. 다음 실행 시각을 사람이 읽는 문장으로 */
const SCHED_MODES = ["없음", "매일", "평일"];
const schedText = (s) => (!s || s.mode === "없음" ? "예약 없음" : s.mode + " " + s.time);
const nextRun = (s) => {
  if (!s || s.mode === "없음") return "";
  const now = new Date(); const [h, m] = String(s.time || "02:00").split(":").map(Number);
  const d = new Date(now); d.setHours(h, m, 0, 0); if (d <= now) d.setDate(d.getDate() + 1);
  while (s.mode === "평일" && (d.getDay() === 0 || d.getDay() === 6)) d.setDate(d.getDate() + 1);
  const z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(h) + ":" + z(m);
};
const RUN_K = { "대기 중": "info", "실행 중": "warn", "완료": "pass", "중단": "draft", "실행 불가": "fail" };
const CASE_K = { "대기": "draft", "실행 중": "warn", "통과": "pass", "실패": "fail", "건너뜀": "draft" };
const passRate = (r) => { const cs = (r.cases || []).filter((c) => c.st === "통과" || c.st === "실패"); return cs.length ? Math.round((cs.filter((c) => c.st === "통과").length / cs.length) * 100) : null; };
const resultText = (r) => { const cs = r.cases || []; const p = cs.filter((c) => c.st === "통과").length; const f = cs.filter((c) => c.st === "실패").length; return "통과 " + p + " · 실패 " + f + (cs.length - p - f ? " · 기타 " + (cs.length - p - f) : ""); };
const gateOk = (r) => { const pr = passRate(r); return pr != null && pr >= (r.gate || 0); };

/* ── 실행 엔진 (목업) — 결과를 미리 계산하고 타이머로 진행을 흘려보낸다.
   화면을 떠나도 진행되도록 모듈 단위로 둔다 (실 구현: 러너가 진행 상황을 서버로 보고) ── */
const RUN_TIMERS = {};
const actName = (s) => ((L.ACT[s.act] || { needs: [] }).needs.includes("loc") ? L.elName(s) : s.act === "화면 확인" ? "\"" + (s.val || "") + "\"" : s.act === "입력" ? "" : s.val || "");
const robotRows = (code) => String(code || "").split("\n").filter((l) => /^\s{2,}\S/.test(l)).map((l) => l.trim()).filter((l) => !l.startsWith("#") && !l.startsWith("[")).map((l) => ({ act: l.split(/\s{2,}/)[0], name: l.split(/\s{2,}/).slice(1).join("  "), res: { st: "ok", msg: "" } }));
const nextRunId = (runs) => "MRUN-" + String(Math.max(0, ...(runs || []).map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10) || 0)) + 1).padStart(3, "0");
export function startRun({ plan, cases, allCases, sys, env, build, dev, trigger, note, api, runs }) {
  const id = nextRunId(runs);
  const plans = cases.map((c) => {
    const pre = c.preCase ? [{ act: "전제조건", name: c.preCase + " " + ((allCases.find((x) => x.id === c.preCase) || {}).name || ""), res: { st: "ok", msg: "" } }] : [];
    const body = c.level === "Full-Code" ? robotRows(c.code) : (c.steps || []).map((s) => ({ act: s.act, name: actName(s), val: s.act === "입력" ? s.val : "", res: L.simulateStep(s, build.ver) }));
    const all = [...pre, ...body];
    return { c, all, pl: pre.length, fi: all.findIndex((x) => x.res.st === "fail") };
  });
  const cur = {
    id, planId: plan.id, planName: plan.name, systemId: sys.id, sysName: sys.name, env: env.env, build: build.ver, devId: dev.id, device: devLabel(dev), trigger, note: note || "",
    status: "실행 중", startedAt: nowStamp(), endedAt: "", gate: plan.gate, retry: plan.retry,
    log: [{ t: "앱 v" + build.ver + " 설치 · 데이터 초기화 · 실행 — " + dev.model }],
    cases: plans.map(({ c, all, pl }) => ({ id: c.id, name: c.name, st: "대기", preCase: c.preCase || "", preLen: pl, steps: all.map((x) => ({ act: x.act, name: x.name, val: x.val || "", st: "대기", msg: x.res.msg || "" })) })),
  };
  api.lockMqaDevice(dev.id, "실행 " + id);
  api.addMqaRun(JSON.parse(JSON.stringify(cur)));
  const push = () => api.updateMqaRun(id, JSON.parse(JSON.stringify({ status: cur.status, endedAt: cur.endedAt, cases: cur.cases, log: cur.log })));
  const tm = (RUN_TIMERS[id] = []);
  const at = (ms, fn) => tm.push(setTimeout(() => { fn(); push(); }, ms));
  let t = 700; let stop = false;
  plans.forEach(({ c, all, fi, pl }, i) => {
    const rc = cur.cases[i];
    at(t, () => { if (stop) { rc.st = "건너뜀"; return; } rc.st = "실행 중"; cur.log.push({ t: c.id + " " + c.name }); });
    const last = fi >= 0 ? fi : all.length - 1;
    for (let j = 0; j <= last; j++) { t += 180; const jj = j; at(t, () => { if (stop) return; rc.steps[jj].st = all[jj].res.st === "fail" ? "실패" : "통과"; }); }
    t += 200;
    at(t, () => {
      if (stop) return;
      for (let j = last + 1; j < rc.steps.length; j++) rc.steps[j].st = "실행 안 함";
      if (fi < 0) { rc.st = "통과"; cur.log.push({ lv: "PASS", t: c.id + " 통과" }); return; }
      rc.st = "실패"; rc.failStep = fi + 1 - pl; /* 에디터 스텝 번호와 맞춘다 (전제조건은 번호 없음) */ rc.failMsg = all[fi].res.msg; rc.retried = plan.retry > 0 ? plan.retry : 0;
      cur.log.push({ lv: "FAIL", t: c.id + " 실패 — " + (fi < pl ? "전제조건" : "스텝 " + (fi + 1 - pl)) + " · " + all[fi].res.msg + (rc.retried ? " (재시도 " + rc.retried + "회 후)" : "") });
      if (plan.onfail === "첫 실패 시 중단") stop = true;
    });
    if (fi >= 0 && plan.retry > 0) t += 180 * (last + 1) * plan.retry;   // 재시도 시간
  });
  at(t + 300, () => {
    cur.cases.forEach((rc) => { if (rc.st === "대기") rc.st = "건너뜀"; });
    cur.status = "완료"; cur.endedAt = nowStamp(); cur.log.push({ t: "완료 · 단말 반납" });
    api.releaseMqaDevice(dev.id);
    delete RUN_TIMERS[id];
  });
  return id;
}
export function stopRun(run, api) {
  (RUN_TIMERS[run.id] || []).forEach(clearTimeout); delete RUN_TIMERS[run.id];
  api.updateMqaRun(run.id, { status: "중단", endedAt: nowStamp(), cases: run.cases.map((c) => (c.st === "대기" || c.st === "실행 중" ? { ...c, st: "건너뜀" } : c)), log: [...(run.log || []), { t: "사용자가 중단 · 단말 반납" }] });
  api.releaseMqaDevice(run.devId);
}
/* 실행 시작 — 계획 · 실패만 다시 · 예약이 모두 이 함수를 지난다 */
const useRunner = () => {
  const app = useApp();
  const ctx = { systems: app.mqaSystems || [], cases: app.mqaCases || [], runners: app.mqaRunners || [] };
  const launch = (plan, { trigger = "수동", only, note } = {}) => {
    const { sy, e } = envOfPlan(ctx.systems, plan);
    const b = buildOf(e, plan.buildId); const dev = devOf(ctx.runners, plan.devId);
    let cases = casesOfPlan(plan, ctx.cases); if (only) cases = cases.filter((c) => only.includes(c.id));
    if (dev && dev.state === "사용 중" && /^편집 세션/.test(dev.busy || "") && trigger === "예약") app.releaseMqaDevice(dev.id);
    return startRun({ plan, cases, allCases: ctx.cases, sys: sy, env: e, build: b, dev, trigger, note, api: app, runs: app.mqaRuns });
  };
  return { app, ctx, launch };
};

const Empty = ({ icon: Icon, title, hint, children }) => (
  <Card className="flex flex-col items-center justify-center py-14 text-center"><Icon size={26} className="text-slate-400" /><div className="mt-3 text-sm font-medium text-slate-700">{title}</div>{hint && <div className="mt-1.5 max-w-md text-xs text-slate-500">{hint}</div>}{children}</Card>
);

/* ═══════════ 실행 계획 ═══════════ */
const P0 = (sys) => ({ name: "", systemId: sys ? sys.id : 0, env: sys && sys.envs[0] ? sys.envs[0].env : "", buildId: "", suites: [], tags: "", devId: "", retry: 1, onfail: "계속 진행", gate: 90, status: "초안", schedule: { mode: "없음", time: "02:00" } });
const PLAN_KEYS = ["name", "systemId", "env", "buildId", "suites", "tags", "devId", "retry", "onfail", "gate", "status", "schedule"];
const pickPlan = (p) => Object.fromEntries(PLAN_KEYS.map((k) => [k, p[k]]));
export function MqaPlanScreen() {
  const { mqaPlans = [], addMqaPlan, updateMqaPlan, removeMqaPlan, mqaSystems = [], mqaSuites = [], mqaCases = [], mqaRunners = [], setNavGuard, goTo } = useApp();
  const [msg, flash] = useToast();
  const [selId, setSelId] = useState(mqaPlans[0] ? mqaPlans[0].id : null);
  const sel = mqaPlans.find((p) => p.id === selId) || mqaPlans[0] || null;
  /* 편집 중인 값 — 고른 계획이 바뀌면 그 계획 값으로 다시 시작한다 */
  const [dRaw, setD] = useState(null);
  const d = sel ? (dRaw && dRaw.__id === sel.id ? dRaw : { ...pickPlan(sel), __id: sel.id }) : null;
  const [addOpen, setAddOpen] = useState(false);
  const [nf, setNf] = useState(P0(mqaSystems[0]));
  const dirty = !!(sel && d && JSON.stringify(pickPlan(d)) !== JSON.stringify(pickPlan(sel)));
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const set = (patch) => setD({ ...d, ...patch });
  const choose = (p) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?")) return; setSelId(p.id); setD(null); };
  const create = () => {
    if (!nf.name.trim()) { flash("계획 이름을 입력하세요"); return; }
    if (!nf.suites.length) { flash("스위트를 1개 이상 고르세요"); return; }
    const id = Math.max(0, ...mqaPlans.map((x) => x.id)) + 1;
    addMqaPlan({ ...P0(mqaSystems[0]), ...nf, name: nf.name.trim(), id }); setSelId(id); setD(null); setAddOpen(false); flash(nf.name.trim() + " 계획 생성 (초안) — 실행 단말을 지정하세요");
  };
  const del = (p) => { if (!window.confirm(p.name + " 계획을 삭제할까요?")) return; removeMqaPlan(p.id); setSelId(null); setD(null); flash(p.name + " 삭제됨"); };
  const save = () => { updateMqaPlan(sel.id, { ...pickPlan(d), name: d.name.trim() || sel.name }); setD(null); flash("계획 저장됨"); };

  const Head = <PageToolbar desc="무엇을(앱 · 환경 · 버전 · 케이스) 어디서(단말) 언제(예약) 돌릴지 정합니다" />;
  const addModal = addOpen && (
    <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddOpen(false)}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">새 실행 계획</h3><button onClick={() => setAddOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
        <div className="space-y-3.5 p-5">
          <Field label="계획 이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 주문 회귀 (스테이징)" /></Field>
          <Field label="대상 앱 · 환경">
            <Select value={nf.systemId + "|" + nf.env} onChange={(e) => { const [s, en] = e.target.value.split("|"); setNf({ ...nf, systemId: +s, env: en }); }}>
              {mqaSystems.flatMap((sy) => sy.envs.map((en) => <option key={sy.id + en.env} value={sy.id + "|" + en.env}>{sy.name} · {en.env}</option>))}
            </Select>
          </Field>
          <Field label="스위트 (다중 선택)"><SuitePick suites={mqaSuites} value={nf.suites} onChange={(v) => setNf({ ...nf, suites: v })} /></Field>
          <div className="text-xs text-slate-500">초안으로 만들어집니다 — 실행 단말 · 예약은 상세에서 정합니다.</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5"><Btn onClick={() => setAddOpen(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={create}>계획 생성</Btn></div>
      </div>
    </div></Portal>
  );
  if (!sel) return (
    <div className="space-y-4">{Head}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3"><Btn kind="primary" icon={Plus} className="w-full" disabled={!mqaSystems.length} onClick={() => { setNf(P0(mqaSystems[0])); setAddOpen(true); }}>새 실행 계획</Btn></div>
        <div className="col-span-9"><Empty icon={ClipboardList} title="실행 계획을 만드세요" hint="계획은 대상 앱 · 환경과 스위트를 묶고, 어느 단말에서 언제 돌릴지 정합니다. 승인된 케이스만 실행됩니다." /></div>
      </div>{addModal}<Toast msg={msg} /></div>
  );

  const { sy, e } = envOfPlan(mqaSystems, d);
  const builds = ((e && e.app) || {}).builds || [];
  const b = buildOf(e, d.buildId);
  const cs = casesOfPlan(d, mqaCases);
  const allDevs = flatDevices(mqaRunners);
  const sched = d.schedule || { mode: "없음", time: "02:00" };
  const scheduled = sched.mode !== "없음";
  const blk = planBlock({ ...d, status: "활성" }, { systems: mqaSystems, cases: mqaCases, runners: mqaRunners }, scheduled, true);
  /* 실행 전에 알 수 있는 위험 — 막지 않고 알린다 */
  const verOff = b ? cs.filter((c) => c.baseBuild && c.baseBuild !== b.ver && !(c.lastDry && c.lastDry.build === b.ver && c.lastDry.result === "통과")) : [];
  const caution = e && e.prod ? cs.filter((c) => c.prodCaution) : [];
  const allTags = [...new Set(mqaCases.filter((c) => c.systemId === d.systemId).flatMap((c) => tagList(c.tags)))];
  const excluded = mqaCases.filter((c) => c.systemId === d.systemId && (d.suites || []).includes(c.suite) && c.status !== "승인").length;
  return (
    <div className="space-y-4">{Head}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setNf(P0(mqaSystems[0])); setAddOpen(true); }}>새 실행 계획</Btn>
          {mqaPlans.map((p) => { const ps = envOfPlan(mqaSystems, p); const pd = devOf(mqaRunners, p.devId); return (
            <Card key={p.id} className={"cursor-pointer p-3 " + (sel.id === p.id ? SEL_CARD : SEL_IDLE)}>
              <div onClick={() => choose(p)}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{p.name}</span><div className="flex items-center gap-1.5"><Badge kind={p.status === "활성" ? "pass" : "draft"}>{p.status}</Badge><button onClick={(ev) => { ev.stopPropagation(); del(p); }} className="text-slate-500 hover:text-red-600" title="계획 삭제"><X size={13} /></button></div></div>
                <div className="mt-1 text-xs text-slate-500">{ps.sy ? ps.sy.name : "—"} · {p.env}</div>
                <div className="mt-0.5 text-xs text-slate-500">{pd ? pd.model : "단말 미지정"} · {schedText(p.schedule)}</div>
              </div>
            </Card>
          ); })}
        </div>
        <Card className="col-span-9 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0 max-w-sm flex-1"><Input value={d.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="계획 이름" /></div>
            <div className="flex shrink-0 items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={d.status === "활성"} onChange={(ev) => set({ status: ev.target.checked ? "활성" : "초안" })} className="accent-sky-600" />활성</label>
              {dirty && <span className="text-xs text-amber-700">미저장 변경</span>}
              <Btn kind="primary" icon={Save} onClick={save} disabled={!dirty}>저장</Btn>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-5">
            {/* 무엇을 */}
            <div className="space-y-3.5">
              <div className="text-xs font-semibold text-slate-500">무엇을</div>
              <Field label="대상 앱 · 환경">
                <Select value={d.systemId + "|" + d.env} onChange={(ev) => { const [s, en] = ev.target.value.split("|"); set({ systemId: +s, env: en, buildId: "" }); }}>
                  {mqaSystems.flatMap((x) => x.envs.map((en) => <option key={x.id + en.env} value={x.id + "|" + en.env}>{x.name} · {en.env}{en.prod ? " (운영)" : ""}</option>))}
                </Select>
              </Field>
              <Field label="앱 버전" hint="기본 테스트 버전을 고르면 대상·환경에서 기본을 바꿀 때 따라갑니다">
                <Select value={d.buildId} onChange={(ev) => set({ buildId: ev.target.value })}>
                  <option value="">기본 테스트 버전{buildOf(e, "") ? " (지금 v" + buildOf(e, "").ver + ")" : " — 없음"}</option>
                  {builds.map((x) => <option key={x.id} value={x.id}>v{x.ver} ({x.code}) 고정</option>)}
                </Select>
              </Field>
              <Field label="스위트 (다중 선택)"><SuitePick suites={mqaSuites} value={d.suites} onChange={(v) => set({ suites: v })} /></Field>
              <Field label="태그 필터" hint="비우면 스위트 전체 · 하나라도 일치하면 대상">
                <div className="flex flex-wrap gap-1.5">{allTags.map((t) => { const on = tagList(d.tags).includes(t); return <button key={t} onClick={() => set({ tags: (on ? tagList(d.tags).filter((x) => x !== t) : [...tagList(d.tags), t]).join(",") })} className={"rounded-full border px-2.5 py-0.5 text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 text-slate-600 hover:bg-slate-100")}>{t}</button>; })}{!allTags.length && <span className="text-xs text-slate-500">태그 없음</span>}</div>
              </Field>
              <div className={"rounded-lg border px-3 py-2 text-xs " + (cs.length ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700")}>
                {cs.length ? <>대상 케이스 <b className="font-semibold text-sky-700">{cs.length}건</b> <span className="font-mono text-slate-500">{cs.map((c) => c.id).join(", ")}</span></> : "조건에 맞는 승인 케이스가 없습니다 — 실행해도 0건입니다"}
                {excluded > 0 && <div className="mt-0.5 text-slate-500">승인되지 않은 {excluded}건은 빠집니다</div>}
              </div>
              {verOff.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={12} className="mr-1 inline" />{verOff.length}건은 다른 앱 버전 기준으로 만들어져 v{b.ver}에서 확인되지 않았습니다 — 요소를 못 찾을 수 있습니다 <span className="font-mono">{verOff.map((c) => c.id).join(", ")}</span></div>}
              {caution.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ 운영 환경에 운영주의 {caution.length}건이 포함됩니다 — 실데이터를 바꿀 수 있습니다</div>}
            </div>
            {/* 어디서 · 어떻게 · 언제 */}
            <div className="space-y-3.5">
              <div className="text-xs font-semibold text-slate-500">어디서 · 어떻게</div>
              <Field label="실행 단말" hint="계획마다 단말 1대 — 그 단말에서 케이스를 순서대로 돌립니다">
                <Select value={d.devId} onChange={(ev) => set({ devId: ev.target.value })}>
                  <option value="">단말 선택</option>
                  {mqaRunners.map((r) => <optgroup key={r.id} label={r.name + " · " + runnerRole(r)}>{(r.devices || []).map((x) => { const fd = allDevs.find((y) => y.id === x.id); const no = scheduled && runnerRole(r) === "저작용"; return <option key={x.id} value={x.id} disabled={no}>{x.model} ({osName(x.sdk)}){fd && fd.state !== "사용 가능" ? " · " + fd.state : ""}{no ? " · 예약 불가 (저작용 PC)" : ""}</option>; })}</optgroup>)}
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="재시도"><Select value={d.retry} onChange={(ev) => set({ retry: +ev.target.value })}><option value={0}>안 함</option><option value={1}>1회</option><option value={2}>2회</option></Select></Field>
                <Field label="실패 시"><Select value={d.onfail} onChange={(ev) => set({ onfail: ev.target.value })}><option>계속 진행</option><option>첫 실패 시 중단</option></Select></Field>
                <Field label="품질 게이트 (%)"><Input type="number" value={d.gate} onChange={(ev) => set({ gate: +ev.target.value || 0 })} /></Field>
              </div>
              <div className="pt-1 text-xs font-semibold text-slate-500">언제</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="예약"><Select value={sched.mode} onChange={(ev) => set({ schedule: { ...sched, mode: ev.target.value } })}>{SCHED_MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
                {scheduled && <Field label="시각"><Input type="time" value={sched.time} onChange={(ev) => set({ schedule: { ...sched, time: ev.target.value } })} /></Field>}
              </div>
              {scheduled && <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">다음 실행 <b className="font-medium text-slate-800">{nextRun(sched)}</b> · 30분 전에 러너 · 단말을 점검하고, 문제가 있으면 알립니다. 그 시각에 쓸 수 없으면 건너뛰지 않고 '실행 불가'로 남깁니다.{d.status !== "활성" && <span className="block text-amber-700">초안이라 예약이 돌지 않습니다 — 활성으로 바꾸세요.</span>}</div>}
              <div className={"rounded-lg border px-3 py-2 text-xs " + (blk ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                {blk ? <><AlertTriangle size={12} className="mr-1 inline" />지금 실행할 수 없음 — {blk}{/단말|러너|USB|보조 앱/.test(blk) && <button onClick={() => goTo("mqa-devices")} className="ml-2 text-sky-700">테스트 기기로</button>}</> : <><CheckCircle2 size={12} className="mr-1 inline" />실행 준비됨 — {sy ? sy.name : ""} {e ? envText({ ...e, build: b ? b.ver : "" }) : ""} · {(devOf(mqaRunners, d.devId) || {}).model}</>}
              </div>
            </div>
          </div>
        </Card>
      </div>
      {addModal}<Toast msg={msg} />
    </div>
  );
}
const SuitePick = ({ suites, value, onChange }) => (
  <div className="grid grid-cols-2 gap-2">{suites.map((x) => { const on = (value || []).includes(x.name); return <button key={x.id} onClick={() => onChange(on ? value.filter((s) => s !== x.name) : [...(value || []), x.name])} className={"rounded-lg border px-2 py-1.5 text-left text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.name}</button>; })}</div>
);

/* ═══════════ 실행 ═══════════ */
export function MqaRunScreen({ nav }) {
  const { app, ctx, launch } = useRunner();
  const { mqaPlans = [], mqaRuns = [], addMqaRun } = app;
  const [msg, flash] = useToast();
  const active = mqaPlans.filter((p) => p.status === "활성");
  const [pid, setPid] = useState(active[0] ? active[0].id : null);
  const plan = mqaPlans.find((p) => p.id === pid) || active[0] || null;
  const running = mqaRuns.filter((r) => r.status === "실행 중");
  const done = mqaRuns.filter((r) => r.status !== "실행 중").slice(0, 5);
  const blk = plan ? planBlock(plan, ctx, false) : "활성 계획이 없습니다";
  const go = () => { if (blk) { flash(blk); return; } const id = launch(plan); flash(id + " 시작"); };
  const scheduledPlans = active.filter((p) => p.schedule && p.schedule.mode !== "없음");
  /* (목업) 예약 시각 도래 — 그 시각의 상태로 판단한다. 편집 세션은 끊고 시작, 그 밖의 문제는 '실행 불가' 로 기록 */
  const fire = (p) => {
    const b = planBlock(p, ctx, true, true);
    if (b) { const { sy, e } = envOfPlan(ctx.systems, p); const bd = buildOf(e, p.buildId); const dv = devOf(ctx.runners, p.devId); addMqaRun({ id: nextRunId(mqaRuns), planId: p.id, planName: p.name, systemId: p.systemId, sysName: sy ? sy.name : "", env: p.env, build: bd ? bd.ver : "", devId: p.devId, device: dv ? devLabel(dv) : "—", trigger: "예약", status: "실행 불가", startedAt: nowStamp(), endedAt: nowStamp(), gate: p.gate, note: b, cases: [], log: [{ lv: "FAIL", t: "실행 불가 — " + b }] }); flash("예약 실행 불가 — " + b); return; }
    const dv = devOf(ctx.runners, p.devId);
    const pre = dv && /^편집 세션/.test(dv.busy || "") ? dv.busy + " 을(를) 종료하고 시작" : "";
    const id = launch(p, { trigger: "예약", note: pre }); flash(id + " 예약 실행 시작" + (pre ? " · 편집 세션 종료" : ""));
  };
  return (
    <div className="space-y-4">
      <PageToolbar desc="계획을 골라 지금 실행 · 진행 중인 실행 · 예약 실행" />
      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold text-slate-800">지금 실행</div>
        {!mqaPlans.length ? <div className="text-xs text-slate-500">실행 계획이 없습니다 — <button onClick={() => app.goTo("mqa-plan")} className="text-sky-600">실행 계획</button>에서 만드세요.</div> : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-72"><Select value={plan ? plan.id : ""} onChange={(e) => setPid(+e.target.value)}>{mqaPlans.map((p) => <option key={p.id} value={p.id} disabled={p.status !== "활성"}>{p.name}{p.status !== "활성" ? " (초안)" : ""}</option>)}</Select></div>
            {plan && (() => { const { sy, e } = envOfPlan(ctx.systems, plan); const b = buildOf(e, plan.buildId); const dv = devOf(ctx.runners, plan.devId); return <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><Badge kind="info">{sy ? sy.name : "—"} · {plan.env} · 앱 v{b ? b.ver : "—"}</Badge><span className="flex items-center gap-1"><Smartphone size={12} />{dv ? devLabel(dv) : "단말 미지정"}</span><span>· 케이스 {casesOfPlan(plan, ctx.cases).length}건</span></div>; })()}
            <div className="ml-auto flex items-center gap-2">{blk && <span className="text-xs text-amber-700">⚠ {blk}</span>}<Btn kind="primary" icon={Play} disabled={!!blk} onClick={go}>실행</Btn></div>
          </div>
        )}
      </Card>

      {running.map((r) => <LiveRun key={r.id} run={r} onStop={() => { if (window.confirm(r.id + " 실행을 중단할까요?")) { stopRun(r, app); flash(r.id + " 중단"); } }} onOpen={() => nav && nav("mqa-result-detail", r.id)} />)}

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Calendar size={15} className="text-sky-600" />예약 실행</div>
        {!scheduledPlans.length && <div className="text-xs text-slate-500">예약된 계획이 없습니다.</div>}
        <div className="space-y-1.5">{scheduledPlans.map((p) => { const b = planBlock(p, ctx, true, true); const dv = devOf(ctx.runners, p.devId); const r = runnerOfDev(ctx.runners, p.devId); return (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">
            <span className="w-40 shrink-0 font-medium text-slate-800">{p.name}</span>
            <span className="w-36 shrink-0 text-slate-600"><Clock size={11} className="mr-1 inline" />{nextRun(p.schedule)}</span>
            <span className="flex-1 truncate text-slate-500"><Monitor size={11} className="mr-1 inline" />{r ? r.name : "—"} · {dv ? dv.model : "—"}</span>
            {b ? <span className="text-amber-700">사전 점검: {b}</span> : <span className="text-emerald-700">사전 점검 정상</span>}
            <button onClick={() => fire(p)} className="shrink-0 text-sky-600" title="목업 — 예약 시각이 된 것처럼 발동">(목업) 지금 발동</button>
          </div>
        ); })}</div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5"><span className="text-sm font-semibold text-slate-800">최근 실행</span><Btn icon={History} onClick={() => nav && nav("mqa-history")}>실행 이력</Btn></div>
        <RunTable runs={done} onOpen={(id) => nav && nav("mqa-result-detail", id)} />
      </Card>
      <Toast msg={msg} />
    </div>
  );
}
function LiveRun({ run, onStop, onOpen }) {
  const cur = run.cases.find((c) => c.st === "실행 중");
  const fin = run.cases.filter((c) => c.st === "통과" || c.st === "실패").length;
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm"><RefreshCw size={14} className="animate-spin text-sky-600" /><span className="font-mono text-sky-700">{run.id}</span><span className="font-semibold text-slate-800">{run.planName}</span><Badge kind="warn">실행 중</Badge><span className="text-xs text-slate-500">{run.trigger} · {run.device} · 앱 v{run.build}</span>
        <div className="ml-auto flex gap-2"><Btn onClick={onOpen}>상세</Btn><Btn icon={Square} onClick={onStop}>중단</Btn></div></div>
      {run.note && <div className="mb-2 text-xs text-amber-700">{run.note}</div>}
      <div className="mb-2 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: (run.cases.length ? (fin / run.cases.length) * 100 : 0) + "%" }} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">{run.cases.map((c) => <div key={c.id} className="flex items-center gap-2 text-xs"><span className="w-14 font-mono text-sky-600">{c.id}</span><span className="flex-1 truncate text-slate-700">{c.name}</span><Badge kind={CASE_K[c.st]}>{c.st}</Badge></div>)}</div>
        <div className="rounded-lg bg-slate-900 p-2.5 font-mono text-xs leading-relaxed text-slate-100" style={{ maxHeight: 160, overflowY: "auto" }}>
          {cur && <div className="mb-1 text-sky-300">▶ {cur.id} · 스텝 {cur.steps.filter((s) => s.st !== "대기").length}/{cur.steps.length}</div>}
          {(run.log || []).slice(-8).map((l, i) => <div key={i} className={l.lv === "FAIL" ? "text-red-300" : l.lv === "PASS" ? "text-emerald-300" : ""}>{l.t}</div>)}
        </div>
      </div>
    </Card>
  );
}
const RunTable = ({ runs, onOpen }) => (
  <table className="w-full text-sm">
    <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-4 py-2 font-medium">실행</th><th className="font-medium">계획</th><th className="font-medium">앱 · 환경</th><th className="font-medium">단말</th><th className="font-medium">트리거</th><th className="font-medium">시작</th><th className="font-medium">결과</th><th className="pr-4 text-right font-medium">상태</th></tr></thead>
    <tbody>
      {!runs.length && <tr><td colSpan={8} className="py-8 text-center text-xs text-slate-500">실행 이력이 없습니다</td></tr>}
      {runs.map((r) => { const pr = passRate(r); return (
        <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
          <td className="px-4 py-2 font-mono text-xs text-sky-600">{r.id}</td><td className="text-slate-800">{r.planName}</td>
          <td className="text-xs text-slate-600">{r.sysName} · {r.env} · v{r.build}</td><td className="text-xs text-slate-600">{String(r.device || "").split(" — ")[0]}</td>
          <td className="text-xs text-slate-600">{r.trigger}</td><td className="text-xs text-slate-500">{r.startedAt}</td>
          <td className="text-xs">{r.status === "실행 불가" ? <span className="text-red-700">{r.note}</span> : <>{resultText(r)}{pr != null && <span className={"ml-1.5 font-semibold " + (gateOk(r) ? "text-emerald-700" : "text-red-700")}>{pr}%</span>}</>}</td>
          <td className="pr-4 text-right"><Badge kind={RUN_K[r.status]}>{r.status}</Badge></td>
        </tr>
      ); })}
    </tbody>
  </table>
);

/* ═══════════ 실행 이력 ═══════════ */
export function MqaHistoryScreen({ nav }) {
  const { mqaRuns = [], mqaPlans = [] } = useApp();
  const [pf, setPf] = useState("전체"); const [sf, setSf] = useState("전체");
  const list = mqaRuns.filter((r) => (pf === "전체" || String(r.planId) === pf) && (sf === "전체" || r.status === sf));
  return (
    <div className="space-y-4">
      <PageToolbar desc="모든 실행 (수동 · 예약 · 실패만 다시)">
        <div className="w-48"><Select value={pf} onChange={(e) => setPf(e.target.value)}><option value="전체">전체 계획</option>{mqaPlans.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</Select></div>
        <div className="w-36"><Select value={sf} onChange={(e) => setSf(e.target.value)}>{["전체", "완료", "실행 중", "중단", "실행 불가"].map((x) => <option key={x}>{x}</option>)}</Select></div>
      </PageToolbar>
      <Card className="overflow-hidden"><RunTable runs={list} onOpen={(id) => nav && nav("mqa-result-detail", id)} /></Card>
    </div>
  );
}

/* ═══════════ 결과 — 상세 · 회귀 비교 · 불안정 ═══════════ */
export function MqaResultScreen({ runId, mode = "상세", back, nav, backLabel }) {
  if (mode === "회귀") return <Regression nav={nav} />;
  if (mode === "불안정") return <Flaky nav={nav} />;
  return <ResultDetail runId={runId} back={back} backLabel={backLabel} nav={nav} />;
}
function ResultDetail({ runId, back, backLabel, nav }) {
  const { app, launch } = useRunner();
  const { mqaRuns = [], mqaPlans = [], mqaCases = [] } = app;
  const [msg, flash] = useToast();
  const run = mqaRuns.find((r) => r.id === runId) || mqaRuns[0] || null;
  const [open, setOpen] = useState(null);
  if (!run) return <Empty icon={FileText} title="실행 결과가 없습니다" hint="실행 화면에서 계획을 실행하면 여기에서 결과를 봅니다." />;
  const pr = passRate(run);
  const fails = run.cases.filter((c) => c.st === "실패");
  const plan = mqaPlans.find((p) => p.id === run.planId);
  const oc = run.cases.find((c) => c.id === (open || (fails[0] || {}).id)) || null;
  const rerun = () => {
    if (!plan) { flash("계획이 삭제되어 다시 실행할 수 없습니다"); return; }
    const b = planBlock(plan, { systems: app.mqaSystems, cases: mqaCases, runners: app.mqaRunners }, false);
    if (b) { flash(b); return; }
    const cur = casesOfPlan(plan, mqaCases).map((c) => c.id); const ids = fails.map((c) => c.id).filter((id) => cur.includes(id));
    if (!ids.length) { flash("실패 케이스가 지금 계획 대상에 없습니다 — 승인 상태인지 확인하세요"); return; }
    const id = launch(plan, { only: ids, note: run.id + " 의 실패만 다시" }); flash(id + " 시작 — 실패 " + ids.length + "건"); nav && nav("mqa-run");
  };
  const openCase = (c) => { app.setMqaEditTc(c.id); app.goTo("mqa-cases"); };
  const tcNow = (id) => mqaCases.find((c) => c.id === id);
  return (
    <div className="space-y-4">
      {back && <button onClick={back} className="inline-flex items-center gap-1 text-xs text-sky-600"><ChevronLeft size={14} />{backLabel || "뒤로"}</button>}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sky-700">{run.id}</span><span className="text-base font-semibold text-slate-900">{run.planName}</span><Badge kind={RUN_K[run.status]}>{run.status}</Badge>
          {pr != null && <Badge kind={gateOk(run) ? "pass" : "fail"}>PASS {pr}% · 게이트 {run.gate}% {gateOk(run) ? "통과" : "미달"}</Badge>}
          <div className="ml-auto flex gap-2">{fails.length > 0 && run.status === "완료" && <Btn kind="primary" icon={RefreshCw} onClick={rerun}>실패만 다시 실행 ({fails.length})</Btn>}</div></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{run.sysName} · {run.env} · 앱 v{run.build}</span><span><Smartphone size={11} className="mr-0.5 inline" />{run.device}</span><span>{run.trigger}</span><span>{run.startedAt} ~ {run.endedAt || "진행 중"}</span>{run.retry > 0 && <span>재시도 {run.retry}회</span>}</div>
        {run.note && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{run.note}</div>}
      </Card>
      {run.status === "실행 불가" ? <Card className="p-4 text-sm text-red-700">{run.note}<div className="mt-1 text-xs text-slate-500">예약 시각에 실행 조건을 만족하지 못해 실행하지 않았습니다. 테스트 기기에서 러너 · 단말 상태를 확인하세요.</div></Card> : (
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-5 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">케이스 <span className="text-xs font-normal text-slate-500">{resultText(run)}</span></div>
          {run.cases.map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className={"flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2 text-left text-xs " + (oc && oc.id === c.id ? "bg-sky-50" : "hover:bg-slate-50")}>
              <span className="w-14 font-mono text-sky-600">{c.id}</span><span className="flex-1 truncate text-slate-800">{c.name}</span>{c.st === "실패" && <span className="text-red-700">{c.failStep > 0 ? "스텝 " + c.failStep : "전제조건"}</span>}<Badge kind={CASE_K[c.st]}>{c.st}</Badge>
            </button>
          ))}
        </Card>
        <div className="col-span-7 space-y-3">
          {oc ? (<>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2"><span className="font-mono text-sm text-sky-700">{oc.id}</span><span className="text-sm font-semibold text-slate-800">{oc.name}</span><Badge kind={CASE_K[oc.st]}>{oc.st}</Badge>
                <div className="ml-auto"><Btn icon={Code2} onClick={() => openCase(oc)}>케이스 열기</Btn></div></div>
              {oc.st === "실패" && <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"><b className="font-medium">{oc.failStep > 0 ? "스텝 " + oc.failStep : "전제조건"} · {oc.steps[oc.failStep - 1 + (oc.preLen || 0)].act} {oc.steps[oc.failStep - 1 + (oc.preLen || 0)].name}</b> — {oc.failMsg}{oc.retried ? " · 재시도 " + oc.retried + "회 모두 실패" : ""}
                {tcNow(oc.id) && tcNow(oc.id).status !== "승인" && <div className="mt-1 text-amber-800">이 케이스는 지금 {tcNow(oc.id).status} 상태입니다 — 수정 후 다시 승인해야 실행 대상에 들어갑니다.</div>}</div>}
              <div className="space-y-0.5">{oc.steps.map((s, i) => (
                <div key={i} className={"flex items-center gap-2 rounded px-2 py-1 text-xs " + (s.st === "실패" ? "bg-red-50" : "")}>
                  <span className="w-5 text-right font-mono text-slate-400">{i < (oc.preLen || 0) ? "전" : i + 1 - (oc.preLen || 0)}</span><span className="w-16 shrink-0 text-slate-600">{s.act}</span><span className="flex-1 truncate text-slate-800">{s.name}{s.val ? " \"" + s.val + "\"" : ""}</span>
                  <span className={s.st === "실패" ? "text-red-700" : s.st === "통과" ? "text-emerald-700" : "text-slate-400"}>{s.st}</span>
                </div>
              ))}</div>
            </Card>
            {oc.st === "실패" && (
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold text-slate-800">실패 시점 자료</div>
                <div className="flex gap-4">
                  <div className="w-40 shrink-0 rounded-2xl border-4 border-slate-800 bg-white p-1.5"><div className="space-y-1 rounded-xl bg-slate-50 p-1.5">{L.elementsFor(run.build).slice(0, 7).map((el) => <div key={el.key} className="truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">{el.text || el.label}</div>)}</div></div>
                  <div className="flex-1 space-y-2 text-xs text-slate-600">
                    <div>실패 순간의 화면 캡처 · 화면 구조 · 로그를 러너가 함께 올립니다. 화면 구조에서 찾던 요소가 없으면, 앱 화면이 바뀐 것인지(요소 다시 집기) 앱 결함인지 판단합니다.</div>
                    <div className="flex flex-wrap gap-2"><Btn icon={Download} onClick={() => flash("목업 — 화면 구조(XML) 내려받기")}>화면 구조</Btn><Btn icon={FileText} onClick={() => flash("목업 — 실행 로그 내려받기")}>실행 로그</Btn></div>
                    <div className="text-slate-400">목업 화면 — 실제로는 실패 순간 캡처가 표시됩니다</div>
                  </div>
                </div>
              </Card>
            )}
          </>) : <Card className="p-6 text-center text-xs text-slate-500">왼쪽에서 케이스를 고르세요</Card>}
        </div>
      </div>)}
      <Toast msg={msg} />
    </div>
  );
}
const completed = (runs) => (runs || []).filter((r) => r.status === "완료");
function Regression({ nav }) {
  const { mqaRuns = [], mqaPlans = [] } = useApp();
  const plansWith = mqaPlans.filter((p) => completed(mqaRuns).filter((r) => r.planId === p.id).length >= 2);
  const [pid, setPid] = useState(plansWith[0] ? plansWith[0].id : null);
  const rs = completed(mqaRuns).filter((r) => r.planId === pid);
  const [a, setA] = useState(null); const [b, setB] = useState(null);
  const cmp = rs.find((r) => r.id === b) || rs[0]; const base = rs.find((r) => r.id === a) || rs[1];
  if (!plansWith.length) return <div className="space-y-4"><PageToolbar desc="같은 계획의 두 실행을 케이스별로 비교" /><Empty icon={GitCompare} title="비교할 실행이 없습니다" hint="같은 계획으로 완료된 실행이 2건 이상 있어야 합니다." /></div>;
  const ids = [...new Set([...(base ? base.cases : []), ...(cmp ? cmp.cases : [])].map((c) => c.id))];
  const stOf = (r, id) => ((r && r.cases.find((c) => c.id === id)) || {}).st || "—";
  const chg = (x, y) => (x === "통과" && y === "실패" ? ["새 실패", "fail"] : x === "실패" && y === "통과" ? ["해결", "pass"] : x === "실패" && y === "실패" ? ["계속 실패", "warn"] : x === "—" ? ["새 케이스", "info"] : y === "—" ? ["빠짐", "draft"] : ["변화 없음", "draft"]);
  return (
    <div className="space-y-4">
      <PageToolbar desc="같은 계획의 두 실행을 케이스별로 비교 — 앱 버전이 바뀐 뒤 무엇이 깨졌나">
        <div className="w-48"><Select value={pid || ""} onChange={(e) => { setPid(+e.target.value); setA(null); setB(null); }}>{plansWith.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
      </PageToolbar>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">기준</span><div className="w-64"><Select value={base ? base.id : ""} onChange={(e) => setA(e.target.value)}>{rs.map((r) => <option key={r.id} value={r.id}>{r.id} · v{r.build} · {r.startedAt}</option>)}</Select></div>
          <span className="text-slate-500">→ 비교</span><div className="w-64"><Select value={cmp ? cmp.id : ""} onChange={(e) => setB(e.target.value)}>{rs.map((r) => <option key={r.id} value={r.id}>{r.id} · v{r.build} · {r.startedAt}</option>)}</Select></div>
          {base && cmp && base.build !== cmp.build && <Badge kind="warn">앱 v{base.build} → v{cmp.build}</Badge>}
        </div>
        <table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">케이스</th><th className="font-medium">기준</th><th className="font-medium">비교</th><th className="font-medium">변화</th></tr></thead>
          <tbody>{ids.map((id) => { const x = stOf(base, id), y = stOf(cmp, id); const [t, k] = chg(x, y); const nm = ((cmp && cmp.cases.find((c) => c.id === id)) || (base && base.cases.find((c) => c.id === id)) || {}).name; return (
            <tr key={id} className="border-b border-slate-100"><td className="py-2 text-xs"><span className="font-mono text-sky-600">{id}</span> <span className="text-slate-800">{nm}</span></td><td className="text-xs">{x}</td><td className="text-xs">{y}</td><td><Badge kind={k}>{t}</Badge></td></tr>
          ); })}</tbody></table>
      </Card>
    </div>
  );
}
/* 불안정 — 같은 케이스가 실행마다 통과 · 실패를 오가면 불안정, 최근 3회 연속 실패면 지속 실패 */
export const caseHistory = (runs) => {
  const m = {};
  completed(runs).slice().reverse().forEach((r) => r.cases.forEach((c) => { if (c.st !== "통과" && c.st !== "실패") return; (m[c.id] = m[c.id] || { id: c.id, name: c.name, seq: [] }).seq.push({ st: c.st, run: r.id, build: r.build }); }));
  return Object.values(m).map((h) => { const f = h.seq.filter((x) => x.st === "실패").length; const last3 = h.seq.slice(-3); const solid = last3.length === 3 && last3.every((x) => x.st === "실패"); return { ...h, runs: h.seq.length, fails: f, kind: solid ? "지속 실패" : f > 0 && f < h.seq.length ? "불안정" : f ? "실패" : "안정" }; });
};
function Flaky({ nav }) {
  const { mqaRuns = [], setMqaEditTc, goTo } = useApp();
  const rows = caseHistory(mqaRuns).filter((h) => h.kind !== "안정").sort((a, b) => b.fails - a.fails);
  return (
    <div className="space-y-4">
      <PageToolbar desc="실행마다 결과가 바뀌는 케이스 · 계속 실패하는 케이스 (완료된 실행 기준)" />
      <Card className="overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-4 py-2 font-medium">케이스</th><th className="font-medium">최근 결과 (오래된 → 최근)</th><th className="font-medium">실패</th><th className="font-medium">판정</th><th className="pr-4" /></tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-500">불안정하거나 계속 실패하는 케이스가 없습니다</td></tr>}
            {rows.map((h) => (
              <tr key={h.id} className="border-b border-slate-100">
                <td className="px-4 py-2 text-xs"><span className="font-mono text-sky-600">{h.id}</span> <span className="text-slate-800">{h.name}</span></td>
                <td><div className="flex gap-1">{h.seq.slice(-10).map((x, i) => <span key={i} title={x.run + " · v" + x.build + " · " + x.st} className={"inline-block h-3 w-3 rounded-sm " + (x.st === "통과" ? "bg-emerald-500" : "bg-red-500")} />)}</div></td>
                <td className="text-xs text-slate-600">{h.fails}/{h.runs}</td>
                <td><Badge kind={h.kind === "불안정" ? "warn" : "fail"}>{h.kind}</Badge></td>
                <td className="pr-4 text-right"><button onClick={() => { setMqaEditTc(h.id); goTo("mqa-cases"); }} className="text-xs text-sky-600">케이스 열기</button></td>
              </tr>
            ))}
          </tbody></table>
        <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">불안정 원인은 대개 대기 시간 · 팝업 · 테스트 데이터입니다. 실패 시점 자료로 원인을 확인하세요.</div>
      </Card>
    </div>
  );
}

/* ═══════════ 대시보드 ═══════════ */
export function MqaDashboardScreen({ nav }) {
  const { mqaCases = [], mqaRuns = [], mqaPlans = [], mqaRunners = [] } = useApp();
  const devs = flatDevices(mqaRunners);
  const lastRun = completed(mqaRuns)[0];
  const approved = mqaCases.filter((c) => c.status === "승인").length;
  const unstable = caseHistory(mqaRuns).filter((h) => h.kind === "불안정" || h.kind === "지속 실패");
  const next = mqaPlans.filter((p) => p.status === "활성" && p.schedule && p.schedule.mode !== "없음").map((p) => ({ p, at: nextRun(p.schedule) })).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
  const KPI = [
    ["승인 TC", approved + "/" + mqaCases.length, "text-sky-600", "승인/전체"],
    ["최근 실행 PASS율", lastRun && passRate(lastRun) != null ? passRate(lastRun) + "%" : "—", "text-emerald-600", lastRun ? lastRun.id + " · v" + lastRun.build : "실행 없음"],
    ["사용 가능 단말", devs.filter((d) => d.state === "사용 가능").length + "/" + devs.length, "text-slate-900", "러너 " + mqaRunners.filter((r) => runnerState(r) === "연결됨").length + "/" + mqaRunners.length + " 연결"],
    ["불안정 · 지속 실패", unstable.length, "text-amber-600", "완료된 실행 기준"],
    ["다음 예약", next ? next.at.slice(5) : "—", "text-slate-900", next ? next.p.name : "예약 없음"],
  ];
  /* 단말별 PASS율 — FQA 의 '브라우저별' 자리. 같은 케이스가 단말에 따라 다르게 나오는지 본다 */
  const byDev = devs.map((d) => { const rs = completed(mqaRuns).filter((r) => r.devId === d.id); const cs = rs.flatMap((r) => r.cases).filter((c) => c.st === "통과" || c.st === "실패"); return { d, runs: rs.length, p: cs.length ? Math.round((cs.filter((c) => c.st === "통과").length / cs.length) * 100) : null }; });
  return (
    <div className="space-y-4">
      <PageToolbar desc="자동화 현황 · 단말 · 최근 실행 (실행 · 케이스 · 테스트 기기에서 파생)" />
      <div className="grid grid-cols-5 gap-3">{KPI.map((k) => <Card key={k[0]} className="p-4"><div className="text-xs text-slate-500">{k[0]}</div><div className={"mt-1 text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-1 truncate text-xs text-slate-500">{k[3]}</div></Card>)}</div>
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5"><span className="text-sm font-semibold text-slate-800">최근 실행</span><Btn icon={History} onClick={() => nav && nav("mqa-history")}>실행 이력</Btn></div>
          <RunTable runs={mqaRuns.slice(0, 6)} onOpen={(id) => nav && nav("mqa-result-detail", id)} />
        </Card>
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">단말별 PASS율</div>
          <div className="space-y-3">{byDev.map(({ d, runs, p }) => (
            <div key={d.id}>
              <div className="mb-1 flex justify-between text-xs"><span className="text-slate-700">{d.model} <span className="text-slate-500">· {d.runnerName} · {runs}회</span></span>{p == null ? <span className="text-slate-500">{d.state === "사용 가능" ? "실행 없음" : d.state}</span> : <span className="font-semibold text-slate-800">{p}%</span>}</div>
              <div className="h-2 rounded bg-slate-100">{p != null && <div className={"h-2 rounded " + (p >= 90 ? "bg-emerald-500" : p >= 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: p + "%" }} />}</div>
            </div>
          ))}</div>
        </Card>
      </div>
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Activity size={15} className="text-amber-600" />불안정 · 지속 실패</span><button onClick={() => nav && nav("mqa-flaky")} className="text-xs text-sky-600">전체 보기</button></div>
        {!unstable.length ? <div className="rounded-lg bg-slate-100 px-3 py-4 text-center text-xs text-slate-500">해당 케이스가 없습니다</div> : <div className="grid grid-cols-2 gap-2">{unstable.slice(0, 4).map((h) => <div key={h.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs"><span><span className="font-mono text-sky-600">{h.id}</span> {h.name} <span className="text-slate-500">· {h.fails}/{h.runs} 실패</span></span><Badge kind={h.kind === "불안정" ? "warn" : "fail"}>{h.kind}</Badge></div>)}</div>}
      </Card>
    </div>
  );
}
