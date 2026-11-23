// 실행 계획 — 목적이 '성능 측정' 일 때만 보이는 칸 (기능 검증 계획에는 나타나지 않는다)
//   무엇을(측정 항목) · 무엇으로(지표) · 합격 기준 · 조건(반복 · 초기화 · 온도 · 배터리)
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Field, Input, Select } from "../common/ui.jsx";
import { perfCaps } from "./devices.js";
import * as PF from "./perfLogic.js";

const chip = (on) => "rounded-lg border px-2.5 py-1 text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50");

/* devs = 계획이 고른 단말 (러너 · 단말은 기능 계획과 같은 칸에서 고른다 — PlanDevices) */
export function PerfConfig({ perf, onChange, devs, cases, hasSuites }) {
  const p = { ...PF.PERF0, ...(perf || {}), items: { ...PF.PERF0.items, ...((perf || {}).items || {}) }, cond: { ...PF.PERF_COND0, ...((perf || {}).cond || {}) } };
  const set = (patch) => onChange({ ...p, ...patch });
  const setItems = (patch) => set({ items: { ...p.items, ...patch } });
  const setCond = (patch) => set({ cond: { ...p.cond, ...patch } });
  const [condOpen, setCondOpen] = useState(false);
  const togStart = (m) => setItems({ start: p.items.start.includes(m) ? p.items.start.filter((x) => x !== m) : [...p.items.start, m] });
  const togMetric = (id) => set({ metrics: p.metrics.includes(id) ? p.metrics.filter((x) => x !== id) : [...p.metrics, id] });
  const rows = PF.itemKeys(p, cases);
  const setCrit = (key, mid, v) => { const b = { ...(p.criteria || {}) }; const r = { ...(b[key] || {}) }; if (v === "") delete r[mid]; else r[mid] = +v; b[key] = r; set({ criteria: b }); };
  const gaps = PF.capGaps(p, devs, perfCaps);
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <tbody>{rows.map((r) => { const ms = PF.metricsFor(p, r.kind); return (
                <tr key={r.key} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">{r.label}</td>
                  <td className="px-2 py-1.5"><div className="flex flex-wrap gap-2">{ms.length === 0 ? <span className="text-slate-400">고른 지표 중 이 항목에 해당하는 것이 없습니다</span> : ms.map((m) => (
                    <label key={m.id} className="flex items-center gap-1 text-slate-500">{m.label}<input type="number" value={((p.criteria || {})[r.key] || {})[m.id] != null ? p.criteria[r.key][m.id] : ""} placeholder={m.zero ? "0" : ""} onChange={(e) => setCrit(r.key, m.id, e.target.value)} className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-800" />{m.unit}</label>
                  ))}</div></td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
        )}
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
    </div>
  );
}
