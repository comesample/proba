// AI 품질 — 지식 소스
//   평가 대상 챗봇이 답할 근거로 삼는 문서 묶음(약관 · FAQ · 상품 안내 등).
//   평가 계획에서 고르면 LLM Judge 가 이 문서를 근거로 정확성 · 환각을 판정한다 — 골든 답변만으로는 놓치는 사실 오류를 잡는다.
//   문서는 올리면 처리(텍스트 추출 · 임베딩)를 거쳐 '완료'가 되어야 쓰인다. '실패' 문서는 쓰지 않는다.
//   화면 구성은 '챗봇 연결'과 같다 — 왼쪽 목록(맨 위 추가 버튼 → 팝업) · 오른쪽 상세
import { useEffect, useRef, useState } from "react";
import { FileText, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useApp } from "../common/context.js";
import { Badge, Btn, Card, Field, Input, PageToolbar, SearchInput, SEL_CARD, SEL_IDLE, nowStamp } from "../common/ui.jsx";

const ACCEPT = ".pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.csv,.xls,.xlsx";
const MAX_MB = 10;
const ST_K = { "처리 중": "info", "완료": "pass", "실패": "fail" };
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
const extColor = (n) => { const e = String(n).split(".").pop().toLowerCase(); return e === "pdf" ? "text-red-500" : ["xls", "xlsx", "csv"].includes(e) ? "text-emerald-600" : ["ppt", "pptx"].includes(e) ? "text-orange-500" : "text-sky-600"; };

/* 추가 팝업 — 이름 · 설명만. 문서는 만든 뒤 오른쪽 상세에서 올린다 */
export function AddKnowledgeForm({ close }) {
  const { knowledge = [], addKnowledge, setPendingSelect, toast } = useApp();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const submit = () => {
    if (!name.trim()) { toast("이름을 입력하세요", "warn"); return; }
    const id = "KB-" + (Math.max(0, ...knowledge.map((k) => +String(k.id).split("-")[1] || 0)) + 1);
    addKnowledge({ id, name: name.trim(), desc: desc.trim(), docs: [] });
    setPendingSelect({ kind: "knowledge", id });
    toast("지식 소스가 추가되었습니다 — 오른쪽에서 문서를 올리세요", "ok");
    close();
  };
  return (
    <div className="space-y-3.5">
      <Field label="이름"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 요금제 FAQ" /></Field>
      <Field label="설명"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="어떤 문서를 모아 두는지" /></Field>
      <div className="flex justify-end gap-2 pt-1"><Btn onClick={close}>취소</Btn><Btn kind="primary" onClick={submit}>지식 소스 추가</Btn></div>
    </div>
  );
}

export function KnowledgeScreen() {
  const { knowledge = [], updateKnowledge, removeKnowledge, plans = [], currentUser, toast, openModal, pendingSelect, setPendingSelect } = useApp();
  const [selId, setSelId] = useState((knowledge[0] || {}).id || null);
  const cur = knowledge.find((k) => k.id === selId) || knowledge[0] || null;
  const [name, setName] = useState((cur || {}).name || "");
  const [desc, setDesc] = useState((cur || {}).desc || "");
  const [q, setQ] = useState("");
  const fileRef = useRef(null);
  useEffect(() => { setName((cur || {}).name || ""); setDesc((cur || {}).desc || ""); setQ(""); }, [(cur || {}).id]);
  useEffect(() => { if (pendingSelect && pendingSelect.kind === "knowledge") { setSelId(pendingSelect.id); setPendingSelect(null); } }, [pendingSelect]);
  const dirty = !!cur && (name !== cur.name || desc !== (cur.desc || ""));
  const usedBy = (k) => plans.filter((p) => p.kbId === k.id);
  const choose = (id) => { if (cur && id === cur.id) return; if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; setSelId(id); };
  const save = () => { if (!name.trim()) { toast("이름을 입력하세요", "warn"); return; } updateKnowledge(cur.id, { name: name.trim(), desc: desc.trim(), updatedBy: currentUser, updatedAt: nowStamp() }); toast(name.trim() + " 저장됨", "ok"); };
  const del = (k) => {
    const u = usedBy(k);
    if (u.length) { toast("평가 계획에서 사용 중이라 삭제할 수 없습니다 — " + u.map((p) => p.name).join(", "), "warn"); return; }
    if (!window.confirm(k.name + " 을(를) 삭제할까요? 문서도 함께 삭제됩니다.")) return;
    removeKnowledge(k.id); if (cur && cur.id === k.id) setSelId(null);
  };
  /* 문서 처리 — 목업은 잠시 뒤 완료로 바꾼다 (실제: 텍스트 추출 · 임베딩). 같은 이름을 다시 올리면 교체 */
  const onFiles = (e) => {
    const fs = Array.from(e.target.files || []); e.target.value = "";
    const big = fs.filter((f) => f.size > MAX_MB * 1048576), ok = fs.filter((f) => f.size <= MAX_MB * 1048576);
    if (big.length) toast(big.map((f) => f.name).join(", ") + " — 파일당 " + MAX_MB + "MB 이하만 올릴 수 있습니다", "warn");
    if (!ok.length) return;
    const at = nowStamp(), kbId = cur.id;
    const fresh = ok.map((f) => ({ name: f.name, size: fmtSize(f.size), status: "처리 중", by: currentUser, at }));
    const names = fresh.map((d) => d.name);
    updateKnowledge(kbId, (k) => ({ docs: [...fresh, ...k.docs.filter((d) => !names.includes(d.name))] }));
    setTimeout(() => updateKnowledge(kbId, (k) => ({ docs: k.docs.map((d) => (names.includes(d.name) && d.status === "처리 중" ? { ...d, status: "완료" } : d)) })), 1500);
  };
  const removeDoc = (d) => { if (!window.confirm(d.name + " 을(를) 삭제할까요?")) return; updateKnowledge(cur.id, (k) => ({ docs: k.docs.filter((x) => x !== d) })); };
  const docs = ((cur || {}).docs || []).filter((d) => !q || (d.name + " " + d.by).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <PageToolbar desc="정확성 · 환각 판정 근거로 쓸 지식 문서 업로드 · 관리" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => openModal("addKnowledge")}>지식 소스 추가</Btn>
          {knowledge.map((k) => (
            <Card key={k.id} className={"cursor-pointer p-3 " + (cur && cur.id === k.id ? SEL_CARD : SEL_IDLE)}>
              <div onClick={() => choose(k.id)} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{k.name}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{k.desc || "—"}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); del(k); }} className="shrink-0 text-slate-400 hover:text-red-600" title="삭제"><Trash2 size={14} /></button>
              </div>
            </Card>
          ))}
          {knowledge.length === 0 && <div className="rounded-lg border border-slate-200 p-4 text-center text-xs text-slate-500">지식 소스가 없습니다 — 지식 소스 추가</div>}
        </div>
        <div className="col-span-9 space-y-4">
          {!cur ? <Card className="p-10 text-center text-sm text-slate-500">왼쪽에서 지식 소스를 선택하거나 추가하세요</Card> : (<>
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
                  <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명" />
                </div>
                <div className="flex shrink-0 items-center gap-2">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn kind="primary" icon={RefreshCw} onClick={save} disabled={!dirty}>저장</Btn></div>
              </div>
              <div className="text-xs text-slate-500">생성 {cur.createdBy || "—"} · {cur.createdAt || "—"}{cur.updatedAt ? " · 수정 " + (cur.updatedBy || "—") + " · " + cur.updatedAt : ""}{usedBy(cur).length ? " · 사용 중: " + usedBy(cur).map((p) => p.name).join(", ") : ""}</div>
            </Card>
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileText size={15} className="text-sky-600" />문서 ({(cur.docs || []).length})</span>
                <div className="flex items-center gap-2">
                  <div className="w-64"><SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="파일명 또는 업로드한 사람 검색" /></div>
                  <Btn icon={Upload} onClick={() => fileRef.current && fileRef.current.click()}>문서 업로드</Btn>
                  <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={onFiles} />
                </div>
              </div>
              {!(cur.docs || []).length ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">PDF · TXT · MD · DOC(X) · PPT(X) · CSV · XLS(X) · 파일당 {MAX_MB}MB 이하</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2 font-medium">파일명</th><th className="px-3 py-2 font-medium">크기</th><th className="px-3 py-2 font-medium">상태</th><th className="px-3 py-2 font-medium">업로드 / 교체일</th><th className="px-3 py-2 text-right font-medium">관리</th></tr></thead>
                    <tbody>{docs.map((d) => (
                      <tr key={d.name} className="border-b border-slate-100 last:border-0">
                        <td className="max-w-[340px] px-3 py-2"><div className="flex items-center gap-2"><FileText size={14} className={"shrink-0 " + extColor(d.name)} /><span className="truncate text-slate-800" title={d.name}>{d.name}</span></div></td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-500">{d.size}</td>
                        <td className="px-3 py-2"><span title={d.why || ""}><Badge kind={ST_K[d.status] || "draft"}>{d.status}</Badge></span></td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{d.by} · {d.at}</td>
                        <td className="px-3 py-2 text-right"><button onClick={() => removeDoc(d)} className="text-slate-400 hover:text-red-600" title="삭제"><Trash2 size={14} /></button></td>
                      </tr>
                    ))}{!docs.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">검색 결과가 없습니다</td></tr>}</tbody>
                  </table>
                </div>
              )}
            </Card>
          </>)}
        </div>
      </div>
    </div>
  );
}
