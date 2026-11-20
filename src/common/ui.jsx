// ============================================================
// 공통 UI 프리미티브 (단일 출처)
// - LQA(App.jsx) 적용 완료. 신규/NQA 화면은 여기서 import.
// - LQA · FQA · 관리자 콘솔 전 영역이 이 단일 출처를 사용(2026-07-01 통일).
//
// 🔑 테마는 라이트 단일이다 (2026-08-07 전면 전환 · 2026-08-31 다크 분기 제거).
//   전에는 ThemeProvider 로 dark/light 를 갈랐는데, 화면의 인라인 클래스는 Provider 가
//   못 바꾸므로 dark 로 돌려도 절반만 바뀌는 상태였다. 지원 계획이 없어 걷어냈다.
// ============================================================
import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Search } from "lucide-react";
import { C } from "./theme.js";

/* 🔑 오버레이는 반드시 이 Portal 로 감싼다.
   position:fixed 는 조상에 transform·filter·contain 이 하나라도 있으면
   뷰포트가 아니라 그 조상 기준으로 갇힌다 — Dim 이 화면 일부만 덮는 원인이다.
   body 직속으로 렌더하면 조상이 무엇이든 항상 화면 전체를 덮는다. */
export const Portal = ({ children }) => createPortal(children, document.body);

/* 🔑 "지금 보고 있는 항목" 표시 — 목록·행 전 화면 단일 출처.
   얇은 테두리 하나로는 흰 카드가 줄지어 선 목록에서 눈에 띄지 않는다.
   배경까지 바꿔야 한눈에 잡힌다.

   🔑 ring 을 쓰지 않는다 — ring 은 box-shadow 라 border 와 겹치면 테두리가 두 겹이 되고,
      Windows 배율(125·150%)에서 변마다 반올림이 달라져 두께가 들쭉날쭉해 보인다.
      두께는 카드 기본값(1px)을 그대로 쓰고 색만 바꾼다 — 안쪽 여백도 안 줄어든다.

   🔑 ! 를 붙이는 이유 — Card 가 border-slate-200 을 이미 갖고 있고, border-color 끼리는
      우선순위가 같아 CSS 에 늦게 나오는 쪽이 이긴다. Tailwind 팔레트 순서상 slate 가 sky 보다
      뒤라서 ! 없이는 회색이 이긴다(파란색이 아예 안 나온다). 지우지 말 것. */
export const SEL_CARD = "!border-sky-600 bg-sky-50";
export const SEL_IDLE = "hover:border-slate-300 hover:bg-slate-50";
/* 표·목록의 행 — hover(회색)와 색 계열 자체를 다르게 둔다 */
export const SEL_ROW  = "bg-sky-100 hover:bg-sky-100";


/* 상태 배지 — 실서비스 배지(components/ui/badge.tsx)와 같은 모양: 옅은 채움 + 진한 테두리 + 검은 글자
   통과 = 파랑 · 실패 = 빨강 · 경고 = 주황 · 정보 = 회색 · 진행/선택 = 청록 · 초안 = 연한 회색 */
export function Badge({ kind = "info", children }) {
  const blue = "border-st-blue-line bg-st-blue/20 text-ink", red = "border-st-red-line bg-st-red/20 text-ink", amber = "border-st-amber-line bg-st-amber/20 text-ink";
  const gray = "border-st-gray-line bg-st-gray text-ink", teal = "border-st-teal-line bg-st-teal-soft text-st-teal-ink", neutral = "border-hairline bg-canvas text-subtle";
  const m = { pass: blue, fail: red, warn: amber, info: gray, active: teal, draft: neutral, crit: red, major: amber, minor: gray, live: red };
  return <span className={"inline-flex h-5 items-center whitespace-nowrap rounded-md border px-2 text-xs font-medium " + (m[kind] || m.info)}>{children}</span>;
}

export function ScoreBar({ label, value, color }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-900">{value}</span></div>
      <div className="h-2 rounded bg-slate-200"><div className="h-2 rounded" style={{ width: value + "%", background: color || C.sky }} /></div>
    </div>
  );
}

export function Card({ children, className = "" }) {
  const base = "rounded-xl border border-hairline bg-white ";   // 실서비스 카드: 흰 판 · 모서리 12px · 그림자 없음
  return <div className={base + className}>{children}</div>;
}

export function Field({ label, children, hint }) {
  return <div><div className="text-xs font-semibold mb-1.5 text-slate-600">{label}</div>{children}{hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}</div>;
}

export function Btn({ kind = "ghost", icon: Icon, children, onClick, disabled, title, className = "" }) {
  const light = {
    /* 실서비스 버튼: 주 버튼 = 남색(navy) · 보조 = 흰 바탕 + 입력칸 테두리(cancel) */
    primary: "bg-navy hover:bg-navy/90 text-white border border-transparent",
    ghost: "bg-white hover:bg-canvas text-ink border border-edge",
    danger: "bg-[#cb0e0e] hover:bg-[#cb0e0e]/90 text-white border border-transparent",
    soft: "bg-slate-100 hover:bg-slate-200 text-ink border border-transparent",
  };
  const m = light;
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={"inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium px-3 disabled:opacity-40 disabled:cursor-not-allowed " + (m[kind] || m.ghost) + " " + className}>
      {Icon && <Icon size={15} />}{children}
    </button>
  );
}

export function Input(props) {
  const base = "w-full bg-white border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder-slate-400 outline-none focus:border-brand read-only:bg-canvas read-only:text-subtle ";
  return <input {...props} className={base + (props.className || "")} />;
}

export function Select({ children, ...p }) {
  const base = "w-full bg-white border border-edge rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-brand";
  return <select {...p} className={base}>{children}</select>;
}

export function Toggle({ on, onClick, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} className={"w-9 h-5 rounded-full p-0.5 " + (on ? "bg-brand" : "bg-slate-300") + (disabled ? " opacity-50 cursor-not-allowed" : "")}>
      <span className="block w-4 h-4 rounded-full bg-white" style={{ transform: on ? "translateX(16px)" : "translateX(0px)", transition: "transform .15s" }} />
    </button>
  );
}

export function Modal({ title, children, onClose, wide }) {
  const box = "border-slate-200 bg-white";
  return (
    <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={"w-full rounded-xl border shadow-xl " + box + " " + (wide ? "max-w-5xl" : "max-w-xl")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "84vh" }}>{children}</div>
      </div>
    </div></Portal>
  );
}

// 화면 상단 툴바 — 좌: 설명 / 우: 액션 (전 화면 공통 골격)
export function PageToolbar({ desc, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-slate-500">{desc}</div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

// 빈 상태 — 아이콘 + 제목 + 보조 문구 (공통)
export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="py-12 text-center">
      {Icon && <Icon size={26} className="text-slate-300 mx-auto mb-2.5" />}
      <div className="font-medium text-sm text-slate-700">{title}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

// 검색 입력 — 아이콘 내장, Input/Select와 동일 톤 (공통)
export function SearchInput({ value, onChange, placeholder, className = "" }) {
  const box = "bg-white border-slate-300";
  return (
    <div className={"flex items-center gap-2 border rounded-lg px-3 py-2 focus-within:border-sky-500 " + box + " " + className}>
      <Search size={15} className="text-slate-400 shrink-0" />
      <input value={value} onChange={onChange} placeholder={placeholder} className="bg-transparent text-sm outline-none flex-1 w-full text-slate-800 placeholder-slate-400" />
    </div>
  );
}

// 세그먼트 컨트롤 (탭형 토글)
export function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg p-0.5 bg-slate-200">
      {options.map((o) => <button key={o} onClick={() => onChange(o)} className={"rounded-md px-3 py-1.5 text-xs font-medium transition " + (value === o ? "bg-sky-600 text-white" : "text-slate-600 hover:text-slate-900")}>{o}</button>)}
    </div>
  );
}

// 현재 시각을 "YYYY-MM-DD HH:mm" 로 포맷 (실행 이력 시각 표기 통일용)
export const fmtTs = (d) => { const z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes()); };
export const nowStamp = () => fmtTs(new Date());
export const stampPlus = (sec) => fmtTs(new Date(Date.now() + (sec || 0) * 1000));

// 실행 이력 "시각" 셀 — 시작(전체 일시) / 종료(같은 날이면 시간만) 2줄 표시 (전 도메인 공통)
export function RunTime({ start, end }) {
  if (!start || start === "-") return <span className="text-slate-500">-</span>;
  let endTxt = "";
  if (end && end !== "-") endTxt = end.slice(0, 10) === start.slice(0, 10) ? end.slice(11) : end;
  return (
    <div className="leading-tight">
      <div className="text-slate-700">{start}</div>
      <div className="text-xs text-slate-500">{endTxt ? "~ " + endTxt : "~ —"}</div>
    </div>
  );
}

// 로컬 토스트 (화면 자체 알림용) — 전역 context toast와 별개로 필요한 화면에서 사용
export function useToast() { const [m, setM] = useState(""); return [m, (t) => { setM(t); setTimeout(() => setM(""), 2000); }]; }
export function Toast({ msg }) { return msg ? <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800 shadow-xl">{msg}</div> : null; }
// end of ui.jsx
export const backTo = (w) => { const s = String(w); const c = s.charCodeAt(s.length - 1); const jong = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 : -1; return s + (jong === 0 || jong === 8 ? "로" : "으로"); };
