// 성능 측정 실행 — 진행 상세(실행 화면) · 결과 상세(실행 이력 → 결과)
//   결과는 '항목 × 단말' 표: 지표 값(중앙값 등) · 기준값 · 초과 표시. 환경 오류 · 실행 불가 단말은 판정에서 빠진다
import { Fragment, useState } from "react";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Square } from "lucide-react";
import { useApp } from "../common/context.js";
import { Badge, Btn, Card, Toast, useToast } from "../common/ui.jsx";
import { osName } from "./devices.js";
import * as PF from "./perfLogic.js";
import * as PR from "./perfRun.js";

const mmss = (ms) => { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const fmt = (m, v) => (v == null ? "—" : v + (m.unit === "건" ? "건" : " " + m.unit));
export const perfProg = (r) => { const t = (r.subs || []).reduce((n, s) => n + (s.total || 0), 0); const d = (r.subs || []).reduce((n, s) => n + (s.st === "완료" ? s.total : s.prog || 0), 0); return [d, t]; };

/* 실행 화면 오른쪽 — 단말별 진행 · 로그 */
export function PerfRunDetail({ run, onStop, onOpen }) {
  const live = run.status === "실행 중";
  const [d, t] = perfProg(run);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <div className="min-w-0"><div className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800">{run.planName}<Badge kind="active">성능</Badge></div><div className="font-mono text-xs text-sky-600">{run.id} <span className="font-sans text-slate-500">· 단말 {run.device} · 앱 v{run.build}</span></div></div>
        <div className="flex shrink-0 items-center gap-2">
          {live ? <span className="flex items-center gap-1 text-xs text-red-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE {mmss(run.elapsed)}</span> : <Badge kind={PR.VERDICT_K[run.verdict] || "draft"}>{run.status === "완료" ? run.verdict : run.status}</Badge>}
          {live && <Btn icon={Square} onClick={onStop}>중단</Btn>}
          {(run.status === "완료" || run.status === "중단") && <Btn icon={FileText} onClick={onOpen}>결과 보기</Btn>}
        </div>
      </div>
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs text-slate-500"><span>측정 <span className="text-slate-800">{d}/{t}</span></span><div className="h-1.5 flex-1 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: (t ? (d / t) * 100 : 0) + "%" }} /></div>{live && <span className="text-slate-700">{run.phase}</span>}</div>
      <div className="space-y-1.5 border-b border-slate-200 p-4">{(run.subs || []).map((s) => (
        <div key={s.devId} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-slate-800">{s.model}</span><span className="w-12 shrink-0 text-slate-500">{s.tier || "—"}</span>
          <div className="h-1.5 flex-1 rounded bg-slate-100"><div className={"h-1.5 rounded " + (s.st === "완료" ? "bg-emerald-500" : "bg-sky-500")} style={{ width: (s.total ? ((s.st === "완료" ? s.total : s.prog || 0) / s.total) * 100 : 0) + "%" }} /></div>
          <Badge kind={PR.SUB_K[s.st] || "draft"}>{s.st}</Badge>
          {s.why && <span className="max-w-[40%] truncate text-slate-500" title={s.why}>{s.why}</span>}
        </div>
      ))}</div>
      <div className="overflow-y-auto bg-slate-900 p-2.5 font-mono text-xs leading-relaxed" style={{ maxHeight: 220 }}>
        {(run.log || []).slice(-60).map((l, i) => <div key={i} className="flex gap-2"><span className={"w-10 shrink-0 font-semibold " + (l.lv === "FAIL" ? "text-red-300" : l.lv === "PASS" ? "text-emerald-300" : "text-slate-400")}>{l.lv}</span><span className="text-slate-200">{l.t}</span></div>)}
      </div>
    </Card>
  );
}

/* 결과 상세 — 위: 확인할 것(기준 초과 · 측정 실패 · 흔들림 큼) / 아래: 항목별 상세(항목 × 단말 · 단서). 직전과의 비교는 회귀 비교에서 */
const FIND_K = { "초과": "fail", "측정 실패": "warn", "흔들림 큼": "info" };
export function PerfResultView({ run, back, backLabel, nav }) {
  const { updateMqaRun } = useApp();
  const [msg, flash] = useToast();
  const perf = run.perf || PF.PERF0;
  const subs = run.subs || [];
  const done = subs.filter((s) => s.st === "완료");
  const keys = []; done.forEach((s) => s.items.forEach((it) => { if (!keys.some((k) => k.key === it.key)) keys.push({ key: it.key, label: it.label, kind: it.kind }); }));
  const finds = PR.findings(run);
  const cond = run.cond || PF.PERF_COND0;
  const [open, setOpen] = useState(() => Object.fromEntries(keys.map((k) => [k.key, finds.some((f) => f.key === k.key)])));
  const defects = run.defects || {};
  const fkey = (f) => f.key + "|" + (f.dev ? f.dev.devId : "") + "|" + (f.mid || "");
  /* 결함 등록 — 측정값 · 기준값 · 시작 단계 · 트레이스를 첨부한다 (목업: 번호만 붙인다) */
  const regDefect = (f) => { const no = "BUG-" + (1400 + Object.keys(defects).length + 1); updateMqaRun(run.id, { defects: { ...defects, [fkey(f)]: no } }); flash(no + " 결함 초안 — " + f.label + (f.dev ? " · " + f.dev.model : "") + " · 측정값 · 트레이스 첨부 (목업)"); };
  const findText = (f) => { const m = f.mid ? PF.metricOf(f.mid) : null;
    return f.k === "측정 실패" ? f.why : f.k === "흔들림 큼" ? m.label + " 흔들림 ±" + f.cv + "% — 다시 측정 권장" : m.label + " " + fmt(m, f.val) + " (기준 " + fmt(m, f.crit) + ")"; };
  return (
    <div className="space-y-4">
      {back && <button onClick={back} className="inline-flex items-center gap-1 text-xs text-sky-600"><ChevronLeft size={14} />{backLabel || "실행 이력"}</button>}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="flex items-center gap-2"><span className="font-mono text-sm text-sky-600">{run.id}</span><span className="text-sm font-semibold text-slate-800">{run.planName}</span><Badge kind="active">성능</Badge></div>
          <div className="mt-1 text-xs text-slate-500">{run.sysName} · {run.env} · 앱 v{run.build} · {run.device} · {run.trigger} · {run.startedAt}{run.endedAt ? " ~ " + String(run.endedAt).slice(11) : ""}</div>
          <div className="mt-0.5 text-xs text-slate-500">반복 {cond.iters}회 (첫 {cond.warmup}회 버림) · {cond.clearData ? "데이터 초기화 · " : ""}{cond.compile} · 온도 {cond.maxTemp}℃ 이하 · 배터리 {cond.minBatt}% 이상</div>
        </div>
        <div className="text-right"><Badge kind={PR.VERDICT_K[run.verdict] || "draft"}>{run.status === "완료" ? run.verdict || "판정 없음" : run.status}</Badge>
          <div className="mt-1 text-xs text-slate-500">{run.verdict === "판정 불완전" ? "측정 실패가 있어 합격으로 보지 않습니다" : run.verdict === "합격" ? "모든 기준 이내" : run.verdict === "불합격" ? "기준을 넘은 값이 있습니다" : "기준이 없는 항목은 기록만"}</div>
          {nav && <button onClick={() => nav("mqa-regression", run.id)} className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600">직전 회차와 비교<ArrowRight size={12} /></button>}
        </div>
      </Card>
      {/* 확인할 것 — 이 회차에서 사람이 봐야 하는 것만 */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2"><span className="text-sm font-semibold text-slate-800">확인할 것</span><span className="text-xs text-slate-500">{finds.length ? finds.length + "건" : "없음"}</span></div>
        {finds.length === 0 ? <div className="px-4 py-4 text-xs text-slate-500">기준 초과 · 측정 실패 · 흔들림 큰 값이 없습니다.</div> : (
          <div>{finds.map((f, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs last:border-0">
              <Badge kind={FIND_K[f.k]}>{f.k}</Badge>
              <span className="w-40 shrink-0 truncate text-slate-800">{f.label}</span>
              <span className="w-24 shrink-0 truncate text-slate-500">{f.dev ? f.dev.model : "빌드"}</span>
              <span className={"min-w-0 flex-1 truncate " + (f.k === "초과" ? "text-red-700" : "text-slate-700")} title={findText(f)}>{findText(f)}</span>
              {f.k !== "흔들림 큼" && (defects[fkey(f)] ? <span className="shrink-0 font-mono text-red-700">{defects[fkey(f)]}</span> : <button onClick={() => regDefect(f)} className="shrink-0 text-red-700 hover:text-red-800">결함 등록</button>)}
            </div>
          ))}</div>
        )}
      </Card>
      {run.app && <Card className="flex items-center gap-3 p-3 text-sm"><span className="text-slate-500">앱 크기 (설치 후)</span><span className={"font-semibold " + (run.app.over ? "text-red-700" : "text-slate-800")}>{run.app.size} MB</span>{run.app.crit != null && <span className="text-xs text-slate-500">기준 {run.app.crit} MB{run.app.over ? " · 초과" : ""}</span>}<span className="ml-auto text-xs text-slate-400">빌드마다 한 번 · 단말 무관</span></Card>}
      {/* 단말 상태 — 환경 오류 · 실행 불가는 잰 적이 없는 것 (불합격 아님) */}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">단말</div>
        <table className="w-full text-xs"><tbody>{subs.map((s) => (
          <tr key={s.devId} className="border-b border-slate-100 last:border-0">
            <td className="px-4 py-2 text-slate-800">{s.model} <span className="text-slate-400">{osName(s.sdk)}</span></td><td className="text-slate-500">{s.tier || "등급 없음"}</td>
            <td className="text-slate-500">배터리 {s.batt}% · {s.temp}℃</td>
            <td className="pr-4 text-right"><Badge kind={s.st === "완료" ? PR.VERDICT_K[PR.subVerdict(s)] : PR.SUB_K[s.st] || "draft"}>{s.st === "완료" ? PR.subVerdict(s) : s.st}</Badge>{s.why && <div className="mt-0.5 text-slate-500">{s.why}</div>}</td>
          </tr>
        ))}</tbody></table>
      </Card>
      {/* 항목별 상세 — 확인할 것이 있는 항목만 펼쳐 둔다 */}
      {keys.map((k) => { const ms = PF.metricsFor(perf, k.kind); const isOpen = !!open[k.key]; const hit = finds.filter((f) => f.key === k.key).length; return (
        <Card key={k.key} className="overflow-hidden">
          <button onClick={() => setOpen({ ...open, [k.key]: !isOpen })} className="flex w-full items-center gap-2 border-b border-slate-200 px-4 py-2 text-left"><span className="text-slate-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span><span className="text-sm font-semibold text-slate-800">{k.label}</span>{hit > 0 && <span className="text-xs text-amber-700">확인할 것 {hit}</span>}</button>
          {isOpen && (<>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100 text-left text-slate-500"><th className="px-4 py-1.5 font-medium">지표</th><th className="font-medium">기준값</th>{done.map((s) => <th key={s.devId} className="font-medium">{s.model}<span className="ml-1 font-normal text-slate-400">{s.tier}</span></th>)}</tr></thead>
            <tbody>{ms.map((m) => { const c = PF.criterionOf(perf, k.key, m.id); return (
              <tr key={m.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-1.5 text-slate-700" title={"수집: " + m.src + " · " + m.agg}>{m.label}</td>
                <td className="text-slate-500">{c == null ? "—" : fmt(m, c)}</td>
                {done.map((s) => { const it = s.items.find((x) => x.key === k.key) || { vals: {}, over: [] };
                  if (it.fail) return <td key={s.devId} className="text-amber-700" title={it.fail}>측정 실패</td>;
                  const v = it.vals[m.id]; const o = (it.over || []).includes(m.id); const lv = PR.cvLevel((it.cv || {})[m.id], cond); return (
                  <td key={s.devId} className={o ? "font-semibold text-red-700" : "text-slate-800"} title={it.iters && it.iters[m.id] ? "회차별: " + it.iters[m.id].join(", ") + " · 흔들림 ±" + it.cv[m.id] + "%" : v === null ? "이 단말에서는 측정 불가" : ""}>
                    {v === null ? <span className="text-slate-400">측정 불가</span> : fmt(m, v)}{o && " ▲"}
                    {lv && <span className={"ml-1 text-[10px] " + (lv === "큼" ? "text-amber-700" : "text-slate-400")}>±{it.cv[m.id]}%</span>}
                  </td>
                ); })}
              </tr>
            ); })}</tbody>
          </table>
          {/* 측정 실패 사유 — 그 단말에서 케이스가 실패해 값을 내지 않았다 */}
          {done.filter((s) => (s.items.find((x) => x.key === k.key) || {}).fail).map((s) => <div key={s.devId} className="border-t border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">{s.model} — {s.items.find((x) => x.key === k.key).fail} · 이 구간의 성능 값은 내지 않았습니다</div>)}
          {/* 단서 — 시작: 단계별 시간 · 사용 흐름: 버벅임 원인 (Android 12 이상) */}
          {k.kind === "start" && <div className="space-y-1 border-t border-slate-100 px-4 py-2">{done.map((s) => { const it = s.items.find((x) => x.key === k.key); if (!it || !it.phases) return null; const tot = PR.START_PHASES.reduce((n, [p]) => n + (it.phases[p] || 0), 0) || 1; const top = PR.START_PHASES.filter(([p]) => it.phases[p]).sort((a, b) => it.phases[b[0]] - it.phases[a[0]])[0]; return (
            <div key={s.devId} className="flex items-center gap-2 text-xs"><span className="w-24 shrink-0 truncate text-slate-600">{s.model}</span>
              <div className="flex h-3 flex-1 overflow-hidden rounded bg-slate-100">{PR.START_PHASES.map(([p, lb], i) => it.phases[p] ? <div key={p} className={["bg-slate-400", "bg-sky-500", "bg-indigo-400", "bg-emerald-400"][i]} style={{ width: (it.phases[p] / tot) * 100 + "%" }} title={lb + " " + it.phases[p] + " ms"} /> : null)}</div>
              <span className="w-40 shrink-0 text-slate-500">가장 긴 단계: {top ? top[1] + " " + it.phases[top[0]] + "ms" : "—"}</span>
            </div>
          ); })}<div className="flex flex-wrap gap-3 pt-0.5 text-[10px] text-slate-500">{PR.START_PHASES.map(([p, lb], i) => <span key={p} className="flex items-center gap-1"><span className={"inline-block h-2 w-2 rounded-sm " + ["bg-slate-400", "bg-sky-500", "bg-indigo-400", "bg-emerald-400"][i]} />{lb}</span>)}<span>· Perfetto 시작 분석 (앱 코드 없이)</span></div></div>}
          {k.kind === "case" && done.some((s) => (s.items.find((x) => x.key === k.key) || {}).jankCause) && <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-1.5 text-xs text-slate-500"><span>버벅임 원인</span>{done.map((s) => { const it = s.items.find((x) => x.key === k.key); return it && it.jankCause ? <span key={s.devId}>{s.model}: 앱이 늦음 {it.jankCause.app}% · 시스템 쪽 {it.jankCause.sys}%</span> : null; })}<span className="text-slate-400">(Android 12 이상 · FrameTimeline)</span></div>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-500"><span>Perfetto 트레이스</span>{done.map((s) => { const it = s.items.find((x) => x.key === k.key); return it ? <button key={s.devId} onClick={() => flash(it.trace + " — ui.perfetto.dev 에서 엽니다 (목업)")} className="text-sky-600 hover:underline">{s.model}</button> : null; })}</div>
          </>)}
        </Card>
      ); })}
      {!keys.length && <Card className="p-8 text-center text-xs text-slate-500">{run.status === "완료" ? "측정을 마친 단말이 없습니다 — 단말 상태를 확인하세요" : "측정이 끝나지 않았습니다"}</Card>}
      <div className="text-xs text-slate-500">값은 반복 측정의 중앙값(크래시 · ANR 은 합계) · 칸에 마우스를 올리면 회차별 값 · ±n% 는 흔들림(변동계수 — {cond.cvWarn || 10}% 넘으면 표시, {cond.cvBad || 20}% 넘으면 다시 측정 권장) · ▲ 기준 초과</div>
      <Toast msg={msg} />
    </div>
  );
}
