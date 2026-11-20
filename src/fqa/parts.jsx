// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { Badge } from "../common/ui.jsx";
import { TAGS, TAG_DESC, tagList } from "./logic.js";

/* ───────── primitives (lqa-demo 톤) ───────── */
const taCls = "w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500";
/* badge는 '이 화면이 만들어 내는 케이스의 성격' — 없으면 표시하지 않는다 */
const Hdr = ({ icon: Icon, title, desc, badge }) => (
  <div className="mb-1 flex items-center gap-2">
    <Icon size={16} className="text-sky-600" /><span className="text-sm font-semibold text-slate-900">{title}</span>
    {badge && <Badge kind="active">{badge}</Badge>}{desc && <span className="text-xs text-slate-500">{desc}</span>}
  </div>
);

const TagPicker = ({ value, onChange }) => {
  const cur = tagList(value);
  const toggle = (t) => onChange((cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(","));
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAGS.map((t) => (
        <button key={t} onClick={() => toggle(t)} title={TAG_DESC[t]} className={"rounded-full border px-2.5 py-0.5 text-xs " + (cur.includes(t) ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200")}>{t}</button>
      ))}
    </div>
  );
};
/* ═══════════ 11. 실행 계획 ═══════════ */
const TG = ({ on, onClick }) => (
  <button onClick={onClick} className={"relative h-5 w-9 rounded-full transition " + (on ? "bg-sky-600" : "bg-slate-200")}><span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} /></button>
);

export { Hdr, TG, TagPicker, taCls };
