// ============================================================
// FQA 실행 만들기 — 실행 화면(계획 실행)과 결과 화면(실패한 스위트 다시 실행)이 같은 함수를 쓴다
//   실행 단위 = (스위트, 케이스) · 스위트마다 위에서부터 순서대로 (suiteLogic.runItems)
//   앞 케이스가 실패하면 같은 스위트의 뒤 케이스는 건너뜀 — 경고(재시도 통과)는 실패가 아니라 계속 간다
//   목업: 판정은 큐에 넣을 때 미리 정한다(직전 결과 + 재시도 시 낮은 확률로 불안정)
// ============================================================
import { lastOf, suiteNm, surfacesOf } from "./logic.js";
import * as SL from "./suiteLogic.js";

// 계획의 대상·환경은 ID 참조 → 접점(웹/API)을 조회해 실행 옵션 표시에 사용
export const envRefOf = (plan, systems) => { const sy = (systems || []).find((s) => s.id === ((plan.targetRef || {}).systemId)); const e = sy ? (sy.envs || []).find((x) => x.env === (plan.targetRef || {}).env) : null; return { sy, e, label: sy ? sy.name + " · " + (plan.targetRef || {}).env : "미지정" }; };
// 실행 시점의 대상·환경·빌드 버전을 run에 스탬프 — "이 회귀가 어느 빌드에서 나왔나"를 추적하기 위함
const stampOf = (plan, systems) => { const { e, label } = envRefOf(plan, systems); return { target: label, ver: (e && e.ver && e.ver !== "-") ? e.ver : "-" }; };
export const nextRunId = (runs) => "FRUN-" + ((runs || []).reduce((m, r) => Math.max(m, parseInt((r.id.split("-")[1] || "0"), 10)), 500) + 1);

/* 실행할 브라우저 — 웹 접점이 있는 환경이면 계획이 고른 브라우저 전부, 아니면 브라우저 없음 */
export const browsersOf = (plan, env) => ((env && env.webUrl) ? ((plan.brow && plan.brow.length) ? plan.brow : ["Chromium"]) : [""]);

/* 실행 행 — { key, brow, suiteId, suiteName, id, name, rev, v, skipWhy, flaky, dur }
   브라우저마다 스위트를 한 번씩 돈다(브라우저 순서 → 스위트 순서). 웹 케이스가 없는 스위트(API 만)는 한 번만 돈다.
   결과는 케이스 기준으로 합쳐 본다 — 상세에서 어느 브라우저였는지 보여준다 (suiteLogic.mergedTcs) */
export const buildTcs = (plan, { cases, suites, runs, systems }, onlySuites) => {
  const retry = plan.retry != null ? plan.retry : 0;
  const brs = browsersOf(plan, envRefOf(plan, systems).e);
  const items = SL.runItems(plan, cases, suites, onlySuites);
  const webSuite = {}; items.forEach((it) => { if (/웹/.test(surfacesOf(it.c))) webSuite[it.suiteId] = true; });
  const broken = {};   // (브라우저, 스위트)별 '앞 단계 실패'
  const out = [];
  brs.forEach((b, bi) => items.forEach((it) => {
    if (bi > 0 && !webSuite[it.suiteId]) return;
    const c = it.c, bw = webSuite[it.suiteId] ? b : "", bk = bw + "|" + it.suiteId;
    const head = { key: (bw ? bw + ":" : "") + it.suiteId + ":" + c.id, ...(bw && brs.length > 1 ? { brow: bw } : {}), suiteId: it.suiteId, suiteName: it.suiteName, id: c.id, name: c.name, rev: c.rev || 1 };
    const why = it.skip || broken[bk];
    if (why) { out.push({ ...head, v: "SKIP", skipWhy: why, dur: "-" }); return; }
    const base = lastOf(runs, c.id) === "FAIL" ? "FAIL" : "PASS";
    // flaky = 1차 실패 후 재시도로 통과 — 재시도(retry>0)가 있어야 성립. 통과지만 불안정 → WARN.
    // 보정(heal)은 여기서 만들지 않는다 — 보정은 "실패한 뒤 제안"이라 판정을 바꾸지 않는다.
    const flaky = retry > 0 && base === "PASS" && Math.random() < 0.18;
    if (base === "FAIL") broken[bk] = "앞 단계 실패 (" + c.id + ")";
    out.push({ ...head, v: flaky ? "WARN" : base, flaky: flaky || undefined, dur: (Math.round((Math.random() * 3 + 0.3) * 10) / 10) + "s" });
  }));
  return out;
};
/* 실제로 돌 케이스가 있는가 — 건너뜀만 있으면 실행하지 않는다 */
export const runnableCount = (tcs) => (tcs || []).filter((t) => t.v !== "SKIP").length;

/* 실행 한 건 — 큐 맨끝에 '대기'로 넣을 객체. 다시 실행은 partial · note 를 단다(집계에서 빠진다) */
export const makeRun = (plan, ctx, { onlySuites, note, trig = "수동" } = {}) => {
  const tcs = buildTcs(plan, ctx, onlySuites);
  const { e } = envRefOf(plan, ctx.systems);
  const t = SL.tally(tcs);
  // 웹 케이스가 하나도 없으면(API 만) 브라우저 없이 돈 실행이다 — 결과 화면의 증적 탭도 API 기준이 된다
  const webAny = SL.runItems(plan, ctx.cases, ctx.suites, onlySuites).some((it) => /웹/.test(surfacesOf(it.c)));
  const sids = onlySuites || (plan.suiteIds || []);
  return {
    id: nextRunId(ctx.runs), planId: plan.id, plan: plan.name, name: plan.name, suite: sids.map((x) => suiteNm(ctx.suites, x)).join(" · "), ...stampOf(plan, ctx.systems),
    pw: "1.50.0", brVer: "132.0.6834.83", brow: webAny ? browsersOf(plan, e).filter(Boolean).join(" · ") : "", trig, by: "QA Engineer", status: "대기 중", prog: 0, progt: "대기", dur: "-", at: "방금 전",
    gate: plan.gate != null ? plan.gate : 95, total: t.total, pass: 0, fail: 0, warn: 0, skip: t.skip, tcs,
    ...(onlySuites ? { partial: true, note: note || "실패한 스위트 다시 실행" } : {}),
  };
};
