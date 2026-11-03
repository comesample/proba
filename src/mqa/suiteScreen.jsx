// ============================================================
// MQA 테스트 스위트 — 업무 흐름 묶음
//   케이스(c.suiteId) · 실행 계획(p.suiteIds) 은 스위트를 ID 로 가리킨다 — 이름을 바꿔도 연결이 끊기지 않는다
//   스위트는 앱 공용이다. 앱이 여럿이면 목록 · 건수를 앱별로 보여준다 (실행 계획이 앱으로 다시 거른다)
// ============================================================
import { useState, useEffect } from "react";
import { Plus, X, Save, Search, Layers } from "lucide-react";
import { Card, Badge, Btn, Field, Input, Toast, useToast, PageToolbar, Portal, SEL_CARD, SEL_IDLE } from "../common/ui.jsx";
import { useApp } from "../common/context.js";

const tagList = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const ST_K = { "승인": "pass", "검토중": "warn", "초안": "draft" };
export const suiteName = (suites, id) => ((suites || []).find((s) => s.id === id) || {}).name || "";

export function MqaSuiteScreen() {
  const [msg, flash] = useToast();
  const { mqaSuites: suites = [], addMqaSuite, updateMqaSuite, removeMqaSuite, mqaCases = [], mqaPlans = [], mqaSystems = [], setMqaEditTc, goTo, setNavGuard } = useApp();
  const casesOf = (id) => mqaCases.filter((c) => c.suiteId === id);
  const plansOf = (id) => mqaPlans.filter((p) => (p.suiteIds || []).includes(id));
  const multiApp = mqaSystems.length > 1;
  const sysName = (id) => ((mqaSystems.find((s) => s.id === id) || {}).name || "—");
  /* 앱별 건수 — 앱이 하나면 전체 건수만 */
  const byApp = (id) => { const m = {}; casesOf(id).forEach((c) => { m[c.systemId] = (m[c.systemId] || 0) + 1; }); return Object.entries(m).map(([k, v]) => sysName(+k) + " " + v); };
  const [sel, setSel] = useState(suites[0] ? suites[0].id : null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({});
  const selSuite = suites.find((x) => x.id === sel) || suites[0] || null;
  const rows = selSuite ? casesOf(selSuite.id).filter((c) => !q || (c.id + " " + c.name + " " + (c.tags || "")).toLowerCase().includes(q.toLowerCase())) : [];
  const pick = (id) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?")) return; setSel(id); setDraft({}); };
  const nm = draft.name != null ? draft.name : (selSuite ? selSuite.name : "");
  const ds = draft.desc != null ? draft.desc : (selSuite ? (selSuite.desc || "") : "");
  const dirty = !!selSuite && (nm !== selSuite.name || ds !== (selSuite.desc || ""));
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const saveSuite = () => {
    const name = nm.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.id !== selSuite.id && s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    updateMqaSuite(selSuite.id, { name, desc: ds }); setDraft({}); flash("스위트가 수정되었습니다");
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", desc: "" });
  const add = () => {
    const name = form.name.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    const id = Date.now();
    addMqaSuite({ id, name, desc: form.desc }); setSel(id); setDraft({}); setOpen(false); flash("스위트가 추가되었습니다");
  };
  /* 삭제 — 케이스가 속해 있거나 실행 계획이 쓰고 있으면 막는다 */
  const del = (s) => {
    const n = casesOf(s.id).length; const ps = plansOf(s.id);
    if (n) { flash("케이스 " + n + "건이 속해 있어 삭제할 수 없습니다 — 케이스를 다른 스위트로 옮기세요"); return; }
    if (ps.length) { flash("실행 계획이 쓰고 있어 삭제할 수 없습니다 — " + ps.map((p) => p.name).join(", ")); return; }
    if (!window.confirm(s.name + " 스위트를 삭제할까요?")) return;
    removeMqaSuite(s.id); setDraft({}); setSel(null); flash("삭제됨");
  };
  return (
    <div className="space-y-4">
      <PageToolbar desc="업무 흐름 묶음 — 실행 계획이 스위트를 골라 승인된 케이스를 돌립니다" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setForm({ name: "", desc: "" }); setOpen(true); }}>스위트 추가</Btn>
          {suites.map((s) => { const cs = casesOf(s.id); return (
            <Card key={s.id} className={"p-3 " + (selSuite && selSuite.id === s.id ? SEL_CARD : SEL_IDLE)}>
              <div className="cursor-pointer" onClick={() => pick(s.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-medium text-slate-800">{s.name}</div>{s.desc && <div className="truncate text-xs text-slate-500">{s.desc}</div>}</div>
                  <button onClick={(e) => { e.stopPropagation(); del(s); }} className="shrink-0 text-slate-500 hover:text-red-600" title="스위트 삭제"><X size={13} /></button>
                </div>
                <div className="mt-1.5 text-xs text-slate-500">TC {cs.length} · 승인 {cs.filter((c) => c.status === "승인").length}{multiApp && cs.length > 0 && <span className="block truncate">{byApp(s.id).join(" · ")}</span>}</div>
              </div>
            </Card>
          ); })}
          {suites.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">스위트가 없습니다.</div>}
        </div>
        <div className="col-span-9 space-y-4">
          {selSuite ? (<>
            <Card className="space-y-2.5 p-4">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><Input value={nm} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="스위트 이름" /></div>
                {dirty && <span className="shrink-0 text-xs text-amber-700">미저장 변경</span>}
                <Btn kind="primary" icon={Save} onClick={saveSuite} disabled={!dirty}>저장</Btn>
              </div>
              <Input value={ds} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="설명 (선택)" />
              <div className="text-xs text-slate-500">소속 <span className="font-semibold text-sky-600">{casesOf(selSuite.id).length}</span>건 · 승인 {casesOf(selSuite.id).filter((c) => c.status === "승인").length}건{plansOf(selSuite.id).length > 0 && <> · 실행 계획 {plansOf(selSuite.id).map((p) => p.name).join(", ")}</>}</div>
            </Card>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <span className="shrink-0 text-sm font-semibold text-slate-800">포함 테스트케이스 <span className="text-xs font-normal text-slate-500">{casesOf(selSuite.id).length}건</span></span>
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5" style={{ maxWidth: 300 }}>
                  <Search size={14} className="text-slate-500" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TC·이름·태그 검색" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" />
                </div>
              </div>
              <div className="overflow-y-auto p-2" style={{ maxHeight: 520 }}>
                {rows.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-100">
                    <span className="w-16 shrink-0 font-mono text-sky-600">{c.id}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-800">{c.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-slate-500">{tagList(c.tags).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5">{t}</span>)}<span>수정 {c.updatedBy || "—"} · {c.updatedAt || "—"}</span></div>
                    </div>
                    {multiApp && <Badge kind="info">{sysName(c.systemId)}</Badge>}
                    <Badge kind={c.level === "Full-Code" ? "warn" : "active"}>{c.level || "Low-Code"}</Badge>
                    <Badge kind={ST_K[c.status] || "draft"}>{c.status}</Badge>
                    <button onClick={() => { setMqaEditTc(c.id); goTo("mqa-cases"); }} className="shrink-0 text-slate-500 hover:text-sky-600">편집</button>
                  </div>
                ))}
                {rows.length === 0 && <div className="py-10 text-center text-xs text-slate-500">{casesOf(selSuite.id).length === 0 ? "이 스위트에 포함된 테스트케이스가 없습니다." : "검색 결과가 없습니다."}</div>}
              </div>
            </Card>
          </>) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <Layers size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">{suites.length ? "왼쪽에서 스위트를 선택하세요" : "테스트 스위트를 먼저 만드세요"}</div>
              {!suites.length && <div className="mt-1.5 max-w-md text-xs text-slate-500">스위트는 업무 흐름 단위로 케이스를 묶습니다. 실행 계획이 스위트를 골라 실행합니다.</div>}
            </Card>
          )}
        </div>
      </div>
      {open && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">스위트 추가</h3><button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              <Field label="이름"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 결제 / 주문" /></Field>
              <Field label="설명 (선택)"><Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="이 스위트가 검증하는 업무 흐름" /></Field>
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setOpen(false)}>취소</Btn><Btn kind="primary" icon={Save} onClick={add}>추가</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
