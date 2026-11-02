// ============================================================
// MQA 작업 조건 선택 — 작업 환경 · 작업 단말 · 읽기 전용 필드
//   쓰는 곳: 테스트케이스 에디터(디버그 실행 · 요소 집기 · AI 생성) · 대상·환경(앱 실행 확인)
//   같은 표기를 한곳에서 만든다 — 화면마다 따로 쓰면 표기가 어긋나 사용자가 같은 것인지 알 수 없다
//     환경: "스테이징 · 앱 v3.2.0"   단말: "Galaxy S23 (Android 14) — 11층 QA PC", 목록은 러너(PC)별로 묶는다
// ============================================================
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

/* 단말 — 러너(PC)별로 묶는다. 못 쓰는 단말도 보여주되 상태를 붙여 고르지 못하게 한다 */
export const DeviceSelect = ({ devs, value, onChange, build }) => {
  const groups = [...new Set(devs.map((d) => d.runnerName))];
  return (
    <Select value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {devs.length === 0 && <option value="">연결된 단말 없음 — 테스트 기기에서 연결</option>}
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {devs.filter((d) => d.runnerName === g).map((d) => { const b = deviceBlock(d, build); return <option key={d.id} value={d.id} disabled={!!b}>{d.model} ({osName(d.sdk)}) — {d.runnerName}{b ? " · " + d.state : ""}</option>; })}
        </optgroup>
      ))}
    </Select>
  );
};

/* 바꿀 수 없는 값 — 비활성 선택 상자는 고장으로 오해하기 쉬워 '정해진 값' 모양으로 보여준다 */
export const ReadonlyField = ({ value, title }) => (
  <div title={title} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
    <span className="truncate">{value}</span><Lock size={13} className="shrink-0 text-slate-400" />
  </div>
);

export const FieldRow = ({ label, children }) => (
  <div className="flex items-center gap-2"><span className="w-16 shrink-0 text-xs text-slate-500">{label}</span><div className="min-w-0 flex-1">{children}</div></div>
);
