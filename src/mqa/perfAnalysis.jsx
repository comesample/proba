// 성능 측정 — 회귀 비교(두 회차 · 지표 차이) · 대시보드 성능 영역(마지막 회차 · 빌드별 추이)
//   기능의 회귀 비교 · 대시보드와 같은 자리에서, 성능 계획을 고르면 이 화면이 보인다
//   비교 단위 = (항목, 지표, 단말). 측정 실패 · 측정 불가 · 그 단말이 없던 회차는 '비교 불가'
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, Card, Field, KpiCard, Select } from "../common/ui.jsx";
import * as PF from "./perfLogic.js";
import * as PR from "./perfRun.js";

const fmtv = (m, v) => (v == null ? "—" : v + (m.unit === "건" ? "건" : " " + m.unit));
/* 두 값의 차이 — 악화(+) · 개선(-) · 유지. 크래시는 1건이라도 늘면 악화 */
export const deltaOf = (m, a, b, th) => {
  if (a == null || b == null) return { k: "비교 불가", pct: null };
  if (m.id === "crash") return b > a ? { k: "악화", pct: null } : b < a ? { k: "개선", pct: null } : { k: "유지", pct: 0 };
  const pct = a ? Math.round(((b - a) / a) * 1000) / 10 : 0;
  return pct > th ? { k: "악화", pct } : pct < -th ? { k: "개선", pct } : { k: "유지", pct };
};
const DK = { "악화": "text-red-700", "개선": "text-emerald-700", "유지": "text-slate-500", "비교 불가": "text-slate-400" };
const cvOfRun = (run, devId, key, mid) => { const s = (run.subs || []).find((x) => x.devId === devId && x.st === "완료"); const it = s && s.items.find((x) => x.key === key); return it && it.cv ? it.cv[mid] || 0 : 0; };
const valOf = (run, devId, key, mid) => { const s = (run.subs || []).find((x) => x.devId === devId && x.st === "완료"); const it = s && s.items.find((x) => x.key === key); return !it || it.fail ? null : it.vals[mid] == null ? null : it.vals[mid]; };
/* 비교 행 — B(나중) 회차에 있는 항목 × 지표 × 단말 */
export const compareRows = (A, B, th) => {
  const perf = B.perf || PF.PERF0; const rows = [];
  const keys = []; (B.subs || []).forEach((s) => (s.items || []).forEach((it) => { if (!keys.some((k) => k.key === it.key)) keys.push(it); }));
  keys.forEach((it) => PF.metricsFor(perf, it.kind).forEach((m) => (B.subs || []).filter((s) => s.st === "완료").forEach((s) => {
    const a = valOf(A, s.devId, it.key, m.id), b = valOf(B, s.devId, it.key, m.id);
    /* 어느 한쪽이 흔들림 큼이면 차이도 믿기 어렵다 — 악화로 단정하지 않고 표시한다 */
    const noisy = PR.cvLevel(Math.max(cvOfRun(A, s.devId, it.key, m.id), cvOfRun(B, s.devId, it.key, m.id)), B.cond) === "큼";
    rows.push({ key: it.key, label: it.label, m, dev: s, a, b, d: deltaOf(m, a, b, th), noisy, crit: PF.criterionOf(perf, it.key, m.id) });
  })));
  if (A.app && B.app) { const m = PF.metricOf("size"); rows.unshift({ key: "app", label: "앱 크기", m, dev: null, a: A.app.size, b: B.app.size, d: deltaOf(m, A.app.size, B.app.size, th), crit: B.app.crit }); }
  return rows;
};

/* ═══════════ 회귀 비교 (성능 계획) ═══════════ */
export function PerfRegression({ plan, runs, planSel, presetB }) {
  const rs = (runs || []).filter((r) => r.planId === plan.id && r.purpose === "성능" && r.status === "완료");
  const [aId, setA] = useState(null); const [bId, setB] = useState(presetB || null);
  const [th, setTh] = useState(10);
  const B = rs.find((r) => r.id === bId) || rs[0]; const A = rs.find((r) => r.id === aId) || rs.filter((r) => r !== B && String(r.startedAt) < String(B ? B.startedAt : ""))[0] || rs.find((r) => r !== B);
  const [onlyBad, setOnlyBad] = useState(true);
  if (rs.length < 2 || !A || !B) return <div className="space-y-4">{planSel}<Card className="p-8 text-center text-sm text-slate-500">이 계획에는 비교할 완료된 측정이 2건 이상 필요합니다 (현재 {rs.length}건).</Card></div>;
  const rows = compareRows(A, B, th);
  const cnt = (k) => rows.filter((r) => r.d.k === k).length;
  const shown = onlyBad ? rows.filter((r) => r.d.k === "악화" || (r.crit != null && r.b != null && r.b > r.crit)) : rows;
  const opt = (r) => r.id + " · v" + r.build + " · " + String(r.startedAt).slice(5, 16) + " · " + (r.verdict || "");
  const devDiff = (A.devIds || []).join() !== (B.devIds || []).join();
  return (
    <div className="space-y-4">
      {planSel}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4"><div className="mb-1 text-xs text-slate-500">A — 기준</div><Select value={A.id} onChange={(e) => setA(e.target.value)}>{rs.filter((r) => r.id !== B.id).map((r) => <option key={r.id} value={r.id}>{opt(r)}</option>)}</Select></Card>
        <Card className="border-sky-300 p-4"><div className="mb-1 text-xs text-slate-500">B — 비교</div><Select value={B.id} onChange={(e) => setB(e.target.value)}>{rs.filter((r) => r.id !== A.id).map((r) => <option key={r.id} value={r.id}>{opt(r)}</option>)}</Select></Card>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-red-600">{cnt("악화")}</div><div className="mt-0.5 text-xs text-slate-500">악화 (+{th}% 초과)</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-emerald-600">{cnt("개선")}</div><div className="mt-0.5 text-xs text-slate-500">개선</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-slate-700">{cnt("유지")}</div><div className="mt-0.5 text-xs text-slate-500">유지</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-slate-400">{cnt("비교 불가")}</div><div className="mt-0.5 text-xs text-slate-500">비교 불가 (측정 실패 · 없음)</div></Card>
      </div>
      {devDiff && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">두 회차의 단말 구성이 다릅니다 — 한쪽에만 있는 단말은 비교 불가입니다</div>}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs">
          <span className="text-sm font-semibold text-slate-800">지표 차이</span><span className="text-slate-500">v{A.build} → v{B.build}</span>
          <label className="ml-auto flex items-center gap-1.5 text-slate-600">악화 기준<select value={th} onChange={(e) => setTh(+e.target.value)} className="rounded border border-slate-300 bg-white px-1 py-0.5"><option value={5}>+5%</option><option value={10}>+10%</option><option value={20}>+20%</option></select></label>
          <label className="flex cursor-pointer items-center gap-1.5 text-slate-600"><input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} className="accent-sky-600" />악화 · 기준 초과만</label>
        </div>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-100 text-left text-slate-500"><th className="px-4 py-1.5 font-medium">항목</th><th className="font-medium">지표</th><th className="font-medium">단말</th><th className="font-medium">A</th><th className="font-medium">B</th><th className="font-medium">차이</th><th className="pr-4 font-medium">기준값</th></tr></thead>
          <tbody>{shown.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">{onlyBad ? "악화 · 기준 초과가 없습니다" : "비교할 값이 없습니다"}</td></tr> : shown.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-1.5 text-slate-800">{r.label}</td><td className="text-slate-600">{r.m.label}</td><td className="text-slate-500">{r.dev ? r.dev.model : "빌드"}</td>
              <td className="text-slate-500">{fmtv(r.m, r.a)}</td><td className={r.crit != null && r.b != null && r.b > r.crit ? "font-semibold text-red-700" : "text-slate-800"}>{fmtv(r.m, r.b)}</td>
              <td className={DK[r.d.k]}>{r.d.k}{r.d.pct != null && r.d.k !== "비교 불가" ? " (" + (r.d.pct > 0 ? "+" : "") + r.d.pct + "%)" : ""}{r.noisy && <span className="ml-1 text-amber-700" title="회차별 값이 크게 흔들려 이 차이를 믿기 어렵습니다 — 다시 측정해 확인하세요">· 흔들림 큼</span>}</td>
              <td className="pr-4 text-slate-500">{r.crit == null ? "—" : fmtv(r.m, r.crit)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <div className="text-xs text-slate-500">기준 이내여도 +{th}% 넘게 나빠지면 악화 · 흔들림 큼 표시는 다시 측정해 확인 · 크래시 · ANR 은 1건이라도 늘면 악화 · 측정 실패 · 측정 불가 · 한쪽에만 있는 단말은 비교 불가</div>
    </div>
  );
}

/* ═══════════ 성능 추이 — 빌드별 (계획 · 항목 · 지표를 고르면 단말마다 한 줄) ═══════════ */
/* 빌드별 추이 — 대시보드 성능 영역에 둔다 (따로 메뉴를 두지 않는다 · 기능의 통과율 추이와 같은 자리) */
export function PerfTrend({ plans, runs, nav, compact }) {
  const perfPlans = (plans || []).filter((p) => p.purpose === "성능");
  const [pid, setPid] = useState(perfPlans[0] ? perfPlans[0].id : null);
  const plan = perfPlans.find((p) => p.id === pid) || perfPlans[0] || null;
  const rs = plan ? (runs || []).filter((r) => r.planId === plan.id && r.purpose === "성능" && r.status === "완료").slice().sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt))) : [];
  const keys = []; rs.forEach((r) => (r.subs || []).forEach((s) => (s.items || []).forEach((it) => { if (!keys.some((k) => k.key === it.key)) keys.push(it); })));
  if (rs.some((r) => r.app)) keys.push({ key: "app", label: "앱 크기", kind: "app" });
  const [key, setKey] = useState(null); const k = keys.find((x) => x.key === key) || keys[0] || null;
  const ms = k ? PF.metricsFor(plan.perf || PF.PERF0, k.kind) : [];
  const [mid, setMid] = useState(null); const m = ms.find((x) => x.id === mid) || ms[0] || null;
  const devs = []; rs.forEach((r) => (r.subs || []).forEach((s) => { if (!devs.some((d) => d.devId === s.devId)) devs.push(s); }));
  if (!perfPlans.length) return <Card className="p-8 text-center text-sm text-slate-500">성능 측정 계획이 없습니다 — 실행 계획에서 목적을 '성능 측정' 으로 만들면 여기에서 빌드별 추이를 봅니다.</Card>;
  const crit = k && m ? PF.criterionOf(plan.perf, k.key, m.id) : null;
  const val = (r, d) => (k.key === "app" ? (r.app ? r.app.size : null) : valOf(r, d.devId, k.key, m.id));
  const series = k && m ? (k.key === "app" ? [{ d: { devId: "app", model: "빌드" }, vs: rs.map((r) => val(r)) }] : devs.map((d) => ({ d, vs: rs.map((r) => val(r, d)) }))) : [];
  const max = Math.max(1, crit || 0, ...series.flatMap((x) => x.vs.filter((v) => v != null)));
  return (
    <div className="space-y-4">
      {compact && <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">빌드별 추이 <span className="text-xs font-normal text-slate-500">· 단말마다 한 줄 · 두 회차 자세히는 회귀 비교</span></div>}
      <Card className="grid grid-cols-3 gap-3 p-3">
        <Field label="성능 계획"><Select value={plan ? plan.id : ""} onChange={(e) => { setPid(+e.target.value); setKey(null); setMid(null); }}>{perfPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="측정 항목"><Select value={k ? k.key : ""} onChange={(e) => { setKey(e.target.value); setMid(null); }}>{keys.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></Field>
        <Field label="지표"><Select value={m ? m.id : ""} onChange={(e) => setMid(e.target.value)}>{ms.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
      </Card>
      {rs.length === 0 ? <Card className="p-8 text-center text-sm text-slate-500">완료된 측정이 없습니다.</Card> : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2"><span className="text-sm font-semibold text-slate-800">{k.label} · {m.label}</span><span className="text-xs text-slate-500">빌드 {rs.length}개 · 낮을수록 좋음{crit != null ? " · 기준 " + fmtv(m, crit) : ""}</span></div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100 text-left text-slate-500"><th className="px-4 py-1.5 font-medium">단말</th>{rs.map((r) => <th key={r.id} className="font-medium"><button onClick={() => nav && nav("mqa-result-detail", r.id)} className="text-sky-600 hover:underline">v{r.build}</button></th>)}</tr></thead>
            <tbody>{series.map(({ d, vs }) => (
              <tr key={d.devId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 text-slate-800">{d.model} <span className="text-slate-400">{d.tier || ""}</span></td>
                {vs.map((v, i) => { const prev = i > 0 ? vs[i - 1] : null; const dl = i > 0 ? deltaOf(m, prev, v, 10) : null; const over = crit != null && v != null && v > crit; return (
                  <td key={i} className="py-2 pr-2 align-bottom">
                    <div className="flex h-12 items-end"><div className={"w-6 rounded-t " + (v == null ? "bg-slate-100" : over ? "bg-red-400" : dl && dl.k === "악화" ? "bg-amber-400" : "bg-sky-400")} style={{ height: (v == null ? 4 : Math.max(4, (v / max) * 48)) + "px" }} title={v == null ? "측정 없음 · 측정 실패" : fmtv(m, v)} /></div>
                    <div className={over ? "font-semibold text-red-700" : "text-slate-700"}>{v == null ? "—" : fmtv(m, v)}</div>
                    {dl && dl.k !== "비교 불가" && dl.k !== "유지" && <div className={"text-[10px] " + DK[dl.k]}>{dl.k}{dl.pct != null ? " " + (dl.pct > 0 ? "+" : "") + dl.pct + "%" : ""}</div>}
                  </td>
                ); })}
              </tr>
            ))}</tbody>
          </table>
          <div className="flex flex-wrap gap-3 border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-[10px] text-slate-500"><span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-sky-400" />기준 이내</span><span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />직전 대비 +10% 넘게 악화</span><span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-400" />기준 초과</span><span>· 빌드 이름을 누르면 그 회차 결과</span></div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════ 대시보드 성능 영역 — 성능 계획이 있을 때만 보인다 (기능만 하는 조직에는 나타나지 않음) ═══════════
   KPI(마지막 회차 판정 · 확인할 것 · 직전 대비 악화) → 계획별 마지막 회차 → 빌드별 추이 */
export function PerfDashSection({ plans, runs, nav, title, defects, onDefects }) {
  const perfPlans = (plans || []).filter((p) => p.purpose === "성능");
  if (!perfPlans.length) return null;
  const hist = (p) => (runs || []).filter((r) => r.planId === p.id && r.purpose === "성능" && r.status === "완료").sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const rows = perfPlans.map((p) => { const rs = hist(p); const r = rs[0]; const prev = rs[1]; return { p, r, f: r ? PR.findings(r) : [], worse: r && prev ? compareRows(prev, r, 10).filter((x) => x.d.k === "악화" && !x.noisy).length : 0 }; });
  const withRun = rows.filter((x) => x.r);
  const pass = withRun.filter((x) => x.r.verdict === "합격").length;
  /* KPI 5 — 누르면 그 값을 조치할 화면으로. 계획이 여럿이면 해당하는 가장 최근 회차 (0 이면 누를 곳이 없다) */
  const latest = withRun.slice().sort((a, b) => String(b.r.startedAt).localeCompare(String(a.r.startedAt)));
  const pick = (fn) => latest.find(fn);
  const open = (x) => (x ? () => nav && nav("mqa-result-detail", x.r.id) : null);
  const findN = withRun.reduce((n, x) => n + x.f.length, 0), worseN = withRun.reduce((n, x) => n + x.worse, 0), failN = withRun.reduce((n, x) => n + x.f.filter((y) => y.k === "측정 실패").length, 0);
  /* 미해결 결함 — 공통 결함 목록의 성능 결함 중 해결 전 (In Progress 포함). 계획 필터를 따른다 (그 계획 회차에서 등록한 것) */
  const runIds = new Set((runs || []).filter((r) => perfPlans.some((p) => p.id === r.planId)).map((r) => r.id));
  const openDef = (defects || []).filter((d) => d.domain === "MQA" && d.perf && d.status !== "Resolved" && runIds.has(d.run)).length;
  const worseRun = pick((x) => x.worse > 0);
  const KPI = [
    { label: "성능 판정 (마지막 회차)", value: withRun.length ? pass + "/" + withRun.length + " 합격" : "—", tone: pass === withRun.length && withRun.length ? "text-emerald-600" : "text-red-600", sub: "성능 계획 " + perfPlans.length + "개", go: open(pick((x) => x.r.verdict !== "합격") || latest[0]) },
    { label: "확인할 것", value: findN, tone: "text-amber-600", sub: "기준 초과 · 측정 실패 · 흔들림 큼", go: findN ? open(pick((x) => x.f.length)) : null },
    { label: "직전 대비 악화", value: worseN, tone: "text-red-600", sub: "+10% 넘게 · 흔들림 큰 값 제외", go: worseRun ? () => nav && nav("mqa-regression", worseRun.r.id) : null },
    { label: "측정 실패", value: failN, sub: "측정 중 케이스 실패", go: failN ? open(pick((x) => x.f.some((y) => y.k === "측정 실패"))) : null },
    { label: "미해결 결함", value: openDef, tone: openDef ? "text-red-600" : "text-slate-400", sub: "해결 전", go: openDef && onDefects ? onDefects : null },
  ];
  return (
    <div className="space-y-4">
      {title && <div className="flex items-center gap-2 pt-1 text-sm font-semibold text-slate-700"><span className="h-4 w-1 rounded bg-sky-500" />{title}</div>}
      <div className="grid grid-cols-5 gap-3">{KPI.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} tone={k.tone} sub={k.sub} onClick={k.go} />)}</div>
      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold text-slate-800">계획별 마지막 회차</div>
        <div className="space-y-2">{rows.map(({ p, r, f, worse }) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1"><div className="truncate text-slate-800">{p.name}</div><div className="text-xs text-slate-500">{r ? "v" + r.build + " · " + String(r.startedAt).slice(5, 16) + " · " + r.device : "측정 없음"}</div></div>
            {r && <div className="shrink-0 text-right text-xs text-slate-600">확인할 것 {f.length} · 직전 대비 악화 {worse}</div>}
            {r && <button onClick={() => nav && nav("mqa-regression", r.id)} className="shrink-0 text-xs text-sky-600">직전과 비교</button>}
            {r ? <button onClick={() => nav && nav("mqa-result-detail", r.id)}><Badge kind={PR.VERDICT_K[r.verdict] || "draft"}>{r.verdict}</Badge></button> : <Badge kind="draft">—</Badge>}
          </div>
        ))}</div>
      </Card>
      <PerfTrend plans={perfPlans} runs={runs} nav={nav} compact />
    </div>
  );
}
