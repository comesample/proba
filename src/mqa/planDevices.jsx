// 실행 계획 — 어디서: 러너 1곳 + 그 러너에 붙은 단말 n대 (기능 검증 · 성능 측정 공통)
//   러너를 고르면 그 러너의 단말이 모두 선택된다 — 빼고 싶은 단말만 끈다
//   러너에 단말이 없으면 막지 않고 알린다 (테스트 기기에서 연결하면 바로 쓸 수 있다)
import { AlertTriangle } from "lucide-react";
import { Field, Select } from "../common/ui.jsx";
import { flatDevices, osName, runnerState } from "./devices.js";

const chip = (on) => "rounded-lg border px-2.5 py-1 text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50");

export function PlanDevices({ runners, runnerId, devIds, onChange, onGoDevices, perf }) {
  const runner = (runners || []).find((r) => r.id === runnerId) || null;
  const devs = runner ? flatDevices([runner]) : [];
  const pick = (rid) => { const r = (runners || []).find((x) => x.id === rid); onChange({ runnerId: rid, devIds: r ? (r.devices || []).map((d) => d.id) : [] }); };
  const tog = (id) => onChange({ runnerId, devIds: (devIds || []).includes(id) ? devIds.filter((x) => x !== id) : [...(devIds || []), id] });
  return (
    <div className="space-y-2">
      <Field label="러너" hint="계획마다 러너 1곳 — 그 러너에 붙은 단말에서 돌립니다">
        <Select value={runnerId || ""} onChange={(e) => pick(e.target.value)}>
          <option value="">러너 선택</option>
          {(runners || []).map((r) => <option key={r.id} value={r.id}>{r.name} · 단말 {(r.devices || []).length}대{runnerState(r) !== "연결됨" ? " · " + runnerState(r) : ""}</option>)}
        </Select>
      </Field>
      {runner && (devs.length === 0
        ? <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{runner.name} 에 연결된 단말이 없습니다 — 테스트 기기에서 단말을 연결하세요{onGoDevices && <button onClick={onGoDevices} className="ml-2 text-sky-700">테스트 기기로</button>}</span></div>
        : <Field label={"단말 (" + (devIds || []).filter((id) => devs.some((d) => d.id === id)).length + " / " + devs.length + "대)"} hint={perf ? "같은 측정을 단말마다 잽니다 — 등급별로 두면 저사양 회귀를 놓치지 않습니다" : "고른 단말에서 같은 스위트를 동시에 돌리고, 결과는 케이스 기준으로 합칩니다"}>
            <div className="flex flex-wrap gap-1.5">{devs.map((d) => (
              <button key={d.id} onClick={() => tog(d.id)} className={chip((devIds || []).includes(d.id))} title={(d.tier ? d.tier : "등급 없음") + (d.power ? " · 전력 측정 가능" : "")}>
                {d.model} <span className="text-slate-400">{osName(d.sdk)}{d.tier ? " · " + d.tier : ""}</span>{d.state !== "사용 가능" && <span className="ml-1 text-amber-700">{d.state}</span>}
              </button>
            ))}</div>
          </Field>)}
    </div>
  );
}
