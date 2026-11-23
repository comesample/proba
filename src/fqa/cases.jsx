// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Code2, FileText, Layers, Pencil, Plus, RefreshCw, Search, Tag, Trash2, Video, X } from "lucide-react";
import { Badge, Btn, Card, Field, Input, Modal, PageToolbar, Portal, Select, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { FqaApiImportScreen } from "./apiImportScreen.jsx";
import { FqaEditorScreen } from "./editor.jsx";
import { SURF_K, TAGS, TAG_DESC, nextTcId, surfacesOf, tagList } from "./logic.js";
import * as SL from "./suiteLogic.js";
import { FqaRecordScreen } from "./recordScreen.jsx";
import { ExcelImport } from "../common/TcImport.jsx";
import { FqaSpecImportScreen } from "./specImportScreen.jsx";
import { SAMPLE_TC_WEB } from "./aiLogic.js";
/* ═══════════ 9. 테스트케이스 (통합 저장소) ═══════════ */
export function FqaCasesScreen() {
  const { fqaCases, fqaSuites, updateFqaSuite, addFqaCase, setFqaCaseStatus, removeFqaCase, commitFqaCase, fqaEditTc, setFqaEditTc, fqaSuiteFocus, setFqaSuiteFocus, goTo, navTick, pendingSelect, setPendingSelect } = useApp();
  const editorDirty = useRef(false);
  /* 좌측 메뉴 '테스트케이스' 재클릭 → 목록으로 (미저장 확인은 goTo 가 이미 했다). 처음 마운트 때는 무시 */
  const tick0 = useRef(navTick);
  useEffect(() => { if (navTick === tick0.current) return; editorDirty.current = false; setMode("목록"); setOpen(null); setBlank(null); setAddOpen(false); }, [navTick]);
  useEffect(() => { if (fqaEditTc) { const c = fqaCases.find((x) => x.id === fqaEditTc); if (c) { setSel(c); setMode("edit"); } setFqaEditTc(null); } }, [fqaEditTc]);
  const [msg, flash] = useToast();
  const [mode, setMode] = useState(() => (fqaEditTc && fqaCases.some((x) => x.id === fqaEditTc)) ? "edit" : "목록");
  const [addOpen, setAddOpen] = useState(false);
  const [blank, setBlank] = useState(null);   // 직접 작성 모달 { name, level }
  const [newPlat, setNewPlat] = useState("Web");
  const [q, setQ] = useState("");
  const [stf, setStf] = useState("전체");
  const [suiteF, setSuiteF] = useState("전체");
  const [tagF, setTagF] = useState("전체");
  const [platF, setPlatF] = useState("전체");
  // 스위트 화면의 "전체 N건 보기" — 해당 스위트로 필터를 걸고 목록을 연다
  useEffect(() => { if (fqaSuiteFocus) { setMode("목록"); setSuiteF(fqaSuiteFocus); setQ(""); setStf("전체"); setTagF("전체"); setPlatF("전체"); setFqaSuiteFocus(null); } }, [fqaSuiteFocus]);
  /* 대시보드 KPI(승인 대기 등)에서 넘어온 경우 — 상태 필터만 걸어서 목록으로 연다 */
  useEffect(() => { if (pendingSelect && pendingSelect.kind === "cases" && pendingSelect.dom === "FQA") { setMode("목록"); setSuiteF("전체"); setQ(""); setStf(pendingSelect.st || "전체"); setTagF("전체"); setPlatF("전체"); setPendingSelect(null); } }, [pendingSelect]);
  const [sel, setSel] = useState(() => (fqaEditTc ? fqaCases.find((x) => x.id === fqaEditTc) || null : null));
  const [open, setOpen] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const stK = { "승인": "pass", "검토중": "warn", "초안": "draft" };
  const lvK2 = { "Low-Code": "active", "Full-Code": "warn" };
  const lvLabel = (c) => c.level;
  // 수정 최신순 — 방금 만들거나 고친 케이스가 위로. (updatedAt 없는 시드는 뒤로)
  const list = fqaCases.filter((c) => (stf === "전체" || c.status === stf) && (suiteF === "전체" || SL.suitesOfCase(fqaSuites, c.id).some((su) => su.id === suiteF)) && (tagF === "전체" || tagList(c.tags).includes(tagF)) && (platF === "전체" || surfacesOf(c) === platF) && (c.id + c.name + SL.suiteNamesOf(fqaSuites, c.id).join(" ") + c.tags).toLowerCase().includes(q.toLowerCase()))
    .slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const inSuites = (id) => SL.suiteNamesOf(fqaSuites, id);
  const delCase = (c, after) => { if (!window.confirm(c.id + " 삭제할까요? 되돌릴 수 없습니다." + (inSuites(c.id).length ? "\n\n이 케이스가 포함된 스위트에서도 빠집니다:\n" + inSuites(c.id).map((n) => " · " + n).join("\n") : ""))) return; removeFqaCase(c.id); if (after) after(); flash(c.id + " 삭제됨"); };
  const togglePick = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = list.length > 0 && list.every((c) => picked.has(c.id));
  const toggleAll = () => { if (allPicked) setPicked(new Set()); else setPicked(new Set(list.map((c) => c.id))); };
  const bulkSet = (st) => { picked.forEach((id) => setFqaCaseStatus(id, st)); flash(picked.size + "건 " + st + " 처리"); setPicked(new Set()); };
  const bulkDel = () => { if (!window.confirm(picked.size + "건을 삭제할까요? 되돌릴 수 없습니다.")) return; picked.forEach((id) => removeFqaCase(id)); flash(picked.size + "건 삭제됨"); setPicked(new Set()); };
  /* 일괄 스위트·태그 변경.
     🔑 상태(status)와 달리 스위트·태그는 VER_FIELDS 에 있는 '리비전 대상' 필드다.
        updateFqaCase 로 조용히 바꾸면 케이스 변경 이력에 흔적이 남지 않는다 — commitFqaCase 로 리비전을 남긴다.
     🔑 스위트가 틀리면 실행 계획이 그 케이스를 아예 잡지 않는다(실패가 아니라 누락). 그래서 되돌릴 길이 있어야 한다. */
  const pickedCases = () => fqaCases.filter((c) => picked.has(c.id));
  const [suiteModal, setSuiteModal] = useState(null);   // 스위트에 추가: 추가할 스위트 ID
  const [tagModal, setTagModal] = useState(null);       // 일괄 태그: { [caseId]: "tag,tag" } 초안
  const openSuiteModal = () => setSuiteModal((fqaSuites[0] || {}).id || 0);
  /* 스위트에 추가 — 끝에 붙인다. 순서는 스위트 화면에서 바꾼다. 다른 스위트에서 빠지지 않는다(케이스는 재사용) */
  const applySuite = () => {
    const su = fqaSuites.find((x) => x.id === suiteModal);
    if (!su) { setSuiteModal(null); return; }
    const tgt = pickedCases().filter((c) => !(su.items || []).includes(c.id));
    if (!tgt.length) { flash("이미 모두 " + su.name + "에 들어 있습니다"); setSuiteModal(null); return; }
    updateFqaSuite(su.id, { items: [...(su.items || []), ...tgt.map((c) => c.id)] });
    flash(tgt.length + "건 → " + su.name + " 끝에 추가" + (tgt.some((c) => c.status !== "승인") ? " · 승인 전 케이스가 있어 그 스위트는 승인할 때까지 실행되지 않습니다" : "")); setSuiteModal(null); setPicked(new Set());
  };
  const openTagModal = () => { const d = {}; pickedCases().forEach((c) => { d[c.id] = c.tags || ""; }); setTagModal(d); };
  const tagOn = (id, t) => tagList(tagModal[id]).includes(t);
  const togTag = (id, t) => setTagModal((d) => { const cur = tagList(d[id]); return { ...d, [id]: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(",") }; });
  /* 열 머리 = 전체 토글. 하나라도 꺼져 있으면 전부 켜고, 전부 켜져 있으면 전부 끈다.
     임포트 직후처럼 'regression 을 전부에' 다는 경우가 대부분이라 이게 없으면 결국 하나씩 누르게 된다. */
  const colAll = (t) => Object.keys(tagModal || {}).every((id) => tagList(tagModal[id]).includes(t));
  const togCol = (t) => setTagModal((d) => { const all = Object.keys(d).every((id) => tagList(d[id]).includes(t)); const o = {}; Object.keys(d).forEach((id) => { const cur = tagList(d[id]); o[id] = (all ? cur.filter((x) => x !== t) : (cur.includes(t) ? cur : [...cur, t])).join(","); }); return o; });
  const applyTags = () => {
    const tgt = pickedCases().filter((c) => (c.tags || "") !== (tagModal[c.id] || ""));
    if (!tgt.length) { flash("변경된 태그가 없습니다"); setTagModal(null); return; }
    tgt.forEach((c) => commitFqaCase(c.id, { tags: tagModal[c.id] || "" }, { note: "일괄 태그 변경" }));
    flash(tgt.length + "건 태그 변경"); setTagModal(null); setPicked(new Set());
  };
  const Back = () => <button onClick={() => { if (editorDirty.current && !window.confirm("저장하지 않은 변경이 있습니다. 목록으로 나가시겠습니까?")) return; editorDirty.current = false; setMode("목록"); }} className="mb-3 inline-flex items-center gap-1 text-xs text-sky-600"><ChevronLeft size={14} />테스트케이스 목록</button>;
  /* 직접 작성 — 빈 케이스를 만들고 에디터를 연다. 스텝(Low-Code)으로만 시작한다 (MQA 와 같은 규칙)
     코드로 시작하는 길은 '스크립트 임포트' 하나 — 붙여넣은 코드도 바꿀 수 있으면 스텝으로 들어온다 */
  const createBlank = () => {
    const name = (blank.name || "").trim();
    if (!name) { flash("TC 이름을 입력하세요"); return; }
    // 목록에 넣지 않는다 — 다른 경로처럼 첫 저장 때 생성된다(열기만 하고 안 쓰면 남지 않음)
    const c = { id: nextTcId(fqaCases), origin: "직접 작성", name, tags: "", status: "초안", level: "Low-Code", dataset: "-", steps: [] };
    setBlank(null); setSel(c); setMode("edit");
  };
  if (mode === "레코딩") return <div><Back /><FqaRecordScreen onEdit={(c) => { setSel(c); setMode("edit"); }} onDone={(m) => { setMode("목록"); flash(m); }} /></div>;
  /* TC 임포트 — 수동 TC 문서(Excel · CSV) → 자연어 절차만 있는 초안. 스텝은 각 케이스에서 'AI로 스텝 만들기'
     파일의 '분류' · '사전조건' 으로 스위트를 만들지 않는다 — 스위트는 실행 흐름이라 가져온 뒤 스위트에서 넣는다 (사전조건은 참고용 원문으로 남긴다) */
  const doImport = (items) => {
    items.forEach((it, i) => addFqaCase({ id: nextTcId(fqaCases, i), origin: "TC 임포트", name: it.name, tags: "", status: "초안", level: "Low-Code", dataset: "-", steps: [], proc: it.proc, pre: it.pre || "" }));
    setMode("목록"); flash(items.length + "건 가져옴 (초안) · 스텝은 각 케이스에서 AI로 만드세요");
  };
  if (mode === "tc-import") return <div><Back /><ExcelImport sample={SAMPLE_TC_WEB} onImport={doImport} onCancel={() => setMode("목록")} target={<div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">스텝은 가져온 뒤 각 케이스에서 <span className="text-slate-700">AI로 스텝 만들기</span>로 만듭니다.</div>} /></div>;
  if (mode === "spec-import") return <div><Back /><FqaSpecImportScreen onDone={(m) => { setMode("목록"); flash(m); }} onCancel={() => setMode("목록")} /></div>;
  if (mode === "api-import") return <div><Back /><FqaApiImportScreen onDone={(m) => { setMode("목록"); flash(m); }} /></div>;
  // 편집 대상은 스토어에서 다시 찾는다 — sel은 스냅샷이라, 저장 후 새 리비전이 에디터에 반영되지 않는다
  const selCase = sel ? (fqaCases.find((c) => c.id === sel.id) || sel) : null;
  // key={id} — 복제로 다른 케이스를 열면 에디터를 새로 마운트해 편집 상태를 갈아끼운다
  if (mode === "edit") return <div><Back /><FqaEditorScreen key={selCase ? selCase.id : "new"} entry={selCase ? selCase.level : "Low-Code"} tc={selCase} onDirty={(d) => { editorDirty.current = d; }} onOpen={(c) => { editorDirty.current = false; setSel(c); }} /></div>;
  return (
    <div className="space-y-4">
      <PageToolbar desc="기능 TC 저장소 · 생성·편집·관리" />
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><Search size={15} className="text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TC·스위트·태그 검색" className="flex-1 bg-transparent text-sm text-slate-800 outline-none" /></div>
        <div style={{ width: 150 }}><Select value={String(suiteF)} onChange={(e) => setSuiteF(e.target.value === "전체" ? "전체" : +e.target.value)}><option>전체</option>{fqaSuites.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}</Select></div>
        <div style={{ width: 120 }}><Select value={tagF} onChange={(e) => setTagF(e.target.value)}><option>전체</option>{TAGS.map((t) => <option key={t}>{t}</option>)}</Select></div>
        <div style={{ width: 110 }}><Select value={platF} onChange={(e) => setPlatF(e.target.value)}><option>전체</option><option>웹</option><option>API</option><option>웹+API</option></Select></div>
        <div style={{ width: 110 }}><Select value={stf} onChange={(e) => setStf(e.target.value)}><option>전체</option><option>승인</option><option>검토중</option><option>초안</option></Select></div>
        <div className="relative">
          <Btn kind="primary" icon={Plus} onClick={() => setAddOpen(!addOpen)} >새 TC</Btn>
          {addOpen && (
            <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-300 bg-white py-1 shadow-xl">
              {/* TC 임포트만 스텝 없이 절차로 들어온다 (초안) — 스텝은 에디터에서 AI로 만든다 */}
              {[["직접 작성", Pencil, "빈 케이스", true], ["레코딩 (웹)", Video, "레코딩", true], ["API 임포트", FileText, "api-import", true], ["TC 임포트 (Excel · CSV)", FileText, "tc-import", true], ["스크립트 임포트 (.spec.ts)", Code2, "spec-import", true]].map(([l, Ic, m, ok]) => (
                <button key={l} disabled={!ok} onClick={() => { if (!ok) return; setAddOpen(false); if (m === "빈 케이스") { setBlank({ name: "", level: "Low-Code" }); return; } setMode(m); }} className={"flex w-full items-center gap-2 px-3 py-2 text-sm " + (ok ? "text-slate-800 hover:bg-slate-100" : "cursor-not-allowed text-slate-500")}><Ic size={14} className={ok ? "text-sky-600" : "text-slate-400"} />{l}{!ok && <span className="ml-auto text-slate-500" style={{ fontSize: 10 }}>준비 중</span>}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {picked.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm">
          <span className="flex-1 text-sky-700">{picked.size}건 선택됨</span>
          <Btn kind="primary" icon={CheckCircle2} onClick={() => bulkSet("승인")}>선택 승인</Btn>
          <Btn onClick={() => bulkSet("검토중")}>검토중으로</Btn>
          <Btn icon={Layers} onClick={openSuiteModal}>스위트에 추가</Btn>
          <Btn icon={Tag} onClick={openTagModal}>태그 지정</Btn>
          <Btn kind="danger" icon={Trash2} onClick={bulkDel}>선택 삭제</Btn>
          <Btn onClick={() => setPicked(new Set())}>선택 해제</Btn>
        </div>
      )}
      {/* ── 일괄 스위트 변경 ── 선택분이 여러 스위트에 흩어져 있을 수 있으니 현재 분포를 먼저 보여준다 */}
      {suiteModal !== null && (
        <Modal title={"스위트에 추가 · " + picked.size + "건"} onClose={() => setSuiteModal(null)}>
          <div className="space-y-3">
            <Field label="추가할 스위트" hint="고른 순서대로 스위트 끝에 붙습니다. 다른 스위트에서 빠지지 않습니다 — 케이스는 여러 스위트에서 재사용됩니다. 순서는 스위트 화면에서 바꿉니다.">
              <Select value={String(suiteModal)} onChange={(e) => setSuiteModal(+e.target.value)}>{fqaSuites.map((su) => <option key={su.id} value={String(su.id)}>{su.name} · {(su.items || []).length}건</option>)}</Select>
            </Field>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">승인 전 케이스가 들어가면 스위트 전체가 실행되지 않습니다.</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setSuiteModal(null)}>취소</Btn><Btn kind="primary" onClick={applySuite}>적용</Btn></div>
          </div>
        </Modal>
      )}
      {/* ── 일괄 태그 지정 ── 케이스별로 켜고 끈다. 열 머리를 누르면 전체 일괄. */}
      {tagModal && (
        <Modal wide title={"태그 지정 · " + picked.size + "건"} onClose={() => setTagModal(null)}>
          <div className="space-y-3">
            <div className="text-xs text-slate-500">칸을 눌러 케이스별로 켜고 끕니다. <span className="text-slate-700">열 머리</span>를 누르면 전체에 한 번에 적용됩니다.</div>
            <div className="overflow-y-auto rounded-lg border border-slate-200" style={{ maxHeight: 380 }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                    <th className="py-2 pl-3 pr-2 font-medium">케이스</th>
                    {TAGS.map((t) => (
                      <th key={t} className="w-24 px-2 py-1.5 text-center">
                        <button onClick={() => togCol(t)} title={TAG_DESC[t] + " · 전체 토글"} className={"w-full rounded-full border px-2 py-0.5 text-xs " + (colAll(t) ? "border-sky-600 bg-sky-100 text-sky-700 font-semibold" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100")}>{t}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pickedCases().map((c) => (
                    <tr key={c.id} className="border-b border-slate-200">
                      <td className="py-1.5 pl-3 pr-2"><span className="font-mono text-xs text-slate-500">{c.id}</span> <span className="text-slate-700">{c.name}</span> <span className="text-xs text-slate-500">· {inSuites(c.id).join(", ") || "스위트 없음"}</span></td>
                      {TAGS.map((t) => (
                        <td key={t} className="px-2 py-1.5 text-center">
                          <button onClick={() => togTag(c.id, t)} className={"rounded-full border px-2.5 py-0.5 text-xs " + (tagOn(c.id, t) ? "border-sky-600 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-300 hover:bg-slate-100")}>{tagOn(c.id, t) ? t : "—"}</button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setTagModal(null)}>취소</Btn><Btn kind="primary" onClick={applyTags}>적용</Btn></div>
          </div>
        </Modal>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          {/* 케이스의 속성만 — 실행 결과·결함은 실행의 속성이므로 결과·결함 화면이 본진이다 */}
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="w-8 py-2.5 pl-4"><input type="checkbox" checked={allPicked} onChange={toggleAll} className="accent-sky-600" title="전체 선택" /></th><th className="py-2.5 pr-4 font-medium">ID</th><th className="font-medium">이름</th><th className="font-medium">스위트</th><th className="font-medium">태그</th><th className="font-medium">구성</th><th className="font-medium">관리</th><th className="font-medium">상태</th><th className="font-medium">수정</th><th></th></tr></thead>
          <tbody>
            {/* 아무것도 없는 것과 필터에 걸린 것은 다른 상황이다 — 같은 빈 표를 보여주면 사용자가 원인을 모른다 */}
            {list.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center">
                {fqaCases.length === 0 ? (<>
                  <div className="text-sm font-medium text-slate-700">등록된 테스트케이스가 없습니다</div>
                  <div className="mt-1.5 text-xs text-slate-500">직접 작성 · 레코딩하거나, API 명세 · 기존 TC(Excel · CSV) · Playwright 스크립트를 임포트할 수 있습니다. 실행하려면 <span className="text-slate-500">승인</span> 상태여야 합니다.</div>

                </>) : (<>
                  <div className="text-sm text-slate-700">조건에 맞는 케이스가 없습니다</div>
                  <div className="mt-1.5 text-xs text-slate-500">검색어·스위트·태그·접점·상태 필터를 확인하세요.</div>
                </>)}
              </td></tr>
            )}
            {list.map((c) => (
              <tr key={c.id} onClick={() => setOpen(c)} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100 " + (picked.has(c.id) ? "bg-slate-100/60" : "")}>
                <td className="pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(c.id)} onChange={() => togglePick(c.id)} className="accent-sky-600" /></td>
                <td className="py-3 pr-4 font-mono text-sky-600">{c.id}</td>
                <td className="text-slate-800">{c.name}</td>
                <td className="text-slate-500">{inSuites(c.id).join(", ") || "—"}</td>
                <td>{tagList(c.tags).length ? <div className="flex gap-1">{tagList(c.tags).map((t) => <span key={t} className="rounded-full border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t}</span>)}</div> : <span className="text-xs text-slate-500">-</span>}</td>
                <td className="whitespace-nowrap">{surfacesOf(c) === "-" ? <span className="text-xs text-slate-500">-</span> : <Badge kind={SURF_K[surfacesOf(c)] || "info"}>{surfacesOf(c)}</Badge>}{c.dataset && c.dataset !== "-" && <span className="ml-1 font-mono text-sky-600" style={{ fontSize: 10 }} title={"데이터셋 " + c.dataset}>⛁ {c.dataset}</span>}</td>
                <td><Badge kind={lvK2[c.level] || "info"}>{lvLabel(c)}</Badge></td>
                <td><Badge kind={stK[c.status]}>{c.status}</Badge></td>
                <td className="pr-2 text-xs text-slate-500 whitespace-nowrap">{c.updatedBy || "—"} · {c.updatedAt || "—"}</td>
                {/* 디버그 실행은 환경을 골라야 한다 — 그 자리는 에디터다 */}
                <td className="pr-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}><button onClick={() => { setSel(c); setMode("edit"); }} className="mr-3 text-xs text-slate-500 hover:text-sky-600">편집</button><button onClick={() => delCase(c)} className="text-slate-500 hover:text-red-600" title="삭제"><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {open && (
        <Portal><div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><span className="font-mono text-sky-600">{open.id}</span><button onClick={() => setOpen(null)} className="text-slate-500 hover:text-slate-700"><X size={20} /></button></div>
            <div className="space-y-4 text-sm">
              <div><div className="text-slate-900">{open.name}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{surfacesOf(open) !== "-" && <Badge kind={SURF_K[surfacesOf(open)] || "info"}>{surfacesOf(open)}</Badge>}{inSuites(open.id).map((n) => <Badge key={n} kind="info">{n}</Badge>)}<Badge kind={lvK2[open.level]}>{lvLabel(open)}</Badge><Badge kind={stK[open.status]}>{open.status}</Badge></div></div>
              <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500 space-y-0.5"><div>생성 <span className="text-slate-700">{open.createdBy || "—"}</span> · {open.createdAt || "—"}</div><div>수정 <span className="text-slate-700">{open.updatedBy || "—"}</span> · {open.updatedAt || "—"}</div></div>
              <div><div className="mb-1 text-xs text-slate-500">태그</div>{tagList(open.tags).length ? <div className="flex flex-wrap gap-1.5">{tagList(open.tags).map((t) => <span key={t} className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>)}</div> : <div className="text-xs text-slate-500">없음</div>}</div>
              <div><div className="mb-1 text-xs text-slate-500">데이터셋 (데이터 드리븐)</div><div className="text-xs text-slate-500">{open.dataset && open.dataset !== "-" ? open.dataset : "없음"}</div></div>
              <div><div className="mb-1 text-xs text-slate-500">생성 경로</div><div className="text-xs text-slate-500">{open.origin || "—"}</div></div>
              {/* 실행 결과·결함은 케이스의 속성이 아니다 — 결과·결함 화면이 본진 */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                {(open.status || "검토중") !== "승인"
                  ? <Btn kind="primary" icon={CheckCircle2} onClick={() => { setFqaCaseStatus(open.id, "승인"); setOpen({ ...open, status: "승인" }); flash(open.id + " 승인됨"); }}>승인</Btn>
                  : <Btn icon={RefreshCw} onClick={() => { setFqaCaseStatus(open.id, "검토중"); setOpen({ ...open, status: "검토중" }); flash(open.id + " 검토중으로"); }}>검토중으로</Btn>}
                {/* 실행은 환경을 골라야 한다 — 에디터의 '디버그 실행'이 그 자리다. 여기서 흉내 내지 않는다. */}
                <Btn icon={Code2} onClick={() => { setSel(open); setMode("edit"); setOpen(null); }}>편집(에디터)</Btn>
                <div className="flex-1" />
                <Btn kind="danger" icon={X} onClick={() => delCase(open, () => setOpen(null))}>삭제</Btn>
              </div>
            </div>
          </div>
        </div></Portal>
      )}
      {blank && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBlank(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Pencil size={15} className="text-sky-600" />직접 작성</span>
              <button onClick={() => setBlank(null)} className="text-slate-500 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="space-y-3.5 px-5 py-4">
              <Field label="TC 이름"><Input value={blank.name} onChange={(e) => setBlank({ ...blank, name: e.target.value })} placeholder="예: 쿠폰 중복 적용 차단" /></Field>
              <div className="text-xs text-slate-500">스텝으로 작성합니다. 쓰던 Playwright 코드가 있으면 <button onClick={() => { setBlank(null); setMode("spec-import"); }} className="text-sky-600">스크립트 임포트</button>로 가져오세요.</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5"><Btn onClick={() => setBlank(null)}>취소</Btn><Btn kind="primary" icon={Code2} onClick={createBlank}>에디터 열기</Btn></div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}