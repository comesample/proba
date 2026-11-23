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
import { Plus, X, Save, Play, Square, ClipboardList, CheckCircle2, XCircle, AlertTriangle, Clock, Smartphone, History, ChevronLeft, RefreshCw, Code2, FileText, Calendar, Activity, GitCompare, Download, Monitor, Zap, TrendingUp, Sparkles, Bug } from "lucide-react";
import { ShareBox, autoAlert } from "../common/ReportShare.jsx";
import { Card, Badge, Btn, Field, Input, Select, Seg, KpiCard, StatusLine, Toast, useToast, PageToolbar, Portal, SEL_CARD, SEL_IDLE, SEL_ROW, nowStamp, RunTime } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import * as L from "./caseLogic.js";
import * as SL from "./suiteLogic.js";
import { openMqaDefect, regMqaDefects } from "./defectLogic.js";
import { isTimed, isOnNewBuild, nextRun } from "../common/scheduleLogic.js";
import * as BV from "./builds.js";
import { flatDevices, deviceBlock, devLabel, osName, runnerState, runnerOfDev } from "./devices.js";
import { envText, DeviceSelect, MockBtn, ReadonlyField } from "./workPickers.jsx";
import { ScheduleConfig } from "../common/ScheduleConfig.jsx";
import { FlakyTable, FLAKY_WINDOW } from "../common/FlakyTable.jsx";
import { JUDGE_K, KIND_BG, kindsOf } from "../common/causeLogic.js";
import * as PF from "./perfLogic.js";
import * as PR from "./perfRun.js";
import { PerfResultView, PerfRunDetail, perfProg } from "./perfResult.jsx";
import { PerfConfig } from "./perfPlan.jsx";
import { PlanDevices } from "./planDevices.jsx";
import { PerfRegression, PerfDashSection } from "./perfAnalysis.jsx";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { C, TOOLTIP } from "../common/theme.js";

/* ── 공통 판단 (계획 화면 · 실행 화면 · 예약 점검이 같은 함수를 쓴다) ── */
export const envOfPlan = (systems, p) => { const sy = (systems || []).find((s) => s.id === p.systemId) || null; const e = sy ? (sy.envs || []).find((x) => x.env === p.env) || null : null; return { sy, e }; };
/* 계획이 쓸 앱 버전 — buildId 가 비면 최신(빌드 번호 최고), 지정했는데 지워졌으면 null (builds.js) */
export const buildOf = (e, buildId) => BV.resolveBuild(e, buildId);
/* 계획 대상 케이스 — 스위트가 정한다 (suiteLogic.js). 실행 가능한 스위트만 통째로
   (대상 건수 · 버전 확인용으로 중복을 뺀다 — 실제 실행은 runItems 의 스위트 순서) */
export const casesOfPlan = (p, cases, suites) => SL.casesOfPlanSuites(p, cases, suites);
const devOf = (runners, id) => flatDevices(runners).find((d) => d.id === id) || null;
/* 🔑 계획의 단말 = 러너 1곳 + 그 러너에 붙은 단말 n대 (기능 · 성능 공통)
   여러 러너에 걸친 선택은 두지 않는다 — 결과 수집 · 점유 · 대기가 러너 하나 안에서 끝난다 (앱의 단말 = 웹의 브라우저) */
export const planDevs = (runners, p) => {
  const runner = (runners || []).find((r) => r.id === p.runnerId) || null;
  const all = runner ? flatDevices([runner]) : [];
  return { runner, all, devs: (p.devIds || []).map((id) => all.find((d) => d.id === id)).filter(Boolean) };
};
export const devsLabel = (devs, runner) => (!devs.length ? "단말 없음" : devs.length === 1 ? devs[0].model : devs[0].model + " 외 " + (devs.length - 1) + "대") + (runner ? " — " + runner.name : "");
/* 실행을 막지 않는 '사용 중' — 편집 세션(예약 실행이 우선) · 다른 실행(러너 대기열로) */
const freeOf = (d, editPreempt, queueOk) => (d.state === "사용 중" && ((editPreempt && /^편집 세션/.test(d.busy || "")) || (queueOk && /^실행 /.test(d.busy || ""))) ? { ...d, state: "사용 가능" } : d);
/* 실행을 막는 사유 — 빈 문자열이면 실행 가능. scheduled=true 면 예약 시각 기준(편집 세션은 끊고 시작)으로 본다.
   editPreempt=true 면 편집 세션이 점유한 단말은 '사용 가능' 으로 본다 (예약 실행이 우선) */
/* queueOk=true: 다른 '실행' 이 단말을 쓰는 중이면 막지 않는다 — 단말 대기열에 들어간다 */
export const planBlock = (p, ctx, scheduled, editPreempt, buildOverride, queueOk = true) => {
  const { e } = envOfPlan(ctx.systems, p);
  if (p.status !== "활성") return "계획이 초안입니다 — 활성으로 바꾼 뒤 실행할 수 있습니다";
  if (!e) return "대상·환경을 찾을 수 없습니다";
  const b = buildOverride || buildOf(e, p.buildId);
  if (!b) return p.buildId ? "계획에 고정한 앱 버전이 삭제되었습니다 — 계획에서 앱 버전을 다시 고르세요" : e.env + " 환경에 앱 설치 파일이 없습니다";
  /* 성능 측정 계획 — 측정 항목 · 지표를 본다. 앱 시작 · 유휴만 재면 스위트가 없어도 된다 */
  if (p.purpose === "성능") { const pb = PF.perfBlock(p.perf || PF.PERF0, casesOfPlan(p, ctx.cases, ctx.suites)); if (pb) return pb; }
  else {
    if (!casesOfPlan(p, ctx.cases, ctx.suites).length) return "조건에 맞는 승인 케이스가 없습니다";
    const mr = SL.missingRoles(p, ctx.suites, ctx.cases, e);
    if (mr.length) return "스위트 '" + mr[0].s.name + "' 의 계정 역할 '" + mr[0].role + "' 이(가) " + e.env + " 환경에 없습니다 — 대상·환경에서 계정을 추가하세요";
  }
  /* 단말 — 러너 1곳 + 단말 n대. 쓸 수 있는 단말이 하나라도 있으면 실행한다 (못 쓰는 단말은 그 회차에서 제외 · 기록) */
  const { runner, all, devs } = planDevs(ctx.runners, p);
  if (!runner) return "러너가 지정되지 않았습니다";
  if (runnerState(runner) !== "연결됨") return "러너(" + runner.name + ")가 연결되어 있지 않습니다";
  if (!all.length) return runner.name + " 에 연결된 단말이 없습니다 — 테스트 기기에서 단말을 연결하세요";
  if (!devs.length) return "단말을 1대 이상 고르세요";
  return devs.some((d) => !deviceBlock(freeOf(d, editPreempt, queueOk), b)) ? "" : deviceBlock(devs[0], b);
};
/* 예약 — 공통 스케줄 설정(FQA 와 같은 컴포넌트)을 쓴다
   schedule = { mode: manual | schedule | event, freq: hourly|daily|weekdays|weekly|monthly|cron, time, dow, dom, cron, tz, active, ev: { newBuild }, summary }
   이벤트는 하나 — '새 버전을 올리면'. 앱 버전을 '최신' 으로 둔 계획만 해당한다(특정 버전으로 고정한 계획은 새 버전과 무관).
   업로드가 PROBA 안에서 일어나므로 고객사 빌드 시스템 연동이 필요 없다 */
export const SCHED0 = { mode: "manual", freq: "daily", time: "02:00", dow: 1, dom: 1, cron: "0 2 * * *", tz: "Asia/Seoul", active: true, ev: {}, summary: "예약 없음" };
export const MQA_EVENTS = [{ key: "newBuild", label: "새 버전을 올리면", desc: "대상·환경에 더 높은 빌드 번호의 앱을 올리면 바로 실행합니다 (앱 버전이 '최신' 인 계획만)", short: "새 버전" }];
export { isTimed, isOnNewBuild, nextRun } from "../common/scheduleLogic.js";   // 다른 앱 화면이 여기서 가져다 쓴다
export const schedText = (s) => (!s || s.mode === "manual" ? "예약 없음" : s.summary || "예약");
const RUN_K = { "대기 중": "info", "실행 중": "warn", "완료": "pass", "중단": "draft", "실행 불가": "fail" };
const CASE_K = { "대기": "draft", "실행 중": "warn", "통과": "pass", "경고": "warn", "실패": "fail", "건너뜀": "draft" };
/* 🔑 회차의 케이스 결과는 '케이스' 기준으로 합친다 — 같은 케이스가 여러 스위트에서 돌 수 있다 (U3)
   하나라도 실패면 실패, 아니면 통과가 있으면 통과, 아니면 건너뜀. 대표 행은 실패 → 통과 → 첫 행 순.
   통과율·회귀·불안정·대시보드는 모두 이 합친 결과를 본다 (로그인 5번 통과가 통과 5건으로 부풀지 않게) */
export const mergedCases = (r) => {
  const m = new Map();
  (r.cases || []).forEach((c) => { const g = m.get(c.id); if (g) g.push(c); else m.set(c.id, [c]); });
  return [...m.values()].map((occ) => { const rep = occ.find((x) => x.st === "실패") || occ.find((x) => x.st === "경고") || occ.find((x) => x.st === "통과") || occ[0]; return { ...rep, occ }; });
};
/* 통과율 — 경고(재시도 통과)는 분모에 넣고 통과로 세지 않는다 (FQA 와 같은 규칙) */
const passRate = (r) => { const cs = mergedCases(r).filter((c) => c.st === "통과" || c.st === "실패" || c.st === "경고"); return cs.length ? Math.round((cs.filter((c) => c.st === "통과").length / cs.length) * 100) : null; };
const resultText = (r) => { const cs = mergedCases(r); const p = cs.filter((c) => c.st === "통과").length; const w = cs.filter((c) => c.st === "경고").length; const f = cs.filter((c) => c.st === "실패").length; const k = cs.filter((c) => c.st === "건너뜀").length; return "통과 " + p + (w ? " · 경고 " + w : "") + " · 실패 " + f + (k ? " · 건너뜀 " + k : ""); };
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
/* 러너별 대기열 — 1단말 1작업. 쓰려는 단말이 다른 실행에 쓰이는 중이면 막지 않고 줄을 세운다 */
const QUEUE = {};   // runnerId → [{ id, args }]
export const queueOf = (runnerId) => (QUEUE[runnerId] || []).map((q) => q.id);
/* 🔑 API 스텝의 loc 은 화면 요소가 아니라 경로·검증 대상이다 — 요소로 풀면 "위치로 지정한 요소" 가 되어
   어느 경로를 쳤는지가 화면에서 사라진다. api 를 먼저 가른다. */
const actName = (s) => { const a = L.ACT[s.act] || { needs: [] };
  if (a.api) return [s.loc, s.val].filter(Boolean).join(" = ");
  return a.needs.includes("loc") ? L.elName(s) : s.act === "화면 확인" ? "\"" + (s.val || "") + "\"" : s.act === "입력" ? "" : s.val || ""; };
const robotRows = (code) => String(code || "").split("\n").filter((l) => /^\s{2,}\S/.test(l)).map((l) => l.trim()).filter((l) => !l.startsWith("#") && !l.startsWith("[")).map((l) => ({ act: l.split(/\s{2,}/)[0], name: l.split(/\s{2,}/).slice(1).join("  "), res: { st: "ok", msg: "" } }));
/* 같은 순간에 여러 실행을 만들 수 있어(새 버전 이벤트) 마지막으로 낸 번호도 함께 본다 */
let LAST_RUN_NO = 0;
const nextRunId = (runs) => { const n = Math.max(LAST_RUN_NO, ...(runs || []).map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10) || 0)) + 1; LAST_RUN_NO = n; return "MRUN-" + String(n).padStart(3, "0"); };
/* 실행 단위 = (스위트, 케이스) — suiteLogic.runItems. 결과를 미리 계산하고 '누가 건너뛰는지' 도 여기서 정한다.
   앞 케이스가 실패하면 같은 스위트의 뒤 케이스는 건너뜀 (앞 단계가 만든 상태 위에서 시작하므로) */
const simBody = (cc, build, env) => (cc.level === "Full-Code" ? robotRows(cc.code) : (cc.steps || []).map((s) => ({ act: s.act, name: actName(s), val: s.act === "입력" ? s.val : "", el: s.el || "", res: L.simulateStep(s, build.ver, env) })));
/* 재시도 통과(경고) — 1차 실패 후 재시도에서 통과하면 '경고'. 실패가 아니므로 뒤 케이스는 이어서 돈다 (FQA 와 같은 규칙)
   목업: 재시도가 있으면 일정 확률로 재시도에서 통과한다고 미리 정한다 */
const planOf = ({ items, build, env, plan }) => {
  const broken = {};
  return items.map((it) => {
    const c = it.c, all = simBody(c, build, env);
    const fi = all.findIndex((x) => x.res.st === "fail");
    const rp = fi >= 0 && plan && plan.retry > 0 && Math.random() < 0.35;
    const p = { it, c, all, pl: 0, fi, rp };
    if (it.skip) p.skip = it.skip;                                   // 시작 전에 정해진 것 (스위트 실행 불가 · 격리)
    else if (broken[it.suiteId]) p.later = broken[it.suiteId];       // 실행 중에 정해지는 것 (앞 단계 실패)
    else if (fi >= 0 && !rp) broken[it.suiteId] = "앞 단계 실패 (" + c.id + ")";
    return p;
  });
};
/* 계정 슬롯 — 여러 단말이 같은 계정으로 동시에 돌면 데이터(장바구니 등)가 꼬인다.
   계획이 쓰는 역할마다 환경의 계정 수를 보고, 그 최솟값만큼만 동시에 돈다 (나머지 단말은 앞 단말이 끝난 뒤 · FQA 병렬과 같은 규칙) */
const acctSlots = (items, env, n) => {
  const roles = [...new Set(items.filter((it) => !it.skip && it.acctRole).map((it) => it.acctRole))];
  if (!roles.length) return n;
  return Math.max(1, Math.min(n, ...roles.map((r) => ((env && env.accts) || []).filter((a) => a.role === r).length || 1)));
};
const caseRows = (plans, dev, multi) => plans.map(({ it, c, all, pl, skip }) => ({ key: (multi ? dev.id + ":" : "") + it.suiteId + ":" + c.id, id: c.id, name: c.name, rev: c.rev || 1, suiteId: it.suiteId, suiteName: it.suiteName, acctRole: it.acctRole,
  devId: dev.id, devModel: dev.model, st: skip ? "건너뜀" : "대기", skipWhy: skip || "", preLen: pl, steps: all.map((x) => ({ act: x.act, name: x.name, val: x.val || "", el: x.el || "", st: skip ? "실행 안 함" : "대기", msg: x.res.msg || "" })) }));
const runHead = (id, { plan, sys, env, build, runner, devs, trigger, note, partial }, status) => ({
  id, ...(plan.purpose === "성능" ? { purpose: "성능" } : {}), planId: plan.id, planName: plan.name, systemId: sys.id, sysName: sys.name, env: env.env, build: build.ver,
  runnerId: runner ? runner.id : "", devIds: devs.map((d) => d.id), devId: devs[0] ? devs[0].id : "", device: devsLabel(devs, runner), trigger, note: note || "",
  status, startedAt: nowStamp(), endedAt: "", gate: plan.gate, retry: plan.retry, elapsed: 0, partial: !!partial, queuedAt: status === "대기 중" ? nowStamp() : "", cases: [], subs: [], log: [] });
/* 러너별 대기열 — 계획이 고른 단말 중 하나라도 다른 실행이 쓰는 중이면 줄을 선다 (러너 단위) */
export function enqueueRun(args) {
  const { runner, api, runs } = args;
  const id = nextRunId(runs);
  api.addMqaRun({ ...runHead(id, args, "대기 중"), log: [{ lv: "INFO", t: "단말 대기 — " + runner.name + " 의 단말이 다른 실행에 사용 중" }] });
  (QUEUE[runner.id] = QUEUE[runner.id] || []).push({ id, args });
  return id;
}
const drain = (runnerId) => { const q = QUEUE[runnerId]; if (!q || !q.length) return; const next = q.shift(); (next.args.plan.purpose === "성능" ? startPerfRun : startRun)({ ...next.args, existingId: next.id }); };
export function startRun(args) {
  const { plan, devs, runner, api, runs, existingId, build, env } = args;
  const id = existingId || nextRunId(runs);
  const multi = devs.length > 1;
  const perDev = devs.map((d) => ({ dev: d, plans: planOf(args) }));      // 단말마다 따로 판정 (재시도 통과는 단말마다 다를 수 있다)
  const cur = runHead(id, args, "실행 중");
  cur.cases = perDev.flatMap(({ dev, plans }) => caseRows(plans, dev, multi));
  const slots = acctSlots(args.items, env, devs.length);
  cur.log = [{ lv: "INFO", t: "러너 " + runner.name + " — 단말 " + devs.map((d) => d.model).join(", ") + (multi && slots < devs.length ? " · 계정이 " + slots + "개라 " + slots + "대씩 동시에" : multi ? " · 동시에" : "") }, { lv: "INFO", t: "앱 v" + build.ver + " 설치 · 데이터 초기화 · 실행" }, ...(args.excluded || []).map((x) => ({ lv: "INFO", t: x.model + " 제외 — " + x.why }))];
  if (existingId) cur.log.unshift({ lv: "INFO", t: "단말이 비어 대기열에서 시작" });
  cur.phase = "앱 설치 · 실행";
  devs.forEach((d) => api.lockMqaDevice(d.id, "실행 " + id));
  if (existingId) api.updateMqaRun(id, JSON.parse(JSON.stringify(cur))); else api.addMqaRun(JSON.parse(JSON.stringify(cur)));
  const push = () => api.updateMqaRun(id, JSON.parse(JSON.stringify({ status: cur.status, startedAt: cur.startedAt, endedAt: cur.endedAt, cases: cur.cases, log: cur.log, elapsed: cur.elapsed, phase: cur.phase })));
  const ev = []; const at = (ms, fn) => ev.push({ at: ms, fn });
  /* 단말 하나의 타임라인 — t0 에서 시작해 끝 시각을 돌려준다. 단말마다 '첫 실패 시 중단' 이 따로 걸린다 */
  const schedule = ({ dev, plans }, base, t0) => {
    let t = t0; let stop = false; let prevSuite = null; const tag = multi ? "[" + dev.model + "] " : "";
    plans.forEach(({ it, c, all, fi, pl, skip, later, rp }, i) => {
      const rc = cur.cases[base + i];
      if (it.suiteId !== prevSuite) {
        prevSuite = it.suiteId;
        at(t, () => { if (stop) return; cur.log.push({ lv: "INFO", t: tag + "스위트 " + it.suiteName + (it.acctRole ? " · 계정 역할 " + it.acctRole : "") + " — 앱 초기화 · 순서대로 이어서 실행" }); });
        t += T.caseStart;
      }
      if (skip) { at(t, () => { if (stop) return; cur.log.push({ lv: "INFO", t: tag + c.id + " 건너뜀 — " + skip }); }); t += 200; return; }
      if (later) { at(t, () => { if (stop) return; rc.st = "건너뜀"; rc.skipWhy = later; rc.steps.forEach((x) => { x.st = "실행 안 함"; }); cur.log.push({ lv: "INFO", t: tag + c.id + " 건너뜀 — " + later }); }); t += 200; return; }
      at(t, () => { if (stop) { rc.st = "건너뜀"; rc.skipWhy = "중단"; return; } rc.st = "실행 중"; cur.phase = tag + c.id + (i > 0 && plans[i - 1].it.suiteId === it.suiteId ? " — 앞 케이스에서 이어서" : " 시작"); cur.log.push({ lv: "TC", t: tag + c.id + " " + c.name }); });
      t += 300;
      const last = fi >= 0 ? fi : all.length - 1;
      for (let j = 0; j <= last; j++) {
        const jj = j, x = all[j];
        at(t, () => { if (stop) return; rc.steps[jj].st = "실행 중"; cur.phase = tag + c.id + " · 스텝 " + (jj < pl ? "전" : jj + 1 - pl); cur.log.push({ lv: "STEP", t: tag + x.act + (x.name ? " · " + x.name : "") + (x.val ? " \"" + x.val + "\"" : "") }); });
        t += T.step;
        const dur = x.res.st === "fail" ? 10000 : 700 + ((jj * 337 + i * 191) % 900);   // 목업 소요: 실패는 대기 초과(10초)
        at(t, () => { if (stop) return; rc.steps[jj].st = x.res.st === "fail" ? "실패" : "통과"; rc.steps[jj].dur = dur; rc.dur = (rc.dur || 0) + dur; });
      }
      if (fi >= 0 && plan.retry > 0) {
        at(t, () => { if (stop) return; cur.log.push({ lv: "RETRY", t: tag + c.id + " 실패 → 스위트 " + it.suiteName + " 를 처음부터 재시도 (" + plan.retry + "회)" + (rp ? " — 재시도에서 통과" : "") }); });
        t += (T.caseStart + T.step * (last + 1)) * plan.retry;
      }
      t += T.caseEnd;
      at(t, () => {
        if (stop) return;
        for (let j = last + 1; j < rc.steps.length; j++) rc.steps[j].st = "실행 안 함";
        if (fi < 0) { rc.st = "통과"; cur.log.push({ lv: "PASS", t: tag + c.id + " 통과" }); return; }
        if (rp) { rc.steps.forEach((x) => { x.st = "통과"; }); rc.st = "경고"; rc.retried = plan.retry; rc.warnMsg = "1차 실패 후 재시도에서 통과 — " + all[fi].res.msg; cur.log.push({ lv: "WARN", t: tag + c.id + " 재시도 통과 (불안정 신호)" }); return; }
        rc.st = "실패"; rc.failStep = fi + 1 - pl; /* 에디터 스텝 번호와 맞춘다 */ rc.failMsg = all[fi].res.msg; rc.retried = plan.retry > 0 ? plan.retry : 0;
        cur.log.push({ lv: "FAIL", t: tag + c.id + " 실패 — 스텝 " + (fi + 1 - pl) + " · " + all[fi].res.msg + (rc.retried ? " (재시도 " + rc.retried + "회 후)" : "") });
        if (plan.onfail === "첫 실패 시 중단") stop = true;
      });
    });
    return t;
  };
  /* 계정 슬롯만큼 동시에 — k 번째 단말은 (k - slots) 번째 단말이 끝난 뒤 시작 */
  const ends = []; let base = 0, tEnd = 0;
  perDev.forEach((pd, k) => { const t0 = k < slots ? T.install : ends[k - slots]; if (k >= slots) at(t0, () => cur.log.push({ lv: "INFO", t: "[" + pd.dev.model + "] 계정이 비어 시작" })); ends[k] = schedule(pd, base, t0); base += pd.plans.length; tEnd = Math.max(tEnd, ends[k]); });
  ev.sort((a, b) => a.at - b.at);
  const rowPlans = perDev.flatMap((pd) => pd.plans);
  at(tEnd + T.end, () => {
    cur.cases.forEach((rc) => { if (rc.st === "대기") { rc.st = "건너뜀"; rc.skipWhy = rc.skipWhy || "중단"; } });
    cur.status = "완료"; cur.phase = ""; cur.endedAt = nowStamp(); cur.log.push({ lv: "INFO", t: "완료 · 단말 반납" });
    /* 원인을 지금 박는다 — 이 시점의 이력으로 판단하고, 이후 실행이 과거를 바꾸지 못하게 한다 */
    cur.cases.filter((rc) => rc.st === "실패" && !rc.cause).forEach((rc) => {
      const j = judgeOf(cur, rc, api.mqaRuns || [], (api.mqaCases || []).find((x) => x.id === rc.id));
      if (j) rc.cause = j;
    });
    /* 로케이터 보정 제안 — '요소 변경' 일 때만, 실행한 그 케이스(리비전)의 실패 스텝으로 계산해 함께 박는다 (L.healFor) */
    cur.cases.forEach((rc, i) => {
      const c = rowPlans[i] && rowPlans[i].c;
      if (rc.st !== "실패" || !rc.cause || rc.cause.cause !== "요소 변경" || !c || c.level === "Full-Code") return;
      const h = L.healFor((c.steps || [])[rc.failStep - 1], build.ver);
      if (h) rc.heal = { ...h, stepNo: rc.failStep, rev: c.rev || 1, st: "검토 대기" };
    });
    /* 정식 실행에서 통과한 버전은 '확인된 버전' 이 된다 — 디버그로 다시 확인하라고 하지 않는다 (builds.js) */
    cur.cases.filter((rc) => rc.st === "통과" || rc.st === "경고").forEach((rc) => { const c = (api.mqaCases || []).find((x) => x.id === rc.id); if (c && !BV.isVerified(c, build.ver)) api.updateMqaCase(rc.id, { verifiedOn: BV.withVerified(c, build.ver) }); });
    devs.forEach((d) => api.releaseMqaDevice(d.id));
    if (api.notify) { const mc = mergedCases(cur), p = mc.filter((x) => x.st === "통과").length, f = mc.filter((x) => x.st === "실패").length; api.notify({ icon: "play", text: plan.name + " 완료 — 통과 " + p + " / 실패 " + f, to: { domain: "MQA", view: "mqa-result-detail", run: id } }); }
    runAlert(cur, api);
  });
  /* 가상 시계 — 100ms 마다 SPEED 배로 흐른다 */
  let v = 0, tick = 0;
  const iv = setInterval(() => {
    v += 100 * SPEED; cur.elapsed = v; tick++;
    let any = false;
    while (ev.length && ev[0].at <= v) { ev.shift().fn(); any = true; }
    if (any || tick % 5 === 0 || !ev.length) push();   // 화면 갱신은 변화가 있을 때 + 0.5초마다(경과 시간)
    if (!ev.length) { clearInterval(iv); delete RUN_TIMERS[id]; drain(runner.id); }
  }, 100);
  RUN_TIMERS[id] = { iv, devs: devs.map((d) => d.id), runnerId: runner.id };
  return id;
}
/* 자동 알림 — 공통 '리포트 · 알림' 의 채널 · 발송 조건을 그대로 따른다
   조건: always 항상 / fail 실패가 있을 때 / drop 회귀(직전 전체 실행 대비 퇴행)가 있을 때 */
function runAlert(run, api) {
  if (!api.reportCfg || !api.addReportHist) return;
  const fails = mergedCases(run).filter((c) => c.st === "실패");
  const prev = run.partial ? null : (api.mqaRuns || []).filter((r) => r.status === "완료" && r.planId === run.planId && !r.partial && r.id !== run.id)[0];
  const reg = prev ? fails.filter((c) => (mergedCases(prev).find((x) => x.id === c.id) || {}).st === "통과") : [];
  const causeTxt = reg.map((c) => { const j = judgeOf(run, c, [run, ...(api.mqaRuns || [])], (api.mqaCases || []).find((x) => x.id === c.id)); return c.id + (j ? " " + j.cause : ""); }).join(", ");
  const pr = passRate(run);
  autoAlert({ reportCfg: api.reportCfg, addReportHist: api.addReportHist, domain: "MQA", hasFail: fails.length > 0, hasReg: reg.length > 0,
    text: run.planName + " " + run.id + " 완료 — " + (reg.length ? "퇴행 " + reg.length + "건 (" + causeTxt + ")" : "실패 " + fails.length + "건") + (pr != null ? " · PASS " + pr + "%" : "") });
}
/* ── 성능 측정 실행 (목업) — 러너 1곳의 단말 n대에서 동시에: 설치 · 조건 맞추기 → 항목별 반복 측정 → 집계 · 판정
   실행 · 대기 · 점유 규칙은 기능 실행과 같다 (1단말 1작업 · 러너별 대기열).
   같은 PC 의 다른 단말은 잡지 않는다 — 시작 시간 · 프레임 · 메모리 · CPU 는 단말 안에서 재는 값이라 PC 부하에 거의 흔들리지 않는다 */
const PERF_TIMERS = {};
const P_SETUP = 2500, P_STEP = 450;
export function startPerfRun({ plan, sys, env, build, trigger, api, runs, ctx, runner, devs, excluded, existingId }) {
  const id = existingId || nextRunId(runs);
  const perf = { ...PF.PERF0, ...(plan.perf || {}), cond: { ...PF.PERF_COND0, ...((plan.perf || {}).cond || {}) } };
  const cs = casesOfPlan(plan, ctx.cases, ctx.suites);
  const items = PF.itemKeys(perf, cs).filter((it) => it.kind !== "app");
  const all = flatDevices(ctx.runners);
  const subs = [...devs.map((d) => ({ d, why: "" })), ...(excluded || []).map((x) => ({ d: x.d, why: x.why }))].map(({ d, why }, k) => {
    return { devId: d.id, model: d.model, tier: d.tier || "", sdk: d.sdk, runnerId: d.runnerId, runner: d.runnerName, power: !!d.power, st: why ? "실행 불가" : "대기", why, batt: 52 + ((k * 17 + 11) % 44), temp: Math.round((31 + ((k * 7) % 5) * 0.8) * 10) / 10, items: [], prog: 0, total: items.length * (perf.cond.iters + perf.cond.warmup) };
  });
  const cur = { id, purpose: "성능", planId: plan.id, planName: plan.name, systemId: sys.id, sysName: sys.name, env: env.env, build: build.ver, trigger, status: "실행 중", startedAt: nowStamp(), endedAt: "", elapsed: 0, phase: "설치 · 조건 맞추기",
    runnerId: runner.id, devIds: devs.map((d) => d.id), device: devsLabel(devs, runner), devId: devs[0] ? devs[0].id : "", perf, cond: perf.cond, cases: [], subs, app: null,
    log: [{ lv: "INFO", t: "성능 측정 — 단말 " + subs.length + "대 · 항목 " + items.length + "개 · 반복 " + perf.cond.iters + "회 (첫 " + perf.cond.warmup + "회 버림)" }, ...subs.filter((x) => x.st === "실행 불가").map((x) => ({ lv: "FAIL", t: x.model + " 실행 불가 — " + x.why }))] };
  if (existingId) { cur.log.unshift({ lv: "INFO", t: "단말이 비어 대기열에서 시작" }); api.updateMqaRun(id, JSON.parse(JSON.stringify(cur))); } else api.addMqaRun(JSON.parse(JSON.stringify(cur)));
  const locked = devs;
  locked.forEach((d) => api.lockMqaDevice(d.id, "실행 " + id + " (성능 측정)"));
  const push = () => api.updateMqaRun(id, JSON.parse(JSON.stringify({ status: cur.status, endedAt: cur.endedAt, elapsed: cur.elapsed, phase: cur.phase, subs: cur.subs, app: cur.app, log: cur.log, verdict: cur.verdict })));
  let v = 0, tick = 0;
  const finishSub = (sub) => {
    const dev = all.find((d) => d.id === sub.devId) || sub;
    /* 사용 흐름 항목 — 케이스가 측정 중 실패하면(요소를 못 찾는 등) 그 구간 값은 내지 않는다 ('측정 실패') */
    const failOf = (it) => { if (it.kind !== "case") return null; const c = (ctx.cases || []).find((x) => x.id === it.key); if (!c) return null; const body = simBody(c, build, env); const fi = body.findIndex((x) => x.res.st === "fail"); return fi >= 0 ? "케이스 실패 — 스텝 " + (fi + 1) + " · " + body[fi].res.msg : null; };
    sub.items = items.map((it) => { const ms = PF.metricsFor(perf, it.kind); const fail = failOf(it); const m = PR.measureItem(it, ms, { ...dev, tier: sub.tier, power: sub.power, sdk: sub.sdk }, perf.cond, {}, Math.random, { fail }); const j = fail ? { over: [], judged: false } : PR.judgeItem(perf, it.key, m.vals);
      return { key: it.key, label: it.label, kind: it.kind, vals: m.vals, iters: m.iters, cv: m.cv, phases: m.phases, jankCause: m.jankCause, fail: m.fail || null, over: j.over, judged: j.judged, trace: PR.traceName(id, sub, it) }; });
    sub.st = "완료"; sub.prog = sub.total;
    const ov = sub.items.reduce((n, it) => n + it.over.length, 0); const fl = sub.items.filter((it) => it.fail).length;
    cur.log.push({ lv: ov || fl ? "FAIL" : "PASS", t: sub.model + " 측정 완료 — " + (ov ? "기준 초과 " + ov + "건" : "기준 이내") + (fl ? " · 측정 실패 " + fl + "건 (케이스 실패)" : "") });
  };
  const iv = setInterval(() => {
    v += 100 * SPEED; cur.elapsed = v; tick++;
    cur.subs.forEach((sub) => {
      if (sub.st === "대기" && v >= P_SETUP) {
        /* 환경 검사 — 배터리 하한 · 온도 상한. 걸리면 '환경 오류' (불합격 아님) */
        if (sub.batt < perf.cond.minBatt) { sub.st = "환경 오류"; sub.why = "배터리 " + sub.batt + "% — 하한 " + perf.cond.minBatt + "% 미만"; cur.log.push({ lv: "INFO", t: sub.model + " 환경 오류 — " + sub.why }); return; }
        sub.st = "실행 중"; cur.log.push({ lv: "INFO", t: sub.model + " 조건 맞춤 — " + (perf.cond.clearData ? "데이터 초기화 · " : "") + perf.cond.compile + " · 배터리 " + sub.batt + "% · " + sub.temp + "℃" });
      }
      if (sub.st === "실행 중") { sub.prog = Math.min(sub.total, Math.floor((v - P_SETUP) / P_STEP)); if (sub.prog >= sub.total) finishSub(sub); }
    });
    const live = cur.subs.find((x) => x.st === "실행 중");
    if (live) { const per = perf.cond.iters + perf.cond.warmup; const it = items[Math.min(items.length - 1, Math.floor(live.prog / per))]; cur.phase = (it ? it.label : "") + " · " + ((live.prog % per) + 1) + "/" + per + "회"; }
    const done = cur.subs.every((x) => x.st !== "대기" && x.st !== "실행 중");
    if (done) {
      clearInterval(iv); delete PERF_TIMERS[id];
      if ((perf.metrics || []).includes("size")) cur.app = PR.appSize(perf, build.ver);
      cur.status = "완료"; cur.phase = ""; cur.endedAt = nowStamp(); cur.verdict = PR.runVerdict(cur);
      cur.log.push({ lv: "INFO", t: "완료 · 단말 반납 — " + cur.verdict });
      push();
      locked.forEach((d) => api.releaseMqaDevice(d.id)); drain(runner.id);
      if (api.notify) api.notify({ icon: "play", text: plan.name + " 성능 측정 완료 — " + cur.verdict + (PR.overCount(cur) ? " (기준 초과 " + PR.overCount(cur) + "건)" : ""), to: { domain: "MQA", view: "mqa-result-detail", run: id } });
      return;
    }
    if (tick % 5 === 0) push();
  }, 100);
  PERF_TIMERS[id] = { iv, locked, runnerId: runner.id };
  return id;
}
function stopPerfRun(run, api) {
  if (run.status === "대기 중") return cancelQueued(run, api);
  const t = PERF_TIMERS[run.id]; if (t) clearInterval(t.iv); delete PERF_TIMERS[run.id];
  api.updateMqaRun(run.id, { status: "중단", phase: "", endedAt: nowStamp(), subs: (run.subs || []).map((x) => (x.st === "대기" || x.st === "실행 중" ? { ...x, st: "중단" } : x)), log: [...(run.log || []), { lv: "INFO", t: "사용자가 중단 · 단말 반납" }] });
  (t ? t.locked : []).forEach((d) => api.releaseMqaDevice(d.id)); drain(run.runnerId);
}
export function stopRun(run, api) {
  if (run.purpose === "성능") return stopPerfRun(run, api);
  if (run.status === "대기 중") return cancelQueued(run, api);
  const tm = RUN_TIMERS[run.id]; if (tm) clearInterval(tm.iv); delete RUN_TIMERS[run.id];
  api.updateMqaRun(run.id, { status: "중단", phase: "", endedAt: nowStamp(), cases: run.cases.map((c) => (c.st === "대기" || c.st === "실행 중" ? { ...c, st: "건너뜀" } : c)), log: [...(run.log || []), { lv: "INFO", t: "사용자가 중단 · 단말 반납" }] });
  (run.devIds || [run.devId]).forEach((d) => api.releaseMqaDevice(d));
  drain(run.runnerId);
}
/* 대기열에서 빼기 — 러너별 대기열 */
function cancelQueued(run, api) {
  const q = QUEUE[run.runnerId] || []; QUEUE[run.runnerId] = q.filter((x) => x.id !== run.id);
  api.updateMqaRun(run.id, { status: "중단", endedAt: nowStamp(), log: [...(run.log || []), { lv: "INFO", t: "대기 중 취소" }] });
}
/* 실행 시작 — 계획 · 실패만 다시 · 예약이 모두 이 함수를 지난다 */
const useRunner = () => {
  const app = useApp();
  const ctx = { systems: app.mqaSystems || [], cases: app.mqaCases || [], suites: app.mqaSuites || [], runners: app.mqaRunners || [] };
  const launch = (plan, { trigger = "수동", only, note, build } = {}) => {
    const { sy, e } = envOfPlan(ctx.systems, plan);
    const b = build || buildOf(e, plan.buildId);
    const { runner, devs: picked } = planDevs(ctx.runners, plan);
    /* 편집 세션이 잡은 단말은 자동 실행이면 끊고 쓴다. 못 쓰는 단말은 이번 회차에서 제외(기록), 다른 실행이 쓰는 단말은 대기열 */
    if (trigger !== "수동") picked.filter((d) => d.state === "사용 중" && /^편집 세션/.test(d.busy || "")).forEach((d) => app.releaseMqaDevice(d.id));
    const usable = picked.filter((d) => !deviceBlock(freeOf(d, trigger !== "수동", true), b));
    const excluded = picked.filter((d) => !usable.includes(d)).map((d) => ({ d, model: d.model, why: deviceBlock(d, b) }));
    const items = plan.purpose === "성능" ? [] : SL.runItems(plan, ctx.cases, ctx.suites, only);   // (스위트, 케이스) 순서 — '실패만 다시' 는 그 스위트를 처음부터
    const args = { plan, items, sys: sy, env: e, build: b, runner, devs: usable, excluded, trigger, note, partial: !!only, api: app, runs: app.mqaRuns, ctx };
    if (usable.some((d) => d.state === "사용 중" && /^실행 /.test(d.busy || ""))) return enqueueRun(args);   // 다른 실행이 쓰는 중 → 러너 대기열
    return plan.purpose === "성능" ? startPerfRun(args) : startRun(args);
  };
  /* 자동 실행(예약 · 새 버전) — 그 순간의 상태로 판단한다. 편집 세션은 끊고 시작, 그 밖의 문제는 건너뛰지 않고 '실행 불가' 로 기록 */
  const autoRun = (p, trigger, build) => {
    const blk = planBlock(p, ctx, true, true, build, true);
    if (blk) {
      const { sy, e } = envOfPlan(ctx.systems, p); const bd = build || buildOf(e, p.buildId); const pdv = planDevs(ctx.runners, p);
      app.addMqaRun({ id: nextRunId(app.mqaRuns), ...(p.purpose === "성능" ? { purpose: "성능" } : {}), planId: p.id, planName: p.name, systemId: p.systemId, sysName: sy ? sy.name : "", env: p.env, build: bd ? bd.ver : "", runnerId: p.runnerId, devIds: p.devIds || [], devId: (p.devIds || [])[0] || "", device: devsLabel(pdv.devs, pdv.runner), subs: [], trigger, status: "실행 불가", startedAt: nowStamp(), endedAt: nowStamp(), gate: p.gate, note: blk, cases: [], log: [{ lv: "FAIL", t: "실행 불가 — " + blk }] });
      return { blocked: blk };
    }
    const ed = planDevs(ctx.runners, p).devs.find((d) => /^편집 세션/.test(d.busy || ""));
    const pre = ed ? ed.busy + " 을(를) 종료하고 시작" : "";
    return { id: launch(p, { trigger, note: pre, build }), pre };
  };
  return { app, ctx, launch, autoRun };
};
export { useRunner };

const Empty = ({ icon: Icon, title, hint, children }) => (
  <Card className="flex flex-col items-center justify-center py-14 text-center"><Icon size={26} className="text-slate-400" /><div className="mt-3 text-sm font-medium text-slate-700">{title}</div>{hint && <div className="mt-1.5 max-w-md text-xs text-slate-500">{hint}</div>}{children}</Card>
);

/* ═══════════ 실행 계획 ═══════════ */
/* purpose — 기능 검증 | 성능 측정. 만든 뒤에는 바꾸지 않는다 (이력 · 추이가 섞이지 않게 — 대상 앱 · 환경과 같은 규칙) */
const P0 = (sys) => ({ name: "", purpose: "기능", systemId: sys ? sys.id : 0, env: sys && sys.envs[0] ? sys.envs[0].env : "", buildId: "", suiteIds: [], runnerId: "", devIds: [], retry: 1, onfail: "계속 진행", gate: 90, status: "초안", schedule: SCHED0, perf: PF.PERF0 });
const PLAN_KEYS = ["name", "purpose", "systemId", "env", "buildId", "suiteIds", "runnerId", "devIds", "retry", "onfail", "gate", "status", "schedule", "perf"];
/* 스케줄은 의미 있는 값만 비교한다 — 공통 스케줄 컴포넌트는 처음 그릴 때(개발 모드의 StrictMode 재실행 포함)
   ev 를 { newBuild: false } 처럼 채워 내보내므로, 원본 {} 와 글자 그대로 비교하면 바꾸지 않아도 '미저장 변경' 이 뜬다 */
const normSched = (s) => { const x = { ...SCHED0, ...(s || {}) }; return { mode: x.mode, freq: x.freq, time: x.time, dow: +x.dow, dom: +x.dom, cron: x.cron, tz: x.tz, active: x.active !== false, newBuild: !!(x.ev && x.ev.newBuild) }; };
const pickPlan = (p) => Object.fromEntries(PLAN_KEYS.map((k) => [k, p[k]]));
const cmpPlan = (p) => JSON.stringify(Object.fromEntries(PLAN_KEYS.map((k) => [k, k === "schedule" ? normSched(p[k]) : p[k]])));
export function MqaPlanScreen() {
  const { mqaPlans = [], addMqaPlan, updateMqaPlan, removeMqaPlan, mqaSystems = [], mqaSuites = [], mqaCases = [], mqaRunners = [], mqaRuns = [], setNavGuard, goTo } = useApp();
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
    if (nf.purpose !== "성능" && !nf.suiteIds.length) { flash("스위트를 1개 이상 고르세요"); return; }
    const id = Math.max(0, ...mqaPlans.map((x) => x.id)) + 1;
    addMqaPlan({ ...P0(mqaSystems[0]), ...nf, name: nf.name.trim(), id }); setSelId(id); setD(null); setAddOpen(false);
    flash(nf.name.trim() + " 계획 생성 (초안) — " + (nf.purpose === "성능" ? "러너 · 단말 · 측정 항목 · 지표를 정하세요" : "러너 · 단말을 지정하세요"));
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
            <Field label="목적" hint="만든 뒤에는 바꿀 수 없습니다">
              <div className="grid grid-cols-2 gap-2">{[["기능", "기능 검증", "케이스가 통과하는지"], ["성능", "성능 측정", "시작 시간 · 프레임 · 메모리 등을 반복 측정"]].map(([k, t, ds]) => (
                <button key={k} onClick={() => setNf({ ...nf, purpose: k })} className={"rounded-lg border px-3 py-2 text-left " + (nf.purpose === k ? "border-sky-500 bg-sky-100" : "border-slate-300 bg-slate-100 hover:bg-slate-200")}><div className={"text-xs font-medium " + (nf.purpose === k ? "text-sky-700" : "text-slate-800")}>{t}</div><div className="mt-0.5 text-xs text-slate-500">{ds}</div></button>
              ))}</div>
            </Field>
            <Field label="대상 앱 · 환경" hint="만든 뒤에는 바꿀 수 없습니다 — 다른 환경은 새 계획으로 만드세요">
              <Select value={nf.systemId + "|" + nf.env} onChange={(e) => { const [s, en] = e.target.value.split("|"); setNf({ ...nf, systemId: +s, env: en }); }}>
                {mqaSystems.flatMap((sy) => sy.envs.map((en) => <option key={sy.id + en.env} value={sy.id + "|" + en.env}>{sy.name} · {en.env}</option>))}
              </Select>
            </Field>
            <Field label={"스위트 (다중 선택)" + (nf.purpose === "성능" ? " — 앱 시작 · 유휴만 잴 거면 비워도 됩니다" : "")}><SuitePick suites={mqaSuites.filter((s) => s.systemId === nf.systemId)} value={nf.suiteIds} onChange={(v) => setNf({ ...nf, suiteIds: v })} /></Field>
            <div className="text-xs text-slate-500">초안으로 만들어집니다 — {nf.purpose === "성능" ? "러너 · 단말 · 측정 항목 · 지표 · 합격 기준" : "러너 · 단말 · 예약"}은 상세에서 정합니다.</div>
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
  const b = buildOf(e, d.buildId);
  const builds = BV.buildsOf(e);
  const cs = casesOfPlan(d, mqaCases, mqaSuites);
  const allDevs = flatDevices(mqaRunners);
  const sched = d.schedule || SCHED0;
  const scheduled = isTimed(sched) || isOnNewBuild(sched);
  const blk = planBlock({ ...d, status: "활성" }, { systems: mqaSystems, cases: mqaCases, suites: mqaSuites, runners: mqaRunners }, scheduled, true);
  /* 실행 전에 알 수 있는 위험 — 막지 않고 알린다 */
  /* 이 버전에서 확인된 적 없는 케이스 — 만든 버전 · 디버그 통과 · 정식 실행 통과 어느 것도 아님 (builds.js isVerified) */
  const verOff = b ? cs.filter((c) => !BV.isVerified(c, b.ver)) : [];
  const caution = e && e.prod ? cs.filter((c) => c.prodCaution) : [];
  /* 실행 못 하는 스위트와 이유 — 🔴 조용히 빼지 않는다 (중간 하나가 빠지면 흐름이 끊기므로 통째로 막힌다) */
  const notes = SL.planSuiteNotes(d, mqaSuites, mqaCases);
  return (
    <div className="space-y-4">{Head}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setNf(P0(mqaSystems[0])); setAddOpen(true); }}>새 실행 계획</Btn>
          {mqaPlans.map((p) => { const ps = envOfPlan(mqaSystems, p); const pd = planDevs(mqaRunners, p); return (
            <Card key={p.id} className={"cursor-pointer p-3 " + (sel.id === p.id ? SEL_CARD : SEL_IDLE)}>
              <div onClick={() => choose(p)}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{p.name}</span><div className="flex items-center gap-1.5"><Badge kind={p.purpose === "성능" ? "active" : "info"}>{p.purpose === "성능" ? "성능" : "기능"}</Badge><Badge kind={p.status === "활성" ? "pass" : "draft"}>{p.status}</Badge><button onClick={(ev) => { ev.stopPropagation(); del(p); }} className="text-slate-500 hover:text-red-600" title="계획 삭제"><X size={13} /></button></div></div>
                <div className="mt-1 text-xs text-slate-500">{ps.sy ? ps.sy.name : "—"} · {p.env}</div>
                <div className="mt-0.5 text-xs text-slate-500">{pd.runner ? devsLabel(pd.devs, pd.runner) : "러너 미지정"} · {schedText(p.schedule)}</div>
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
              <Field label="목적 · 대상 앱 · 환경"><ReadonlyField value={(d.purpose === "성능" ? "성능 측정" : "기능 검증") + " · " + (sy ? sy.name : "—") + " · " + d.env + (e && e.prod ? " (운영)" : "")} title="만든 뒤에는 바꿀 수 없습니다 — 다른 목적 · 환경은 새 계획으로 만드세요" /></Field>
              <Field label="테스트할 앱 버전" hint="최신 = 빌드 번호가 가장 높은 버전">
                <Select value={d.buildId || ""} onChange={(ev) => set({ buildId: ev.target.value })}>
                  <option value="">{BV.buildLabel(e, "")}</option>
                  {builds.map((x) => <option key={x.id} value={x.id}>v{x.ver} ({x.code})</option>)}
                  {d.buildId && !builds.some((x) => x.id === d.buildId) && <option value={d.buildId}>삭제된 버전</option>}
                </Select>
              </Field>
              <Field label="스위트 (다중 선택)"><SuitePick suites={mqaSuites.filter((s) => s.systemId === d.systemId)} value={d.suiteIds} onChange={(v) => set({ suiteIds: v })} /></Field>
              <div className={"rounded-lg border px-3 py-2 text-xs " + (cs.length ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700")}>
                {cs.length ? <>대상 케이스 <b className="font-semibold text-sky-700">{cs.length}건</b> <span className="font-mono text-slate-500">{cs.map((c) => c.id).join(", ")}</span></> : d.purpose === "성능" ? "스위트 없음 — 앱 시작 · 유휴만 잽니다" : "조건에 맞는 승인 케이스가 없습니다 — 실행해도 0건입니다"}
                {notes.filter((n) => n.block).map((n) => <div key={n.s.id} className="mt-0.5 text-amber-700">{n.s.name} 실행 불가 — {n.block}</div>)}
              </div>
              {verOff.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={12} className="mr-1 inline" />{verOff.length}건은 v{b.ver}에서 아직 확인되지 않았습니다(다른 버전에서 만들고, 이 버전에서 통과한 적 없음) — 요소를 못 찾을 수 있습니다 <span className="font-mono">{verOff.map((c) => c.id).join(", ")}</span></div>}
              {caution.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ 운영 환경에 운영주의 {caution.length}건이 포함됩니다 — 실데이터를 바꿀 수 있습니다</div>}
            </div>
            {/* 어디서 · 어떻게 · 언제 */}
            <div className="space-y-3.5">
              <div className="text-xs font-semibold text-slate-500">어디서 · 어떻게</div>
              <PlanDevices runners={mqaRunners} runnerId={d.runnerId} devIds={d.devIds} onChange={(v) => set(v)} onGoDevices={() => goTo("mqa-devices")} perf={d.purpose === "성능"} />
              {d.purpose === "성능" ? <PerfConfig perf={d.perf} onChange={(v) => set({ perf: v })} devs={allDevs.filter((x) => (d.devIds || []).includes(x.id))} cases={cs} hasSuites={(d.suiteIds || []).length > 0} runs={mqaRuns} planId={d.__id} /> : (<>
              <div className="grid grid-cols-3 gap-3">
                <Field label="재시도"><Select value={d.retry} onChange={(ev) => set({ retry: +ev.target.value })}><option value={0}>안 함</option><option value={1}>1회</option><option value={2}>2회</option></Select></Field>
                <Field label="실패 시"><Select value={d.onfail} onChange={(ev) => set({ onfail: ev.target.value })}><option>계속 진행</option><option>첫 실패 시 중단</option></Select></Field>
                <Field label="품질 게이트 (%)"><Input type="number" value={d.gate} onChange={(ev) => set({ gate: +ev.target.value || 0 })} /></Field>
              </div>
              </>)}
              <div className={"rounded-lg border px-3 py-2 text-xs " + (blk ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                {blk ? <><AlertTriangle size={12} className="mr-1 inline" />지금 실행할 수 없음 — {blk}{/단말|러너|USB|자동화 준비/.test(blk) && <button onClick={() => goTo("mqa-devices")} className="ml-2 text-sky-700">테스트 기기로</button>}</> : <><CheckCircle2 size={12} className="mr-1 inline" />실행 준비됨 — {sy ? sy.name : ""} {e ? envText({ ...e, build: b ? b.ver : "" }) : ""} · {devsLabel(planDevs(mqaRunners, d).devs, planDevs(mqaRunners, d).runner)}</>}
              </div>
            </div>
          </div>
          {/* 언제 — 공통 스케줄 설정 (FQA 와 같은 컴포넌트) + 앱 전용 이벤트 '새 버전을 올리면' */}
          <div className="mt-5 border-t border-slate-200 pt-4">
            <ScheduleConfig key={sel.id} value={sched} onChange={(v) => set({ schedule: v })} events={MQA_EVENTS} singleSelect manualHint="자동 실행 없음 — 실행 화면에서 수동으로만 돌립니다." toast={flash} />
            {isTimed(sched) && <div className="mt-3 text-xs text-slate-500">실행 30분 전에 러너 · 단말을 점검하고, 그 시각에 쓸 수 없으면 건너뛰지 않고 '실행 불가'로 남깁니다.</div>}
            {isOnNewBuild(sched) && (d.buildId
              ? <div className="mt-3 text-xs text-amber-700">앱 버전을 v{(b || {}).ver || "?"}로 고정해 두어 새 버전을 올려도 실행되지 않습니다 — 새 버전마다 돌리려면 앱 버전을 '최신'으로 두세요.</div>
              : <div className="mt-3 text-xs text-slate-500">대상·환경에 더 높은 빌드 번호의 앱을 올리는 즉시 그 버전으로 실행합니다.</div>)}
            {scheduled && d.status !== "활성" && <div className="mt-1 text-xs text-amber-700">초안이라 자동 실행되지 않습니다 — 활성으로 바꾸세요.</div>}
          </div>
        </Card>
      </div>
      {addModal}<Toast msg={msg} />
    </div>
  );
}
const SuitePick = ({ suites, value, onChange }) => (
  <div className="grid grid-cols-2 gap-2">{suites.map((x) => { const on = (value || []).includes(x.id); return <button key={x.id} onClick={() => onChange(on ? value.filter((s) => s !== x.id) : [...(value || []), x.id])} className={"rounded-lg border px-2 py-1.5 text-left text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200")}>{x.name}<span className="ml-1 text-slate-500">· {(x.items || []).length}건</span></button>; })}</div>
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
  const go = () => { if (blk) { flash(blk); return; } const id = launch(plan); setSelId(id); const busy = planDevs(ctx.runners, plan).devs.some((x) => x.state === "사용 중" && /^실행 /.test(x.busy || "")); flash(busy ? id + " 러너 대기열에 추가 — 앞선 실행이 끝나면 시작" : id + " 시작"); };
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
  const prog = (r) => { if (r.purpose === "성능") return perfProg(r); const n = (r.cases || []).length; const d = (r.cases || []).filter((c) => ["통과", "경고", "실패", "건너뜀"].includes(c.st)).length; return [d, n]; };
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
          {plan && (() => { const { sy, e } = envOfPlan(ctx.systems, plan); const b = buildOf(e, plan.buildId); const pdv = planDevs(ctx.runners, plan); const dvBusy = pdv.devs.some((x) => x.state === "사용 중"); return <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><Badge kind="info">{sy ? sy.name : "—"} · {plan.env} · 앱 v{b ? b.ver : "—"}{plan.buildId ? " (고정)" : " (최신)"}</Badge><span className="flex items-center gap-1"><Smartphone size={12} />{devsLabel(pdv.devs, pdv.runner)}{dvBusy && <span className="text-amber-700"> · 사용 중인 단말 있음</span>}</span>{plan.purpose === "성능" ? <span>· 성능 측정 · 항목 {PF.itemKeys(plan.perf || PF.PERF0, casesOfPlan(plan, ctx.cases, ctx.suites)).filter((x) => x.kind !== "app").length}개</span> : <span>· 케이스 {casesOfPlan(plan, ctx.cases, ctx.suites).length}건</span>}{blk && <span className="text-amber-700">⚠ {blk}</span>}</div>; })()}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-4 py-2 font-medium">실행</th><th className="font-medium">단말</th><th className="font-medium">상태</th><th className="font-medium">진행</th><th className="pr-4" /></tr></thead>
              <tbody>
                {!rows.length && <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-500">진행 중이거나 대기 중인 실행이 없습니다</td></tr>}
                {rows.map((r) => { const [d, n] = prog(r); const q = r.status === "대기 중" ? queueOf(r.runnerId).indexOf(r.id) + 1 : 0; return (
                  <tr key={r.id} onClick={() => setSelId(r.id)} className={"cursor-pointer border-b border-slate-100 " + (sel && sel.id === r.id ? SEL_ROW : "hover:bg-slate-50")}>
                    <td className="px-4 py-2.5"><div className="font-mono text-xs text-sky-600">{r.id}</div><div className="text-slate-800">{r.planName}{r.purpose === "성능" && <span className="ml-1.5 rounded bg-sky-50 px-1.5 text-xs text-sky-700">성능</span>}</div><div className="text-xs text-slate-500">{r.trigger}</div></td>
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
            <div className="space-y-1.5">{scheduledPlans.map((p) => { const b = planBlock(p, ctx, true, true); const pdv = planDevs(ctx.runners, p); return (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                <span className="shrink-0 text-slate-600">{isTimed(p.schedule) ? <><Clock size={11} className="mr-1 inline" />{nextRun(p.schedule).slice(5)}</> : <><Zap size={11} className="mr-1 inline" />새 버전 지정 시</>}</span>
                <span className="shrink-0 text-slate-500">{devsLabel(pdv.devs, null)}</span>
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
  if (run.purpose === "성능") return <PerfRunDetail run={run} onStop={onStop} onOpen={onOpen} />;
  const cur = run.cases.find((c) => c.st === "실행 중") || null;
  const [d, n] = [run.cases.filter((c) => ["통과", "경고", "실패", "건너뜀"].includes(c.st)).length, run.cases.length];
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
      {run.status === "대기 중" && <div className="px-4 py-6 text-center text-xs text-slate-500"><Clock size={18} className="mx-auto mb-2 text-slate-400" />고른 단말 중 다른 실행에 사용 중인 단말이 있습니다 — 대기열 {queueOf(run.runnerId).indexOf(run.id) + 1}번째, 앞선 실행이 끝나면 자동으로 시작합니다.</div>}
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
                  {x.st === "실행 중" ? <RefreshCw size={11} className="shrink-0 animate-spin text-sky-600" /> : x.st === "통과" ? <CheckCircle2 size={11} className="shrink-0 text-emerald-600" /> : x.st === "경고" ? <AlertTriangle size={11} className="shrink-0 text-amber-600" /> : x.st === "실패" ? <XCircle size={11} className="shrink-0 text-red-600" /> : <span className="h-[11px] w-[11px] shrink-0 rounded-full border border-slate-300" />}
                  <span className="w-14 shrink-0 text-slate-500">{x.act}</span><span className="truncate text-slate-800">{x.name}{x.val ? " \"" + x.val + "\"" : ""}</span>
                </div>
              ))}</div>
            </>) : (
              <div className="space-y-1">{run.cases.map((c) => <div key={c.key || c.id} className="flex items-center gap-2 text-xs" title={c.skipWhy || ""}><span className="w-14 font-mono text-sky-600">{c.id}</span><span className="flex-1 truncate text-slate-700">{c.name}{c.suiteName && <span className="ml-1 text-slate-400">· {c.suiteName}</span>}</span><Badge kind={CASE_K[c.st]}>{c.st}</Badge></div>)}</div>
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

/* ═══════════ 실행 이력 ═══════════ */
/* 실행 이력 — FQA 와 같은 구성: 필터(상태 · 계획) / 표(실행 · 계획 · 앱 버전 · 대상·환경 · 단말 · 트리거 · 시각 · 상태 · 판정 · 결과)
   끝난 실행만(완료 · 중단 · 실행 불가). 진행 중 · 대기 중은 실행 화면에서 본다 */
const TRIG_K = { "수동": "info", "예약": "pass", "새 버전": "warn" };
const verdictOf = (r) => (r.status !== "완료" ? "-" : r.purpose === "성능" ? (r.verdict || PR.runVerdict(r)) : mergedCases(r).some((c) => c.st === "실패") ? "실패" : mergedCases(r).some((c) => c.st === "경고") ? "경고" : "통과");
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
            {hist.map((r) => { const v = verdictOf(r); const mc = mergedCases(r); const n = mc.length; const p = mc.filter((c) => c.st === "통과").length; return (
              <tr key={r.id} onClick={() => nav && nav("mqa-result-detail", r.id)} className="cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-sky-600">{r.id}</td>
                {/* 🔑 부분 실행 표시 — 회귀 비교·대시보드에는 이미 있는데 이 표에만 없었다.
                    없으면 "실패 2건만 다시 돌려 통과" 가 계획 전체가 통과한 회차로 읽힌다. */}
                <td className="text-slate-800">{planNow(r) || r.planName}{r.partial && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-xs text-amber-800">부분</span>}{planNow(r) && r.planName && planNow(r) !== r.planName && <span className="ml-1.5 text-xs text-slate-500">· 당시 “{r.planName}”</span>}</td>
                <td className="font-mono text-xs text-slate-500">{r.build ? "v" + r.build : "-"}</td>
                <td className="text-xs text-slate-500">{r.sysName} · {r.env}</td>
                <td className="text-xs text-slate-500">{String(r.device || "-").split(" — ")[0]}</td>
                <td><Badge kind={TRIG_K[r.trigger] || "info"}>{r.trigger}</Badge></td>
                <td><RunTime start={r.startedAt} end={r.endedAt} /></td>
                <td><Badge kind={RUN_K[r.status]}>{r.status}</Badge></td>
                <td>{v === "-" ? <span className="text-xs text-slate-500">-</span> : <Badge kind={v === "통과" || v === "합격" ? "pass" : v === "경고" ? "warn" : v === "판정 없음" ? "draft" : "fail"}>{v}</Badge>}</td>
                <td className="pr-4 text-xs text-slate-500">{r.status === "실행 불가" ? <span className="text-red-700" title={r.note}>실행하지 못함</span> : r.purpose === "성능" ? (PR.overCount(r) ? <span className="text-red-700">기준 초과 {PR.overCount(r)}건</span> : "단말 " + r.device) : p + "/" + n}</td>
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
/* 🔑 '백엔드 결함 의심' 이 따로 있는 이유 — 원인이 담당자를 가른다.
   UI 실패는 QA·프론트로, API 5xx 는 백엔드로 간다. '앱 결함' 에 섞으면 엉뚱한 사람에게 간다. */
// 구분별 배지 · 색은 공통 (common/causeLogic) — 다른 원인 고르기 목록은 앱 기준 구분만
const JUDGE_KINDS = kindsOf("MQA");
/* 🔑 원인은 회차의 일부다 — 완료 시점에 한 번 정하고 그 뒤로는 바뀌지 않는다.
   전에는 조회할 때마다 다시 계산해서, 고친 뒤 재실행해 통과하면 '과거 회차' 의 원인이
   '요소 변경' → '대기 부족(불안정)' 으로 소급 변경됐다. 실제로 고친 원인이 통계에서 사라지고
   일어나지 않은 원인이 기록으로 남는다. (F5 — 참조는 깨지고 사실은 안 깨진다)
   c.cause 가 있으면 그것이 정본이고, 없으면 이 함수가 처음 정하는 순간이다. */
const judgeOf = (run, c, runs, caseNow) => {
  if (c.st !== "실패") return null;
  if (c.cause) return c.cause;              // 완료 시점에 동결된 판정
  const m = c.failMsg || "";
  /* 🔑 API 스텝 실패는 UI 실패와 다른 곳으로 간다 — 화면을 못 찾은 것이 아니라 서버가 답한 것이다.
     UI 규칙(요소를 찾지 못했습니다 …)보다 먼저 본다. 메시지 모양이 겹칠 수 있다.
     ⚠️ 목업 시뮬레이터는 아직 API 실패를 만들지 않는다 — 실 실행에서 쓰이는 경로다. */
  const apiFail = (c.steps || []).some((x) => x.st === "실패" && (L.ACT[x.act] || {}).api);
  if (apiFail) {
    /* 설정이 빠진 것은 서버 잘못도 테스트 잘못도 아니다 — 환경을 채우면 해결된다 */
    if (/Base URL/.test(m)) return { kind: "환경 문제", cause: "API 설정 누락", by: "규칙", basis: "대상·환경에 API Base URL 이 없습니다" };
    if (/\b5\d\d\b/.test(m)) return { kind: "백엔드 결함 의심", cause: "서버 오류 (5xx)", by: "규칙", basis: "API 응답이 5xx — 앱이 아니라 서버가 실패했습니다" };
    if (/\b4\d\d\b/.test(m)) return { kind: "테스트 문제", cause: "요청 오류 (4xx)", by: "규칙", basis: "API 응답이 4xx — 경로 · 본문 · 권한을 확인하세요" };
    return { kind: "확인 필요", cause: "API 응답 불일치", by: "AI", conf: "중간", basis: "API 스텝에서 실패 — 기대값과 실제 응답을 비교하세요" };
  }
  if (/크래시|ANR/.test(m)) return { kind: "앱 결함 의심", cause: "앱 크래시", by: "규칙", basis: "앱 로그에 크래시 · ANR 기록" };
  if (/서버|연결/.test(m)) return { kind: "환경 문제", cause: "서버 · 연결 오류", by: "규칙", basis: "서버 응답 오류 · 연결 끊김 기록" };
  const others = completed(runs).filter((r) => r.id !== run.id && r.planId === run.planId);
  const stOf = (r) => (mergedCases(r).find((x) => x.id === c.id) || {}).st;
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
  if (run.purpose === "성능") return <PerfResultView run={run} back={back} backLabel={backLabel} nav={nav} />;
  const pr = passRate(run);
  const fails = run.cases.filter((c) => c.st === "실패");
  const plan = mqaPlans.find((p) => p.id === run.planId);
  /* 같은 케이스가 두 스위트에서 돌 수 있다 — 행은 key(스위트:케이스) 로 고른다 */
  const oc = run.cases.find((c) => (c.key || c.id) === (open || ((fails[0] || {}).key || (fails[0] || {}).id))) || run.cases[0] || null;
  const tcNow = (id) => mqaCases.find((c) => c.id === id);
  const rerun = (only) => {
    if (!plan) { flash("계획이 삭제되어 다시 실행할 수 없습니다"); return; }
    /* 실패만 다시 — 그 회차와 같은 앱 버전으로 돌린다 (계획이 '최신' 이어도 그 사이 새 버전이 올라왔을 수 있다) */
    const rb = BV.buildsOf(envOfPlan(app.mqaSystems, plan).e).find((x) => x.ver === run.build);
    if (!rb) { flash("v" + run.build + " 파일이 삭제되어 같은 버전으로 다시 실행할 수 없습니다"); return; }
    const b = planBlock(plan, { systems: app.mqaSystems, cases: mqaCases, suites: app.mqaSuites, runners: app.mqaRunners }, false, false, rb);
    if (b) { flash(b); return; }
    /* 스위트 단위로 다시 돈다 — 실패한 행의 스위트만. 지금 실행할 수 없는 스위트(승인 전 등)는 뺀다 */
    const ok = SL.planSuites(plan, app.mqaSuites).filter((s) => !SL.suiteBlock(s, mqaCases)).map((s) => s.id);
    const sids = [...new Set((only || fails).map((c) => c.suiteId))].filter((x) => ok.includes(x));
    if (!sids.length) { flash("실패한 스위트를 지금 실행할 수 없습니다 — 계획에서 빠졌거나 승인 전 케이스가 있습니다"); return; }
    const id = launch(plan, { only: sids, note: run.id + " 의 실패한 스위트 다시 · v" + rb.ver, build: rb }); flash(id + " 시작 — 스위트 " + sids.length + "개"); nav && nav("mqa-run");
  };
  const openCase = (c) => { app.setMqaEditTc(c.id); app.goTo("mqa-cases"); };
  const judged = run.judged || {};
  const confirm = (c, kind) => { app.updateMqaRun(run.id, { judged: { ...judged, [c.id]: kind } }); flash(c.id + " 원인 확정 — " + kind); };
  /* 로케이터 보정 제안 — 승인하면 케이스의 그 로케이터를 바꾸고 이력을 남긴다. 승인 상태는 유지(보정 승인 자체가 검토).
     판정은 바꾸지 않는다 — 고친 뒤 '이 스위트 다시 실행' 으로 확인한다 */
  const setHealSt = (rc, st) => app.updateMqaRun(run.id, { cases: run.cases.map((x) => ((x.key || x.id) === (rc.key || rc.id) ? { ...x, heal: { ...x.heal, st } } : x)) });
  const approveHeal = (rc) => {
    const c = tcNow(rc.id), h = rc.heal;
    const hit = c && c.level !== "Full-Code" ? (c.steps || []).filter((x) => x.loc === h.from).length : 0;
    if (!hit) { setHealSt(rc, "적용 실패"); flash("케이스에 " + h.from + " 를 쓰는 스텝이 없습니다 — 이미 고쳤을 수 있습니다"); return; }
    app.commitMqaCase(rc.id, { steps: c.steps.map((x) => (x.loc === h.from ? { ...x, loc: h.to, ex: h.ex } : x)) }, { note: "보정 승인 — " + h.from + " → " + h.to });
    setHealSt(rc, "승인됨"); flash(rc.id + " 로케이터 반영 (" + hit + "개 스텝) — 이 스위트를 다시 실행해 확인하세요");
  };
  const addDefect = (c) => openMqaDefect(app, run, c.id, { tc: c.id, title: c.name + " 실패 — 앱 결함 의심", desc: "실행: " + run.id + " · v" + run.build + "\n케이스: " + c.name + " (" + c.id + ")" + (c.failMsg ? "\n실패: " + c.failMsg : ""), steps: "1. 케이스 '" + c.name + "' 실행" + (c.failStep ? "\n2. 스텝 " + c.failStep + " 에서 실패" : ""), expected: "케이스 통과", actual: c.failMsg || "케이스 실패" });
  const mc = mergedCases(run), mFail = mc.filter((c) => c.st === "실패").length;
  const SUM = [["통과", mc.filter((c) => c.st === "통과").length, "text-emerald-600"], ["경고", mc.filter((c) => c.st === "경고").length, "text-amber-600"], ["실패", mFail, mFail ? "text-red-600" : "text-slate-400"], ["건너뜀", mc.filter((c) => c.st === "건너뜀").length, "text-slate-500"], ["소요", durOfRun(run), "text-slate-900"]];
  const j = oc ? judgeOf(run, oc, mqaRuns, tcNow(oc.id)) : null;
  const jk = oc && judged[oc.id];
  const caseLog = (() => { if (!oc) return []; const lg = run.log || []; const i0 = lg.findIndex((l) => l.lv === "TC" && String(l.t).startsWith(oc.id + " ")); if (i0 < 0) return lg; const i1 = lg.findIndex((l, i) => i > i0 && l.lv === "TC"); return lg.slice(i0, i1 < 0 ? lg.length : i1); })();
  const fs = oc && oc.st === "실패" ? oc.steps[oc.failStep - 1 + (oc.preLen || 0)] : null;
  return (
    <div className="space-y-4">
      <PageToolbar desc={<span>{back ? <button onClick={back} className="text-sky-600 hover:underline">{backLabel || "실행 이력"}</button> : "실행 결과"} <span className="text-slate-400">›</span> <span className="font-mono">{run.id}</span></span>}>
        {fails.length > 0 && run.status === "완료" && <Btn kind="primary" icon={RefreshCw} onClick={() => rerun()}>실패한 스위트 다시 실행 ({new Set(fails.map((c) => c.suiteId)).size})</Btn>}
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
      {pr != null && <Card className="flex items-center gap-3 p-3 text-sm"><span className={"font-semibold " + (gateOk(run) ? "text-emerald-700" : "text-red-700")}>품질 게이트 {gateOk(run) ? "통과" : "미달"}</span><span className="text-xs text-slate-500">PASS {pr}% · 기준 {run.gate}%</span>{/* 🔑 부분 실행이면 모집단이 계획 전체가 아니다 — 숫자는 그대로 두고 범위를 밝힌다. */}{run.partial && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">부분 실행 기준 — 계획 전체가 아닙니다</span>}<div className="h-2 flex-1 rounded bg-slate-100"><div className={"h-2 rounded " + (gateOk(run) ? "bg-emerald-500" : "bg-red-500")} style={{ width: pr + "%" }} /></div></Card>}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">케이스 <span className="text-xs font-normal text-slate-500">{mc.length}건{run.cases.length > mc.length ? " · 실행 " + run.cases.length + "회(여러 스위트)" : ""}</span></div>
          {/* 스위트 → 케이스 2단 — 스위트가 바뀌는 곳에 머리줄 (스위트 이전의 옛 실행은 머리줄 없이) */}
          {run.cases.map((c, i) => { const jc = judgeOf(run, c, mqaRuns, tcNow(c.id)); /* 여러 단말에서 돈 회차는 단말 · 스위트마다 머리를 둔다 (웹의 브라우저 머리와 같은 모양) */
            const multiDev = (run.devIds || []).length > 1;
            const head = c.suiteName && (i === 0 || run.cases[i - 1].suiteId !== c.suiteId || run.cases[i - 1].devId !== c.devId);
            const sc = head ? run.cases.filter((x) => x.suiteId === c.suiteId && x.devId === c.devId) : []; return (
            <Fragment key={c.key || c.id}>
            {head && <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs">{multiDev && <span className="rounded bg-white px-1.5 text-slate-600 ring-1 ring-slate-200">{c.devModel}</span>}<span className="font-semibold text-slate-700">{c.suiteName}</span><span className="text-slate-500">{c.acctRole ? "계정 " + c.acctRole : ""}</span><span className="ml-auto text-slate-500">통과 {sc.filter((x) => x.st === "통과").length} · 실패 {sc.filter((x) => x.st === "실패").length}{sc.some((x) => x.st === "건너뜀") ? " · 건너뜀 " + sc.filter((x) => x.st === "건너뜀").length : ""}</span></div>}
            <button onClick={() => setOpen(c.key || c.id)} className={"w-full border-b border-slate-100 px-4 py-2 text-left text-xs " + (oc && (oc.key || oc.id) === (c.key || c.id) ? "bg-sky-50" : "hover:bg-slate-50")}>
              <div className="flex items-center gap-2"><span className="w-14 font-mono text-sky-600">{c.id}</span><span className="flex-1 truncate text-slate-800">{c.name}</span><Badge kind={CASE_K[c.st]}>{c.st}</Badge></div>
              {c.skipWhy && <div className="mt-0.5 truncate pl-16 text-slate-400" title={c.skipWhy}>{c.skipWhy}</div>}
              {jc && <div className="mt-1 pl-16"><Badge kind={JUDGE_K[judged[c.id] || jc.kind]}>{judged[c.id] || jc.kind}</Badge>{!judged[c.id] && <span className="ml-1 text-slate-400">{jc.by} 제안</span>}{(run.defects || {})[c.id] && <span className="ml-1 font-mono text-red-700">{run.defects[c.id]}</span>}{c.heal && c.heal.st === "검토 대기" && <span className="ml-1 text-sky-700">· 보정 제안</span>}</div>}
            </button>
            </Fragment>
          ); })}
        </Card>
        <div className="col-span-8 space-y-3">
          {oc && (<>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2"><span className="font-mono text-sm text-sky-700">{oc.id}</span><span className="text-sm font-semibold text-slate-800">{oc.name}</span><Badge kind={CASE_K[oc.st]}>{oc.st === "경고" ? "경고 (재시도 통과)" : oc.st}</Badge>{oc.dur != null && <span className="text-xs text-slate-500">{sec(oc.dur)}</span>}
                <div className="ml-auto"><Btn icon={Code2} onClick={() => openCase(oc)}>케이스 열기</Btn></div></div>
              {oc.st === "건너뜀" && oc.skipWhy && <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><b className="font-medium">건너뜀</b> — {oc.skipWhy}{oc.suiteName ? " · 스위트 " + oc.suiteName : ""}</div>}
              {oc.st === "경고" && <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{oc.warnMsg || "1차 실패 후 재시도에서 통과"} — 통과로 세지 않고 불안정 신호로 봅니다</div>}
              {fs && <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"><b className="font-medium">{"스텝 " + oc.failStep} · {fs.act} {fs.name}</b> — {oc.failMsg}{oc.retried ? " · 재시도 " + oc.retried + "회 모두 실패" : ""}
                {tcNow(oc.id) && tcNow(oc.id).status !== "승인" && <div className="mt-1 text-amber-800">이 케이스는 지금 {tcNow(oc.id).status} 상태입니다 — 수정 후 다시 승인해야 실행 대상에 들어갑니다.</div>}</div>}
              {/* 원인 판정 — 규칙 · AI 제안, 담당자 확정 */}
              {j && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">원인 판정</span>
                    <Badge kind={JUDGE_K[jk || j.kind]}>{jk || j.kind}</Badge><span className="text-slate-700">{j.cause}</span>
                    <span className="text-slate-500">{jk ? "· 담당자 확정" : "· " + j.by + " 제안" + (j.conf ? " · 확신 " + j.conf : "")}</span>
                    {!jk && <div className="ml-auto flex items-center gap-1.5"><button onClick={() => confirm(oc, j.kind)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-50">확정</button>
                      <select value="" onChange={(e) => e.target.value && confirm(oc, e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-700"><option value="">다른 원인</option>{JUDGE_KINDS.filter((k) => k !== j.kind && k !== "확인 필요").map((k) => <option key={k}>{k}</option>)}</select></div>}
                  </div>
                  <div className="mt-1 text-slate-600">근거: {j.basis}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(jk || j.kind) === "테스트 문제" && <Btn icon={Code2} onClick={() => openCase(oc)}>요소 다시 집기 · 대기 보정</Btn>}
                    {(jk || j.kind) === "앱 결함 의심" && ((run.defects || {})[oc.id] ? <span className="text-red-700">결함 {run.defects[oc.id]} 등록됨</span> : <Btn icon={FileText} onClick={() => addDefect(oc)}>결함 등록 (근거 첨부)</Btn>)}
                    {(jk || j.kind) === "환경 문제" && <Btn icon={RefreshCw} onClick={() => rerun([oc])}>이 스위트 다시 실행</Btn>}
                  </div>
                </div>
              )}
              {/* 로케이터 보정 제안 — 판정은 그대로, 제안만 덧붙인다 */}
              {oc.heal && (
                <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-2"><span className="font-semibold text-sky-800">로케이터 보정 제안</span><span className="text-slate-500">스텝 {oc.heal.stepNo} · {oc.heal.step}</span>
                    <Badge kind={oc.heal.st === "승인됨" ? "pass" : oc.heal.st === "검토 대기" ? "warn" : "draft"}>{oc.heal.st}</Badge></div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono"><span className="text-red-700 line-through">{oc.heal.from}</span><span className="text-slate-500">→</span><span className="text-emerald-700">{oc.heal.to}</span><span className="font-sans text-slate-500">({oc.heal.kind})</span></div>
                  <div className="mt-1 text-slate-600">{oc.heal.why}</div>
                  {oc.heal.st === "검토 대기" && <div className="mt-2 flex flex-wrap gap-2"><Btn kind="primary" icon={CheckCircle2} onClick={() => approveHeal(oc)}>승인 · 반영</Btn><Btn icon={Code2} onClick={() => { setHealSt(oc, "직접 수정"); openCase(oc); }}>요소 다시 집기</Btn></div>}
                  {oc.heal.st === "승인됨" && <div className="mt-2"><Btn icon={RefreshCw} onClick={() => rerun([oc])}>이 스위트 다시 실행</Btn></div>}
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
/* 기능 집계용 — 성능 측정 실행은 케이스 판정이 없어 통과율 · 회귀 · 불안정에서 뺀다 (성능은 성능 추이에서) */
const completed = (runs) => (runs || []).filter((r) => r.status === "완료" && r.purpose !== "성능");
/* 회귀 비교 — 같은 계획의 두 실행을 케이스별로 맞대어 본다 (FQA 와 같은 구성)
   정합 규칙
     · 기본 비교는 '전체 실행' 끼리: 최신 전체 실행(B) ↔ 그 직전 전체 실행(A). '실패만 다시' 같은 부분 실행은 (부분) 표시
     · 부분 실행이 끼면 두 실행에 모두 있는 케이스만 비교 (나머지는 비교 제외로 센다)
     · 비교 조건 차이를 알린다: 앱 버전 변화는 정보, 단말 차이는 주의(단말 때문일 수 있음)
     · 케이스 rev 가 다르면 '케이스 변경' — 결과 변화를 앱 탓으로 단정하지 않는다
     · 퇴행 행에는 결과 화면과 같은 원인 판정(담당자 확정 우선) */
const pctOf = (r) => { const p = passRate(r); return p == null ? "—" : p + "%"; };
function Regression({ nav }) {
  const { mqaRuns = [], mqaPlans = [], mqaCases = [], mqaSystems = [], mqaSuites = [], updateMqaRun, mqaRegFocus, defects, addDefect } = useApp();
  const [msg, flash] = useToast();
  const [aiOpen, setAiOpen] = useState(false);
  const plansWith = mqaPlans.filter((p) => completed(mqaRuns).filter((r) => r.planId === p.id).length >= 2);
  /* 결과 화면의 '직전 회차와 비교' 로 오면 그 회차의 계획을 연다 */
  const focusRun = mqaRegFocus ? mqaRuns.find((r) => r.id === mqaRegFocus) : null;
  const [pid, setPid] = useState(focusRun ? focusRun.planId : plansWith[0] ? plansWith[0].id : (mqaPlans[0] || {}).id);
  const rs = completed(mqaRuns).filter((r) => r.planId === pid);
  const full = rs.filter((r) => !r.partial);
  const defB = full[0] || rs[0]; const defA = full.filter((r) => r !== defB)[0] || rs.filter((r) => r !== defB)[0];
  const [aId, setA] = useState(null); const [bId, setB] = useState(null);
  const A = rs.find((r) => r.id === aId) || defA; const B = rs.find((r) => r.id === bId) || defB;
  const Head = <PageToolbar desc="회귀 비교 · 같은 계획의 두 실행을 케이스별로" />;
  const planSel = <Card className="p-3"><Field label="실행 계획 (비교 맥락)"><Select value={pid || ""} onChange={(e) => { setPid(+e.target.value); setA(null); setB(null); }}>{mqaPlans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.purpose === "성능" ? " (성능)" : ""}</option>)}</Select></Field></Card>;
  /* 성능 계획 — 두 회차의 지표 차이 (기능의 통과 → 실패 전환 자리) */
  const selPlan = mqaPlans.find((p) => p.id === pid);
  if (selPlan && selPlan.purpose === "성능") return <div className="space-y-4"><PageToolbar desc="회귀 비교 · 같은 계획의 두 측정을 지표별로" /><PerfRegression key={pid} plan={selPlan} runs={mqaRuns} planSel={planSel} presetB={focusRun && focusRun.planId === pid ? focusRun.id : null} /></div>;
  if (rs.length < 2 || !A || !B) return <div className="space-y-4">{Head}{planSel}<Card className="p-8 text-center text-sm text-slate-500">이 계획에는 비교할 완료된 실행이 2건 이상 필요합니다 (현재 {rs.length}건).</Card></div>;
  const opt = (r) => r.id + " · v" + r.build + " · " + String(r.startedAt).slice(5) + " · " + pctOf(r) + (r.partial ? " (부분)" : "");
  const part = A.partial || B.partial;
  const MA = mergedCases(A), MB = mergedCases(B);   // 케이스 기준으로 합친 결과끼리 비교한다
  const ids = part ? MA.map((c) => c.id).filter((id) => MB.some((c) => c.id === id)) : [...new Set([...MA, ...MB].map((c) => c.id))];
  const excludedN = part ? new Set([...MA, ...MB].map((c) => c.id)).size - ids.length : 0;
  const cOf = (r, id) => (r === A ? MA : MB).find((c) => c.id === id);
  const stOf = (r, id) => { const c = cOf(r, id); return c ? c.st : null; };
  const RK = { "실패": 0, "경고": 1, "통과": 2 };   // 낮아지면 퇴행 — 경고(재시도 통과)는 통과와 실패 사이 (FQA 와 같은 규칙)
  /* 건너뜀은 비교하지 않는다 — 실행하지 않은 것은 퇴행도 개선도 아니다 */
  const cls = (a, b) => (!a ? { k: "새 케이스", c: "text-sky-700" } : !b ? { k: "빠짐", c: "text-slate-500" } : a === "건너뜀" || b === "건너뜀" ? { k: "비교 불가", c: "text-slate-400" } : RK[b] < RK[a] ? { k: "퇴행", c: "text-red-700" } : RK[b] > RK[a] ? { k: "개선", c: "text-emerald-700" } : { k: "유지", c: "text-slate-600" });
  const rows = ids.map((id) => { const ca = cOf(A, id), cb = cOf(B, id); return { id, name: (cb || ca).name, a: stOf(A, id), b: stOf(B, id), ra: ca && ca.rev, rb: cb && cb.rev, cb }; });
  const summ = rows.reduce((m, r) => { const k = cls(r.a, r.b).k; m[k] = (m[k] || 0) + 1; return m; }, {});
  const devDiff = String(A.device).split(" — ")[0] !== String(B.device).split(" — ")[0];
  const vK = { "통과": "pass", "경고": "warn", "실패": "fail", "건너뜀": "draft" };
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
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-slate-700">{summ["유지"] || 0}</div><div className="mt-0.5 text-xs text-slate-500">유지</div>{summ["비교 불가"] ? <div className="mt-0.5 text-xs text-slate-400">비교 불가(건너뜀) {summ["비교 불가"]}</div> : null}</Card>
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><span className="text-sm font-semibold text-slate-800">케이스 회귀 분석 <span className="font-normal text-slate-500">· {A.id} → {B.id}</span></span>
          <div className="flex gap-2"><Btn icon={Download} onClick={() => flash("목업 — 케이스 회귀 분석 Excel 내려받기")}>Excel</Btn><Btn kind="primary" icon={Sparkles} onClick={() => setAiOpen(true)}>AI 분석</Btn></div></div>
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
      {aiOpen && <RegAiPanel flash={flash} A={A} B={B} rows={rows} summ={summ} cls={cls} devDiff={devDiff} part={part} runs={mqaRuns} cases={mqaCases} systems={mqaSystems} suites={mqaSuites} onClose={() => setAiOpen(false)} onOpen={() => { setAiOpen(false); nav && nav("mqa-result-detail", B.id); }}
        onDefects={(ids) => { const ks = regMqaDefects({ defects, addDefect, updateMqaRun }, B, ids.map((id) => { const c = mqaCases.find((x) => x.id === id) || { id, name: id }; return [id, { tc: id, title: c.name + " 실패 — 앱 결함 의심 (회귀 " + A.id + " → " + B.id + ")", desc: "회귀 비교: " + A.id + " (v" + A.build + ") → " + B.id + " (v" + B.build + ")\n케이스: " + c.name + " (" + id + ")" }]; })); flash(ks.length + "건 결함 등록 — 결함 메뉴에서 볼 수 있습니다"); }} />}
      <Toast msg={msg} />
    </div>
  );
}
/* AI 회귀 분석 패널 — LQA 회귀 비교와 같은 구성: 계산(결정적) → AI 추정(원인 · 권고)
   숫자는 모두 시스템 계산. AI 는 판정 근거(judgeOf · 담당자 확정)를 묶어 문장으로 설명만 한다 */
function RegAiPanel({ A, B, rows, summ, cls, devDiff, part, runs, cases, systems, suites, onClose, onOpen, onDefects, flash }) {
  const caseNow = (id) => cases.find((c) => c.id === id);
  const reg = rows.filter((r) => cls(r.a, r.b).k === "퇴행");
  const judg = reg.map((r) => { const j = r.cb ? judgeOf(B, r.cb, runs, caseNow(r.id)) : null; const k = (B.judged || {})[r.id]; return { ...r, j, kind: k || (j ? j.kind : "확인 필요"), cause: k ? k : j ? j.cause : "판정 불가", fixed: !!k }; });
  const groups = {}; judg.forEach((x) => { (groups[x.cause] = groups[x.cause] || { cause: x.cause, kind: x.kind, ids: [], basis: x.j ? x.j.basis : "" }).ids.push(x.id); });
  const G = Object.values(groups);
  const appDef = judg.filter((x) => x.kind === "앱 결함 의심" && !(B.defects || {})[x.id]);
  const build = (r) => { const sy = systems.find((x) => x.id === r.systemId); const e = sy && (sy.envs || []).find((x) => x.env === r.env); return e && ((e.app || {}).builds || []).find((b) => b.ver === r.build); };
  const noteB = (build(B) || {}).note || "";
  const revN = rows.filter((r) => r.ra != null && r.rb != null && r.ra !== r.rb).length;
  /* 결과가 바뀐 스위트 — 실패한 실행의 스위트로 묶는다(여러 스위트에서 돌았으면 실패가 난 곳). 옛 실행은 지금 속한 스위트로 */
  const rowOf = (id) => rows.find((r) => r.id === id) || {};
  const suiteOf = (id) => ((rowOf(id).cb || {}).suiteName) || SL.suiteNamesOf(suites, id)[0] || "미지정";
  const bySuite = {}; rows.forEach((r) => { const k = cls(r.a, r.b).k; if (k !== "퇴행" && k !== "개선") return; const su = suiteOf(r.id); const o = (bySuite[su] = bySuite[su] || { 퇴행: 0, 개선: 0 }); o[k]++; });
  const snap = [["앱 버전", "v" + A.build, "v" + B.build], ["단말", String(A.device).split(" — ")[0], String(B.device).split(" — ")[0]], ["실행 방식", A.partial ? "부분" : "전체", B.partial ? "부분" : "전체"]];
  /* AI 한 줄 결론 — 원인 묶음에서 만든다 */
  const conclusion = !reg.length
    ? (summ["개선"] ? "퇴행 없음 — 개선 " + summ["개선"] + "건, " + B.id + "는 " + A.id + "보다 나아졌습니다" : "퇴행 없음 — 두 실행의 품질이 같습니다")
    : G.map((g) => "퇴행 " + g.ids.length + "건은 " + g.cause + (g.kind === "테스트 문제" ? " 때문 — 앱 결함이 아닌 테스트 보정 대상" : g.kind === "앱 결함 의심" ? " — 앱 결함 의심, 결함 등록 권장" : g.kind === "환경 문제" ? " — 환경 문제로 보임" : " — 원인 확인 필요")).join(" · ") + (devDiff ? " (단말이 달라 단말 영향도 확인 필요)" : "");
  const recs = [];
  const healN = (B.cases || []).filter((x) => x.heal && x.heal.st === "검토 대기").length;
  if (healN) recs.push("로케이터 보정 제안 " + healN + "건 검토 · 승인 (" + B.id + " 결과 상세)");
  if (G.some((g) => g.cause === "요소 변경")) recs.push("요소 다시 집기 → 실패한 스위트 다시 실행 (" + G.filter((g) => g.cause === "요소 변경").flatMap((g) => g.ids).join(", ") + ")");
  if (G.some((g) => /대기 부족/.test(g.cause))) recs.push("대기 시간 보정 후 반복 실행으로 재확인 (" + G.filter((g) => /대기 부족/.test(g.cause)).flatMap((g) => g.ids).join(", ") + ")");
  if (judg.some((x) => x.kind === "앱 결함 의심")) recs.push("앱 결함 의심 건은 실패 화면 · 로그를 첨부해 결함 등록");
  if (judg.some((x) => x.kind === "환경 문제")) recs.push("단말 · 서버 상태 확인 후 다시 실행");
  if (devDiff) recs.push("같은 단말에서 다시 비교해 단말 영향 배제");
  if (part) recs.push("전체 실행끼리 비교하면 빠진 케이스까지 확인할 수 있습니다");
  if (!recs.length) recs.push(reg.length ? "실패 시점 자료로 원인을 확인하세요" : "조치 필요 없음 — 다음 정기 실행에서 추이 확인");
  return (
    <Portal><div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><span className="flex items-center gap-2 font-semibold text-slate-900"><Sparkles size={16} className="text-sky-600" />AI 회귀 분석</span><button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={20} /></button></div>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2"><Badge kind="info">계산</Badge><span className="text-xs text-slate-500">결정적 분석 — 저장된 실행 결과 산술</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">변화 요약 · {A.id} → {B.id}</div>
            <div className="mt-1 text-slate-800">퇴행 <b className="text-red-700">{summ["퇴행"] || 0}</b> · 개선 <b className="text-emerald-700">{summ["개선"] || 0}</b> · 유지 {summ["유지"] || 0} · PASS {pctOf(A)} → {pctOf(B)}</div>
            {passRate(B) != null && <div className="mt-1 text-xs">품질 게이트 <span className={gateOk(B) ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{gateOk(B) ? "통과" : "미달"}</span> <span className="text-slate-500">· 기준 {B.gate}%</span></div>}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">무엇이 바뀌었나</div>
            <div className="space-y-1">{snap.map((r) => <div key={r[0]} className={"flex items-center justify-between rounded px-2 py-1 text-xs " + (r[1] !== r[2] ? "bg-slate-100" : "")}><span className="text-slate-500">{r[0]}</span><span className={r[1] !== r[2] ? "text-amber-700" : "text-slate-500"}>{r[1]} → {r[2]}</span></div>)}
              <div className="flex items-center justify-between px-2 py-1 text-xs"><span className="text-slate-500">케이스 변경</span><span className={revN ? "text-amber-700" : "text-slate-500"}>{revN ? revN + "건 (rev 다름)" : "없음"}</span></div>
              {noteB && <div className="px-2 py-1 text-xs text-slate-500">빌드 메모 (v{B.build}): <span className="text-slate-700">{noteB}</span></div>}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">스위트별 변화</div>
            {!Object.keys(bySuite).length ? <div className="text-xs text-slate-500">결과가 바뀐 케이스가 없습니다</div> : <div className="space-y-1">{Object.entries(bySuite).map(([k, v]) => <div key={k} className="flex items-center justify-between text-xs"><span className="text-slate-500">{k}</span><span className="text-slate-700">{v.퇴행 ? <span className="text-red-700">퇴행 {v.퇴행}</span> : null}{v.퇴행 && v.개선 ? " · " : ""}{v.개선 ? <span className="text-emerald-700">개선 {v.개선}</span> : null}</span></div>)}</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-200 pt-3"><Badge kind="active">AI 추정</Badge><span className="text-xs text-slate-500">서버 경유 · 개인정보 가림 · 검증 필요</span></div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">한 줄 결론</div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-slate-800">{conclusion}</div>
          </div>
          {G.length > 0 && <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">원인별 묶음</div>
            <ul className="space-y-1.5">{G.map((g) => <li key={g.cause} className="text-xs text-slate-700"><div className="flex items-center gap-1.5"><Badge kind={JUDGE_K[g.kind] || "draft"}>{g.kind}</Badge><span className="font-medium">{g.cause} {g.ids.length}건</span><span className="font-mono text-slate-500">— {g.ids.join(", ")}</span></div>{g.basis && <div className="mt-0.5 pl-1 text-slate-500">근거: {g.basis}</div>}</li>)}</ul>
          </div>}
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">권장 조치</div>
            <ul className="space-y-1.5">{recs.map((c, i) => <li key={i} className="flex gap-2 text-xs text-slate-700"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />{c}</li>)}</ul>
          </div>
          <div className="flex flex-wrap gap-2">
            {appDef.length > 0 && <Btn kind="primary" icon={Bug} onClick={() => onDefects(appDef.map((x) => x.id))}>앱 결함 의심 {appDef.length}건 결함 등록</Btn>}
            {reg.length > 0 && <Btn icon={FileText} onClick={onOpen}>{B.id} 결과 상세</Btn>}
          </div>
          {/* 리포트 공유 — 공통 부품 (채널 · 이력은 공통 '리포트 · 알림') */}
          <ShareBox domain="MQA" subject={"회귀 리포트 " + A.id + " → " + B.id + " · 퇴행 " + (summ["퇴행"] || 0)}
            preview={B.planName + " " + A.id + " → " + B.id + " · 퇴행 " + (summ["퇴행"] || 0) + " · PASS " + pctOf(B) + " — " + conclusion}
            onLeave={onClose} onDone={(chs) => flash("회귀 리포트 공유 — " + chs.join(" · ") + " (발송 이력에 기록)")} />
          <div className="text-xs text-slate-500">＊ 계산 항목은 저장된 결과의 산술이며, AI 추정 항목(결론 · 원인 · 권고)은 참고용입니다. 담당자가 결과 화면에서 확정한 원인이 있으면 그 판정을 따릅니다.</div>
        </div>
      </div>
    </div></Portal>
  );
}
/* 불안정 · 지속 실패 판정 — 대시보드와 같은 함수 하나만 쓴다 (두 화면이 같은 케이스를 다르게 분류하면 안 된다)
   · 최근 FLAKY_WINDOW 회의 완료 실행만 본다
   · 같은 앱 버전 안에서 통과/실패가 섞이면 '불안정' — 버전이 바뀐 뒤 계속 실패하면 불안정이 아니라 '지속 실패(회귀)'
   · 연속 2회 이상 실패도 '지속 실패'
   · 담당자가 결과 화면에서 '앱 결함 의심' 으로 확정한 실패가 있으면 '결함' 으로 (불안정에서 뺀다)
   · 🔑 '실패만 다시' 같은 부분 실행은 빼고 전체 실행만 본다 — 다른 집계와 같은 규칙이다.
     안 빼면 "고쳐서 다시 돌려 통과" 가 같은 버전 안의 통과/실패 혼재로 읽혀 '불안정' 이 되고,
     화면이 '격리' 를 권한다. 수정을 확인한 행위가 케이스를 빼라는 권고로 바뀐다. */
export { FLAKY_WINDOW };   // 두 도메인 같은 값 (common/FlakyTable.jsx)
export const caseHistory = (runs) => {
  const m = {};
  completed(runs).filter((r) => !r.partial).slice().reverse().forEach((r) => mergedCases(r).forEach((c) => {
    if (c.st !== "통과" && c.st !== "실패" && c.st !== "경고") return;
    (m[c.id] = m[c.id] || { id: c.id, name: c.name, seq: [] }).seq.push({ st: c.st === "경고" ? "재시도 통과" : c.st, run: r.id, build: r.build, judged: (r.judged || {})[c.id], defect: (r.defects || {})[c.id] });
  }));
  return Object.values(m).map((h) => {
    const w = h.seq.slice(-FLAKY_WINDOW);
    const f = w.filter((x) => x.st === "실패").length;
    const lastBuild = w.length ? w[w.length - 1].build : "";
    const cur = w.filter((x) => x.build === lastBuild);
    const warns = w.filter((x) => x.st === "재시도 통과").length;
    const mixed = warns > 0 || [...new Set(w.map((x) => x.build))].some((b) => { const xs = w.filter((x) => x.build === b); return xs.some((x) => x.st !== "실패") && xs.some((x) => x.st === "실패"); });
    let trail = 0; for (let i = w.length - 1; i >= 0; i--) { if (w[i].st === "실패") trail++; else break; }
    const regressed = cur.length > 0 && cur.every((x) => x.st === "실패") && w.some((x) => x.build !== lastBuild && x.st !== "실패");
    const defect = w.some((x) => x.st === "실패" && x.judged === "앱 결함 의심");
    const kind = defect ? "결함" : trail >= 2 || regressed ? "지속 실패" : mixed ? "불안정" : f ? "실패" : "안정";
    const lastFail = [...w].reverse().find((x) => x.st === "실패");
    return { ...h, w, runs: w.length, fails: f, warns, trail, regressed, kind, lastFail, hasDefect: w.some((x) => x.defect) };
  });
};
function Flaky({ nav }) {
  const { mqaRuns = [], mqaCases = [], mqaSuites = [], updateMqaCase, updateMqaRun, setMqaEditTc, goTo, openModal } = useApp();
  const [msg, flash] = useToast();
  const caseNow = (id) => mqaCases.find((c) => c.id === id);
  const rows = caseHistory(mqaRuns).filter((h) => ["불안정", "지속 실패", "결함"].includes(h.kind)).sort((a, b) => b.fails / b.runs - a.fails / a.runs);
  const causeOf = (h) => { if (!h.lastFail) return null; const run = mqaRuns.find((r) => r.id === h.lastFail.run); const c = run && mergedCases(run).find((x) => x.id === h.id); const j = run && c ? judgeOf(run, c, mqaRuns, caseNow(h.id)) : null; return j ? { ...j, kind: h.lastFail.judged || j.kind, fixed: !!h.lastFail.judged } : null; };
  const toggleQuar = (h) => { const c = caseNow(h.id); if (!c) return; updateMqaCase(h.id, { quarantined: !c.quarantined }); flash(c.quarantined ? h.id + " 격리 해제 — 다음 실행부터 대상에 들어갑니다" : h.id + " 격리 — 실행 계획 대상에서 빠집니다"); };
  const regDefect = (h) => { const run = mqaRuns.find((r) => r.id === h.lastFail.run); openMqaDefect({ openModal, updateMqaRun }, run, h.id, { tc: h.id, title: "지속 실패: " + h.name, desc: "케이스 '" + h.name + "' (" + h.id + ")\n최근 " + h.runs + "회 중 " + h.fails + "회 실패 · 마지막 실패 " + run.id, steps: "1. 케이스 '" + h.name + "' 반복 실행\n2. 실패 재현 확인", expected: "케이스 통과", actual: "최근 " + h.runs + "회 중 " + h.fails + "회 실패" }); };
  const suiteOf = (id) => SL.suiteNamesOf(mqaSuites, id).join(" · ");
  /* 공용 표(common/FlakyTable)에 맞춰 행을 만든다 — 판정은 caseHistory, 원인은 결과 화면과 같은 judgeOf */
  const healOf = (h) => { if (!h.lastFail) return null; const run = mqaRuns.find((r) => r.id === h.lastFail.run); const c = run && mergedCases(run).find((x) => x.id === h.id); return (c && c.heal) || null; };
  const view = rows.map((h) => { const j = causeOf(h); return { ...h, suite: suiteOf(h.id), quarantined: !!(caseNow(h.id) || {}).quarantined, w: h.w.map((x) => ({ st: x.st, run: x.run, ver: "v" + x.build })), cause: j ? { text: j.cause, note: j.fixed ? "확정" : j.by + " 제안" } : null, heal: healOf(h) }; });
  return (
    <div className="space-y-4">
      <PageToolbar desc="불안정(Flaky) · 테스트케이스 기준" />
      <FlakyTable rows={view} verLabel="앱 버전" onQuar={toggleQuar} onDefect={regDefect} onOpen={(h) => { setMqaEditTc(h.id); goTo("mqa-cases"); }} />
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ 대시보드 ═══════════
   FQA 와 같은 구성: 필터(계획 · 기간) → KPI 6 → 실패 원인 분포 → 실행 · PASS율 추이 → 스위트 건강도 + 단말별 PASS율 → 빈발 실패 + 최근 실행
   정합 규칙
     · PASS율 · 추이 · 단말별 · 스위트 · 원인 분포는 '전체 실행' 만 (실패만 다시 같은 부분 실행은 빼야 실패가 과대 집계되지 않는다)
     · 불안정 · 지속 실패는 불안정 화면과 같은 함수(caseHistory)
     · 원인은 결과 화면과 같은 판정(judgeOf) — 담당자 확정이 우선
     · 필터(계획 · 기간)는 모든 카드에 똑같이 적용 */
const hbar = (p) => (p >= 90 ? "#10b981" : p >= 70 ? "#f59e0b" : "#ef4444");
export function MqaDashboardScreen({ nav }) {
  const { mqaCases = [], mqaRuns = [], mqaPlans = [], mqaRunners = [], mqaSuites = [], defects = [], goList } = useApp();
  const [msg, flash] = useToast();
  const iso = (d) => { const z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
  const [today] = useState(() => iso(new Date()));
  const [defFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return iso(d); });
  /* 기능 · 성능 전환 — 두 목적의 계획이 모두 있을 때만 보인다. 한쪽만 있으면 그쪽으로 고정 */
  const hasFn = mqaPlans.some((p) => p.purpose !== "성능"), hasPerf = mqaPlans.some((p) => p.purpose === "성능");
  const [purF, setPurF] = useState(() => (hasFn || !hasPerf ? "기능" : "성능"));
  const [planF, setPlanF] = useState("전체");
  const [from, setFrom] = useState(defFrom); const [to, setTo] = useState(today);
  const minFromOf = (t) => { const d = new Date(t); d.setMonth(d.getMonth() - 6); return iso(d); };
  const setRange = (nf, nt) => { if (nf > nt) nf = nt; const mf = minFromOf(nt); if (nf < mf) { nf = mf; flash("기간은 최대 6개월까지 지정할 수 있습니다"); } setFrom(nf); setTo(nt); };
  const dOf = (r) => String(r.startedAt || "").slice(0, 10);
  const scoped = mqaRuns.filter((r) => (planF === "전체" || r.planId === planF) && dOf(r) >= from && dOf(r) <= to);
  const done = completed(scoped); const full = done.filter((r) => !r.partial);
  const lastFull = full[0];
  const devs = flatDevices(mqaRunners);
  const approved = mqaCases.filter((c) => c.status === "승인").length, quar = mqaCases.filter((c) => c.quarantined).length;
  const hist = caseHistory(scoped);
  const unstable = hist.filter((h) => ["불안정", "지속 실패", "결함"].includes(h.kind)).sort((a, b) => b.fails / b.runs - a.fails / a.runs);
  /* 미해결 결함 = 공통 결함 목록의 앱 테스트 결함 중 Resolved 가 아닌 것 (웹 대시보드와 같은 규칙) · 기능 화면이라 성능 결함은 뺀다 */
  const defectN = defects.filter((d) => d.domain === "MQA" && !d.perf && d.status !== "Resolved").length;
  const purPlans = mqaPlans.filter((p) => (p.purpose === "성능" ? "성능" : "기능") === purF);
  const next = purPlans.filter((p) => p.status === "활성" && isTimed(p.schedule)).map((p) => ({ p, at: nextRun(p.schedule) })).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
  const evPlans = purPlans.filter((p) => p.status === "활성" && !p.buildId && isOnNewBuild(p.schedule)).length;   // 버전 고정 계획은 새 버전에 돌지 않는다
  /* 한 번에 한 목적만 — 계획 목록도 그 목적의 계획만. 단말 · 예약 KPI 는 공통이라 늘 보인다 */
  const selP = planF === "전체" ? null : mqaPlans.find((p) => p.id === planF);
  const showFn = purF === "기능", showPerf = purF === "성능";
  /* KPI 5 — 웹 기능과 같은 4개 + 앱만의 1개(승인 대기). 누르면 그 값을 조치할 화면으로 (0 이면 누를 곳이 없다)
     단말 · 다음 예약은 카드가 아니라 상태 줄 (기능 · 성능 공통) */
  const review = mqaCases.filter((c) => c.status === "검토중").length, drafts = mqaCases.filter((c) => c.status === "초안").length;
  const KPI = [
    { label: "자동화 TC", value: mqaCases.length, sub: "승인 " + approved + "/" + mqaCases.length + (quar ? " · 격리 " + quar : ""), go: mqaCases.length ? () => nav && nav("mqa-cases") : null },
    { label: "PASS율 (최근 실행)", value: lastFull && passRate(lastFull) != null ? passRate(lastFull) + "%" : "—", tone: "text-emerald-600", sub: lastFull ? lastFull.id + " · v" + lastFull.build : "실행 없음", go: lastFull ? () => nav && nav("mqa-result-detail", lastFull.id) : null },
    { label: "불안정 · 지속 실패", value: unstable.length, tone: "text-amber-600", sub: "최근 " + FLAKY_WINDOW + "회 기준", go: unstable.length ? () => nav && nav("mqa-flaky") : null },
    { label: "미해결 결함", value: defectN, tone: defectN ? "text-red-600" : "text-slate-400", sub: "해결 전", go: defectN ? () => goList("defects", { kind: "defects", dom: "MQA", st: "해결 전" }) : null },
    { label: "승인 대기", value: review, tone: review ? "text-sky-600" : "text-slate-400", sub: "검토중 기준 · 초안 " + drafts, go: review ? () => goList("mqa-cases", { kind: "cases", dom: "MQA", st: "검토중" }) : null },
  ];
  const devOk = devs.filter((d) => d.state === "사용 가능").length, runOk = mqaRunners.filter((r) => runnerState(r) === "연결됨").length;
  const status = [
    { label: "단말 " + devOk + "/" + devs.length + " 사용 가능 · 러너 " + runOk + "/" + mqaRunners.length + " 연결", onClick: () => nav && nav("mqa-devices") },
    { label: "다음 예약 " + (next ? next.at.slice(5) + " " + next.p.name : "없음") + (evPlans ? " · 새 버전 시 계획 " + evPlans + "건" : ""), onClick: () => nav && nav("mqa-plan") },
  ];
  /* 실패 원인 분포 — 전체 실행의 실패 케이스 */
  /* '누가 고칠 일인가'(구분) 기준으로 묶는다 — 담당자 확정이 우선 · 세부 원인은 툴팁 (FQA 대시보드와 같은 규칙) */
  const causes = {}, causeSub = {};
  full.forEach((r) => mergedCases(r).filter((c) => c.st === "실패").forEach((c) => { const j = judgeOf(r, c, mqaRuns, mqaCases.find((x) => x.id === c.id)); const k = (r.judged || {})[c.id] || (j ? j.kind : "확인 필요"); const sc = j ? j.cause : "판정 불가"; causes[k] = (causes[k] || 0) + 1; (causeSub[k] = causeSub[k] || {})[sc] = ((causeSub[k] || {})[sc] || 0) + 1; }));
  const causeTot = Object.values(causes).reduce((a, b) => a + b, 0);
  const causeRows = kindsOf("MQA").filter((k) => causes[k]).map((k) => ({ k, n: causes[k], p: Math.round((causes[k] / causeTot) * 100), sub: Object.entries(causeSub[k]).map(([c, n]) => c + " " + n).join(" · ") }));
  /* 추이 — 일자별 실행 수 · PASS율, 앱 버전이 바뀐 날 표시 */
  const byDay = {};
  full.slice().reverse().forEach((r) => { const d = dOf(r); const b = (byDay[d] = byDay[d] || { d: d.slice(5), runs: 0, p: 0, n: 0, ver: r.build }); b.runs++; mergedCases(r).forEach((c) => { if (c.st === "통과" || c.st === "실패" || c.st === "경고") { b.n++; if (c.st === "통과") b.p++; } }); b.ver = r.build; });
  const trend = Object.values(byDay).map((x) => ({ ...x, pass: x.n ? Math.round((x.p / x.n) * 100) : null }));
  const verMarks = trend.filter((x, i) => i > 0 && x.ver !== trend[i - 1].ver);
  /* 스위트 건강도 = 그 스위트가 마지막으로 돈 전체 실행의 그 스위트 행만 (단말 행 모두) — 다른 스위트에서 돈 같은 케이스 결과를 빌려 오지 않는다.
     통과율은 KPI 와 같은 기준 (경고는 통과로 세지 않는다 · 건너뜀은 분모에서 뺀다). 돈 적 없으면 '미실행' (웹 대시보드와 같은 규칙) */
  const suiteHealth = mqaSuites.map((su) => { const cs = SL.suiteCases(su, mqaCases); const r = full.find((x) => (x.cases || []).some((c) => c.suiteId === su.id)); const rows = r ? r.cases.filter((c) => c.suiteId === su.id && ["통과", "실패", "경고"].includes(c.st)) : []; return { name: su.name, tc: cs.length, pass: rows.length ? Math.round((rows.filter((c) => c.st === "통과").length / rows.length) * 100) : null }; });
  /* 단말별 PASS율 — FQA 의 '브라우저별' 자리 */
  /* 단말별 — 실행 행(케이스 × 단말) 기준. 여러 단말에서 돈 회차는 그 단말의 행만 센다 */
  const byDev = devs.map((d) => { const rs = full.filter((r) => (r.devIds || [r.devId]).includes(d.id)); const cs = rs.flatMap((r) => (r.cases || []).filter((c) => (c.devId || r.devId) === d.id)).filter((c) => ["통과", "실패", "경고"].includes(c.st)); return { d, runs: rs.length, p: cs.length ? Math.round((cs.filter((c) => c.st === "통과").length / cs.length) * 100) : null }; });
  const recent = scoped.filter((r) => r.purpose !== "성능").slice(0, 5);
  return (
    <div className="space-y-4">
      <PageToolbar desc="기능 검증 · 성능 측정 현황 (실행 · 케이스 · 테스트 기기에서 파생)">
        {hasFn && hasPerf && <Seg options={["기능", "성능"]} value={purF} onChange={(v) => { setPurF(v); setPlanF("전체"); }} />}
        <div style={{ width: 200 }}><Select value={planF} onChange={(e) => setPlanF(e.target.value === "전체" ? "전체" : +e.target.value)}><option value="전체">전체 계획</option>{purPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <input type="date" value={from} min={minFromOf(to)} max={to} onChange={(e) => setRange(e.target.value, to)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-sky-500" />
        <span className="text-slate-500">~</span>
        <input type="date" value={to} min={from} max={today} onChange={(e) => setRange(from, e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-sky-500" />
      </PageToolbar>
      <StatusLine items={status} />
      {showFn && <>
      <div className="grid grid-cols-5 gap-3">{KPI.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} tone={k.tone} sub={k.sub} onClick={k.go} />)}</div>
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-800">실패 원인 분포 <span className="text-xs font-normal text-slate-500">전체 실행 기준</span></span><span className="text-xs text-slate-500">누가 고칠 일인가 기준 · 담당자 확정 우선</span></div>
        {causeTot === 0 ? <div className="rounded-lg bg-slate-100 px-3 py-4 text-center text-xs text-slate-500">기간 내 실패가 없습니다</div> : (<>
          <div className="flex h-2 overflow-hidden rounded bg-slate-100">{causeRows.map((c) => <div key={c.k} style={{ width: c.p + "%" }} className={KIND_BG[c.k] || "bg-slate-400"} title={c.k + " " + c.n + "건 — " + c.sub} />)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">{causeRows.map((c) => <span key={c.k} className="flex items-center gap-1.5"><span className={"inline-block h-2 w-2 rounded-sm " + (KIND_BG[c.k] || "bg-slate-400")} /><span className="text-slate-700">{c.k}</span><span className="text-slate-500" title={c.sub}>{c.n}건 · {c.p}%</span></span>)}</div>
        </>)}
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><TrendingUp size={15} className="text-sky-600" />실행 · PASS율 추이 <span className="font-normal text-slate-500">· 전체 실행 일자별 · 점선 = 앱 버전 변경</span></div>
        {!trend.length ? <div className="py-14 text-center text-xs text-slate-500">기간 내 완료된 실행이 없습니다.</div> : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trend}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="d" stroke={C.axis} fontSize={11} />
              <YAxis yAxisId="l" stroke={C.axis} fontSize={11} allowDecimals={false} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} stroke={C.axis} fontSize={11} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => [v, n]} labelFormatter={(l) => { const x = trend.find((t) => t.d === l); return l + (x ? " · 앱 v" + x.ver : ""); }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {verMarks.map((m) => <ReferenceLine key={m.d} x={m.d} yAxisId="l" stroke={C.axis} strokeDasharray="4 3" label={{ value: "v" + m.ver, position: "top", fontSize: 10, fill: C.axis }} />)}
              <Bar yAxisId="l" dataKey="runs" name="실행 수" fill={C.skyFill} radius={[3, 3, 0, 0]} barSize={22} />
              <Line yAxisId="r" type="monotone" dataKey="pass" name="PASS율(%)" stroke={C.sky} strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Activity size={15} className="text-sky-600" />스위트 건강도 (스위트 마지막 실행 기준)</div>
          <div className="space-y-2.5">{suiteHealth.map((su) => (
            <div key={su.name}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-700">{su.name} <span className="text-slate-500">· {su.tc} TC</span></span>{su.pass == null ? <span className="text-slate-500">미실행</span> : <span className="font-semibold" style={{ color: hbar(su.pass) }}>{su.pass}%</span>}</div>
              <div className="h-2 rounded bg-slate-100">{su.pass != null && <div className="h-2 rounded" style={{ width: su.pass + "%", background: hbar(su.pass) }} />}</div></div>
          ))}</div>
        </Card>
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">단말별 PASS율 <span className="font-normal text-slate-500">· 실행 단말 기준</span></div>
          <div className="space-y-3">{byDev.map(({ d, runs, p }) => (
            <div key={d.id}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-700">{d.model} <span className="text-slate-500">· {runs}회</span></span>{p == null ? <span className="text-slate-500">{d.state === "사용 가능" ? "실행 없음" : d.state}</span> : <span className="font-semibold" style={{ color: hbar(p) }}>{p}%</span>}</div>
              <div className="h-2 rounded bg-slate-100">{p != null && <div className="h-2 rounded" style={{ width: p + "%", background: hbar(p) }} />}</div></div>
          ))}</div>
          <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">전체 실행만 집계 · 실패한 스위트 다시 실행 같은 부분 실행은 제외합니다.</div>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><AlertTriangle size={15} className="text-amber-600" />빈발 실패 Top</span><button onClick={() => nav && nav("mqa-flaky")} className="text-xs text-sky-600">전체 보기</button></div>
          <div className="space-y-2">
            {!unstable.length && <div className="rounded-lg bg-slate-100 px-3 py-6 text-center text-xs text-slate-500">불안정 · 지속 실패 TC가 없습니다</div>}
            {unstable.slice(0, 4).map((h) => <div key={h.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm"><div><span className="font-mono text-xs text-sky-600">{h.id}</span> <span className="text-slate-800">{h.name}</span><div className="text-xs text-slate-500">최근 {h.runs}회 중 실패 {h.fails}회</div></div><Badge kind={h.kind === "불안정" ? "warn" : "fail"}>{h.kind}</Badge></div>)}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><span className="text-sm font-semibold text-slate-800">최근 실행</span><Btn icon={History} onClick={() => nav && nav("mqa-history")}>실행 이력으로</Btn></div>
          <table className="w-full text-sm"><tbody className="text-slate-700">
            {!recent.length && <tr><td className="px-4 py-6 text-center text-xs text-slate-500">실행 이력이 없습니다</td></tr>}
            {recent.map((r) => <tr key={r.id} onClick={() => nav && nav("mqa-result-detail", r.id)} className="cursor-pointer border-b border-slate-200 hover:bg-slate-100"><td className="px-4 py-2.5 font-mono text-xs text-sky-600">{r.id}</td><td className="text-slate-800">{r.planName}{r.partial && <span className="ml-1 text-xs text-slate-500">(부분)</span>}</td><td className="text-xs text-slate-500">v{r.build} · {String(r.device || "").split(" — ")[0]}</td><td className="text-xs text-slate-500">{r.status === "완료" ? resultText(r) : r.status === "실행 불가" ? "실행하지 못함" : ""}</td><td className="pr-4 text-right"><Badge kind={RUN_K[r.status]}>{r.status}</Badge></td></tr>)}
          </tbody></table>
        </Card>
      </div>
      </>}
      {/* 성능 측정 — 성능 계획이 있을 때만. 기능 지표와 섞지 않는다 (같은 기간 필터) */}
      {showPerf && <PerfDashSection plans={selP ? [selP] : mqaPlans} runs={mqaRuns.filter((r) => dOf(r) >= from && dOf(r) <= to)} nav={nav} title={showFn ? "성능 측정" : ""} defects={defects} onDefects={() => goList("defects", { kind: "defects", dom: "MQA", st: "해결 전" })} />}
      <Toast msg={msg} />
    </div>
  );
}
