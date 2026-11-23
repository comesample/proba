// ============================================================
// 성능 측정 실행 — 판정 규칙 · 목업 측정값 (엔진의 진행 흐름은 flow.jsx startPerfRun)
//   실행 흐름 (단말마다 동시에):
//     설치 → 조건 맞추기(데이터 초기화 · 컴파일 고정 · 온도 · 배터리 확인) → 항목별 반복 측정(첫 회 버림) → 집계(중앙값 등)
//   · 환경 검사에 걸린 단말은 '환경 오류' — 잰 적이 없는 것이지 불합격이 아니다 (회차 판정에서 뺀다)
//   · 쓸 수 없는 단말은 '실행 불가' + 이유
//   · 증적: 회차 · 단말 · 항목마다 Perfetto 트레이스 1개 (ui.perfetto.dev 에서 연다)
// ============================================================
import * as PF from "./perfLogic.js";

const TIER_F = { "고사양": 1, "중사양": 1.25, "저사양": 1.6, "": 1.3 };
/* 기준값 — 단말 등급 · 항목 종류로 정한다 (목업). 실 구현은 수집한 값 그대로 */
const BASE = {
  start: { "콜드": { start: 640, mem: 205, cpu: 520, crash: 0 }, "웜": { start: 270, mem: 198, cpu: 210, crash: 0 }, "핫": { start: 120, mem: 196, cpu: 90, crash: 0 } },
  idle: (min) => ({ mem: 232, cpu: 140 * min, net: 0.35 * min, power: 410, crash: 0 }),
  case: { jank: 3.2, slow: 18, mem: 290, cpu: 1750, net: 1.2, crash: 0 },
};
const SCALE = { start: 1, jank: 1.5, slow: 1, mem: 0.25, cpu: 1, net: 0, power: 0.2, crash: 0 };   // 등급 영향의 크기 (지표마다 다르다)
const round = (mid, v) => (mid === "start" || mid === "cpu" || mid === "mem" || mid === "power" || mid === "slow" ? Math.round(v) : Math.round(v * 10) / 10);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/* 흔들림 — 변동계수(CV) = 회차별 값이 평균에서 평균적으로 몇 % 벗어나는가. 반복값이 있는 지표만 (크래시 건수 · 앱 크기 제외) */
const cvOf = (a) => { if (!a || a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; if (!m) return 0; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); return Math.round((sd / m) * 1000) / 10; };
export const cvLevel = (cv, cond) => (cv > ((cond || {}).cvBad || 20) ? "큼" : cv > ((cond || {}).cvWarn || 10) ? "참고" : "");
/* 시작 시간 단계 — Perfetto 시작 분석(시스템 구간)으로 앱 코드 없이 나눈다: 프로세스 시작 → 앱 초기화(bindApplication) → 첫 화면 생성(Activity) → 첫 프레임 */
export const START_PHASES = [["proc", "프로세스 시작"], ["bind", "앱 초기화"], ["act", "화면 생성"], ["frame", "첫 프레임"]];
const PHASE_W = { "콜드": [0.18, 0.42, 0.28, 0.12], "웜": [0, 0, 0.72, 0.28], "핫": [0, 0, 0.6, 0.4] };

/* 한 단말 · 한 항목의 측정 — 반복값 · 집계값 · 흔들림 · 단서. drift = 빌드에 따른 변화(목업 시드용 · 1 = 변화 없음)
   opt.fail = 측정 중 케이스가 실패함 → 값을 내지 않는다 (그 구간의 값은 의미가 없다 — 잘못된 성능 결과를 맞다고 오인하지 않게)
   opt.noise = 회차 간 흔들림 크기 (목업) · opt.phaseDrift = 시작 단계 중 늘어난 단계 (목업) */
export const measureItem = (item, metrics, dev, cond, drift = {}, rnd = Math.random, opt = {}) => {
  if (opt.fail) return { vals: {}, iters: {}, cv: {}, fail: opt.fail };
  const f = TIER_F[dev.tier || ""] || 1.3;
  const base = item.kind === "start" ? BASE.start[item.key.split(":")[1]] : item.kind === "idle" ? BASE.idle(+String(item.label).replace(/\D/g, "") || 10) : { ...BASE.case };
  const vals = {}, iters = {}, cv = {};
  const noise = opt.noise || 0.12;
  metrics.forEach((m) => {
    if (base[m.id] == null) return;
    if (m.needs === "power" && !dev.power) { vals[m.id] = null; return; }   // 그 단말에서는 측정 불가
    const b = base[m.id] * (1 + (f - 1) * (SCALE[m.id] != null ? SCALE[m.id] : 1)) * (drift[m.id] || 1);
    if (m.id === "crash") { const n = rnd() < 0.02 ? 1 : 0; vals[m.id] = n; return; }
    const arr = Array.from({ length: cond.iters }, () => round(m.id, b * (1 + (rnd() - 0.5) * (m.id === (opt.noisyMetric || m.id) ? noise : 0.12))));
    iters[m.id] = arr; vals[m.id] = median(arr); cv[m.id] = cvOf(arr);
  });
  const out = { vals, iters, cv };
  /* 단서 — 시작은 단계별 시간, 사용 흐름은 버벅임 원인(Android 12 이상 FrameTimeline) */
  if (item.kind === "start" && vals.start != null) {
    const w = PHASE_W[item.key.split(":")[1]] || PHASE_W["콜드"]; const pd = opt.phaseDrift || {};
    const raw = START_PHASES.map(([k], i) => w[i] * (pd[k] || 1)); const sum = raw.reduce((a, b) => a + b, 0) || 1;
    out.phases = Object.fromEntries(START_PHASES.map(([k], i) => [k, Math.round((vals.start * raw[i]) / sum)]));
  }
  if (item.kind === "case" && vals.jank != null && (dev.sdk || 0) >= 31) { const app = Math.round(62 + rnd() * 20); out.jankCause = { app, sys: 100 - app }; }
  return out;
};
/* 판정 — 기준값을 넘은 지표 목록. 기준이 하나도 없으면 judged = false (판정 없음) */
export const judgeItem = (perf, key, vals) => {
  const over = [], checked = [];
  Object.keys(vals).forEach((mid) => { const c = PF.criterionOf(perf, key, mid); if (c == null || vals[mid] == null) return; checked.push(mid); if (vals[mid] > c) over.push(mid); });
  return { over, judged: checked.length > 0 };
};
/* 단말 결과 → 판정: 불합격(하나라도 초과) · 판정 불완전(측정 실패가 있음 — 합격으로 오인하지 않게) · 합격 · 판정 없음
   환경 오류 · 실행 불가는 판정 없음 */
export const subVerdict = (sub) => {
  if (sub.st !== "완료") return "판정 없음";
  if (sub.items.some((it) => (it.over || []).length)) return "불합격";
  if (sub.items.some((it) => it.fail)) return "판정 불완전";
  return sub.items.some((it) => it.judged) ? "합격" : "판정 없음";
};
export const runVerdict = (run) => {
  const vs = (run.subs || []).map(subVerdict).concat(run.app && run.app.over ? ["불합격"] : run.app && run.app.judged ? ["합격"] : []);
  return vs.includes("불합격") ? "불합격" : vs.includes("판정 불완전") ? "판정 불완전" : vs.includes("합격") ? "합격" : "판정 없음";
};
/* 확인할 것 — 결과 화면 맨 위 요약 (기준 초과 · 측정 실패 · 흔들림 큼) */
export const findings = (run) => {
  const out = []; const cond = run.cond || {};
  if (run.app && run.app.over) out.push({ k: "초과", key: "app", label: "앱 크기", dev: null, mid: "size", val: run.app.size, crit: run.app.crit });
  (run.subs || []).filter((s) => s.st === "완료").forEach((s) => s.items.forEach((it) => {
    if (it.fail) { out.push({ k: "측정 실패", key: it.key, label: it.label, dev: s, why: it.fail }); return; }
    (it.over || []).forEach((mid) => out.push({ k: "초과", key: it.key, label: it.label, dev: s, mid, val: it.vals[mid], crit: PF.criterionOf(run.perf, it.key, mid) }));
    Object.keys(it.cv || {}).forEach((mid) => { if (cvLevel(it.cv[mid], cond) === "큼") out.push({ k: "흔들림 큼", key: it.key, label: it.label, dev: s, mid, cv: it.cv[mid] }); });
  }));
  return out;
};
export const overCount = (run) => (run.subs || []).reduce((n, s) => n + s.items.reduce((m, it) => m + (it.over || []).length, 0), 0) + (run.app && run.app.over ? 1 : 0);
export const VERDICT_K = { "합격": "pass", "불합격": "fail", "판정 불완전": "warn", "판정 없음": "draft" };
export const SUB_K = { "대기": "draft", "실행 중": "warn", "완료": "pass", "환경 오류": "info", "실행 불가": "fail", "중단": "draft" };
/* 앱 크기 — 빌드마다 한 번 (단말 무관) */
export const appSize = (perf, build, drift = 1) => {
  const v = Math.round(96.4 * drift * 10) / 10; const c = PF.criterionOf(perf, "app", "size");
  return { size: v, judged: c != null, over: c != null && v > c, crit: c, build };
};
export const traceName = (runId, dev, item) => runId + "_" + dev.id + "_" + String(item.key).replace(/[:\s]/g, "-") + ".perfetto-trace";
