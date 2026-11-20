// ============================================================
// FQA 테스트 스위트 — 위에서부터 순서대로 실행하는 흐름 (suiteLogic.js · MQA 와 같은 규칙)
//   브라우저 세션을 한 번 열고 순서대로 이어서 실행한다. 앞이 실패하면 뒤는 건너뜀
//   로그인이 필요하면 1번에 로그인 케이스 · 서로 무관한 검증은 스위트를 작게 나눈다
//   케이스는 스위트를 모른다 — 한 케이스를 여러 스위트에서 재사용한다
//   계획(p.suiteIds) · 스위트(items) 모두 ID 로 가리킨다 — 이름을 바꿔도 연결이 끊기지 않는다
//   🔑 편집은 초안(draft)에 모았다가 저장 한 번으로 반영한다
// ============================================================
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Layers, Plus, Save, X } from "lucide-react";
import { Badge, Btn, Card, Field, Input, Modal, PageToolbar, Portal, SearchInput, SEL_CARD, SEL_IDLE, Select, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { surfaceOf } from "./data.js";
import { SURF_K, surfacesOf, tagList } from "./logic.js";
import * as SL from "./suiteLogic.js";

const ST_K = { "승인": "pass", "검토중": "warn", "초안": "draft" };
const META = ["name", "desc", "acctRole", "items"];
const pickMeta = (s) => Object.fromEntries(META.map((k) => [k, k === "items" ? [...(s.items || [])] : (s[k] || "")]));
const SF0 = { name: "", desc: "" };
const mixK = { "웹+API": "active", "API": "warn", "웹": "info" };

export function FqaSuiteScreen() {
  const [msg, flash] = useToast();
  const { fqaSuites: suites, addFqaSuite, updateFqaSuite, removeFqaSuite, fqaCases, fqaPlans = [], fqaSystems = [], setFqaEditTc, goto, setNavGuard } = useApp();
  const plansOf = (id) => fqaPlans.filter((p) => (p.suiteIds || []).includes(id));
  const caseOf = (id) => fqaCases.find((c) => c.id === id) || null;
  const [sel, setSel] = useState(suites[0] ? suites[0].id : null);
  const selSuite = suites.find((x) => x.id === sel) || null;
  const [draft, setDraft] = useState(() => (selSuite ? pickMeta(selSuite) : null));
  const dirty = !!selSuite && !!draft && JSON.stringify(draft) !== JSON.stringify(pickMeta(selSuite));
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 스위트 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const pick = (id) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?")) return; const s = suites.find((x) => x.id === id); setSel(id); setDraft(s ? pickMeta(s) : null); };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const view = selSuite && draft ? { ...selSuite, ...draft } : null;   // 판단은 편집 중인 모습으로 한다

  /* 계정 역할 후보 — 등록된 모든 환경의 테스트 계정 역할 (실제 계정은 실행 계획의 환경이 넣는다) */
  const roleOpts = [...new Set(fqaSystems.flatMap((sy) => (sy.envs || []).flatMap((e) => (e.accts || []).map((a) => a.role))).filter(Boolean))];
  // 접점(웹/API)은 든 케이스의 스텝에서 파생 — 스위트는 platform 을 갖지 않는다
  const mixOf = (s) => {
    const cs = SL.suiteCases(s, fqaCases);
    const has = (fn) => cs.some((c) => (c.steps || []).some(fn));
    const web = has((x) => surfaceOf(x.act) === "web"), api = has((x) => surfaceOf(x.act) === "api");
    return web && api ? "웹+API" : api ? "API" : web ? "웹" : "-";
  };

  /* 순서 · 추가 · 제거 */
  const move = (i, dir) => { const a = [...draft.items]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ items: a }); };
  const [dragI, setDragI] = useState(null);
  const drop = (to) => { if (dragI === null || dragI === to) { setDragI(null); return; } const a = [...draft.items]; const [m] = a.splice(dragI, 1); a.splice(to, 0, m); set({ items: a }); setDragI(null); };
  const removeAt = (i) => set({ items: draft.items.filter((_, k) => k !== i) });
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const addCands = view ? fqaCases.filter((c) => !(view.items || []).includes(c.id) && (!q || (c.id + " " + c.name + " " + (c.tags || "")).toLowerCase().includes(q.toLowerCase()))) : [];
  const addPicked = () => { if (!picked.length) { flash("추가할 케이스를 고르세요"); return; } set({ items: [...draft.items, ...picked] }); setPicked([]); setAddOpen(false); setQ(""); };

  const save = () => {
    const name = String(draft.name || "").trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.id !== selSuite.id && s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    updateFqaSuite(selSuite.id, { ...draft, name });
    const b = SL.suiteBlock({ ...view, name }, fqaCases);
    flash("스위트가 저장되었습니다" + (b ? " — 실행 불가: " + b : ""));
  };

  /* 추가 · 삭제 */
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(SF0);
  const add = () => {
    const name = form.name.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    const id = Date.now();
    const su = { id, name, desc: form.desc || "", acctRole: "", items: [] };
    addFqaSuite(su); setSel(id); setDraft(pickMeta(su)); setOpen(false); flash("스위트가 추가되었습니다 — 케이스를 넣으세요");
  };
  /* 삭제 — 실행 계획이 쓰고 있으면 막는다. 케이스는 지워지지 않는다 */
  const del = (s) => {
    const ps = plansOf(s.id);
    if (ps.length) { flash("실행 계획이 쓰고 있어 삭제할 수 없습니다 — " + ps.map((p) => p.name).join(", ")); return; }
    if (!window.confirm(s.name + " 스위트를 삭제할까요? 케이스는 지워지지 않습니다.")) return;
    removeFqaSuite(s.id); if (sel === s.id) { setSel(null); setDraft(null); } flash("삭제됨");
  };
  const edit = (id) => { if (dirty && !window.confirm("저장하지 않은 스위트 변경이 있습니다. 케이스 편집으로 이동할까요?")) return; setFqaEditTc(id); goto("fqa-cases"); };

  return (
    <div className="space-y-4">
      <PageToolbar desc="케이스를 실행 순서대로 엮습니다 — 위에서부터 이어서 실행하고, 앞이 실패하면 뒤는 건너뜁니다" />
      <div className="grid grid-cols-12 gap-4">
        {/* ── 좌: 목록 ── */}
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setForm(SF0); setOpen(true); }}>스위트 추가</Btn>
          {suites.map((s) => { const b = SL.suiteBlock(s, fqaCases), mx = mixOf(s); return (
            <Card key={s.id} className={"p-3 " + (selSuite && selSuite.id === s.id ? SEL_CARD : SEL_IDLE)}>
              <div className="cursor-pointer" onClick={() => pick(s.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-medium text-slate-800">{s.name}</div>{s.desc && <div className="truncate text-xs text-slate-500">{s.desc}</div>}</div>
                  <button onClick={(e) => { e.stopPropagation(); del(s); }} className="shrink-0 text-slate-500 hover:text-red-600" title="스위트 삭제"><X size={13} /></button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  {mx !== "-" && <Badge kind={mixK[mx] || "info"}>{mx}</Badge>}
                  <span>TC {(s.items || []).length}</span>
                  {b && <span className="text-amber-700">· 실행 불가</span>}
                </div>
              </div>
            </Card>
          ); })}
          {suites.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">스위트가 없습니다.</div>}
        </div>

        {/* ── 우: 흐름 편집 ── */}
        <div className="col-span-9 space-y-4">
          {view ? (<>
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="스위트 이름" /></div>
                {dirty && <span className="shrink-0 text-xs text-amber-700">미저장 변경</span>}
                {dirty && <Btn onClick={() => setDraft(pickMeta(selSuite))}>되돌리기</Btn>}
                <Btn kind="primary" icon={Save} onClick={save} disabled={!dirty}>저장</Btn>
              </div>
              <Input value={draft.desc} onChange={(e) => set({ desc: e.target.value })} placeholder="설명 (선택) — 이 흐름이 검증하는 업무" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="계정 역할" hint="스텝의 ${계정 ID}·${계정 비밀번호}에 이 역할의 계정이 들어갑니다">
                  <Select value={draft.acctRole} onChange={(e) => set({ acctRole: e.target.value })}><option value="">기본 (풀의 첫 계정)</option>{roleOpts.map((r) => <option key={r}>{r}</option>)}</Select>
                </Field>
                <Field label="실행 계획"><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{plansOf(selSuite.id).length ? plansOf(selSuite.id).map((p) => p.name).join(", ") : "없음"}</div></Field>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <span className="text-sm font-semibold text-slate-800">실행 순서 <span className="text-xs font-normal text-slate-500">{draft.items.length}건 · 끌어서 순서 변경</span></span>
                <Btn icon={Plus} onClick={() => { setPicked([]); setQ(""); setAddOpen(true); }}>케이스 추가</Btn>
              </div>
              <div className="p-2">
                {draft.items.map((id, i) => { const c = caseOf(id); const bad = !c ? "삭제됨" : c.status !== "승인" ? "승인 전" : ""; return (
                  <div key={id + i} draggable onDragStart={() => setDragI(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)}
                    className={"flex cursor-move items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-100 " + (dragI === i ? "opacity-50" : "")}>
                    <span className="w-6 shrink-0 text-center font-semibold text-sky-600">{i + 1}</span>
                    <span className="w-20 shrink-0 font-mono text-sky-600">{id}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-800">{c ? c.name : "—"}</div>
                      {c && (tagList(c.tags).length > 0 || (c.dataset && c.dataset !== "-")) && <div className="mt-0.5 flex flex-wrap gap-1">{tagList(c.tags).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{t}</span>)}{c.dataset && c.dataset !== "-" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">데이터셋 {c.dataset}</span>}</div>}
                    </div>
                    {bad && <span className="shrink-0 text-amber-700">{bad}</span>}
                    {c && surfacesOf(c) !== "-" && <Badge kind={SURF_K[surfacesOf(c)] || "info"}>{surfacesOf(c)}</Badge>}
                    {c && <Badge kind={c.level === "Full-Code" ? "warn" : "active"}>{c.level || "Low-Code"}</Badge>}
                    {c && <Badge kind={ST_K[c.status] || "draft"}>{c.status}</Badge>}
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="shrink-0 text-slate-400 hover:text-sky-600 disabled:opacity-30" title="위로"><ArrowUp size={13} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === draft.items.length - 1} className="shrink-0 text-slate-400 hover:text-sky-600 disabled:opacity-30" title="아래로"><ArrowDown size={13} /></button>
                    {c && <button onClick={() => edit(id)} className="shrink-0 text-slate-500 hover:text-sky-600">편집</button>}
                    <button onClick={() => removeAt(i)} className="shrink-0 text-slate-400 hover:text-red-600" title="스위트에서 빼기 (케이스는 지워지지 않음)"><X size={13} /></button>
                  </div>
                ); })}
                {draft.items.length === 0 && <div className="py-10 text-center text-xs text-slate-500">케이스가 없습니다 — '케이스 추가'로 넣으세요. 로그인이 필요하면 1번에 로그인 케이스를 둡니다.</div>}
              </div>
            </Card>
          </>) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <Layers size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">{suites.length ? "왼쪽에서 스위트를 선택하세요" : "테스트 스위트를 먼저 만드세요"}</div>
              {!suites.length && <div className="mt-1.5 max-w-md text-xs text-slate-500">스위트는 케이스를 실행 순서대로 엮은 것입니다. 실행 계획이 스위트를 골라 실행합니다.</div>}
            </Card>
          )}
        </div>
      </div>

      {/* 케이스 추가 */}
      {addOpen && view && (
        <Modal title={"케이스 추가 · " + draft.name} onClose={() => setAddOpen(false)}>
          <div className="space-y-3">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="TC·이름·태그 검색" />
            <div className="text-xs text-slate-500">고른 순서대로 끝에 붙습니다</div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              {addCands.map((c) => { const k = picked.indexOf(c.id); return (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-0 hover:bg-slate-50">
                  <input type="checkbox" checked={k >= 0} onChange={() => setPicked((p) => (k >= 0 ? p.filter((x) => x !== c.id) : [...p, c.id]))} className="accent-sky-600" />
                  <span className="w-5 text-center text-sky-600">{k >= 0 ? (draft.items.length + k + 1) : ""}</span>
                  <span className="w-20 font-mono text-sky-600">{c.id}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{c.name}</span>
                  <Badge kind={c.level === "Full-Code" ? "warn" : "active"}>{c.level || "Low-Code"}</Badge>
                  <Badge kind={ST_K[c.status] || "draft"}>{c.status}</Badge>
                </label>
              ); })}
              {addCands.length === 0 && <div className="py-8 text-center text-xs text-slate-500">추가할 수 있는 케이스가 없습니다.</div>}
            </div>
            <div className="flex justify-end gap-2"><Btn onClick={() => setAddOpen(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={addPicked} disabled={!picked.length}>{picked.length}건 추가</Btn></div>
          </div>
        </Modal>
      )}

      {/* 스위트 추가 */}
      {open && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">스위트 추가</h3><button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              <Field label="이름"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 결제 / 주문" /></Field>
              <Field label="설명 (선택)"><Input value={form.desc || ""} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="이 흐름이 검증하는 업무" /></Field>
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setOpen(false)}>취소</Btn><Btn kind="primary" icon={Save} onClick={add}>추가</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
