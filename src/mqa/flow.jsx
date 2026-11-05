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
import { useState, useEffect, Fragment } from "react";
import { Plus, X, Save, Play, Square, ClipboardList, CheckCircle2, XCircle, AlertTriangle, Clock, Smartphone, History, ChevronLeft, RefreshCw, Code2, FileText, Calendar, Activity, GitCompare, Download, Monitor, Zap } from "lucide-react";
import { Card, Badge, Btn, Field, Input, Select, Toast, useToast, PageToolbar, Portal, SEL_CARD, SEL_IDLE, SEL_ROW, nowStamp, RunTime } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import * as L from "./caseLogic.js";
import { flatDevices, deviceBlock, devLabel, osName, runnerState, runnerOfDev } from "./devices.js";
import { envText, DeviceSelect, MockBtn, ReadonlyField } from "./workPickers.jsx";
import { ScheduleConfig } from "../common/ScheduleConfig.jsx";

/* ── 공통 판단 (계획 화면 · 실행 화면 · 예약 점검이 같은 함수를 쓴다) ── */
const tagList = (t) => String(t || "").split(/[,\s]+/).filter(Boolean);
export const envOfPlan = (systems, p) => { const sy = (systems || []).find((s) => s.id === p.systemId) || null; const e = sy ? (sy.envs || []).find((x) => x.env === p.env) || null : null; return { sy, e }; };
export const buildOf = (e, buildId) => { const app = (e && e.app) || {}; return (app.builds || []).find((b) => b.id === (buildId || app.defBuild)) || null; };
/* 격리(quarantined)된 케이스는 빠진다 — 불안정 화면에서 격리 (FQA 와 같음) */
export const casesOfPlan = (p, cases) => (cases || []).filter((c) => c.systemId === p.systemId && c.status === "승인" && !c.quarantined && (p.suiteIds || []).includes(c.suiteId) && (!tagList(p.tags).length || tagList(p.tags).some((t) => tagList(c.tags).includes(t))));
const devOf = (runners, id) => flatDevices(runners).find((d) => d.id === id) || null;
/* 실행을 막는 사유 — 빈 문자열이면 실행 가능. scheduled=true 면 예약 시각 기준(편집 세션은 끊고 시작)으로 본다.
   editPreempt=true 면 편집 세션이 점유한 단말은 '사용 가능' 으로 본다 (예약 실행이 우선) */
/* queueOk=true: 다른 '실행' 이 단말을 쓰는 중이면 막지 않는다 — 단말 대기열에 들어간다 */
export const planBlock = (p, ctx, scheduled, editPreempt, buildOverride, queueOk = true) => {
  const { e } = envOfPlan(ctx.systems, p);
  if (p.status !== "활성") return "계획이 초안입니다 — 활성으로 바꾼 뒤 실행할 수 있습니다";
  if (!e) return "대상·환경을 찾을 수 없습니다";
  const b = buildOverride || buildOf(e);
  if (!b) return e.env + " 환경에 앱 설치 파일이 없습니다";
  if (!casesOfPlan(p, ctx.cases).length) return "조건에 맞는 승인 케이스가 없습니다";
  const d = devOf(ctx.runners, p.devId);
  if (!d) return "실행 단말이 지정되지 않았습니다";
  const free = d.state === "사용 중" && ((editPreempt && /^편집 세션/.test(d.busy || "")) || (queueOk && /^실행 /.test(d.busy || "")));
  const dd = free ? { ...d, state: "사용 가능" } : d;
  return deviceBlock(dd, b);
};
/* 예약 — 공통 스케줄 설정(FQA 와 같은 컴포넌트)을 쓴다
   schedule = { mode: manual | schedule | event, freq: hourly|daily|weekdays|weekly|monthly|cron, time, dow, dom, cron, tz, active, ev: { newBuild }, summary }
   이벤트는 하나 — '새 기본 테스트 버전 지정 시'. 업로드가 PROBA 안에서 일어나므로 고객사 빌드 시스템 연동이 필요 없다 */
export const SCHED0 = { mode: "manual", freq: "daily", time: "02:00", dow: 1, dom: 1, cron: "0 2 * * *", tz: "Asia/Seoul", active: true, ev: {}, summary: "예약 없음" };
export const MQA_EVENTS = [{ key: "newBuild", label: "새 기본 테스트 버전 지정 시", desc: "대상·환경에서 새 앱 버전을 기본 테스트 버전으로 지정하면 바로 실행합니다", short: "새 버전" }];
export const isTimed = (s) => !!(s && s.mode === "schedule" && s.active !== false);
export const isOnNewBuild = (s) => !!(s && s.mode === "event" && s.ev && s.ev.newBuild);
export const schedText = (s) => (!s || s.mode === "manual" ? "예약 없음" : s.summary || "예약");
/* 다음 실행 시각 — 정기 스케줄만. Cron 은 식 그대로 보여준다 */
export const nextRun = (s) => {
  if (!isTimed(s)) return "";
  if (s.freq === "cron") return "Cron " + s.cron;
  const now = new Date(); const [h, m] = String(s.time || "02:00").split(":").map(Number);
  const z = (n) => String(n).padStart(2, "0");
  const fmt = (d) => d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  if (s.freq === "hourly") { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return fmt(d); }
  const d = new Date(now); d.setHours(h, m, 0, 0);
  const ok = (x) => (s.freq === "weekdays" ? x.getDay() >= 1 && x.getDay() <= 5 : s.freq === "weekly" ? x.getDay() === +s.dow : s.freq === "monthly" ? x.getDate() === +s.dom : true);
  for (let i = 0; i < 400 && (d <= now || !ok(d)); i++) d.setDate(d.getDate() + 1);
  return fmt(d);
};
const RUN_K = { "대기 중": "info", "실행 중": "warn", "완료": "pass", "중단": "draft", "실행 불가": "fail" };
const CASE_K = { "대기": "draft", "실행 중": "warn", "통과": "pass", "실패": "fail", "건너뜀": "draft" };
const passRate = (r) => { const cs = (r.cases || []).filter((c) => c.st === "통과" || c.st === "실패"); return cs.length ? Math.round((cs.filter((c) => c.st === "통과").length / cs.length) * 100) : null; };
const resultText = (r) => { const cs = r.cases || []; const p = cs.filter((c) => c.st === "통과").length; const f = cs.filter((c) => c.st === "실패").length; return "통과 " + p + " · 실패 " + f + (cs.length - p - f ? " · 기타 " + (cs.length - p - f) : ""); };
const gateOk = (r) => { const pr = passRate(r); return pr != null && pr >= (r.gate || 0); };

/* ── 실행 엔진 (목업) — 결과를 미리 계산하고, 가상 시계로 진행을 흘려보낸다.
   화면을 떠나도 진행되도록 모듈 단위로 둔다 (실 구현: 러너가 진행 상황을 서버로 보고)
   시간은 실제 단말 기준에 가깝게: 앱 설치 · 실행 4초, 케이스 시작(앱 초기화) 1.5초, 스텝 1.2초
   목업 배속(SPEED)을 바꾸면 진행 중인 실행에도 바로 적용된다 ── */
const RUN_TIMERS = {};
const T = { install: 4000, caseStart: 1500, step: 1200, caseEnd: 600, end: 800 };
let SPEED = 1;
export const getSpeed = () => SPEED;
export const setSpeed = (v) => { SPEED = v; };
/* 단말별 대기열 — 1단말 1작업. 실행 중인 단말에 들어온 실행은 막지 않고 줄을 세운다 */
const QUEUE = {};   // devId → [{ id, args }]
export const queueOf = (devId) => (QUEUE[devId] || []).map((q) => q.id);
const actName = (s) => ((L.ACT[s.act] || { needs: [] }).needs.includes("loc") ? L.elName(s) : s.act === "화면 확인" ? "\"" + (s.val || "") + "\"" : s.act === "입력" ? "" : s.val || "");
const robotRows = (code) => String(code || "").split("\n").filter((l) => /^\s{2,}\S/.test(l)).map((l) => l.trim()).filter((l) => !l.startsWith("#") && !l.startsWith("[")).map((l) => ({ act: l.split(/\s{2,}/)[0], name: l.split(/\s{2,}/).slice(1).join("  "), res: { st: "ok", msg: "" } }));
/* 같은 순간에 여러 실행을 만들 수 있어(새 버전 이벤트) 마지막으로 낸 번호도 함께 본다 */
let LAST_RUN_NO = 0;
const nextRunId = (runs) => { const n = Math.max(LAST_RUN_NO, ...(runs || []).map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10) || 0)) + 1; LAST_RUN_NO = n; return "MRUN-" + String(n).padStart(3, "0"); };
const planOf = ({ cases, allCases, build }) => cases.map((c) => {
  const pre = c.preCase ? [{ act: "전제조건", name: c.preCase + " " + ((allCases.find((x) => x.id === c.preCase) || {}).name || ""), res: { st: "ok", msg: "" } }] : [];
  const body = c.level === "Full-Code" ? robotRows(c.code) : (c.steps || []).map((s) => ({ act: s.act, name: actName(s), val: s.act === "입력" ? s.val : "", el: s.el || "", res: L.simulateStep(s, build.ver) }));
  const all = [...pre, ...body];
  return { c, all, pl: pre.length, fi: all.findIndex((x) => x.res.st === "fail") };
});
const runShell = (id, { plan, sys, env, build, dev, trigger, note, partial }, plans, status) => ({
  id, planId: plan.id, planName: plan.name, systemId: sys.id, sysName: sys.name, env: env.env, build: build.ver, devId: dev.id, device: devLabel(dev), trigger, note: note || "",
  status, startedAt: nowStamp(), endedAt: "", gate: plan.gate, retry: plan.retry, elapsed: 0, partial: !!partial, queuedAt: status === "대기 중" ? nowStamp() : "",
  log: status === "대기 중" ? [{ lv: "INFO", t: "단말 대기 — " + dev.model + " 이(가) 다른 실행에 사용 중" }] : [],
  cases: plans.map(({ c, all, pl }) => ({ id: c.id, name: c.name, rev: c.rev || 1, st: "대기", preCase: c.preCase || "", preLen: pl, steps: all.map((x) => ({ act: x.act, name: x.name, val: x.val || "", el: x.el || "", st: "대기", msg: x.res.msg || "" })) })),
});
/* 큐에 넣기 — 단말이 다른 '실행' 에 쓰이는 중일 때 */
export function enqueueRun(args) {
  const { dev, api, runs } = args;
  const id = nextRunId(runs);
  api.addMqaRun(runShell(id, args, planOf(args), "대기 중"));
  (QUEUE[dev.id] = QUEUE[dev.id] || []).push({ id, args });
  return id;
}
const drain = (devId) => { const q = QUEUE[devId]; if (!q || !q.length) return; const next = q.shift(); startRun({ ...next.args, existingId: next.id }); };
export function startRun(args) {
  const { plan, dev, api, runs, existingId, build } = args;
  const id = existingId || nextRunId(runs);
  const plans = planOf(args);
  const cur = runShell(id, args, plans, "실행 중");
  cur.log = [{ lv: "INFO", t: "러너 배정 — " + dev.model }, { lv: "INFO", t: "앱 v" + build.ver + " 설치 · 데이터 초기화 · 실행" }];
  if (existingId) cur.log.unshift({ lv: "INFO", t: "단말이 비어 대기열에서 시작" });
  cur.phase = "앱 설치 · 실행";
  api.lockMqaDevice(dev.id, "실행 " + id);
  if (existingId) api.updateMqaRun(id, JSON.parse(JSON.stringify(cur))); else api.addMqaRun(JSON.parse(JSON.stringify(cur)));
  const push = () => api.updateMqaRun(id, JSON.parse(JSON.stringify({ status: cur.status, startedAt: cur.startedAt, endedAt: cur.endedAt, cases: cur.cases, log: cur.log, elapsed: cur.elapsed, phase: cur.phase })));
  const ev = []; const at = (ms, fn) => ev.push({ at: ms, fn });
  let t = T.install; let stop = false;
  plans.forEach(({ c, all, fi, pl }, i) => {
    const rc = cur.cases[i];
    at(t, () => { if (stop) { rc.st = "건너뜀"; return; } rc.st = "실행 중"; cur.phase = c.id + " 시작 — 앱 초기화"; cur.log.push({ lv: "TC", t: c.id + " " + c.name }); });
    t += T.caseStart;
    const last = fi >= 0 ? fi : all.length - 1;
    for (let j = 0; j <= last; j++) {
      const jj = j, x = all[j];
      at(t, () => { if (stop) return; rc.steps[jj].st = "실행 중"; cur.phase = c.id + " · 스텝 " + (jj < pl ? "전" : jj + 1 - pl); cur.log.push({ lv: "STEP", t: x.act + (x.name ? " · " + x.name : "") + (x.val ? " \"" + x.val + "\"" : "") }); });
      t += T.step;
      const dur = x.res.st === "fail" ? 10000 : 700 + ((jj * 337 + i * 191) % 900);   // 목업 소요: 실패는 대기 초과(10초)
      at(t, () => { if (stop) return; rc.steps[jj].st = x.res.st === "fail" ? "실패" : "통과"; rc.steps[jj].dur = dur; rc.dur = (rc.dur || 0) + dur; });
    }
    if (fi >= 0 && plan.retry > 0) {
      at(t, () => { if (stop) return; cur.log.push({ lv: "RETRY", t: c.id + " 실패 → 재시도 (" + plan.retry + "회)" }); });
      t += (T.caseStart + T.step * (last + 1)) * plan.retry;
    }
    t += T.caseEnd;
    at(t, () => {
      if (stop) return;
      for (let j = last + 1; j < rc.steps.length; j++) rc.steps[j].st = "실행 안 함";
      if (fi < 0) { rc.st = "통과"; cur.log.push({ lv: "PASS", t: c.id + " 통과" }); return; }
      rc.st = "실패"; rc.failStep = fi + 1 - pl; /* 에디터 스텝 번호와 맞춘다 (전제조건은 번호 없음) */ rc.failMsg = all[fi].res.msg; rc.retried = plan.retry > 0 ? plan.retry : 0;
      cur.log.push({ lv: "FAIL", t: c.id + " 실패 — " + (fi < pl ? "전제조건" : "스텝 " + (fi + 1 - pl)) + " · " + all[fi].res.msg + (rc.retried ? " (재시도 " + rc.retried + "회 후)" : "") });
      if (plan.onfail === "첫 실패 시 중단") stop = true;
    });
  });
  t += T.end;
  at(t, () => {
    cur.cases.forEach((rc) => { if (rc.st === "대기") rc.st = "건너뜀"; });
    cur.status = "완료"; cur.phase = ""; cur.endedAt = nowStamp(); cur.log.push({ lv: "INFO", t: "완료 · 단말 반납" });
    api.releaseMqaDevice(dev.id);
    if (api.notify) { const p = cur.cases.filter((x) => x.st === "통과").length, f = cur.cases.filter((x) => x.st === "실패").length; api.notify({ icon: "play", text: plan.name + " 완료 — 통과 " + p + " / 실패 " + f, to: { domain: "MQA", view: "mqa-result-detail", run: id } }); }
  });
  /* 가상 시계 — 100ms 마다 SPEED 배로 흐른다 */
  let v = 0, tick = 0;
  const iv = setInterval(() => {
    v += 100 * SPEED; cur.elapsed = v; tick++;
    let any = false;
    while (ev.length && ev[0].at <= v) { ev.shift().fn(); any = true; }
    if (any || tick % 5 === 0 || !ev.length) push();   // 화면 갱신은 변화가 있을 때 + 0.5초마다(경과 시간)
    if (!ev.length) { clearInterval(iv); delete RUN_TIMERS[id]; drain(dev.id); }
  }, 100);
  RUN_TIMERS[id] = iv;
  return id;
}
export function stopRun(run, api) {
  if (run.status === "대기 중") {   // 대기열에서 빼기
    const q = QUEUE[run.devId] || []; QUEUE[run.devId] = q.filter((x) => x.id !== run.id);
    api.updateMqaRun(run.id, { status: "중단", endedAt: nowStamp(), log: [...(run.log || []), { lv: "INFO", t: "대기 중 취소" }] });
    return;
  }
  clearInterval(RUN_TIMERS[run.id]); delete RUN_TIMERS[run.id];
  api.updateMqaRun(run.id, { status: "중단", phase: "", endedAt: nowStamp(), cases: run.cases.map((c) => (c.st === "대기" || c.st === "실행 중" ? { ...c, st: "건너뜀" } : c)), log: [...(run.log || []), { lv: "INFO", t: "사용자가 중단 · 단말 반납" }] });
  api.releaseMqaDevice(run.devId);
  drain(run.devId);
}
/* 실행 시작 — 계획 · 실패만 다시 · 예약이 모두 이 함수를 지난다 */
const useRunner = () => {
  const app = useApp();
  const ctx = { systems: app.mqaSystems || [], cases: app.mqaCases || [], runners: app.mqaRunners || [] };
  const launch = (plan, { trigger = "수동", only, note, build } = {}) => {
    const { sy, e } = envOfPlan(ctx.systems, plan);
    const b = build || buildOf(e); const dev = devOf(ctx.runners, plan.devId);
    let cases = casesOfPlan(plan, ctx.cases); if (only) cases = cases.filter((c) => only.includes(c.id));
    if (dev && dev.state === "사용 중" && /^편집 세션/.test(dev.busy || "") && trigger !== "수동") app.releaseMqaDevice(dev.id);
    const args = { plan, cases, allCases: ctx.cases, sys: sy, env: e, build: b, dev, trigger, note, partial: !!only, api: app, runs: app.mqaRuns };
    if (dev && dev.state === "사용 중" && /^실행 /.test(dev.busy || "")) return enqueueRun(args);   // 다른 실행이 쓰는 중 → 대기열
    return startRun(args);
  };
  /* 자동 실행(예약 · 새 버전) — 그 순간의 상태로 판단한다. 편집 세션은 끊고 시작, 그 밖의 문제는 건너뛰지 않고 '실행 불가' 로 기록 */
  const autoRun = (p, trigger, build) => {
    const blk = planBlock(p, ctx, true, true, build, true);
    if (blk) {
      const { sy, e } = envOfPlan(ctx.systems, p); const bd = build || buildOf(e); const dv = devOf(ctx.runners, p.devId);
      app.addMqaRun({ id: nextRunId(app.mqaRuns), planId: p.id, planName: p.name, systemId: p.systemId, sysName: sy ? sy.name : "", env: p.env, build: bd ? bd.ver : "", devId: p.devId, device: dv ? devLabel(dv) : "—", trigger, status: "실행 불가", startedAt: nowStamp(), endedAt: nowStamp(), gate: p.gate, note: blk, cases: [], log: [{ lv: "FAIL", t: "실행 불가 — " + blk }] });
      return { blocked: blk };
    }
    const dv = devOf(ctx.runners, p.devId);
    const pre = dv && /^편집 세션/.test(dv.busy || "") ? dv.busy + " 을(를) 종료하고 시작" : "";
    return { id: launch(p, { trigger, note: pre, build }), pre };
  };
  return { app, ctx, launch, autoRun };
};
export { useRunner };

const Empty = ({ icon: Icon, title, hint, children }) => (
  <Card className="flex flex-col items-center justify-center py-14 text-center"><Icon size={26} className="text-slate-400" /><div className="mt-3 text-sm font-medium text-slate-700">{title}</div>{hint && <div className="mt-1.5 max-w-md text-xs text-slate-500">{hint}</div>}{children}</Card>
);

/* ═══════════ 실행 계획 ═══════════ */
const P0 = (sys) => ({ name: "", systemId: sys ? sys.id : 0, env: sys && sys.envs[0] ? sys.envs[0].env : "", suiteIds: [], tags: "", devId: "", retry: 1, onfail: "계속 진행", gate: 90, status: "초안", schedule: SCHED0 });
const PLAN_KEYS = ["name", "systemId", "env", "suiteIds", "tags", "devId", "retry", "onfail", "gate", "status", "schedule"];
/* 스케줄은 의미 있는 값만 비교한다 — 공통 스케줄 컴포넌트는 처음 그릴 때(개발 모드의 StrictMode 재실행 포함)
   ev 를 { newBuild: false } 처럼 채워 내보내므로, 원본 {} 와 글자 그대로 비교하면 바꾸지 않아도 '미저장 변경' 이 뜬다 */
const normSched = (s) => { const x = { ...SCHED0, ...(s || {}) }; return { mode: x.mode, freq: x.freq, time: x.time, dow: +x.dow, dom: +x.dom, cron: x.cron, tz: x.tz, active: x.active !== false, newBuild: !!(x.ev && x.ev.newBuild) }; };
const pickPlan = (p) => Object.fromEntries(PLAN_KEYS.map((k) => [k, p[k]]));
const cmpPlan = (p) => JSON.stringify(Object.fromEntries(PLAN_KEYS.map((k) => [k, k === "schedule" ? normSched(p[k]) : p[k]])));
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
  const dirty = !!(sel && d && cmpPlan(d) !== cmpPlan(sel));
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const set = (patch) => setD({ ...d, ...patch });
  const choose = (p) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?")) return; setSelId(p.id); setD(null); };
  /* 대상 앱 · 환경은 만들 때 정하고 바꾸지 않는다 — 다른 환경은 새 계획으로 (이력 · 회귀 비교가 섞이지 않게) */
  const create = () => {
    if (!nf.name.trim()) { flash("계획 이름을 입력하세요"); return; }
    if (mqaPlans.some((x) => x.name === nf.name.trim())) { flash("같은 이름의 계획이 이미 있습니다"); return; }
    if (!nf.suiteIds.length) { flash("스위트를 1개 이상 고르세요"); return; }
    const id = Math.max(0, ...mqaPlans.map((x) => x.id)) + 1;
    addMqaPlan({ ...P0(mqaSystems[0]), ...nf, name: nf.name.trim(), id }); setSelId(id); setD(null); setAddOpen(false);
    flash(nf.name.trim() + " 계획 생성 (초안) — 실행 단말을 지정하세요");
  };
  const del = (p) => { if (!window.confirm(p.name + " 계획을 삭제할까요?")) return; removeMqaPlan(p.id); setSelId(null); setD(null); flash(p.name + " 삭제됨"); };
  const save = () => { updateMqaPlan(sel.id, { ...pickPlan(d), name: d.name.trim() || sel.name }); setD(null); flash("계획 저장됨"); };

  const Head = <PageToolbar desc="무엇을(앱 · 환경 · 케이스) 어디서(단말) 언제(예약) 돌릴지 정합니다" />;
  const addModal = addOpen && (
    <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddOpen(false)}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">새 실행 계획</h3><button onClick={() => setAddOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
        <div className="space-y-3.5 p-5">
          <Field label="계획 이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 주문 회귀 (스테이징)" /></Field>
            <Field label="대상 앱 · 환경" hint="만든 뒤에는 바꿀 수 없습니다 — 다른 환경은 새 계획으로 만드세요">
              <Select value={nf.systemId + "|" + nf.env} onChange={(e) => { const [s, en] = e.target.value.split("|"); setNf({ ...nf, systemId: +s, env: en }); }}>
                {mqaSystems.flatMap((sy) => sy.envs.map((en) => <option key={sy.id + en.env} value={sy.id + "|" + en.env}>{sy.name} · {en.env}</option>))}
              </Select>
            </Field>
            <Field label="스위트 (다중 선택)"><SuitePick suites={mqaSuites} value={nf.suiteIds} onChange={(v) => setNf({ ...nf, suiteIds: v })} /></Field>
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
  const b = buildOf(e);
  const cs = casesOfPlan(d, mqaCases);
  const allDevs = flatDevices(mqaRunners);
  const sched = d.schedule || SCHED0;
  const scheduled = isTimed(sched) || isOnNewBuild(sched);
  const blk = planBlock({ ...d, status: "활성" }, { systems: mqaSystems, cases: mqaCases, runners: mqaRunners }, scheduled, true);
  /* 실행 전에 알 수 있는 위험 — 막지 않고 알린다 */
  const verOff = b ? cs.filter((c) => c.baseBuild && c.baseBuild !== b.ver && !(c.lastDry && c.lastDry.build === b.ver && c.lastDry.result === "통과")) : [];
  const caution = e && e.prod ? cs.filter((c) => c.prodCaution) : [];
  const allTags = [...new Set(mqaCases.filter((c) => c.systemId === d.systemId).flatMap((c) => tagList(c.tags)))];
  const excluded = mqaCases.filter((c) => c.systemId === d.systemId && (d.suiteIds || []).includes(c.suiteId) && c.status !== "승인").length;
  const quarantinedN = mqaCases.filter((c) => c.systemId === d.systemId && (d.suiteIds || []).includes(c.suiteId) && c.status === "승인" && c.quarantined).length;
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
              <Field label="대상 앱 · 환경"><ReadonlyField value={(sy ? sy.name : "—") + " · " + d.env + (e && e.prod ? " (운영)" : "")} title="만든 뒤에는 바꿀 수 없습니다 — 다른 환경은 새 계획으로 만드세요" /></Field>
              <Field label="앱 버전"><ReadonlyField value={b ? "v" + b.ver + " · 대상·환경의 기본 테스트 버전" : "앱 설치 파일 없음 — 대상·환경에서 올리세요"} title="실행할 때마다 그 환경의 기본 테스트 버전을 씁니다. 버전은 대상·환경에서 정합니다" /></Field>
              <Field label="스위트 (다중 선택)"><SuitePick suites={mqaSuites} value={d.suiteIds} onChange={(v) => set({ suiteIds: v })} /></Field>
              <Field label="태그 필터" hint="비우면 스위트 전체 · 하나라도 일치하면 대상">
                <div className="flex flex-wrap gap-1.5">{allTags.map((t) => { const on = tagList(d.tags).includes(t); return <button key={t} onClick={() => set({ tags: (on ? tagList(d.tags).filter((x) => x !== t) : [...tagList(d.tags), t]).join(",") })} className={"rounded-full border px-2.5 py-0.5 text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 text-slate-600 hover:bg-slate-100")}>{t}</button>; })}{!allTags.length && <span className="text-xs text-slate-500">태그 없음</span>}</div>
              </Field>
              <div className={"rounded-lg border px-3 py-2 text-xs " + (cs.length ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700")}>
                {cs.length ? <>대상 케이스 <b className="font-semibold text-sky-700">{cs.length}건</b> <span className="font-mono text-slate-500">{cs.map((c) => c.id).join(", ")}</span></> : "조건에 맞는 승인 케이스가 없습니다 — 실행해도 0건입니다"}
                {excluded > 0 && <div className="mt-0.5 text-slate-500">승인되지 않은 {excluded}건은 빠집니다</div>}
                {quarantinedN > 0 && <div className="mt-0.5 text-amber-700">격리된 {quarantinedN}건은 빠집니다 — 불안정 화면에서 해제할 수 있습니다</div>}
              </div>
              {verOff.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={12} className="mr-1 inline" />{verOff.length}건은 다른 앱 버전 기준으로 만들어져 v{b.ver}에서 확인되지 않았습니다 — 요소를 못 찾을 수 있습니다 <span className="font-mono">{verOff.map((c) => c.id).join(", ")}</span></div>}
              {caution.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ 운영 환경에 운영주의 {caution.length}건이 포함됩니다 — 실데이터를 바꿀 수 있습니다</div>}
            </div>
            {/* 어디서 · 어떻게 · 언제 */}
            <div className="space-y-3.5">
              <div className="text-xs font-semibold text-slate-500">어디서 · 어떻게</div>
              <Field label="실행 단말" hint="계획마다 단말 1대 — 그 단말에서 케이스를 순서대로 돌립니다">
                <DeviceSelect devs={allDevs} value={d.devId} onChange={(v) => set({ devId: v })} build={b} soft />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="재시도"><Select value={d.retry} onChange={(ev) => set({ retry: +ev.target.value })}><option value={0}>안 함</option><option value={1}>1회</option><option value={2}>2회</option></Select></Field>
                <Field label="실패 시"><Select value={d.onfail} onChange={(ev) => set({ onfail: ev.target.value })}><option>계속 진행</option><option>첫 실패 시 중단</option></Select></Field>
                <Field label="품질 게이트 (%)"><Input type="number" value={d.gate} onChange={(ev) => set({ gate: +ev.target.value || 0 })} /></Field>
              </div>
              <div className={"rounded-lg border px-3 py-2 text-xs " + (blk ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                {blk ? <><AlertTriangle size={12} className="mr-1 inline" />지금 실행할 수 없음 — {blk}{/단말|러너|USB|자동화 준비/.test(blk) && <button onClick={() => goTo("mqa-devices")} className="ml-2 text-sky-700">테스트 기기로</button>}</> : <><CheckCircle2 size={12} className="mr-1 inline" />실행 준비됨 — {sy ? sy.name : ""} {e ? envText({ ...e, build: b ? b.ver : "" }) : ""} · {(devOf(mqaRunners, d.devId) || {}).model}</>}
              </div>
            </div>
          </div>
          {/* 언제 — 공통 스케줄 설정 (FQA 와 같은 컴포넌트) + 앱 전용 이벤트 '새 기본 테스트 버전 지정 시' */}
          <div className="mt-5 border-t border-slate-200 pt-4">
            <ScheduleConfig key={sel.id} value={sched} onChange={(v) => set({ schedule: v })} events={MQA_EVENTS} singleSelect manualHint="자동 실행 없음 — 실행 화면에서 수동으로만 돌립니다." toast={flash} />
            {isTimed(sched) && <div className="mt-3 text-xs text-slate-500">실행 30분 전에 러너 · 단말을 점검하고, 그 시각에 쓸 수 없으면 건너뛰지 않고 '실행 불가'로 남깁니다.</div>}
            {isOnNewBuild(sched) && <div className="mt-3 text-xs text-slate-500">대상·환경에서 새 버전을 기본 테스트 버전으로 지정하는 즉시 실행합니다.</div>}
            {scheduled && d.status !== "활성" && <div className="mt-1 text-xs text-amber-700">초안이라 자동 실행되지 않습니다 — 활성으로 바꾸세요.</div>}
          </div>
        </Card>
      </div>
      {addModal}<Toast msg={msg} />
    </div>
  );
}
const SuitePick = ({ suites, value, onChange }) => (
  <div className="grid grid-cols-2 gap-2">{suites.map((x) => { const on = (value || []).includes(x.id); return <button key={x.id} onClick={() => onChange(on ? value.filter((s) => s !== x.id) : [...(value || []), x.id])} className={"rounded-lg border px-2 py-1.5 text-left text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.name}</button>; })}</div>
);

/* ═══════════ 실행 ═══════════
   FQA 실행 화면과 같은 배치 — 좌: 지금 실행 · 실행 큐 / 우: 선택한 실행의 진행 상세
   MQA 특성: 병목은 단말 → 단말별 대기열 · 사용 가능 단말 · 오늘 실행 불가를 KPI 로, 진행 상세에 단말 화면
   지난 실행 목록은 두지 않는다(실행 이력 · 대시보드에 있음) — 오늘 끝난 실행만 큐에 '완료'로 남겨 결과로 바로 간다 */
const LV_K = { INFO: "text-slate-400", TC: "text-sky-300", STEP: "text-slate-300", PASS: "text-emerald-300", FAIL: "text-red-300", RETRY: "text-amber-300" };
const mmss = (ms) => { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
export function MqaRunScreen({ nav }) {
  const { app, ctx, launch, autoRun } = useRunner();
  const { mqaPlans = [], mqaRuns = [] } = app;
  const [msg, flash] = useToast();
  const [speed, setSpd] = useState(getSpeed());
  const active = mqaPlans.filter((p) => p.status === "활성");
  const [pid, setPid] = useState(active[0] ? active[0].id : null);
  const plan = mqaPlans.find((p) => p.id === pid) || active[0] || null;
  const today = nowStamp().slice(0, 10);
  const isToday = (r) => String(r.startedAt || "").slice(0, 10) === today;
  const running = mqaRuns.filter((r) => r.status === "실행 중");
  const waiting = mqaRuns.filter((r) => r.status === "대기 중");
  /* 끝난 실행은 큐와 상세에서 비운다 (FQA 와 같음) — 결과는 완료 알림 · 실행 이력에서 */
  const rows = [...running, ...waiting];
  const [selId, setSelId] = useState(null);
  const sel = rows.find((r) => r.id === selId) || running[0] || waiting[0] || null;
  const blk = plan ? planBlock(plan, ctx, false) : "활성 계획이 없습니다";
  const go = () => { if (blk) { flash(blk); return; } const id = launch(plan); setSelId(id); const dv = devOf(ctx.runners, plan.devId); flash(dv && dv.state === "사용 중" ? id + " 단말 대기열에 추가 — 앞선 실행이 끝나면 시작" : id + " 시작"); };
  const scheduledPlans = active.filter((p) => isTimed(p.schedule) || isOnNewBuild(p.schedule));
  const fire = (p) => { const r = autoRun(p, "예약"); if (r.id) setSelId(r.id); flash(r.blocked ? "예약 실행 불가 — " + r.blocked : r.id + " 예약 실행 시작" + (r.pre ? " · 편집 세션 종료" : "")); };
  const stop = (r) => { if (!window.confirm(r.id + (r.status === "대기 중" ? " 을(를) 대기열에서 뺄까요?" : " 실행을 중단할까요?"))) return; stopRun(r, app); flash(r.id + (r.status === "대기 중" ? " 대기 취소" : " 중단")); };
  const devs = flatDevices(ctx.runners);
  const KPI_L = [["실행 중", running.length, "text-amber-600"], ["단말 대기", waiting.length, "text-slate-900"]];
  const blockedToday = mqaRuns.filter((r) => r.status === "실행 불가" && isToday(r)).length;
  const KPI_R = [
    ["사용 가능 단말", devs.filter((d) => d.state === "사용 가능").length + " / " + devs.length, "text-slate-900"],
    ["오늘 예약", active.filter((p) => isTimed(p.schedule) && nextRun(p.schedule).slice(0, 10) === today).length, "text-sky-600"],
    ["오늘 실행 불가", blockedToday, blockedToday ? "text-red-600" : "text-slate-400"],
  ];
  const Kpi = ({ k }) => <Card className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div></Card>;
  const prog = (r) => { const n = (r.cases || []).length; const d = (r.cases || []).filter((c) => ["통과", "실패", "건너뜀"].includes(c.st)).length; return [d, n]; };
  return (
    <div className="space-y-4">
      <PageToolbar desc="지금 실행 · 단말 대기열 · 진행 상황">
        <MockBtn onClick={() => { const v = speed === 1 ? 5 : 1; setSpeed(v); setSpd(v); }} title="목업 전용 — 진행 속도를 바꿉니다 (실제 제품에는 없음)">{speed === 1 ? "빠르게 ×5" : "실제 속도로"}</MockBtn>
      </PageToolbar>
      <div className="grid grid-cols-12 gap-4">
        {/* 좌: 지금 실행 · 실행 큐 */}
        <div className="col-span-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">{KPI_L.map((k) => <Kpi key={k[0]} k={k} />)}</div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><Select value={plan ? plan.id : ""} onChange={(e) => setPid(+e.target.value)} disabled={!mqaPlans.length}>{!mqaPlans.length && <option value="">실행 계획 없음</option>}{mqaPlans.map((p) => <option key={p.id} value={p.id} disabled={p.status !== "활성"}>{p.name}{p.status !== "활성" ? " (초안)" : ""}</option>)}</Select></div>
            <Btn kind="primary" icon={Play} disabled={!!blk} onClick={go} title={blk || ""}>실행</Btn>
          </div>
          {plan && (() => { const { sy, e } = envOfPlan(ctx.systems, plan); const b = buildOf(e); const dv = devOf(ctx.runners, plan.devId); return <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><Badge kind="info">{sy ? sy.name : "—"} · {plan.env} · 앱 v{b ? b.ver : "—"}</Badge><span className="flex items-center gap-1"><Smartphone size={12} />{dv ? devLabel(dv) : "단말 미지정"}{dv && dv.state === "사용 중" && <span className="text-amber-700"> · 사용 중 (대기열에 들어감)</span>}</span><span>· 케이스 {casesOfPlan(plan, ctx.cases).length}건</span>{blk && <span className="text-amber-700">⚠ {blk}</span>}</div>; })()}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-4 py-2 font-medium">실행</th><th className="font-medium">단말</th><th className="font-medium">상태</th><th className="font-medium">진행</th><th className="pr-4" /></tr></thead>
              <tbody>
                {!rows.length && <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-500">진행 중이거나 대기 중인 실행이 없습니다</td></tr>}
                {rows.map((r) => { const [d, n] = prog(r); const q = r.status === "대기 중" ? queueOf(r.devId).indexOf(r.id) + 1 : 0; return (
                  <tr key={r.id} onClick={() => setSelId(r.id)} className={"cursor-pointer border-b border-slate-100 " + (sel && sel.id === r.id ? SEL_ROW : "hover:bg-slate-50")}>
                    <td className="px-4 py-2.5"><div className="font-mono text-xs text-sky-600">{r.id}</div><div className="text-slate-800">{r.planName}</div><div className="text-xs text-slate-500">{r.trigger}</div></td>
                    <td className="text-xs text-slate-600">{String(r.device || "").split(" — ")[0]}</td>
                    <td><Badge kind={RUN_K[r.status]}>{r.status}</Badge>{q > 0 && <div className="mt-0.5 text-xs text-slate-500">{q}번째</div>}</td>
                    <td style={{ minWidth: 110 }}>{r.status === "실행 중" ? <div><div className="mb-0.5 flex justify-between text-xs text-slate-500"><span>{d}/{n}</span><span>{mmss(r.elapsed)}</span></div><div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: (n ? (d / n) * 100 : 0) + "%" }} /></div></div>
                      : r.status === "완료" ? <span className="text-xs">{resultText(r)}</span> : r.status === "실행 불가" ? <span className="text-xs text-red-700">실행하지 못함</span> : <span className="text-xs text-slate-500">{n}건 대기</span>}</td>
                    <td className="pr-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {r.status === "실행 중" && <button onClick={() => stop(r)} className="text-xs text-slate-500 hover:text-red-600">중단</button>}
                      {r.status === "대기 중" && <button onClick={() => stop(r)} className="text-xs text-slate-500 hover:text-red-600">취소</button>}
                      {(r.status === "완료" || r.status === "중단") && <button onClick={() => nav && nav("mqa-result-detail", r.id)} className="text-xs text-sky-600">결과 보기</button>}
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">끝난 실행은 완료 알림과 <button onClick={() => nav && nav("mqa-history")} className="text-sky-600">실행 이력</button>에서 결과를 봅니다</div>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Calendar size={15} className="text-sky-600" />예약 실행</div>
            {!scheduledPlans.length && <div className="text-xs text-slate-500">예약된 계획이 없습니다.</div>}
            <div className="space-y-1.5">{scheduledPlans.map((p) => { const b = planBlock(p, ctx, true, true); const dv = devOf(ctx.runners, p.devId); return (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                <span className="shrink-0 text-slate-600">{isTimed(p.schedule) ? <><Clock size={11} className="mr-1 inline" />{nextRun(p.schedule).slice(5)}</> : <><Zap size={11} className="mr-1 inline" />새 버전 지정 시</>}</span>
                <span className="shrink-0 text-slate-500">{dv ? dv.model : "—"}</span>
                {b ? <span className="shrink-0 text-amber-700" title={b}>점검 필요</span> : <span className="shrink-0 text-emerald-700">점검 정상</span>}
                {isTimed(p.schedule) && <MockBtn onClick={() => fire(p)} title="목업 전용 — 예약 시각이 된 것처럼 실행합니다">지금 시각으로</MockBtn>}
              </div>
            ); })}</div>
          </Card>
        </div>
        {/* 우: KPI · 선택한 실행 상세 */}
        <div className="col-span-6 space-y-3">
          <div className="grid grid-cols-3 gap-3">{KPI_R.map((k) => <Kpi key={k[0]} k={k} />)}</div>
          <RunDetail run={sel} onStop={() => sel && stop(sel)} onOpen={() => sel && nav && nav("mqa-result-detail", sel.id)} />
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}
/* 선택한 실행의 진행 상세 — 단말 화면 · 현재 케이스 스텝 · 로그(레벨 필터) */
function RunDetail({ run, onStop, onOpen }) {
  const [lvl, setLvl] = useState("ALL");
  if (!run) return <Card className="flex items-center justify-center p-8 text-xs text-slate-500" style={{ minHeight: 320 }}>진행 중인 실행이 없습니다 — 계획을 골라 [실행]을 누르세요.</Card>;
  const cur = run.cases.find((c) => c.st === "실행 중") || null;
  const [d, n] = [run.cases.filter((c) => ["통과", "실패", "건너뜀"].includes(c.st)).length, run.cases.length];
  const live = run.status === "실행 중";
  const step = cur ? cur.steps.find((x) => x.st === "실행 중") : null;
  const logs = (run.log || []).filter((l) => lvl === "ALL" || l.lv === lvl);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{run.planName}</div><div className="font-mono text-xs text-sky-600">{run.id} <span className="font-sans text-slate-500">· {run.device} · 앱 v{run.build}</span></div></div>
        <div className="flex shrink-0 items-center gap-2">
          {live ? <span className="flex items-center gap-1 text-xs text-red-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE {mmss(run.elapsed)}</span> : <Badge kind={RUN_K[run.status]}>{run.status}</Badge>}
          {(live || run.status === "대기 중") && <Btn icon={Square} onClick={onStop}>{live ? "중단" : "대기 취소"}</Btn>}
          {(run.status === "완료" || run.status === "중단") && <Btn icon={FileText} onClick={onOpen}>결과 보기</Btn>}
        </div>
      </div>
      {run.status === "대기 중" && <div className="px-4 py-6 text-center text-xs text-slate-500"><Clock size={18} className="mx-auto mb-2 text-slate-400" />단말이 다른 실행에 사용 중입니다 — 대기열 {queueOf(run.devId).indexOf(run.id) + 1}번째, 앞선 실행이 끝나면 자동으로 시작합니다.</div>}
      {run.status === "실행 불가" && <div className="px-4 py-6 text-xs text-red-700">{run.note}<div className="mt-1 text-slate-500">예약 시각에 실행 조건을 만족하지 못해 실행하지 않았습니다.</div></div>}
      {(live || run.status === "완료" || run.status === "중단") && (<>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs text-slate-500"><span>케이스 <span className="text-slate-800">{d}/{n}</span></span><div className="h-1.5 flex-1 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: (n ? (d / n) * 100 : 0) + "%" }} /></div>{live && <span className="text-slate-700">{run.phase}</span>}</div>
        <div className="flex gap-4 border-b border-slate-200 p-4">
          {/* 단말 화면 — 실 구현: 러너가 몇 초 간격으로 캡처해 올린다 */}
          <div className="shrink-0">
            <div className="w-32 rounded-2xl border-4 border-slate-800 bg-white p-1.5"><div className="space-y-1 rounded-xl bg-slate-50 p-1.5" style={{ minHeight: 190 }}>
              {live && run.phase && /설치/.test(run.phase) ? <div className="flex h-44 flex-col items-center justify-center text-[10px] text-slate-400"><RefreshCw size={14} className="mb-1 animate-spin" />앱 설치 · 실행</div>
                : L.elementsFor(run.build).slice(0, 7).map((el) => <div key={el.key} className={"truncate rounded border px-1 py-0.5 text-[9px] " + (step && step.el && step.el === el.label ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-500")}>{el.text || el.label}</div>)}
            </div></div>
            <div className="mt-1 text-center text-[10px] text-slate-400">{live ? "단말 화면 · 수 초 간격" : "마지막 화면"}</div>
          </div>
          <div className="min-w-0 flex-1">
            {cur ? (<>
              <div className="mb-1.5 text-xs"><span className="font-mono text-sky-600">{cur.id}</span> <span className="font-medium text-slate-800">{cur.name}</span></div>
              <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 190 }}>{cur.steps.map((x, i) => (
                <div key={i} className={"flex items-center gap-2 rounded px-1.5 py-0.5 text-xs " + (x.st === "실행 중" ? "bg-sky-50" : "")}>
                  <span className="w-4 text-right font-mono text-slate-400">{i < (cur.preLen || 0) ? "전" : i + 1 - (cur.preLen || 0)}</span>
                  {x.st === "실행 중" ? <RefreshCw size={11} className="shrink-0 animate-spin text-sky-600" /> : x.st === "통과" ? <CheckCircle2 size={11} className="shrink-0 text-emerald-600" /> : x.st === "실패" ? <XCircle size={11} className="shrink-0 text-red-600" /> : <span className="h-[11px] w-[11px] shrink-0 rounded-full border border-slate-300" />}
                  <span className="w-14 shrink-0 text-slate-500">{x.act}</span><span className="truncate text-slate-800">{x.name}{x.val ? " \"" + x.val + "\"" : ""}</span>
                </div>
              ))}</div>
            </>) : (
              <div className="space-y-1">{run.cases.map((c) => <div key={c.id} className="flex items-center gap-2 text-xs"><span className="w-14 font-mono text-sky-600">{c.id}</span><span className="flex-1 truncate text-slate-700">{c.name}</span><Badge kind={CASE_K[c.st]}>{c.st}</Badge></div>)}</div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 py-1.5">{["ALL", "INFO", "TC", "STEP", "PASS", "FAIL", "RETRY"].map((l) => <button key={l} onClick={() => setLvl(l)} className={"rounded px-1.5 py-0.5 text-xs " + (lvl === l ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{l}</button>)}</div>
        <div className="overflow-y-auto bg-slate-900 p-2.5 font-mono text-xs leading-relaxed" style={{ maxHeight: 220 }}>
          {logs.slice(-60).map((l, i) => <div key={i} className="flex gap-2"><span className={"w-10 shrink-0 font-semibold " + (LV_K[l.lv] || "text-slate-400")}>{l.lv || "INFO"}</span><span className="text-slate-200">{l.t}</span></div>)}
        </div>
      </>)}
    </Card>
  );
}
const RunTable = ({ runs, onOpen }) => (
  <table className="w-full text-sm">
    <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">실행</th><th className="font-medium">계획</th><th className="font-medium">앱 · 환경</th><th className="font-medium">단말</th><th className="font-medium">트리거</th><th className="font-medium">시작</th><th className="font-medium">결과</th><th className="pr-4 text-right font-medium">상태</th></tr></thead>
    <tbody>
      {!runs.length && <tr><td colSpan={8} className="py-8 text-center text-xs text-slate-500">실행 이력이 없습니다</td></tr>}
      {runs.map((r) => { const pr = passRate(r); return (
        <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100">
          <td className="px-4 py-3 font-mono text-xs text-sky-600">{r.id}</td><td className="text-slate-800">{r.planName}</td>
          <td className="text-xs text-slate-600">{r.sysName} · {r.env} · v{r.build}</td><td className="text-xs text-slate-600">{String(r.device || "").split(" — ")[0]}</td>
          <td><Badge kind={TRIG_K[r.trigger] || "info"}>{r.trigger}</Badge></td><td className="text-xs text-slate-500">{r.startedAt}</td>
          <td className="text-xs">{r.status === "실행 불가" ? <span className="text-red-700">{r.note}</span> : <>{resultText(r)}{pr != null && <span className={"ml-1.5 font-semibold " + (gateOk(r) ? "text-emerald-700" : "text-red-700")}>{pr}%</span>}</>}</td>
          <td className="pr-4 text-right"><Badge kind={RUN_K[r.status]}>{r.status}</Badge></td>
        </tr>
      ); })}
    </tbody>
  </table>
);

/* ═══════════ 실행 이력 ═══════════ */
/* 실행 이력 — FQA 와 같은 구성: 필터(상태 · 계획) / 표(실행 · 계획 · 앱 버전 · 대상·환경 · 단말 · 트리거 · 시각 · 상태 · 판정 · 결과)
   끝난 실행만(완료 · 중단 · 실행 불가). 진행 중 · 대기 중은 실행 화면에서 본다 */
const TRIG_K = { "수동": "info", "예약": "pass", "새 버전": "warn" };
const verdictOf = (r) => (r.status !== "완료" ? "-" : (r.cases || []).some((c) => c.st === "실패") ? "실패" : "통과");
export function MqaHistoryScreen({ nav }) {
  const { mqaRuns = [], mqaPlans = [] } = useApp();
  const [fSt, setFSt] = useState("전체 상태");
  const [fPlan, setFPlan] = useState("전체 계획");
  const planNow = (r) => (mqaPlans.find((p) => p.id === r.planId) || {}).name;   // 계획의 현재 이름
  const hist = mqaRuns.filter((r) => ["완료", "중단", "실행 불가"].includes(r.status))
    .filter((r) => (fSt === "전체 상태" || r.status === fSt) && (fPlan === "전체 계획" || String(r.planId) === fPlan));
  return (
    <div className="space-y-4">
      <PageToolbar desc="끝난 실행 이력 · 행 클릭 시 결과 상세" />
      <div className="flex items-center gap-2">
        <div style={{ width: 120 }}><Select value={fSt} onChange={(e) => setFSt(e.target.value)}>{["전체 상태", "완료", "중단", "실행 불가"].map((x) => <option key={x}>{x}</option>)}</Select></div>
        <div style={{ width: 200 }}><Select value={fPlan} onChange={(e) => setFPlan(e.target.value)}><option value="전체 계획">전체 계획</option>{mqaPlans.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</Select></div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">실행</th><th className="font-medium">계획</th><th className="font-medium">앱 버전</th><th className="font-medium">대상·환경</th><th className="font-medium">단말</th><th className="font-medium">트리거</th><th className="font-medium">시각</th><th className="font-medium">상태</th><th className="font-medium">판정</th><th className="pr-4 font-medium">결과</th></tr></thead>
          <tbody>
            {hist.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">조건에 맞는 이력이 없습니다</td></tr>}
            {hist.map((r) => { const v = verdictOf(r); const n = (r.cases || []).length; const p = (r.cases || []).filter((c) => c.st === "통과").length; const pr = passRate(r); return (
              <tr key={r.id} onClick={() => nav && nav("mqa-result-detail", r.id)} className="cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-sky-600">{r.id}</td>
                <td className="text-slate-800">{planNow(r) || r.planName}{planNow(r) && r.planName && planNow(r) !== r.planName && <span className="ml-1.5 text-xs text-slate-500">· 당시 “{r.planName}”</span>}</td>
                <td className="font-mono text-xs text-slate-500">{r.build ? "v" + r.build : "-"}</td>
                <td className="text-xs text-slate-500">{r.sysName} · {r.env}</td>
                <td className="text-xs text-slate-500">{String(r.device || "-").split(" — ")[0]}</td>
                <td><Badge kind={TRIG_K[r.trigger] || "info"}>{r.trigger}</Badge></td>
                <td><RunTime start={r.startedAt} end={r.endedAt} /></td>
                <td><Badge kind={RUN_K[r.status]}>{r.status}</Badge></td>
                <td>{v === "-" ? <span className="text-xs text-slate-500">-</span> : <Badge kind={v === "통과" ? "pass" : "fail"}>{v}</Badge>}</td>
                <td className="pr-4 text-xs text-slate-500">{r.status === "실행 불가" ? <span className="text-red-700" title={r.note}>실행하지 못함</span> : r.status === "완료" ? <>{p}/{n}{pr != null && <span className={"ml-1.5 font-medium " + (gateOk(r) ? "text-emerald-700" : "text-red-700")}>{pr}%</span>}</> : p + "/" + n}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ═══════════ 결과 — 상세 · 회귀 비교 · 불안정 ═══════════ */
export function MqaResultScreen({ runId, mode = "상세", back, nav, backLabel }) {
  if (mode === "회귀") return <Regression nav={nav} />;
  if (mode === "불안정") return <Flaky nav={nav} />;
  return <ResultDetail runId={runId} back={back} backLabel={backLabel} nav={nav} />;
}
/* 실패 원인 판정 — 규칙으로 갈리는 것은 규칙으로, 나머지는 AI 가 근거와 함께 제안한다 (담당자가 확정)
   목업: 실패 메시지 · 같은 계획의 다른 실행 · 케이스 기준 앱 버전으로 흉내 낸다 */
const JUDGE_K = { "테스트 문제": "warn", "앱 결함 의심": "fail", "환경 문제": "info", "확인 필요": "draft" };
const judgeOf = (run, c, runs, caseNow) => {
  if (c.st !== "실패") return null;
  const m = c.failMsg || "";
  if (/크래시|ANR/.test(m)) return { kind: "앱 결함 의심", cause: "앱 크래시", by: "규칙", basis: "앱 로그에 크래시 · ANR 기록" };
  if (/서버|연결/.test(m)) return { kind: "환경 문제", cause: "서버 · 연결 오류", by: "규칙", basis: "서버 응답 오류 · 연결 끊김 기록" };
  const others = completed(runs).filter((r) => r.id !== run.id && r.planId === run.planId);
  const stOf = (r) => ((r.cases || []).find((x) => x.id === c.id) || {}).st;
  if (/요소를 찾지 못했습니다/.test(m)) {
    if (others.some((r) => r.build === run.build && stOf(r) === "통과")) return { kind: "테스트 문제", cause: "대기 부족 (불안정)", by: "AI", conf: "중간", basis: "같은 앱 v" + run.build + "에서 통과한 실행이 있음 — 화면이 늦게 떠 요소를 못 찾은 것으로 보임" };
    const base = caseNow && caseNow.baseBuild;
    return { kind: "테스트 문제", cause: "요소 변경", by: "AI", conf: "높음", basis: (base && base !== run.build ? "케이스는 앱 v" + base + " 기준 — v" + run.build + " 화면 구조에 찾던 요소가 없고, " : "화면 구조에 찾던 요소가 없고, ") + "비슷한 버튼이 다른 ID로 있음" };
  }
  if (/문구를 찾지 못했습니다/.test(m)) return { kind: "앱 결함 의심", cause: "기대값 불일치", by: "AI", conf: "중간", basis: "화면은 정상으로 떴고 기대한 문구만 다름" };
  return { kind: "확인 필요", cause: "판정 불가", by: "AI", conf: "낮음", basis: "근거가 부족합니다 — 실패 시점 자료를 확인하세요" };
};
const sec = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(1) + "초");
const durOfRun = (r) => { if (r.elapsed) return mmss(r.elapsed); const a = String(r.startedAt || ""), b = String(r.endedAt || ""); const m = (x) => { const t = x.slice(11, 16).split(":"); return +t[0] * 60 + +t[1]; }; return a && b ? (m(b) - m(a)) + "분" : "—"; };
const EV_TABS = ["화면 캡처", "화면 구조", "앱 로그", "실행 로그", "화면 녹화"];
function ResultDetail({ runId, back, backLabel, nav }) {
  const { app, launch } = useRunner();
  const { mqaRuns = [], mqaPlans = [], mqaCases = [] } = app;
  const [msg, flash] = useToast();
  const run = mqaRuns.find((r) => r.id === runId) || mqaRuns[0] || null;
  const [open, setOpen] = useState(null);
  const [etab, setEtab] = useState("화면 캡처");
  if (!run) return <Empty icon={FileText} title="실행 결과가 없습니다" hint="실행 화면에서 계획을 실행하면 여기에서 결과를 봅니다." />;
  const pr = passRate(run);
  const fails = run.cases.filter((c) => c.st === "실패");
  const plan = mqaPlans.find((p) => p.id === run.planId);
  const oc = run.cases.find((c) => c.id === (open || (fails[0] || {}).id)) || run.cases[0] || null;
  const tcNow = (id) => mqaCases.find((c) => c.id === id);
  const rerun = (only) => {
    if (!plan) { flash("계획이 삭제되어 다시 실행할 수 없습니다"); return; }
    const b = planBlock(plan, { systems: app.mqaSystems, cases: mqaCases, runners: app.mqaRunners }, false);
    if (b) { flash(b); return; }
    const cur = casesOfPlan(plan, mqaCases).map((c) => c.id); const ids = (only || fails.map((c) => c.id)).filter((id) => cur.includes(id));
    if (!ids.length) { flash("실패 케이스가 지금 계획 대상에 없습니다 — 승인 상태인지 확인하세요"); return; }
    const id = launch(plan, { only: ids, note: run.id + " 의 실패만 다시" }); flash(id + " 시작 — 실패 " + ids.length + "건"); nav && nav("mqa-run");
  };
  const openCase = (c) => { app.setMqaEditTc(c.id); app.goTo("mqa-cases"); };
  const judged = run.judged || {};
  const confirm = (c, kind) => { app.updateMqaRun(run.id, { judged: { ...judged, [c.id]: kind } }); flash(c.id + " 원인 확정 — " + kind); };
  const addDefect = (c) => { const no = "BUG-" + (1200 + Object.keys(run.defects || {}).length + 1); app.updateMqaRun(run.id, { defects: { ...(run.defects || {}), [c.id]: no } }); flash(no + " 결함 초안 생성 — 실패 화면 · 로그 첨부 (목업)"); };
  const SUM = [["통과", run.cases.filter((c) => c.st === "통과").length, "text-emerald-600"], ["실패", fails.length, fails.length ? "text-red-600" : "text-slate-400"], ["건너뜀", run.cases.filter((c) => c.st === "건너뜀").length, "text-slate-500"], ["소요", durOfRun(run), "text-slate-900"]];
  const j = oc ? judgeOf(run, oc, mqaRuns, tcNow(oc.id)) : null;
  const jk = oc && judged[oc.id];
  const caseLog = (() => { if (!oc) return []; const lg = run.log || []; const i0 = lg.findIndex((l) => l.lv === "TC" && String(l.t).startsWith(oc.id + " ")); if (i0 < 0) return lg; const i1 = lg.findIndex((l, i) => i > i0 && l.lv === "TC"); return lg.slice(i0, i1 < 0 ? lg.length : i1); })();
  const fs = oc && oc.st === "실패" ? oc.steps[oc.failStep - 1 + (oc.preLen || 0)] : null;
  return (
    <div className="space-y-4">
      <PageToolbar desc={<span>{back ? <button onClick={back} className="text-sky-600 hover:underline">{backLabel || "실행 이력"}</button> : "실행 결과"} <span className="text-slate-400">›</span> <span className="font-mono">{run.id}</span></span>}>
        {fails.length > 0 && run.status === "완료" && <Btn kind="primary" icon={RefreshCw} onClick={() => rerun()}>실패만 다시 실행 ({fails.length})</Btn>}
      </PageToolbar>
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
        <span className="font-semibold text-slate-900">{run.planName}</span><Badge kind={RUN_K[run.status]}>{run.status}</Badge>
        <span className="text-xs text-slate-500">{run.sysName} · {run.env} · 앱 v{run.build}</span>
        <span className="text-xs text-slate-500"><Smartphone size={11} className="mr-0.5 inline" />{run.device}</span>
        <span className="text-xs text-slate-500">{run.trigger} · {run.startedAt}{run.retry > 0 ? " · 재시도 " + run.retry + "회" : ""}</span>
        {run.note && <span className="text-xs text-amber-700">{run.note}</span>}
      </Card>
      {run.status === "실행 불가" ? <Card className="p-4 text-sm text-red-700">{run.note}<div className="mt-1 text-xs text-slate-500">예약 시각에 실행 조건을 만족하지 못해 실행하지 않았습니다. 테스트 기기에서 러너 · 단말 상태를 확인하세요.</div></Card> : (<>
      <div className="grid grid-cols-4 gap-3">{SUM.map((k) => <Card key={k[0]} className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div></Card>)}</div>
      {pr != null && <Card className="flex items-center gap-3 p-3 text-sm"><span className={"font-semibold " + (gateOk(run) ? "text-emerald-700" : "text-red-700")}>품질 게이트 {gateOk(run) ? "통과" : "미달"}</span><span className="text-xs text-slate-500">PASS {pr}% · 기준 {run.gate}%</span><div className="h-2 flex-1 rounded bg-slate-100"><div className={"h-2 rounded " + (gateOk(run) ? "bg-emerald-500" : "bg-red-500")} style={{ width: pr + "%" }} /></div></Card>}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">케이스 <span className="text-xs font-normal text-slate-500">{run.cases.length}건</span></div>
          {run.cases.map((c) => { const jc = judgeOf(run, c, mqaRuns, tcNow(c.id)); return (
            <button key={c.id} onClick={() => setOpen(c.id)} className={"w-full border-b border-slate-100 px-4 py-2 text-left text-xs " + (oc && oc.id === c.id ? "bg-sky-50" : "hover:bg-slate-50")}>
              <div className="flex items-center gap-2"><span className="w-14 font-mono text-sky-600">{c.id}</span><span className="flex-1 truncate text-slate-800">{c.name}</span><Badge kind={CASE_K[c.st]}>{c.st}</Badge></div>
              {jc && <div className="mt-1 pl-16"><Badge kind={JUDGE_K[judged[c.id] || jc.kind]}>{judged[c.id] || jc.kind}</Badge>{!judged[c.id] && <span className="ml-1 text-slate-400">{jc.by} 제안</span>}{(run.defects || {})[c.id] && <span className="ml-1 font-mono text-red-700">{run.defects[c.id]}</span>}</div>}
            </button>
          ); })}
        </Card>
        <div className="col-span-8 space-y-3">
          {oc && (<>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2"><span className="font-mono text-sm text-sky-700">{oc.id}</span><span className="text-sm font-semibold text-slate-800">{oc.name}</span><Badge kind={CASE_K[oc.st]}>{oc.st}</Badge>{oc.dur != null && <span className="text-xs text-slate-500">{sec(oc.dur)}</span>}
                <div className="ml-auto"><Btn icon={Code2} onClick={() => openCase(oc)}>케이스 열기</Btn></div></div>
              {fs && <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"><b className="font-medium">{oc.failStep > 0 ? "스텝 " + oc.failStep : "전제조건"} · {fs.act} {fs.name}</b> — {oc.failMsg}{oc.retried ? " · 재시도 " + oc.retried + "회 모두 실패" : ""}
                {tcNow(oc.id) && tcNow(oc.id).status !== "승인" && <div className="mt-1 text-amber-800">이 케이스는 지금 {tcNow(oc.id).status} 상태입니다 — 수정 후 다시 승인해야 실행 대상에 들어갑니다.</div>}</div>}
              {/* 원인 판정 — 규칙 · AI 제안, 담당자 확정 */}
              {j && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">원인 판정</span>
                    <Badge kind={JUDGE_K[jk || j.kind]}>{jk || j.kind}</Badge><span className="text-slate-700">{j.cause}</span>
                    <span className="text-slate-500">{jk ? "· 담당자 확정" : "· " + j.by + " 제안" + (j.conf ? " · 확신 " + j.conf : "")}</span>
                    {!jk && <div className="ml-auto flex items-center gap-1.5"><button onClick={() => confirm(oc, j.kind)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50">확정</button>
                      <select value="" onChange={(e) => e.target.value && confirm(oc, e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-700"><option value="">다른 원인</option>{Object.keys(JUDGE_K).filter((k) => k !== j.kind && k !== "확인 필요").map((k) => <option key={k}>{k}</option>)}</select></div>}
                  </div>
                  <div className="mt-1 text-slate-600">근거: {j.basis}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(jk || j.kind) === "테스트 문제" && <Btn icon={Code2} onClick={() => openCase(oc)}>요소 다시 집기 · 대기 보정</Btn>}
                    {(jk || j.kind) === "앱 결함 의심" && ((run.defects || {})[oc.id] ? <span className="text-red-700">결함 {run.defects[oc.id]} 등록됨</span> : <Btn icon={FileText} onClick={() => addDefect(oc)}>결함 등록 (근거 첨부)</Btn>)}
                    {(jk || j.kind) === "환경 문제" && <Btn icon={RefreshCw} onClick={() => rerun([oc.id])}>이 케이스 다시 실행</Btn>}
                  </div>
                </div>
              )}
              <div className="space-y-0.5">{oc.steps.map((x, i) => (
                <div key={i} className={"flex items-center gap-2 rounded px-2 py-1 text-xs " + (x.st === "실패" ? "bg-red-50" : "")}>
                  <span className="w-5 text-right font-mono text-slate-400">{i < (oc.preLen || 0) ? "전" : i + 1 - (oc.preLen || 0)}</span>
                  {x.st === "통과" ? <CheckCircle2 size={12} className="shrink-0 text-emerald-600" /> : x.st === "실패" ? <XCircle size={12} className="shrink-0 text-red-600" /> : <span className="h-3 w-3 shrink-0 rounded-full border border-slate-300" />}
                  <span className="w-16 shrink-0 text-slate-600">{x.act}</span><span className="flex-1 truncate text-slate-800">{x.name}{x.val ? " \"" + x.val + "\"" : ""}</span>
                  <span className={"w-16 shrink-0 text-right " + (x.st === "실패" ? "text-red-700" : "text-slate-400")}>{x.dur != null ? sec(x.dur) + (x.st === "실패" ? " 초과" : "") : x.st === "실행 안 함" ? "실행 안 함" : ""}</span>
                </div>
              ))}</div>
            </Card>
            {/* 실행 증거 — 실패 시점(실패 케이스) · 마지막 화면(통과 케이스) */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-3">
                <div className="flex">{EV_TABS.map((t) => <button key={t} onClick={() => setEtab(t)} className={"px-2.5 py-2 text-xs " + (etab === t ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-500 hover:text-slate-800")}>{t}</button>)}</div>
                <button onClick={() => flash("목업 — " + oc.id + " " + etab + " 내려받기")} className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-600"><Download size={12} />내려받기</button>
              </div>
              <div className="p-4 text-xs">
                {etab === "화면 캡처" && <div className="flex items-start gap-4"><div className="w-40 shrink-0 rounded-2xl border-4 border-slate-800 bg-white p-1.5"><div className="space-y-1 rounded-xl bg-slate-50 p-1.5">{L.elementsFor(run.build).slice(0, 8).map((el) => <div key={el.key} className="truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">{el.text || el.label}</div>)}</div></div><div className="space-y-1 text-slate-600"><div className="font-medium text-slate-800">{oc.st === "실패" ? "실패 순간 화면" : "마지막 화면"}</div><div>{run.device} · 앱 v{run.build}</div><div className="text-slate-400">목업 화면 — 실제로는 러너가 올린 캡처가 표시됩니다</div></div></div>}
                {etab === "화면 구조" && <pre className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{"<hierarchy rotation=\"0\">\n" + L.elementsFor(run.build).slice(0, 8).map((el) => "  <node class=\"android.widget." + el.cls + "\"" + (el.id ? " resource-id=\"com.example.shop:id/" + el.id + "\"" : "") + (el.acc ? " content-desc=\"" + el.acc + "\"" : "") + (el.text ? " text=\"" + el.text + "\"" : "") + " />").join("\n") + "\n</hierarchy>" + (fs ? "\n\n<!-- 찾던 요소: " + fs.name + " — 이 화면에 없음 -->" : "")}</pre>}
                {etab === "앱 로그" && <pre className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{["I ActivityManager: Displayed com.example.shop/.MainActivity", "I shop.Network: GET /api/products?q=… 200 (184ms)", "I shop.Cart: render cart badge", oc.st === "실패" ? "W shop.UI: view not found in current layout (requested by test)" : "I shop.UI: idle"].join("\n")}</pre>}
                {etab === "실행 로그" && <div className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed">{caseLog.length ? caseLog.map((l, i) => <div key={i} className="flex gap-2"><span className={"w-10 shrink-0 font-semibold " + (LV_K[l.lv] || "text-slate-400")}>{l.lv || "INFO"}</span><span className="text-slate-200">{l.t}</span></div>) : <span className="text-slate-400">이 실행에는 저장된 로그가 없습니다 (샘플 이력)</span>}</div>}
                {etab === "화면 녹화" && <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><Play size={16} className="text-slate-500" /><span className="font-mono text-slate-700">{run.id.toLowerCase()}_{oc.id.toLowerCase()}.mp4</span><span className="text-slate-500">단말 화면 녹화 · 케이스 전체</span></div>}
              </div>
            </Card>
          </>)}
        </div>
      </div></>)}
      <Toast msg={msg} />
    </div>
  );
}
const completed = (runs) => (runs || []).filter((r) => r.status === "완료");
/* 회귀 비교 — 같은 계획의 두 실행을 케이스별로 맞대어 본다 (FQA 와 같은 구성)
   정합 규칙
     · 기본 비교는 '전체 실행' 끼리: 최신 전체 실행(B) ↔ 그 직전 전체 실행(A). '실패만 다시' 같은 부분 실행은 (부분) 표시
     · 부분 실행이 끼면 두 실행에 모두 있는 케이스만 비교 (나머지는 비교 제외로 센다)
     · 비교 조건 차이를 알린다: 앱 버전 변화는 정보, 단말 차이는 주의(단말 때문일 수 있음)
     · 케이스 rev 가 다르면 '케이스 변경' — 결과 변화를 앱 탓으로 단정하지 않는다
     · 퇴행 행에는 결과 화면과 같은 원인 판정(담당자 확정 우선) */
const pctOf = (r) => { const p = passRate(r); return p == null ? "—" : p + "%"; };
function Regression({ nav }) {
  const { mqaRuns = [], mqaPlans = [], mqaCases = [] } = useApp();
  const plansWith = mqaPlans.filter((p) => completed(mqaRuns).filter((r) => r.planId === p.id).length >= 2);
  const [pid, setPid] = useState(plansWith[0] ? plansWith[0].id : (mqaPlans[0] || {}).id);
  const rs = completed(mqaRuns).filter((r) => r.planId === pid);
  const full = rs.filter((r) => !r.partial);
  const defB = full[0] || rs[0]; const defA = full.filter((r) => r !== defB)[0] || rs.filter((r) => r !== defB)[0];
  const [aId, setA] = useState(null); const [bId, setB] = useState(null);
  const A = rs.find((r) => r.id === aId) || defA; const B = rs.find((r) => r.id === bId) || defB;
  const Head = <PageToolbar desc="회귀 비교 · 같은 계획의 두 실행을 케이스별로" />;
  const planSel = <Card className="p-3"><Field label="실행 계획 (비교 맥락)"><Select value={pid || ""} onChange={(e) => { setPid(+e.target.value); setA(null); setB(null); }}>{mqaPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field></Card>;
  if (rs.length < 2 || !A || !B) return <div className="space-y-4">{Head}{planSel}<Card className="p-8 text-center text-sm text-slate-500">이 계획에는 비교할 완료된 실행이 2건 이상 필요합니다 (현재 {rs.length}건).</Card></div>;
  const opt = (r) => r.id + " · v" + r.build + " · " + String(r.startedAt).slice(5) + " · " + pctOf(r) + (r.partial ? " (부분)" : "");
  const part = A.partial || B.partial;
  const ids = part ? A.cases.map((c) => c.id).filter((id) => B.cases.some((c) => c.id === id)) : [...new Set([...A.cases, ...B.cases].map((c) => c.id))];
  const excludedN = part ? new Set([...A.cases, ...B.cases].map((c) => c.id)).size - ids.length : 0;
  const cOf = (r, id) => r.cases.find((c) => c.id === id);
  const stOf = (r, id) => { const c = cOf(r, id); return c && (c.st === "통과" || c.st === "실패") ? c.st : c ? c.st : null; };
  const cls = (a, b) => (!a ? { k: "새 케이스", c: "text-sky-700" } : !b ? { k: "빠짐", c: "text-slate-500" } : a === "통과" && b === "실패" ? { k: "퇴행", c: "text-red-700" } : a === "실패" && b === "통과" ? { k: "개선", c: "text-emerald-700" } : { k: "유지", c: "text-slate-600" });
  const rows = ids.map((id) => { const ca = cOf(A, id), cb = cOf(B, id); return { id, name: (cb || ca).name, a: stOf(A, id), b: stOf(B, id), ra: ca && ca.rev, rb: cb && cb.rev, cb }; });
  const summ = rows.reduce((m, r) => { const k = cls(r.a, r.b).k; m[k] = (m[k] || 0) + 1; return m; }, {});
  const devDiff = String(A.device).split(" — ")[0] !== String(B.device).split(" — ")[0];
  const vK = { "통과": "pass", "실패": "fail", "건너뜀": "draft" };
  const caseNow = (id) => mqaCases.find((c) => c.id === id);
  return (
    <div className="space-y-4">{Head}{planSel}
      <div className="grid grid-cols-2 gap-4">
        {[["A — 기준(baseline)", A, setA, ""], ["B — 비교(target)", B, setB, "border-sky-300"]].map(([t, r, set, cl]) => (
          <Card key={t} className={"p-4 " + cl}><div className="mb-1 text-xs text-slate-500">{t}</div>
            <Select value={r.id} onChange={(e) => set(e.target.value)}>{rs.map((x) => <option key={x.id} value={x.id}>{opt(x)}</option>)}</Select>
            <div className="mt-3 text-4xl font-bold text-slate-900">{pctOf(r)}</div>
            <div className="mt-1 text-xs text-slate-500">앱 v{r.build} · {String(r.device).split(" — ")[0]} · {r.startedAt}{r.partial && <span className="ml-1 text-amber-700">· 부분 실행</span>}</div>
          </Card>
        ))}
      </div>
      {(A.build !== B.build || devDiff || part) && <div className="space-y-1 text-xs">
        {A.build !== B.build && <div className="text-slate-600">ⓘ 앱 v{A.build} → v{B.build} — 버전 변화에 따른 회귀를 봅니다</div>}
        {devDiff && <div className="text-amber-700">⚠ 단말이 다릅니다 ({String(A.device).split(" — ")[0]} → {String(B.device).split(" — ")[0]}) — 결과 차이가 단말 때문일 수 있습니다</div>}
        {part && <div className="text-amber-700">⚠ 부분 실행이 포함되어 두 실행에 모두 있는 케이스만 비교합니다 (비교 제외 {excludedN}건)</div>}
      </div>}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-emerald-600">{summ["개선"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">개선</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-red-600">{summ["퇴행"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">퇴행 (회귀)</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-slate-700">{summ["유지"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">유지</div></Card>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">케이스 회귀 분석 <span className="font-normal text-slate-500">· {A.id} → {B.id}</span></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">ID</th><th className="font-medium">TC</th><th className="font-medium">A</th><th></th><th className="font-medium">B</th><th className="font-medium">변화</th><th className="pr-4 font-medium">원인 판정</th></tr></thead>
          <tbody>
            {rows.map((r) => { const v = cls(r.a, r.b); const revd = r.ra != null && r.rb != null && r.ra !== r.rb; const j = v.k === "퇴행" && r.cb ? judgeOf(B, r.cb, mqaRuns, caseNow(r.id)) : null; const jk = (B.judged || {})[r.id]; return (
              <tr key={r.id} onClick={() => nav && nav("mqa-result-detail", B.id)} title={B.id + " 결과 상세로 이동"} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100 " + (v.k === "퇴행" ? "bg-red-50" : "")}>
                <td className="px-4 py-2.5 font-mono text-xs text-sky-600">{r.id}</td><td className="text-slate-700">{r.name}</td>
                <td className="whitespace-nowrap">{r.a ? <Badge kind={vK[r.a] || "draft"}>{r.a}</Badge> : <span className="text-xs text-slate-500">없음</span>}{r.ra != null && <span className="ml-1.5 font-mono text-[10px] text-slate-500">rev {r.ra}</span>}</td>
                <td className="text-slate-400">→</td>
                <td className="whitespace-nowrap">{r.b ? <Badge kind={vK[r.b] || "draft"}>{r.b}</Badge> : <span className="text-xs text-slate-500">없음</span>}{r.rb != null && <span className="ml-1.5 font-mono text-[10px] text-slate-500">rev {r.rb}</span>}</td>
                <td className={"whitespace-nowrap font-semibold " + v.c}>{v.k}{revd && <span className="ml-1.5 text-[11px] font-normal text-amber-600">· 케이스 변경</span>}</td>
                <td className="pr-4">{j ? <span className="text-xs"><Badge kind={JUDGE_K[jk || j.kind]}>{jk || j.kind}</Badge><span className="ml-1 text-slate-500">{j.cause}{jk ? " · 확정" : " · " + j.by + " 제안"}</span></span> : <span className="text-xs text-slate-400">—</span>}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
/* 불안정 · 지속 실패 판정 — 대시보드와 같은 함수 하나만 쓴다 (두 화면이 같은 케이스를 다르게 분류하면 안 된다)
   · 최근 FLAKY_WINDOW 회의 완료 실행만 본다
   · 같은 앱 버전 안에서 통과/실패가 섞이면 '불안정' — 버전이 바뀐 뒤 계속 실패하면 불안정이 아니라 '지속 실패(회귀)'
   · 연속 2회 이상 실패도 '지속 실패'
   · 담당자가 결과 화면에서 '앱 결함 의심' 으로 확정한 실패가 있으면 '결함' 으로 (불안정에서 뺀다) */
export const FLAKY_WINDOW = 5;
export const caseHistory = (runs) => {
  const m = {};
  completed(runs).slice().reverse().forEach((r) => r.cases.forEach((c) => {
    if (c.st !== "통과" && c.st !== "실패") return;
    (m[c.id] = m[c.id] || { id: c.id, name: c.name, seq: [] }).seq.push({ st: c.st, run: r.id, build: r.build, judged: (r.judged || {})[c.id], defect: (r.defects || {})[c.id] });
  }));
  return Object.values(m).map((h) => {
    const w = h.seq.slice(-FLAKY_WINDOW);
    const f = w.filter((x) => x.st === "실패").length;
    const lastBuild = w.length ? w[w.length - 1].build : "";
    const cur = w.filter((x) => x.build === lastBuild);
    const mixed = [...new Set(w.map((x) => x.build))].some((b) => { const xs = w.filter((x) => x.build === b); return xs.some((x) => x.st === "통과") && xs.some((x) => x.st === "실패"); });
    let trail = 0; for (let i = w.length - 1; i >= 0; i--) { if (w[i].st === "실패") trail++; else break; }
    const regressed = cur.length > 0 && cur.every((x) => x.st === "실패") && w.some((x) => x.build !== lastBuild && x.st === "통과");
    const defect = w.some((x) => x.st === "실패" && x.judged === "앱 결함 의심");
    const kind = defect ? "결함" : trail >= 2 || regressed ? "지속 실패" : mixed ? "불안정" : f ? "실패" : "안정";
    const lastFail = [...w].reverse().find((x) => x.st === "실패");
    return { ...h, w, runs: w.length, fails: f, trail, regressed, kind, lastFail, hasDefect: w.some((x) => x.defect) };
  });
};
const KIND_K = { "불안정": "warn", "지속 실패": "fail", "결함": "fail", "실패": "draft" };
function Flaky({ nav }) {
  const { mqaRuns = [], mqaCases = [], mqaSuites = [], updateMqaCase, updateMqaRun, setMqaEditTc, goTo } = useApp();
  const [msg, flash] = useToast();
  const caseNow = (id) => mqaCases.find((c) => c.id === id);
  const rows = caseHistory(mqaRuns).filter((h) => ["불안정", "지속 실패", "결함"].includes(h.kind)).sort((a, b) => b.fails / b.runs - a.fails / a.runs);
  const flakyN = rows.filter((r) => r.kind === "불안정").length, persistN = rows.filter((r) => r.kind !== "불안정").length;
  const causeOf = (h) => { if (!h.lastFail) return null; const run = mqaRuns.find((r) => r.id === h.lastFail.run); const c = run && run.cases.find((x) => x.id === h.id); const j = run && c ? judgeOf(run, c, mqaRuns, caseNow(h.id)) : null; return j ? { ...j, kind: h.lastFail.judged || j.kind, fixed: !!h.lastFail.judged } : null; };
  const toggleQuar = (h) => { const c = caseNow(h.id); if (!c) return; updateMqaCase(h.id, { quarantined: !c.quarantined }); flash(c.quarantined ? h.id + " 격리 해제 — 다음 실행부터 대상에 들어갑니다" : h.id + " 격리 — 실행 계획 대상에서 빠집니다"); };
  const regDefect = (h) => { const run = mqaRuns.find((r) => r.id === h.lastFail.run); const no = "BUG-" + (1300 + Math.floor(Math.random() * 90)); updateMqaRun(run.id, { defects: { ...(run.defects || {}), [h.id]: no } }); flash(no + " 결함 초안 생성 — " + run.id + " 실패 화면 · 로그 첨부 (목업)"); };
  const suiteOf = (id) => ((mqaSuites.find((x) => x.id === (caseNow(id) || {}).suiteId) || {}).name || "");
  return (
    <div className="space-y-4">
      <PageToolbar desc="불안정(Flaky) · 테스트케이스 기준" />
      <div className="flex flex-wrap items-center gap-3 text-sm"><span className="text-slate-500">최근 실행 {FLAKY_WINDOW}회 기준 (TC별)</span><span className="text-slate-500">·</span><span className="text-amber-700">불안정 {flakyN}건</span><span className="text-red-700">지속 실패 · 결함 {persistN}건</span></div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">TC</th><th className="font-medium">문제 빈도</th><th className="font-medium">유형</th><th className="font-medium">최근 추세</th><th></th></tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">불안정 · 지속 실패로 분류된 TC가 없습니다.</td></tr>}
            {rows.map((h) => { const c = caseNow(h.id) || {}; const j = causeOf(h); const pct = Math.round((h.fails / h.runs) * 100); return (
              <tr key={h.id} className="border-b border-slate-200 text-slate-700 hover:bg-slate-100">
                <td className="px-4 py-3"><div className="font-mono text-xs text-sky-600">{h.id}</div><div className="flex items-center gap-1.5 text-slate-800">{h.name}{c.quarantined && <Badge kind="draft">격리됨</Badge>}</div><div className="text-xs text-slate-500">{suiteOf(h.id)}</div></td>
                <td className="pr-4" style={{ minWidth: 150 }}><div className="mb-0.5 text-xs text-slate-500">실패 {h.fails}/{h.runs}회 · {pct}%</div><div className="h-1.5 rounded bg-slate-100" style={{ width: 130 }}><div className={"h-1.5 rounded " + (h.kind === "불안정" ? "bg-amber-500" : "bg-red-500")} style={{ width: pct + "%" }} /></div></td>
                <td><div className="flex flex-wrap items-center gap-1"><Badge kind={KIND_K[h.kind]}>{h.kind}</Badge>{h.regressed && <Badge kind="info">버전 변경 후</Badge>}{j && <span className="text-xs text-slate-500">{j.cause}{j.fixed ? " · 확정" : " · " + j.by + " 제안"}</span>}</div></td>
                <td><div className="flex items-end gap-1">{h.w.map((x, i) => (<Fragment key={i}>{i > 0 && h.w[i - 1].build !== x.build && <span className="mx-0.5 h-4 w-px bg-slate-300" title={"앱 v" + h.w[i - 1].build + " → v" + x.build} />}<span title={x.run + " · v" + x.build + " · " + x.st} className={"inline-block h-3 w-3 rounded-sm " + (x.st === "통과" ? "bg-emerald-500" : "bg-red-500")} /></Fragment>))}</div><div className="mt-0.5 text-[10px] text-slate-400">{[...new Set(h.w.map((x) => "v" + x.build))].join(" → ")}</div></td>
                <td className="pr-4 text-right whitespace-nowrap">
                  {c.quarantined ? <button onClick={() => toggleQuar(h)} className="mr-3 text-xs text-sky-600 hover:text-sky-700">격리 해제</button>
                    : h.kind === "불안정" ? <button onClick={() => toggleQuar(h)} className="mr-3 text-xs text-amber-700 hover:text-amber-800">격리</button>
                    : h.hasDefect ? <span className="mr-3 text-xs text-slate-500">결함 등록됨</span> : <button onClick={() => regDefect(h)} className="mr-3 text-xs text-red-700 hover:text-red-800">결함 등록</button>}
                  <button onClick={() => { setMqaEditTc(h.id); goTo("mqa-cases"); }} className="text-xs text-sky-600">케이스 열기</button>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </Card>
      <div className="text-xs text-slate-500">판정 기준: 최근 실행 {FLAKY_WINDOW}회를 TC별로 봅니다 · <span className="text-amber-700">같은 앱 버전 안에서 통과/실패 혼재 = 불안정 → 격리</span> · <span className="text-red-700">연속 2회 실패 또는 버전 변경 후 계속 실패 = 지속 실패 → 결함</span> · 담당자가 앱 결함으로 확정한 실패는 결함으로 분류</div>
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ 대시보드 ═══════════ */
export function MqaDashboardScreen({ nav }) {
  const { mqaCases = [], mqaRuns = [], mqaPlans = [], mqaRunners = [] } = useApp();
  const devs = flatDevices(mqaRunners);
  const lastRun = completed(mqaRuns)[0];
  const approved = mqaCases.filter((c) => c.status === "승인").length;
  const unstable = caseHistory(mqaRuns).filter((h) => ["불안정", "지속 실패", "결함"].includes(h.kind));   // 불안정 화면과 같은 함수 · 같은 분류
  const next = mqaPlans.filter((p) => p.status === "활성" && isTimed(p.schedule)).map((p) => ({ p, at: nextRun(p.schedule) })).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
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
