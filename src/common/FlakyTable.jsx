// ============================================================
// 불안정 화면 표 — FQA · MQA 공용 (판정은 도메인이 하고, 표는 같은 모양으로 그린다)
//   판정 규칙 (두 도메인 같음 · 최근 실행 FLAKY_WINDOW 회 · TC별)
//     · 같은 버전 안에서 통과/실패가 섞이거나 재시도 통과가 있음 = 불안정 → 격리
//     · 연속 2회 실패 또는 버전이 바뀐 뒤 계속 실패 = 지속 실패 → 결함 등록
//     · 담당자가 결함으로 확정한 실패 = 결함
//   row { id, name, suite, quarantined, kind, regressed, runs, fails, warns, w: [{ st: 통과|실패|재시도 통과, run, ver }],
//         cause?: { text, note }, heal?, hasDefect }
// ============================================================
import { Fragment } from "react";
import { Badge, Card } from "./ui.jsx";

export const FLAKY_WINDOW = 5;
const KIND_K = { "불안정": "warn", "지속 실패": "fail", "결함": "fail" };
const SQ = { "통과": "bg-emerald-500", "실패": "bg-red-500", "재시도 통과": "bg-amber-400" };

export function FlakyTable({ rows, verLabel = "버전", onQuar, onDefect, onOpen }) {
  const flakyN = rows.filter((r) => r.kind === "불안정").length, persistN = rows.length - flakyN;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm"><span className="text-slate-500">최근 실행 {FLAKY_WINDOW}회 기준 (TC별)</span><span className="text-slate-500">·</span><span className="text-amber-700">불안정 {flakyN}건</span><span className="text-red-700">지속 실패 · 결함 {persistN}건</span></div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-4 py-2.5 font-medium">TC</th><th className="font-medium">문제 빈도</th><th className="font-medium">유형</th><th className="font-medium">최근 추세</th><th></th></tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">불안정 · 지속 실패로 분류된 TC가 없습니다.</td></tr>}
            {rows.map((h) => { const pct = Math.round(((h.fails + (h.warns || 0)) / h.runs) * 100); return (
              <tr key={h.id} className="border-b border-slate-200 text-slate-700 hover:bg-slate-100">
                <td className="px-4 py-3"><div className="font-mono text-xs text-sky-600">{h.id}</div><div className="flex items-center gap-1.5 text-slate-800">{h.name}{h.quarantined && <Badge kind="draft">격리됨</Badge>}</div><div className="text-xs text-slate-500">{h.suite || "—"}</div></td>
                <td className="pr-4" style={{ minWidth: 150 }}><div className="mb-0.5 text-xs text-slate-500">실패 {h.fails}{h.warns ? " · 재시도 통과 " + h.warns : ""} / {h.runs}회</div><div className="h-1.5 rounded bg-slate-100" style={{ width: 130 }}><div className={"h-1.5 rounded " + (h.kind === "불안정" ? "bg-amber-500" : "bg-red-500")} style={{ width: pct + "%" }} /></div></td>
                <td><div className="flex flex-wrap items-center gap-1"><Badge kind={KIND_K[h.kind]}>{h.kind}</Badge>{h.regressed && <Badge kind="info">{verLabel} 변경 후</Badge>}{h.heal && <Badge kind="active">보정</Badge>}{h.cause && <span className="text-xs text-slate-500">{h.cause.text}{h.cause.note ? " · " + h.cause.note : ""}</span>}</div></td>
                <td><div className="flex items-end gap-1">{h.w.map((x, i) => (<Fragment key={i}>{i > 0 && h.w[i - 1].ver !== x.ver && <span className="mx-0.5 h-4 w-px bg-slate-300" title={h.w[i - 1].ver + " → " + x.ver} />}<span title={x.run + " · " + x.ver + " · " + x.st} className={"inline-block h-3 w-3 rounded-sm " + (SQ[x.st] || "bg-slate-300")} /></Fragment>))}</div><div className="mt-0.5 text-[10px] text-slate-400">{[...new Set(h.w.map((x) => x.ver))].join(" → ")}</div></td>
                <td className="pr-4 text-right whitespace-nowrap">
                  {/* 🔑 격리 여부를 먼저 본다 — 유형으로만 나누면 격리된 케이스가 지속 실패로 바뀌는 순간 해제 버튼이 사라진다 */}
                  {h.quarantined ? <button onClick={() => onQuar(h)} className="mr-3 text-xs text-sky-600 hover:text-sky-700">격리 해제</button>
                    : h.kind === "불안정" ? <button onClick={() => onQuar(h)} className="mr-3 text-xs text-amber-700 hover:text-amber-800">격리</button>
                    : h.hasDefect ? <span className="mr-3 text-xs text-slate-500">결함 등록됨</span> : <button onClick={() => onDefect(h)} className="mr-3 text-xs text-red-700 hover:text-red-800">결함 등록</button>}
                  <button onClick={() => onOpen(h)} className="text-xs text-sky-600">케이스 열기</button>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </Card>
      <div className="text-xs text-slate-500">판정 기준: 최근 실행 {FLAKY_WINDOW}회를 TC별로 봅니다 · <span className="text-amber-700">같은 {verLabel} 안에서 통과/실패 혼재 또는 재시도 통과 = 불안정 → 격리</span> · <span className="text-red-700">연속 2회 실패 또는 {verLabel} 변경 후 계속 실패 = 지속 실패 → 결함</span> · 담당자가 결함으로 확정한 실패는 결함으로 분류 · 격리된 TC는 실행 대상에서 빠지므로 복귀는 사람이 판단해 해제합니다</div>
    </>
  );
}
