// 실행 계획 — 목적이 '성능 측정' 일 때만 보이는 칸 (기능 검증 계획에는 나타나지 않는다)
//   무엇을(측정 항목) · 무엇으로(지표) · 합격 기준 · 조건(반복 · 초기화 · 온도 · 배터리)
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Btn, Field, Input, Modal, Select } from "../common/ui.jsx";
import { perfCaps } from "./devices.js";
import * as PF from "./perfLogic.js";

const chip = (on) => "rounded-lg border px-2.5 py-1 text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50");

/* devs = 계획이 고른 단말 (러너 · 단말은 기능 계획과 같은 칸에서 고른다 — PlanDevices) */
export function PerfConfig({ perf, onChange, devs, cases, hasSuites, runs, planId }) {
  const p = { ...PF.PERF0, ...(perf || {}), items: { ...PF.PERF0.items, ...((perf || {}).items || {}) }, cond: { ...PF.PERF_COND0, ...((perf || {}).cond || {}) } };
  const set = (patch) => onChange({ ...p, ...patch });
  const setItems = (patch) => set({ items: { ...p.items, ...patch } });
  const setCond = (patch) => set({ cond: { ...p.cond, ...patch } });
  const [condOpen, setCondOpen] = useState(false);
  const togStart = (m) => setItems({ start: p.items.start.includes(m) ? p.items.start.filter((x) => x !== m) : [...p.items.start, m] });
  const togMetric = (id) => set({ metrics: p.metrics.includes(id) ? p.metrics.filter((x) => x !== id) : [...p.metrics, id] });
  const rows = PF.itemKeys(p, cases);
  const [critOpen, setCritOpen] = useState(false);
  const gaps = PF.capGaps(p, devs, perfCaps);
  const devIds = (devs || []).map((x) => x.id);
  const range = (key, mid) => PF.recentRange(runs, planId, devIds, key, mid);
  /* 기준이 하나도 없으면 판정 없이 기록만 된다 — 계획 화면에서 알린다 (크래시 · ANR 의 기본 0 은 기준으로 치지 않는다) */
  const has = (v) => v !== "" && v != null;
  const noCrit = rows.length > 0 && !Object.values(p.criteria || {}).some((r) => Object.values(r || {}).some(has));
  /* 계획 화면에는 요약만 — 케이스가 늘면 표가 한없이 길어지므로 입력은 팝업에서 한다 */
  const setRows = rows.filter((r) => Object.entries((p.criteria || {})[r.key] || {}).some(([mid, v]) => has(v) && PF.metricsFor(p, r.kind).some((m) => m.id === mid))).length;
  return (
    <div className="space-y-3.5">
      <Field label="측정 항목">
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5"><span className="w-14 shrink-0 text-slate-500">앱 시작</span>{PF.START_MODES.map((m) => <button key={m} onClick={() => togStart(m)} className={chip(p.items.start.includes(m))}>{m}</button>)}<span className="text-slate-400">스크립트 없이 잽니다</span></div>
          <div className="flex items-center gap-1.5"><span className="w-14 shrink-0 text-slate-500">유휴</span><div className="w-28"><Select value={p.items.idle} onChange={(e) => setItems({ idle: +e.target.value })}><option value={0}>안 함</option><option value={5}>5분</option><option value={10}>10분</option><option value={30}>30분</option></Select></div><span className="text-slate-400">첫 화면에 둔 채 메모리 · CPU · 네트워크</span></div>
          <label className={"flex items-center gap-2 " + (hasSuites ? "cursor-pointer" : "text-slate-400")}><input type="checkbox" disabled={!hasSuites} checked={!!p.items.cases && hasSuites} onChange={(e) => setItems({ cases: e.target.checked })} className="accent-sky-600" /><span className="w-12 shrink-0">케이스별</span><span className="text-slate-400">{hasSuites ? "위에서 고른 스위트를 돌리며 케이스 하나를 측정 구간 하나로 잽니다" : "스위트를 고르면 쓸 수 있습니다"}</span></label>
        </div>
      </Field>
      <Field label="지표">
        <div className="flex flex-wrap gap-1.5">{PF.PERF_METRICS.map((m) => <button key={m.id} onClick={() => togMetric(m.id)} className={chip(p.metrics.includes(m.id))} title={"수집: " + m.src + (m.needs === "power" ? " · 전력 측정 칩이 있는 단말 · 유휴 측정에서만" : "") + (m.opt ? " · 서버 응답에 따라 흔들림" : "")}>{m.label} <span className="text-slate-400">{m.unit}</span>{m.opt && <span className="ml-0.5 text-slate-400">· 선택</span>}</button>)}</div>
      </Field>
      {gaps.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={12} className="mr-1 inline" />{gaps.slice(0, 3).join(" · ")}{gaps.length > 3 ? " 외 " + (gaps.length - 3) + "건" : ""}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="반복 횟수"><Select value={p.cond.iters} onChange={(e) => setCond({ iters: +e.target.value })}><option value={5}>5회</option><option value={10}>10회</option><option value={20}>20회</option></Select></Field>
        <Field label="첫 회 버림" hint="캐시 · 컴파일 영향을 덜어냅니다"><Select value={p.cond.warmup} onChange={(e) => setCond({ warmup: +e.target.value })}><option value={0}>안 함</option><option value={1}>1회</option><option value={2}>2회</option></Select></Field>
      </div>
      {/* 합격 기준 = 성능 계획의 게이트 — 하나라도 넘으면 불합격. 빈 칸은 판정하지 않고 값만 기록한다 (크래시 · ANR 은 빈 칸도 0) */}
      <Field label="합격 기준" hint="기준값을 넘으면 불합격 · 빈 칸은 판정 없이 기록만 (크래시 · ANR 은 0)">
        {rows.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500">측정 항목을 고르면 기준값을 정할 수 있습니다</div> : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">
            <span className="text-slate-600">항목 {rows.length}개 중 <strong className="text-slate-800">{setRows}개</strong>에 기준{rows.length - setRows > 0 && <span className="text-slate-400"> · 기준 없음 {rows.length - setRows}개</span>}</span>
            <Btn icon={SlidersHorizontal} onClick={() => setCritOpen(true)}>합격 기준 설정</Btn>
          </div>
        )}
        {noCrit && <div className="mt-1.5 text-xs text-amber-700"><AlertTriangle size={12} className="mr-1 inline" />합격 기준이 없어 판정 없이 기록만 됩니다</div>}
      </Field>
      <div>
        <button onClick={() => setCondOpen(!condOpen)} className="flex items-center gap-1 text-xs font-medium text-slate-600">{condOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}측정 조건 <span className="font-normal text-slate-400">— 데이터 초기화 {p.cond.clearData ? "함" : "안 함"} · {p.cond.compile} · 온도 {p.cond.maxTemp}℃ 이하 · 배터리 {p.cond.minBatt}% 이상 · 흔들림 {p.cond.cvWarn}/{p.cond.cvBad}%</span></button>
        {condOpen && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="col-span-2 flex cursor-pointer items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={p.cond.clearData} onChange={(e) => setCond({ clearData: e.target.checked })} className="accent-sky-600" />회차마다 앱 데이터 초기화 <span className="text-slate-400">(콜드 시작 조건 · 로그인이 필요하면 스위트 앞 케이스가 다시 로그인)</span></label>
            <Field label="컴파일 상태 고정"><Select value={p.cond.compile} onChange={(e) => setCond({ compile: e.target.value })}>{PF.COMPILE_OPTS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <div />
            <Field label="기기 온도 상한 (℃)" hint="넘으면 식을 때까지 기다립니다"><Input type="number" value={p.cond.maxTemp} onChange={(e) => setCond({ maxTemp: +e.target.value || 0 })} /></Field>
            <Field label="배터리 하한 (%)" hint="낮으면 '환경 오류' — 불합격이 아닙니다"><Input type="number" value={p.cond.minBatt} onChange={(e) => setCond({ minBatt: +e.target.value || 0 })} /></Field>
            <Field label="흔들림 참고 (%)" hint="회차별 값의 변동계수가 넘으면 '참고' 표시"><Input type="number" value={p.cond.cvWarn} onChange={(e) => setCond({ cvWarn: +e.target.value || 0 })} /></Field>
            <Field label="흔들림 큼 (%)" hint="넘으면 '흔들림 큼 — 다시 측정 권장' (판정은 함)"><Input type="number" value={p.cond.cvBad} onChange={(e) => setCond({ cvBad: +e.target.value || 0 })} /></Field>
          </div>
        )}
      </div>
      {critOpen && <CriteriaModal p={p} rows={rows} range={range} onClose={() => setCritOpen(false)} onApply={(criteria) => { set({ criteria }); setCritOpen(false); }} />}
    </div>
  );
}

/* 합격 기준 팝업 — 행 = 측정 항목, 열 = 고른 지표. 해당 없는 칸은 '—'.
   케이스가 많아도 다룰 수 있게: 케이스 검색 · 기준 없는 항목만 · 케이스 전체에 같은 값 넣기. [적용] 전까지는 계획에 반영하지 않는다 */
function CriteriaModal({ p, rows, range, onClose, onApply }) {
  const [crit, setC] = useState(() => JSON.parse(JSON.stringify(p.criteria || {})));
  const [q, setQ] = useState("");
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [bulk, setBulk] = useState({});
  const cols = PF.PERF_METRICS.filter((m) => (p.metrics || []).includes(m.id));
  const has = (v) => v !== "" && v != null;
  const applies = (r, m) => m.for.includes(r.kind);
  const val = (key, mid) => ((crit[key] || {})[mid] != null ? crit[key][mid] : "");
  const setV = (key, mid, v) => setC((c) => { const r = { ...(c[key] || {}) }; if (v === "") delete r[mid]; else r[mid] = +v; return { ...c, [key]: r }; });
  const rowSet = (r) => cols.some((m) => applies(r, m) && has(val(r.key, m.id)));
  const caseRows = rows.filter((r) => r.kind === "case");
  const shown = rows.filter((r) => (!q || r.kind !== "case" || r.label.toLowerCase().includes(q.toLowerCase())) && (!emptyOnly || !rowSet(r)));
  const caseCols = cols.filter((m) => m.for.includes("case"));
  const fillCases = (mid) => { const v = bulk[mid]; if (v === "" || v == null) return; setC((c) => { const n = { ...c }; caseRows.forEach((r) => { n[r.key] = { ...(n[r.key] || {}), [mid]: +v }; }); return n; }); };
  const head = (g) => <tr className="bg-slate-50"><td colSpan={cols.length + 1} className="px-2 py-1.5 text-xs font-medium text-slate-500">{g}</td></tr>;
  const line = (r) => (
    <tr key={r.key} className="border-b border-slate-100">
      <td className="max-w-[220px] truncate whitespace-nowrap px-2 py-1.5 text-slate-700" title={r.label}>{r.label}</td>
      {cols.map((m) => { if (!applies(r, m)) return <td key={m.id} className="px-2 py-1.5 text-center text-slate-300">—</td>; const g = range(r.key, m.id); return (
        <td key={m.id} className="px-2 py-1.5"><input type="number" value={val(r.key, m.id)} placeholder={m.zero ? "0" : ""} onChange={(e) => setV(r.key, m.id, e.target.value)} className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-800" />{g && <div className="mt-0.5 text-[11px] text-slate-400" title={"최근 " + g.n + "회 측정 범위"}>{g.lo === g.hi ? g.lo : g.lo + "~" + g.hi}</div>}</td>
      ); })}
    </tr>
  );
  const top = shown.filter((r) => r.kind !== "case"), cs = shown.filter((r) => r.kind === "case");
  return (
    <Modal wide title="합격 기준" onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        {caseRows.length > 0 && <div className="w-56"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="케이스 검색" /></div>}
        <label className="flex cursor-pointer items-center gap-1.5 text-slate-600"><input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} className="accent-sky-600" />기준 없는 항목만</label>
        <span className="text-slate-400">기준값을 넘으면 불합격 · 빈 칸은 기록만 (크래시 · ANR 은 0) · 칸 아래 숫자는 최근 3회 측정 범위</span>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200" style={{ maxHeight: "60vh" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-2 py-2 font-medium">항목</th>{cols.map((m) => <th key={m.id} className="whitespace-nowrap px-2 py-2 font-medium">{m.label} <span className="font-normal text-slate-400">{m.unit}</span></th>)}</tr></thead>
          <tbody>
            {top.length > 0 && head("앱 · 시작 · 유휴")}
            {top.map(line)}
            {caseRows.length > 0 && head("케이스별 " + caseRows.length + "개" + (cs.length !== caseRows.length ? " · 표시 " + cs.length : ""))}
            {caseRows.length > 1 && caseCols.length > 0 && (
              <tr className="border-b border-slate-200 bg-sky-50/40">
                <td className="px-2 py-1.5 text-slate-600">케이스 전체에 같은 값</td>
                {cols.map((m) => !m.for.includes("case") ? <td key={m.id} /> : (
                  <td key={m.id} className="px-2 py-1.5"><div className="flex items-center gap-1"><input type="number" value={bulk[m.id] != null ? bulk[m.id] : ""} onChange={(e) => setBulk({ ...bulk, [m.id]: e.target.value })} className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right" /><button onClick={() => fillCases(m.id)} className="text-sky-700 hover:underline">넣기</button></div></td>
                ))}
              </tr>
            )}
            {cs.map(line)}
            {shown.length === 0 && <tr><td colSpan={cols.length + 1} className="px-2 py-6 text-center text-slate-400">조건에 맞는 항목이 없습니다</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Btn onClick={onClose}>취소</Btn><Btn kind="primary" onClick={() => onApply(crit)}>적용</Btn></div>
    </Modal>
  );
}
