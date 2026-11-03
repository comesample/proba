// ============================================================
// MQA 작업 조건 선택 — 작업 환경 · 작업 단말 · 읽기 전용 필드
//   쓰는 곳: 테스트케이스 에디터(디버그 실행 · 요소 집기 · AI 생성) · 대상·환경(앱 실행 확인)
//   같은 표기를 한곳에서 만든다 — 화면마다 따로 쓰면 표기가 어긋나 사용자가 같은 것인지 알 수 없다
//     환경: "스테이징 · 앱 v3.2.0"   단말: "Galaxy S23 (Android 14) — 11층 QA PC", 목록은 러너(PC)별로 묶는다
// ============================================================
import { useState } from "react";
import { Lock } from "lucide-react";
import { Select } from "../common/ui.jsx";
import { deviceBlock, osName } from "./devices.js";

export const envText = (e) => e.env + " · " + (e.build ? "앱 v" + e.build : "앱 파일 없음");

export const EnvSelect = ({ envs, value, onChange, noProd }) => (
  <Select value={value || ""} onChange={(e) => onChange(e.target.value)}>
    {envs.length === 0 && <option value="">등록된 환경 없음 — 대상·환경에서 추가</option>}
    {envs.map((e) => <option key={e.env} value={e.env} disabled={noProd && e.prod}>{envText(e)}{noProd && e.prod ? " — 사용 불가" : ""}</option>)}
  </Select>
);

/* 단말 — 러너(PC) → 단말 두 단계로 고른다. 못 쓰는 단말도 보여주되 상태를 붙여 고르지 못하게 한다
   block(d): 화면별 추가 차단 사유 · runnerNote(id): 러너 단위로 막을 때 · soft: '사용 중' 은 막지 않음(나중에 쓸 선택) */
export const DeviceSelect = ({ devs, value, onChange, build, block, runnerNote, soft }) => {
  const runners = [...new Map(devs.map((d) => [d.runnerId, { id: d.runnerId, name: d.runnerName, off: devs.filter((x) => x.runnerId === d.runnerId).every((x) => x.state === "오프라인") }])).values()];
  const cur = devs.find((d) => d.id === value);
  const [rid, setRid] = useState(cur ? cur.runnerId : (runners[0] || {}).id);
  const r = cur ? cur.runnerId : rid;
  const why = (d) => (block && block(d)) || (soft && d.state === "사용 중" ? "" : deviceBlock(d, build));
  const mine = devs.filter((d) => d.runnerId === r);
  const pickRunner = (id) => { setRid(id); const ds = devs.filter((d) => d.runnerId === id); const ok = ds.find((d) => !why(d)) || ds[0] || null; onChange(ok ? ok.id : ""); };   // 쓸 수 있는 단말이 없으면 첫 단말을 고르고, 실행할 때 사유를 보여준다
  const note = (d) => { const b = why(d); if (!b) return ""; const bb = block && block(d); return " · " + (bb || d.state); };
  return (
    <div className="flex gap-2">
      <div className="w-40 shrink-0"><Select value={r || ""} onChange={(e) => pickRunner(e.target.value)}>
        {!runners.length && <option value="">러너 없음</option>}
        {runners.map((x) => { const n = runnerNote ? runnerNote(x.id) : ""; return <option key={x.id} value={x.id} disabled={!!n}>{x.name}{x.off ? " · 오프라인" : ""}{n ? " · " + n : ""}</option>; })}
      </Select></div>
      <div className="min-w-0 flex-1"><Select value={cur ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {(!cur || !mine.length) && <option value="">{mine.length ? "단말 선택" : "연결된 단말 없음"}</option>}
        {mine.map((d) => <option key={d.id} value={d.id} disabled={!!why(d)}>{d.model} ({osName(d.sdk)}){note(d)}</option>)}
      </Select></div>
    </div>
  );
};

/* 목업 전용 동작 — 실제 기능 버튼과 구별되게 점선 · 작은 글씨 · '목업' 표시 (실제 제품에는 없는 버튼) */
export const MockBtn = ({ onClick, children, title }) => (
  <button onClick={onClick} title={title || "목업 전용 — 실제 제품에는 없는 버튼입니다"} className="inline-flex shrink-0 items-center gap-1 rounded border border-dashed border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700 hover:bg-violet-100">
    <span className="font-semibold">목업</span><span>{children}</span>
  </button>
);

/* 바꿀 수 없는 값 — 비활성 선택 상자는 고장으로 오해하기 쉬워 '정해진 값' 모양으로 보여준다 */
export const ReadonlyField = ({ value, title }) => (
  <div title={title} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
    <span className="truncate">{value}</span><Lock size={13} className="shrink-0 text-slate-400" />
  </div>
);

export const FieldRow = ({ label, children }) => (
  <div className="flex items-center gap-2"><span className="w-16 shrink-0 text-xs text-slate-500">{label}</span><div className="min-w-0 flex-1">{children}</div></div>
);
