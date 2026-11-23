import { useState } from "react";
import { useApp } from "./context.js";
import { Card, PageToolbar, Badge, Btn, Field, Input, Toast, useToast, Portal } from "./ui.jsx";
import { Plus, X, Save, Pencil, Search, Upload, Database } from "lucide-react";

const nowStr = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
const parseCsv = (text) => {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { columns: [], rows: [] };
  const columns = lines[0].split(",").map((c) => c.trim()).filter(Boolean);
  const rows = lines.slice(1).map((ln) => { const cells = ln.split(","); const o = {}; columns.forEach((c, i) => (o[c] = (cells[i] || "").trim())); return o; });
  return { columns, rows };
};
const toCsv = (d) => (d.columns || []).join(",") + "\n" + (d.rows || []).map((r) => (d.columns || []).map((c) => r[c] || "").join(",")).join("\n");

/* 테스트 데이터셋 (공통) — 명명된 표 데이터. NQA 피드/FQA 데이터 드리븐이 이름으로 참조. */
export function DatasetsScreen() {
  const { datasets, addDataset, updateDataset, removeDataset, nqaScenarios, fqaCases, goto, setDomain, setFqaEditTc, setNqaScnFocus } = useApp();
  const [msg, flash] = useToast();
  const list = datasets || [];
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [refModal, setRefModal] = useState(null);
  const [df, setDf] = useState({ name: "", desc: "", text: "", uploaded: false });
  const ql = q.trim().toLowerCase();
  const shown = !ql ? list : list.filter((d) => d.name.toLowerCase().includes(ql) || (d.desc || "").toLowerCase().includes(ql));
  // 참조처: NQA 측정 시나리오(scn.dataset) + FQA 테스트케이스(c.dataset)
  const refsOf = (name) => [
    ...(fqaCases || []).filter((c) => c.dataset === name).map((c) => ({ domain: "FQA", domLabel: "웹 테스트", code: c.id, title: c.name, tc: c.id })),
    ...(nqaScenarios || []).filter((s) => s.dataset === name).map((s) => ({ domain: "NQA", domLabel: "부하", code: "시나리오", title: s.name, id: s.id })),
  ];
  const refCount = (name) => refsOf(name).length;
  const goRef = (r) => {
    if (r.domain === "FQA") { if (setFqaEditTc) setFqaEditTc(r.tc); if (setDomain) setDomain("FQA"); if (goto) goto("fqa-cases"); }
    else { if (setNqaScnFocus) setNqaScnFocus(r.id); if (setDomain) setDomain("NQA"); if (goto) goto("nqa-scenarios"); }
  };
  const rowN = (d) => (d.rowCount != null ? d.rowCount : (d.rows || []).length);
  const openAdd = () => { setEditId(null); setDf({ name: "", desc: "", text: "phone,pw\n", uploaded: false }); setModal(true); };
  const openEdit = (d) => { setEditId(d.id); setDf({ name: d.name, desc: d.desc || "", text: toCsv(d), uploaded: false }); setModal(true); };
  const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setDf((v) => ({ ...v, text: String(r.result || "").replace(/^﻿/, ""), uploaded: true, name: v.name || f.name.replace(/\.[^.]+$/, "") })); }; r.readAsText(f, "utf-8"); };
  const save = () => {
    const name = df.name.trim();
    if (!name) { flash("이름을 입력하세요"); return; }
    if (list.some((d) => d.id !== editId && d.name === name)) { flash("동일 이름 데이터셋이 이미 있습니다"); return; }
    const { columns, rows } = parseCsv(df.text);
    if (!columns.length) { flash("컬럼(첫 줄)이 필요합니다"); return; }
    const t = nowStr();
    const payload = { name, desc: df.desc.trim(), columns, rows, rowCount: rows.length, source: df.uploaded ? "업로드" : "인라인" };
    if (editId) { updateDataset(editId, payload); flash("데이터셋이 수정되었습니다"); }
    else { addDataset({ id: "ds" + Date.now(), ...payload, createdAt: t, updatedAt: t }); flash("데이터셋이 추가되었습니다"); }
    setModal(false);
  };
  /* 깨지는 것은 과거가 아니라 '다음 실행'이다 — 실행 결과에는 행 스냅샷이 남으므로 과거 결과·결함은 영향받지 않는다.
     그 사실을 경고문에 적지는 않는다. 묻지 않은 걱정을 만들어 답하는 꼴이 된다. */
  const del = (d) => { const n = refCount(d.name); if (n > 0 && !window.confirm(d.name + " 을(를) 참조하는 항목 " + n + "곳이 다음 실행부터 실패합니다.\n\n계속할까요?")) return; if (n === 0 && !window.confirm(d.name + " 데이터셋을 삭제할까요?")) return; removeDataset(d.id); flash(d.name + " 삭제됨"); };
  const parsed = parseCsv(df.text);
  return (
    <div className="space-y-4">
      <PageToolbar desc="테스트 데이터셋 (표 데이터) — 대상·시나리오에서 이름으로 참조. 컬럼은 ${row.X} 매핑 기준." />
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-72"><Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·설명 검색" className="w-full rounded-lg border border-slate-300 bg-slate-100 py-2 pl-8 pr-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-sky-500" /></div>
        <Btn kind="primary" icon={Plus} onClick={openAdd}>데이터셋 추가</Btn>
      </div>
      <Card className="p-4 space-y-1.5">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-500">
          <div className="col-span-3">이름</div><div className="col-span-4">컬럼</div><div className="col-span-1 text-center">행</div><div className="col-span-1 text-center">참조</div><div className="col-span-2">생성 / 변경</div><div className="col-span-1 text-right">관리</div>
        </div>
        {shown.length === 0 ? <div className="p-4 text-center text-xs text-slate-500">{list.length === 0 ? "데이터셋이 없습니다 — 추가하세요." : "검색 결과가 없습니다."}</div> : shown.map((d) => {
          const n = refCount(d.name);
          return (
          <div key={d.id} className="grid grid-cols-12 items-center gap-2 border-b border-slate-200/60 py-1.5 text-sm">
            <div className="col-span-3 min-w-0"><div className="flex items-center gap-1.5 min-w-0"><Database size={12} className="shrink-0 text-sky-600" /><span className="truncate font-mono text-slate-800">{d.name}</span></div>{d.desc && <div className="truncate pl-5 text-xs text-slate-500">{d.desc}</div>}</div>
            <div className="col-span-4 flex flex-wrap gap-1">{(d.columns || []).map((c) => <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">{c}</span>)}</div>
            <div className="col-span-1 text-center text-xs text-slate-500">{rowN(d).toLocaleString()}</div>
            <div className="col-span-1 text-center">{n > 0 ? <button onClick={() => setRefModal({ name: d.name, refs: refsOf(d.name) })} title="참조 목록 보기"><Badge kind="active">{n}</Badge></button> : <Badge kind="draft">0</Badge>}</div>
            <div className="col-span-2 text-xs leading-tight text-slate-500"><div>{d.createdAt || "—"}</div><div className="text-slate-500">변경 {d.updatedAt || "—"}</div></div>
            <div className="col-span-1 flex items-center justify-end gap-2"><button onClick={() => openEdit(d)} className="text-slate-500 hover:text-slate-800" title="편집"><Pencil size={13} /></button><button onClick={() => del(d)} className="text-slate-500 hover:text-red-600" title="삭제"><X size={14} /></button></div>
          </div>
          );
        })}
      </Card>
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">부하 대상의 <span className="text-slate-700">테스트 데이터</span>, 기능 케이스의 데이터 드리븐에서 이 데이터셋을 이름으로 선택합니다. 데이터셋의 컬럼이 본문의 <span className="font-mono text-slate-700">{"${row.컬럼}"}</span> 매핑·검증 기준이 됩니다.</div>

      {modal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-slate-300 bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900">{editId ? "데이터셋 편집" : "새 데이터셋"}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="이름" hint="참조 이름 (파일명 대신)"><Input value={df.name} onChange={(e) => setDf({ ...df, name: e.target.value })} placeholder="accounts_10k" /></Field>
              <Field label="설명 (선택)"><Input value={df.desc} onChange={(e) => setDf({ ...df, desc: e.target.value })} placeholder="용도 메모" /></Field>
            </div>
            <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">데이터 (CSV · 첫 줄=컬럼)</span><label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:border-sky-500"><Upload size={12} />CSV 업로드<input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFile} /></label></div>
            <textarea value={df.text} onChange={(e) => setDf({ ...df, text: e.target.value, uploaded: false })} rows={8} placeholder={"phone,pw\n01012340001,P@ss0001\n01012340002,P@ss0002"} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" />
            <div className="text-xs text-slate-500">컬럼: <span className="text-slate-700">{parsed.columns.join(", ") || "—"}</span> · 행 {parsed.rows.length}개 {df.uploaded && <span className="text-sky-600">· 업로드됨</span>}</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(false)}>취소</Btn><Btn kind="primary" icon={Save} onClick={save}>{editId ? "저장" : "추가"}</Btn></div>
          </div>
        </div></Portal>
      )}
      {refModal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRefModal(null)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-300 bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div className="text-base font-semibold text-slate-900"><span className="font-mono text-sky-600">{refModal.name}</span> 참조처 <span className="text-sm font-normal text-slate-500">· {refModal.refs.length}건</span></div><button onClick={() => setRefModal(null)} className="text-slate-500 hover:text-slate-700"><X size={18} /></button></div>
            <div className="space-y-1.5">
              {refModal.refs.length === 0 ? <div className="p-4 text-center text-xs text-slate-500">참조하는 항목이 없습니다.</div> : refModal.refs.map((r, i) => (
                <button key={i} onClick={() => { goRef(r); setRefModal(null); }} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-100/50 px-3 py-2 text-left hover:border-sky-500" title="해당 항목으로 이동">
                  <Badge kind={r.domain === "NQA" ? "info" : "active"}>{r.domLabel}</Badge>
                  <span className="shrink-0 font-mono text-xs text-sky-600">{r.code}</span>
                  <span className="truncate text-sm text-slate-800">{r.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500">이동 →</span>
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500">항목을 클릭하면 해당 도메인의 테스트케이스·시나리오로 이동합니다.</div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}
