// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useEffect, useState } from "react";
import { Layers, Plus, Save, Search, X } from "lucide-react";
import { Badge, Btn, Card, Field, Input, PageToolbar, Portal, SEL_CARD, SEL_IDLE, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { surfaceOf } from "./data.js";
import { SURF_K, surfacesOf, tagList } from "./logic.js";


/* ═══════════ 5. 테스트 스위트 관리 ═══════════ */
const SF0 = { name: "", desc: "" };
export function FqaSuiteScreen() {
  const [msg, flash] = useToast();
  const { fqaSuites: suites, addFqaSuite, updateFqaSuite, removeFqaSuite, fqaCases, fqaPlans = [], setFqaEditTc, goto, setNavGuard } = useApp();
  const casesOf = (id) => fqaCases.filter((c) => c.suiteId === id);
  const tcOf = (id) => casesOf(id).length;
  const plansOf = (id) => fqaPlans.filter((p) => (p.suiteIds || []).includes(id));
  const [sel, setSel] = useState(suites[0] ? suites[0].id : null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({});
  const stK = { "승인": "pass", "검토중": "warn", "초안": "draft" };
  const selSuite = suites.find((x) => x.id === sel) || suites[0] || null;
  const rows = selSuite ? casesOf(selSuite.id).filter((c) => !q || (c.id + " " + c.name + " " + (c.tags || "")).toLowerCase().includes(q.toLowerCase())) : [];
  const pick = (id) => { setSel(id); setDraft({}); };
  const nm = draft.name != null ? draft.name : (selSuite ? selSuite.name : "");
  const ds = draft.desc != null ? draft.desc : (selSuite ? (selSuite.desc || "") : "");
  const dirty = !!selSuite && (nm !== selSuite.name || ds !== (selSuite.desc || ""));
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const saveSuite = () => {
    const name = nm.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (name !== selSuite.name && suites.some((s) => s.id !== selSuite.id && s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    // 케이스 · 계획은 스위트를 ID 로 가리킨다 — 이름만 바꾸면 된다
    updateFqaSuite(selSuite.id, { name, desc: ds }); setDraft({}); flash("스위트가 수정되었습니다");
  };
  // 혼합 여부는 소속 케이스의 스텝에서 파생 — 스위트는 platform을 갖지 않는다
  const mixOf = (id) => {
    const cs = casesOf(id);
    const has = (fn) => cs.some((c) => (c.steps || []).some(fn));
    const web = has((s) => surfaceOf(s.act) === "web");
    const api = has((s) => surfaceOf(s.act) === "api");
    return web && api ? "웹+API" : api ? "API" : web ? "웹" : "-";
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(SF0);
  const openAdd = () => { setForm(SF0); setOpen(true); };
  const save = () => {
    const name = form.name.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    const id = Date.now();
    addFqaSuite({ ...form, name, id }); setSel(id); setDraft({}); setOpen(false); flash("스위트가 추가되었습니다");
  };
  const del = (s) => {
    if (tcOf(s.id) > 0) { flash("사용 중인 스위트는 삭제 불가 (" + tcOf(s.id) + "건)"); return; }
    if (plansOf(s.id).length) { flash("실행 계획이 쓰고 있어 삭제할 수 없습니다 — " + plansOf(s.id).map((p) => p.name).join(", ")); return; }
    removeFqaSuite(s.id); setDraft({}); flash("삭제됨");
  };
  const mixK = { "웹+API": "active", "API": "warn", "웹": "info" };
  return (
    <div className="space-y-4">
      <PageToolbar desc="업무 흐름 묶음" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={openAdd}>스위트 추가</Btn>
          {suites.map((s) => (
            <Card key={s.id} className={"p-3 " + (selSuite && selSuite.id === s.id ? SEL_CARD : SEL_IDLE)}>
              <div className="cursor-pointer" onClick={() => pick(s.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-medium text-slate-800">{s.name}</div>{s.desc && <div className="truncate text-xs text-slate-500">{s.desc}</div>}</div>
                  <button onClick={(e) => { e.stopPropagation(); del(s); }} className="shrink-0 text-slate-500 hover:text-red-600"><X size={13} /></button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">{mixOf(s.id) !== "-" && <Badge kind={mixK[mixOf(s.id)] || "info"}>{mixOf(s.id)}</Badge>}<span className="text-xs text-slate-500">TC {tcOf(s.id)}</span></div>
              </div>
            </Card>
          ))}
          {suites.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">스위트가 없습니다.</div>}
        </div>
        <div className="col-span-9 space-y-4">
          {selSuite ? (
            <>
              <Card className="space-y-2.5 p-4">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><Input value={nm} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="스위트 이름" /></div>
                  {dirty && <span className="shrink-0 text-xs text-amber-700">미저장 변경</span>}
                  <Btn kind="primary" icon={Save} onClick={saveSuite} disabled={!dirty}>저장</Btn>
                </div>
                <Input value={ds} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="설명 (선택)" />
                <div className="flex items-center gap-2 text-xs text-slate-500">소속 <span className="font-semibold text-sky-600">{casesOf(selSuite.id).length}</span>건{mixOf(selSuite.id) !== "-" && <Badge kind={mixK[mixOf(selSuite.id)] || "info"}>{mixOf(selSuite.id)}</Badge>}</div>
              </Card>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <span className="shrink-0 text-sm font-semibold text-slate-800">포함 테스트케이스 <span className="text-xs font-normal text-slate-500">{casesOf(selSuite.id).length}건</span></span>
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5" style={{ maxWidth: 300 }}>
                    <Search size={14} className="text-slate-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TC·이름·태그 검색" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" />
                    {q && <span className="shrink-0 text-xs text-slate-500">{rows.length}</span>}
                  </div>
                </div>
                <div className="overflow-y-auto p-2" style={{ maxHeight: 520 }}>
                  {rows.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-100">
                      <span className="w-24 shrink-0 pt-0.5 font-mono text-sky-600">{c.id}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-slate-800">{c.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-slate-500">
                          {tagList(c.tags).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{t}</span>)}
                          <span>수정 {c.updatedBy || "—"} · {c.updatedAt || "—"}</span>
                        </div>
                      </div>
                      <Badge kind={SURF_K[surfacesOf(c)] || "info"}>{surfacesOf(c)}</Badge>
                      <Badge kind={stK[c.status] || "draft"}>{c.status}</Badge>
                      <button onClick={() => { setFqaEditTc(c.id); goto("fqa-cases"); }} className="shrink-0 pt-0.5 text-slate-500 hover:text-sky-600">편집</button>
                    </div>
                  ))}
                  {rows.length === 0 && <div className="py-10 text-center text-xs text-slate-500">{casesOf(selSuite.id).length === 0 ? "이 스위트에 포함된 테스트케이스가 없습니다." : "검색 결과가 없습니다."}</div>}
                </div>
              </Card>
            </>
          ) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              {suites.length === 0 ? (<>
                <Layers size={26} className="text-slate-400" />
                <div className="mt-3 text-sm font-medium text-slate-700">테스트 스위트를 먼저 만드세요</div>
                <div className="mt-1.5 max-w-md text-xs text-slate-500">스위트는 업무 흐름 단위로 케이스를 묶습니다. 실행 계획이 스위트를 골라 실행하므로, 케이스는 스위트에 속해야 실행됩니다.</div>
              </>) : <div className="text-xs text-slate-500">왼쪽에서 스위트를 선택하세요.</div>}
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
              <Field label="설명 (선택)"><Input value={form.desc || ""} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="이 스위트가 검증하는 업무 흐름" /></Field>
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setOpen(false)}>취소</Btn><Btn kind="primary" icon={Save} onClick={save}>추가</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}

      <Toast msg={msg} />
    </div>
  );
}