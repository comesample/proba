// ============================================================
// MQA 테스트 스위트 — 위에서부터 순서대로 실행하는 흐름 (suiteLogic.js)
//   앱을 한 번 열고 순서대로 이어서 실행한다. 앞이 실패하면 뒤는 건너뜀
//   로그인이 필요하면 1번에 로그인 케이스 · 서로 무관한 검증은 스위트를 작게 나눈다
//   케이스는 스위트를 모른다 — 한 케이스를 여러 스위트에서 재사용한다
//   실행 계획(p.suiteIds) 은 스위트를 ID 로 가리킨다 — 이름을 바꿔도 연결이 끊기지 않는다
//   🔑 편집은 초안(draft)에 모았다가 저장 한 번으로 반영한다
// ============================================================
import { useState, useEffect } from "react";
import { Plus, X, Save, Layers, ArrowUp, ArrowDown, Download, AlertTriangle } from "lucide-react";
import { Card, Badge, Btn, Field, Input, Select, Toast, useToast, PageToolbar, Portal, Modal, SearchInput, SEL_CARD, SEL_IDLE } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import * as SL from "./suiteLogic.js";
import { toSuiteRobot, toProbaResource } from "./caseLogic.js";

const tagList = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const ST_K = { "승인": "pass", "검토중": "warn", "초안": "draft" };
export const suiteName = (suites, id) => ((suites || []).find((s) => s.id === id) || {}).name || "";
const META = ["name", "desc", "acctRole", "items"];
const pickMeta = (s) => Object.fromEntries(META.map((k) => [k, k === "items" ? [...(s.items || [])] : (s[k] || "")]));

export function MqaSuiteScreen() {
  const [msg, flash] = useToast();
  const { mqaSuites: suites = [], addMqaSuite, updateMqaSuite, removeMqaSuite, mqaCases = [], mqaPlans = [], mqaSystems = [], setMqaEditTc, goTo, setNavGuard } = useApp();
  const plansOf = (id) => mqaPlans.filter((p) => (p.suiteIds || []).includes(id));
  const sysName = (id) => ((mqaSystems.find((s) => s.id === id) || {}).name || "—");
  const caseOf = (id) => mqaCases.find((c) => c.id === id) || null;
  const [sel, setSel] = useState(suites[0] ? suites[0].id : null);
  const selSuite = suites.find((x) => x.id === sel) || null;
  const [draft, setDraft] = useState(() => (selSuite ? pickMeta(selSuite) : null));
  const dirty = !!selSuite && !!draft && JSON.stringify(draft) !== JSON.stringify(pickMeta(selSuite));
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 스위트 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const pick = (id) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?")) return; const s = suites.find((x) => x.id === id); setSel(id); setDraft(s ? pickMeta(s) : null); };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const view = selSuite && draft ? { ...selSuite, ...draft } : null;   // 판단은 편집 중인 모습으로 한다

  /* 계정 역할 후보 — 그 앱 환경들의 테스트 계정 역할 */
  const roleOpts = view ? [...new Set(((mqaSystems.find((s) => s.id === view.systemId) || {}).envs || []).flatMap((e) => (e.accts || []).map((a) => a.role)).filter(Boolean))] : [];
  const block = view ? SL.suiteBlock(view, mqaCases) : "";

  /* 순서 · 추가 · 제거 */
  const move = (i, dir) => { const a = [...draft.items]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ items: a }); };
  const [dragI, setDragI] = useState(null);
  const drop = (to) => { if (dragI === null || dragI === to) { setDragI(null); return; } const a = [...draft.items]; const [m] = a.splice(dragI, 1); a.splice(to, 0, m); set({ items: a }); setDragI(null); };
  const removeAt = (i) => set({ items: draft.items.filter((_, k) => k !== i) });
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const addCands = view ? mqaCases.filter((c) => c.systemId === view.systemId && !(view.items || []).includes(c.id) && (!q || (c.id + " " + c.name + " " + (c.tags || "")).toLowerCase().includes(q.toLowerCase()))) : [];
  const addPicked = () => { if (!picked.length) { flash("추가할 케이스를 고르세요"); return; } set({ items: [...draft.items, ...picked] }); setPicked([]); setAddOpen(false); setQ(""); };

  const save = () => {
    const name = String(draft.name || "").trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.id !== selSuite.id && s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    updateMqaSuite(selSuite.id, { ...draft, name });
    flash("스위트가 저장되었습니다" + (block ? " — 실행 불가: " + block : ""));
  };

  /* 추가 · 삭제 */
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", desc: "", systemId: "" });
  const add = () => {
    const name = form.name.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (suites.some((s) => s.name === name)) { flash("같은 이름의 스위트가 이미 있습니다"); return; }
    const id = Date.now();
    const su = { id, name, desc: form.desc, systemId: +form.systemId || (mqaSystems[0] || {}).id, acctRole: "", items: [] };
    addMqaSuite(su); setSel(id); setDraft(pickMeta(su)); setOpen(false); flash("스위트가 추가되었습니다 — 케이스를 넣으세요");
  };
  /* 삭제 — 실행 계획이 쓰고 있으면 막는다. 케이스는 지워지지 않는다 */
  const del = (s) => {
    const ps = plansOf(s.id);
    if (ps.length) { flash("실행 계획이 쓰고 있어 삭제할 수 없습니다 — " + ps.map((p) => p.name).join(", ")); return; }
    if (!window.confirm(s.name + " 스위트를 삭제할까요? 케이스는 지워지지 않습니다.")) return;
    removeMqaSuite(s.id); if (sel === s.id) { setSel(null); setDraft(null); } flash("삭제됨");
  };
  /* 내보내기 — suite.robot + proba.resource. 계정·앱 ID 는 고른 환경에서 채운다 (비밀번호·토큰은 비워 둔다) */
  const [exp, setExp] = useState(null);   // { envIdx }
  const sysEnvs = view ? ((mqaSystems.find((s) => s.id === view.systemId) || {}).envs || []) : [];
  const out = exp && selSuite ? { suite: toSuiteRobot(selSuite, mqaCases), res: toProbaResource(selSuite, sysEnvs[exp.envIdx], mqaCases) } : null;
  const fileBase = selSuite ? String(selSuite.name).replace(/[\\/:*?"<>|\s]+/g, "_") : "suite";
  const save1 = (name, text) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); a.download = name; a.click(); };
  const edit = (id) => { if (dirty && !window.confirm("저장하지 않은 스위트 변경이 있습니다. 케이스 편집으로 이동할까요?")) return; setMqaEditTc(id); goTo("mqa-cases"); };

  return (
    <div className="space-y-4">
      <PageToolbar desc="케이스를 실행 순서대로 엮습니다 — 위에서부터 이어서 실행하고, 앞이 실패하면 뒤는 건너뜁니다" />
      <div className="grid grid-cols-12 gap-4">
        {/* ── 좌: 목록 ── */}
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setForm({ name: "", desc: "", systemId: String((mqaSystems[0] || {}).id || "") }); setOpen(true); }} disabled={!mqaSystems.length}>스위트 추가</Btn>
          {suites.map((s) => { const b = SL.suiteBlock(s, mqaCases); return (
            <Card key={s.id} className={"p-3 " + (selSuite && selSuite.id === s.id ? SEL_CARD : SEL_IDLE)}>
              <div className="cursor-pointer" onClick={() => pick(s.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-medium text-slate-800">{s.name}</div>{s.desc && <div className="truncate text-xs text-slate-500">{s.desc}</div>}</div>
                  <button onClick={(e) => { e.stopPropagation(); del(s); }} className="shrink-0 text-slate-500 hover:text-red-600" title="스위트 삭제"><X size={13} /></button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span>TC {(s.items || []).length}</span>
                  {mqaSystems.length > 1 && <span className="truncate">· {sysName(s.systemId)}</span>}
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
                <Btn icon={Download} onClick={() => setExp({ envIdx: 0 })} disabled={dirty || !draft.items.length} title={dirty ? "저장한 뒤 내보낼 수 있습니다" : ""}>내보내기</Btn>
                <Btn kind="primary" icon={Save} onClick={save} disabled={!dirty}>저장</Btn>
              </div>
              <Input value={draft.desc} onChange={(e) => set({ desc: e.target.value })} placeholder="설명 (선택) — 이 흐름이 검증하는 업무" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="대상 앱"><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" title="스위트는 앱 하나에 속합니다 — 로케이터가 앱마다 다릅니다">{sysName(view.systemId)}</div></Field>
                <Field label="계정 역할" hint="스텝의 ${계정 ID}·${계정 비밀번호}에 이 역할의 계정이 들어갑니다">
                  <Select value={draft.acctRole} onChange={(e) => set({ acctRole: e.target.value })}><option value="">기본 (풀의 첫 계정)</option>{roleOpts.map((r) => <option key={r}>{r}</option>)}</Select>
                </Field>
              </div>
              <div className="text-xs text-slate-500">실행 계획 {plansOf(selSuite.id).length ? plansOf(selSuite.id).map((p) => p.name).join(", ") : "없음"}</div>
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
                    <span className="w-16 shrink-0 font-mono text-sky-600">{id}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-800">{c ? c.name : "—"}</div>
                      {c && tagList(c.tags).length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{tagList(c.tags).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{t}</span>)}</div>}
                    </div>
                    {bad && <span className="shrink-0 text-amber-700">{bad}</span>}
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
            <div className="text-xs text-slate-500">같은 앱({sysName(view.systemId)})의 케이스 · 고른 순서대로 끝에 붙습니다</div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              {addCands.map((c) => { const k = picked.indexOf(c.id); return (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-0 hover:bg-slate-50">
                  <input type="checkbox" checked={k >= 0} onChange={() => setPicked((p) => (k >= 0 ? p.filter((x) => x !== c.id) : [...p, c.id]))} className="accent-sky-600" />
                  <span className="w-5 text-center text-sky-600">{k >= 0 ? (draft.items.length + k + 1) : ""}</span>
                  <span className="w-16 font-mono text-sky-600">{c.id}</span>
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

      {/* 내보내기 */}
      {out && (
        <Modal title={"내보내기 · " + selSuite.name} onClose={() => setExp(null)}>
          <div className="space-y-3">
            <div className="text-xs text-slate-500">두 파일을 같은 폴더에 두면 Appium 이 있는 곳 어디서나 실행됩니다 — <span className="font-mono">robot -v "계정 비밀번호:…" {fileBase}.robot</span></div>
            {sysEnvs.length > 1 && <Field label="환경" hint="계정 · 앱 ID 를 이 환경에서 채웁니다"><Select value={String(exp.envIdx)} onChange={(e) => setExp({ envIdx: +e.target.value })}>{sysEnvs.map((e, i) => <option key={i} value={String(i)}>{e.env}</option>)}</Select></Field>}
            {(block || out.suite.warns.length > 0) && <div className="space-y-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{block && <div className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />실행 불가 — {block}</div>}{out.suite.warns.map((w) => <div key={w} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{w}</div>)}</div>}
            {[[fileBase + ".robot", out.suite.text], ["proba.resource", out.res]].map(([n, t]) => (
              <div key={n} className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"><span className="font-mono text-slate-700">{n}</span><button onClick={() => save1(n, t)} className="flex items-center gap-1 text-sky-700 hover:text-sky-900"><Download size={12} />받기</button></div>
                <pre className="max-h-56 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700">{t}</pre>
              </div>
            ))}
            <div className="flex justify-end"><Btn onClick={() => setExp(null)}>닫기</Btn></div>
          </div>
        </Modal>
      )}

      {/* 스위트 추가 */}
      {open && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">스위트 추가</h3><button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              <Field label="이름"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 주문 흐름" /></Field>
              <Field label="설명 (선택)"><Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="이 흐름이 검증하는 업무" /></Field>
              <Field label="대상 앱" hint="만든 뒤에는 바꿀 수 없습니다"><Select value={form.systemId} onChange={(e) => setForm({ ...form, systemId: e.target.value })}>{mqaSystems.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</Select></Field>
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setOpen(false)}>취소</Btn><Btn kind="primary" icon={Save} onClick={add}>추가</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
