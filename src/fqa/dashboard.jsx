// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useState } from "react";
import { Activity, AlertTriangle, History, TrendingUp } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Btn, Card, PageToolbar, Select, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { C, TOOLTIP } from "../common/theme.js";
import { CAUSE_BG, CAUSE_ORDER, CAUSE_TX, caseFlaky, healKey, healUsable, lastOf } from "./logic.js";
import * as SL from "./suiteLogic.js";
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
  // 집계는 전체 실행만 — 부분 실행(실패한 스위트 다시 실행)을 섞으면 실패가 과대 집계된다
  const finished = fruns.filter((r) => r.status === "완료" && !r.partial).slice().sort(byDate);
  const lastRun = finished[0];
  const recent = fruns.slice().sort(byDate).slice(0, 5);
  const totalTc = fqaCases.length;
  const approved = fqaCases.filter((c) => c.status === "승인").length;
  /* 불안정 화면과 같은 함수 — 두 화면이 같은 TC 를 다르게 분류하면 안 된다 */
  const flakyRows = caseFlaky(fruns, fqaCases, defects).map((h) => ({ ...h, rate: Math.round((h.fails / h.runs) * 100) }));
  const unstableN = flakyRows.length;
  const topFail = flakyRows.slice().sort((a, b) => b.rate - a.rate).slice(0, 4);
  const openDef = defects.filter((d) => (d.domain || "LQA") === "FQA" && d.status !== "Resolved").length;
  const suiteHealth = fqaSuites.map((su) => {
    const cs = SL.suiteCases(su, fqaCases);
    const rated = cs.filter((c) => ["PASS", "FAIL", "WARN"].includes(lastOf(fruns, c.id)));
    const pass = rated.length ? Math.round((cs.filter((c) => ["PASS", "WARN"].includes(lastOf(fruns, c.id))).length / rated.length) * 100) : null;
    return { name: su.name, tc: cs.length, pass };
  });
  // 추이 = 완료 실행을 일자별로 집계 (실행 수 + 평균 PASS율) — 하드코딩 없이 실행에서 파생
  const byDay = {}; finished.forEach((r) => { const d = dOf(r); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return; (byDay[d] = byDay[d] || []).push(rate(r)); });
  const trend = Object.keys(byDay).sort().map((d) => ({ d: d.slice(5).replace("-", "/"), runs: byDay[d].length, pass: Math.round(byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length) }));
  // 브라우저별 = 완료 실행을 '실행 브라우저(run.brow)'로 집계 (웹 실행만; API 실행은 brow 없음)
  // 한 실행이 여러 브라우저로 돌았으면 브라우저별 행으로 나눠 센다 (행에 brow 가 있다). 옛 실행은 실행 단위 브라우저로
  const browMap = {}; const pushB = (b, v) => (browMap[b] = browMap[b] || []).push(v);
  finished.filter((r) => r.brow).forEach((r) => {
    const bs = [...new Set((r.tcs || []).map((t) => t.brow).filter(Boolean))];
    if (!bs.length) { pushB(r.brow, rate(r)); return; }
    bs.forEach((b) => { const t = SL.tally((r.tcs || []).filter((x) => x.brow === b)); pushB(b, t.total ? Math.round((t.pass / t.total) * 1000) / 10 : 0); });
  });
  const browRows = Object.keys(browMap).sort().map((b) => ({ b, p: Math.round(browMap[b].reduce((a, x) => a + x, 0) / browMap[b].length), runs: browMap[b].length }));
  const planNow = (id) => (fqaPlans.find((p) => p.id === id) || {}).name;
  /* 🔑 보정 제안 지표 — 자가보정이 도움인지 소음인지 판단하는 유일한 신호는 채택률이다.
     제안 건수는 실행에서 파생하고(케이스에 저장하지 않는다), 검토 결과만 healState 에서 읽는다.
     승인률이 낮으면 제안을 늘릴 게 아니라 제안 규칙을 고쳐야 한다는 뜻이다. */
  const healIds = Array.from(new Set(finished.reduce((a, r) => a.concat(SL.mergedTcs(r).filter((t) => healUsable(fqaCases, t)).map(healKey)), [])));
  const healPend = healIds.filter((k) => !healState[k]).length;
  const healOk = healIds.filter((k) => healState[k] === "승인됨").length;
  /* 🔑 실패 원인 분포 — "무엇을 고칠까" 가 아니라 "어디에 투자할까" 를 답한다.
     로케이터 비중이 낮으면 자가보정은 곁다리다. 이 숫자 없이 정하면 근거가 없다.
     실행에서 파생하므로 기간·계획 필터를 그대로 따른다. */
  const causeCnt = {};
  finished.forEach((r) => SL.mergedTcs(r).forEach((t) => { if (t.cause) causeCnt[t.cause] = (causeCnt[t.cause] || 0) + 1; }));   // 케이스 기준으로 합쳐 센다
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
                <div><span className="font-mono text-xs text-sky-600">{h.id}</span> <span className="text-slate-800">{h.name}</span><div className="text-xs text-slate-500">최근 {h.runs}회 중 실패 {h.fails}{h.warns ? " · 재시도 통과 " + h.warns : ""}회</div></div>
                <Badge kind={h.kind === "불안정" ? "warn" : "fail"}>{h.kind}</Badge>
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