// ============================================================
// MQA 테스트케이스 — FQA 테스트케이스와 같은 뼈대
//   목록: 검색·필터·[새 TC] / 체크박스 일괄 처리 / 행 클릭 → 오른쪽 미리보기 패널 → 편집(에디터)
//   생성: 직접 작성(팝업 → 에디터) · TC 임포트(Excel/CSV → 자연어 절차) · 스크립트 임포트(Robot Framework → 스텝) — 결과물 종류로 나눈다
//   에디터: 좌 속성 열(대상·태그·운영주의·전제조건·복제·변경 이력) / 우 정체 카드 → 모드 전환·디버그 실행 → 스텝 표
// MQA 만의 것
//   · 자연어 절차 카드 (정본 3단의 첫 단계) + AI로 양식 정리 / AI로 스텝 만들기
//   · 스텝의 절차 번호 연결 · 확정/미확정 · 요소 집기(기기 화면에서)
//   · 케이스는 대상(앱)에 속한다 — 로케이터가 앱마다 다르기 때문 (FQA 케이스는 환경 독립)
//   · 관리 수준: Low-Code(스텝이 정본) → Full-Code(.robot 원문이 정본) — FQA 와 같은 용어 · 단방향
// 상태: 초안 → 검토중 → 승인 (FQA 와 동일. 저장하면 검토중, 미확정이 남으면 초안으로 저장)
// ============================================================
import { useState, useEffect, useRef, Fragment } from "react";
import { Info, XCircle, Sparkles, MousePointerClick, Play, Upload, FileText, FileCode, Plus, Save, X, Trash2, ChevronLeft, ChevronDown, CheckCircle2, AlertTriangle, Search, Code2, RefreshCw, Smartphone, Pencil, Copy, History, ArrowRight, Layers, Tag, GripVertical, Lock, MoreHorizontal, Braces, KeyRound, ShieldCheck } from "lucide-react";
import { Card, Badge, Btn, Field, Input, Select, Modal, Toast, useToast, PageToolbar, Portal } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import * as L from "./caseLogic.js";
import { flatDevices, deviceBlock, devLabel, pickDefault, osName } from "./devices.js";
import { EnvSelect, DeviceSelect, ReadonlyField, FieldRow, envText } from "./workPickers.jsx";

/* ───────── 공통 ───────── */
const ST_K = { "초안": "draft", "검토중": "warn", "승인": "pass" };
const LV_K = { "Low-Code": "active", "Full-Code": "warn" };   // FQA 와 같은 관리 수준 — Low-Code: 스텝이 정본 / Full-Code: .robot 원문이 정본 (단방향)
const TAGS = ["smoke", "regression", "critical"];
const TAG_DESC = { smoke: "배포 직후 핵심 경로", regression: "전체 회귀", critical: "실패 시 배포 중단" };
const tagList = (t) => String(t || "").split(/[,\s]+/).filter(Boolean);
const EDIT_FIELDS = ["name", "suiteId", "tags", "pre", "proc", "steps", "level", "code", "mismatch", "baseBuild", "preCase", "acctRole", "prodCaution"];
const DEF = { proc: [], steps: [], level: "Low-Code", mismatch: false, prodCaution: false };
const pickFields = (c) => Object.fromEntries(EDIT_FIELDS.map((k) => [k, c[k] === undefined || c[k] === null ? (k in DEF ? DEF[k] : "") : c[k]]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const numOf = (id) => parseInt(String(id).replace(/\D/g, ""), 10) || 0;
const nextTcId = (cases, plus = 1) => "TC-" + String(Math.max(0, ...cases.map((c) => numOf(c.id))) + plus).padStart(3, "0");
const unresolvedOfCase = (c) => (c.level === "Full-Code" ? (String(c.code || "").match(/# \[미확정\]/g) || []).length : L.unresolvedOf(c.steps));
/* 환경별 기본 테스트 버전 — 디버그 실행·요소 집기·AI 초안의 '생성 기준 빌드' */
const envBuildObj = (e) => { const a = (e && e.app) || {}; return (a.builds || []).find((x) => x.id === a.defBuild) || null; };
const envBuild = (e) => (envBuildObj(e) || {}).ver || "";
const envsOf = (sys) => ((sys && sys.envs) || []).map((e) => ({ env: e.env, build: envBuild(e), buildObj: envBuildObj(e), prod: e.prod }));
const readText = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => res(""); r.readAsText(f); });
const taCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500";
const Hdr = ({ icon: Icon, title, desc, badge }) => (
  <div className="mb-1 flex items-center gap-2"><Icon size={16} className="text-sky-600" /><span className="text-sm font-semibold text-slate-900">{title}</span>{badge && <Badge kind="active">{badge}</Badge>}{desc && <span className="text-xs text-slate-500">{desc}</span>}</div>
);
const TagPicker = ({ value, onChange }) => {
  const on = tagList(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAGS.map((t) => <button key={t} title={TAG_DESC[t]} onClick={() => onChange((on.includes(t) ? on.filter((x) => x !== t) : [...on, t]).join(","))} className={"rounded-full border px-2.5 py-0.5 text-xs " + (on.includes(t) ? "border-sky-600 bg-sky-100 text-sky-700" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100")}>{t}</button>)}
    </div>
  );
};

/* ═══════════ 목록 ═══════════ */
export function MqaCasesScreen() {
  const { mqaCases = [], mqaSuites = [], mqaSystems = [], addMqaCase, setMqaCaseStatus, removeMqaCase, commitMqaCase, mqaEditTc, setMqaEditTc, goTo, navTick } = useApp();
  const sn = (id) => ((mqaSuites.find((x) => x.id === id) || {}).name || "");   // 스위트는 ID 로 가리키고 이름은 표시할 때만 찾는다
  const editorDirty = useRef(false);
  const [msg, flash] = useToast();
  const [mode, setMode] = useState("목록");          // 목록 | edit | tc | script
  const [addOpen, setAddOpen] = useState(false);
  const [blank, setBlank] = useState(null);          // 직접 작성 팝업
  const [q, setQ] = useState("");
  const [stf, setStf] = useState("전체");
  const [suiteF, setSuiteF] = useState("전체");
  const [tagF, setTagF] = useState("전체");
  const [sysF, setSysF] = useState("전체");
  const [sel, setSel] = useState(null);              // 에디터에 연 케이스 (새 케이스면 아직 저장 전)
  const [open, setOpen] = useState(null);            // 미리보기 패널
  const [picked, setPicked] = useState(new Set());
  const [suiteModal, setSuiteModal] = useState(null);
  const [tagModal, setTagModal] = useState(null);
  /* 좌측 메뉴 '테스트케이스' 재클릭 → 목록으로 (미저장 확인은 goTo 가 이미 했다). 처음 마운트 때는 무시 */
  const tick0 = useRef(navTick);
  useEffect(() => { if (navTick === tick0.current) return; editorDirty.current = false; setMode("목록"); setOpen(null); setBlank(null); setAddOpen(false); }, [navTick]);
  useEffect(() => { if (mqaEditTc) { const id = typeof mqaEditTc === "string" ? mqaEditTc : mqaEditTc.id; const c = mqaCases.find((x) => x.id === id); if (c) { setSel(c); setMode("edit"); } setMqaEditTc(null); } }, [mqaEditTc]);

  const sysName = (id) => (mqaSystems.find((s) => s.id === id) || {}).name || "—";
  const list = mqaCases.filter((c) => (stf === "전체" || c.status === stf) && (suiteF === "전체" || String(c.suiteId) === suiteF) && (tagF === "전체" || tagList(c.tags).includes(tagF)) && (sysF === "전체" || String(c.systemId) === sysF) && (c.id + c.name + sn(c.suiteId) + c.tags).toLowerCase().includes(q.toLowerCase()))
    .slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const delCase = (c, after) => { if (!window.confirm(c.id + " 삭제할까요? 되돌릴 수 없습니다.")) return; removeMqaCase(c.id); if (after) after(); flash(c.id + " 삭제됨"); };
  const togglePick = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = list.length > 0 && list.every((c) => picked.has(c.id));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(list.map((c) => c.id)));
  const pickedCases = () => mqaCases.filter((c) => picked.has(c.id));
  /* 승인 조건 — 미확정이 남았거나 스텝이 없으면 승인할 수 없다 (실행이 막히는 케이스를 계획에 넣지 않는다) */
  const approvable = (c) => !unresolvedOfCase(c) && (c.level === "Full-Code" ? !!String(c.code || "").trim() && !L.checkRobot(c.code).errors.length : (c.steps || []).length > 0);
  const bulkSet = (st) => {
    const tgt = pickedCases().filter((c) => st !== "승인" || approvable(c));
    tgt.forEach((c) => setMqaCaseStatus(c.id, st));
    const skip = picked.size - tgt.length;
    flash(tgt.length + "건 " + st + " 처리" + (skip ? " · " + skip + "건은 미확정·스텝 없음으로 제외" : "")); setPicked(new Set());
  };
  const bulkDel = () => { if (!window.confirm(picked.size + "건을 삭제할까요? 되돌릴 수 없습니다.")) return; picked.forEach((id) => removeMqaCase(id)); flash(picked.size + "건 삭제됨"); setPicked(new Set()); };
  const applySuite = () => {
    const to = +suiteModal, tgt = pickedCases().filter((c) => c.suiteId !== to);
    if (!to) { flash("이동할 스위트를 고르세요"); return; }
    if (!tgt.length) { flash("이미 모두 " + sn(to) + " 입니다"); setSuiteModal(null); return; }
    tgt.forEach((c) => commitMqaCase(c.id, { suiteId: to }, { note: "일괄 스위트 변경" }));
    flash(tgt.length + "건 → " + sn(to)); setSuiteModal(null); setPicked(new Set());
  };
  const openTagModal = () => { const d = {}; pickedCases().forEach((c) => { d[c.id] = c.tags || ""; }); setTagModal(d); };
  const tagOn = (id, t) => tagList(tagModal[id]).includes(t);
  const togTag = (id, t) => setTagModal((d) => { const cur = tagList(d[id]); return { ...d, [id]: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(",") }; });
  const colAll = (t) => Object.keys(tagModal || {}).every((id) => tagList(tagModal[id]).includes(t));
  const togCol = (t) => setTagModal((d) => { const all = Object.keys(d).every((id) => tagList(d[id]).includes(t)); const o = {}; Object.keys(d).forEach((id) => { const cur = tagList(d[id]); o[id] = (all ? cur.filter((x) => x !== t) : (cur.includes(t) ? cur : [...cur, t])).join(","); }); return o; });
  const applyTags = () => {
    const tgt = pickedCases().filter((c) => (c.tags || "") !== (tagModal[c.id] || ""));
    if (!tgt.length) { flash("변경된 태그가 없습니다"); setTagModal(null); return; }
    tgt.forEach((c) => commitMqaCase(c.id, { tags: tagModal[c.id] || "" }, { note: "일괄 태그 변경" }));
    flash(tgt.length + "건 태그 변경"); setTagModal(null); setPicked(new Set());
  };
  const Back = () => <button onClick={() => { if (editorDirty.current && !window.confirm("저장하지 않은 변경이 있습니다. 목록으로 나가시겠습니까?")) return; editorDirty.current = false; setMode("목록"); }} className="mb-3 inline-flex items-center gap-1 text-xs text-sky-600"><ChevronLeft size={14} />테스트케이스 목록</button>;
  /* 직접 작성 — 빈 케이스를 만들고 에디터를 연다. 목록에는 첫 저장 때 들어간다 (FQA 와 동일) */
  const createBlank = () => {
    const name = (blank.name || "").trim();
    if (!name) { flash("TC 이름을 입력하세요"); return; }
    const sys = mqaSystems.find((s) => String(s.id) === String(blank.systemId));
    const c = { id: nextTcId(mqaCases), origin: "직접 작성", name, systemId: sys ? sys.id : blank.systemId, suiteId: blank.suiteId, tags: "", status: "초안", level: "Low-Code", pre: "", preCase: "", acctRole: "", proc: [], steps: [], code: "", mismatch: false, baseBuild: "", isNew: true };
    setBlank(null); setSel(c); setMode("edit");
  };
  /* 가져오기 공통 — 모두 '초안' 으로 들어온다.
     AI 스텝 생성은 단말에서 앱을 조작해야 하므로 가져오기 단계에서는 하지 않는다 — 케이스마다 에디터에서 'AI로 스텝 만들기' */
  const doImport = (items, opt) => {
    const sys = mqaSystems.find((s) => String(s.id) === String(opt.systemId));
    const byName = Object.fromEntries(mqaSuites.map((s) => [s.name, s.id]));   // 파일의 분류 이름 → 스위트 ID
    const build = envBuild(((sys && sys.envs) || []).find((e) => e.env === "스테이징") || ((sys && sys.envs) || [])[0]);
    items.forEach((it, i) => {
      const steps = it.steps && it.steps.length ? it.steps : [];
      addMqaCase({ id: nextTcId(mqaCases, i + 1), systemId: sys ? sys.id : opt.systemId, tags: "", status: "초안", pre: "", preCase: "", acctRole: "", proc: [], level: "Low-Code", code: "", mismatch: false, ...it, suite: undefined, suiteId: it.suite && byName[it.suite] ? byName[it.suite] : (opt.suiteId || null), steps, baseBuild: steps.length ? build : "" });
    });
    setMode("목록");
    flash(items.length + "건 가져옴 (초안)" + (items.some((it) => !(it.steps || []).length && it.level !== "Full-Code") ? " · 스텝은 각 케이스에서 AI로 만드세요" : ""));
  };
  const firstSuite = (mqaSuites[0] || {}).id || null;
  const startAdd = (m) => {
    setAddOpen(false);
    if (!mqaSystems.length) { flash("대상·환경에서 테스트할 앱을 먼저 등록하세요"); return; }
    if (m === "blank") { setBlank({ name: "", systemId: (mqaSystems[0] || {}).id, suiteId: firstSuite }); return; }
    setMode(m);
  };

  if (mode === "tc") return <div><Back /><ExcelImport onImport={doImport} onCancel={() => setMode("목록")} /></div>;
  if (mode === "script") return <div><Back /><RobotImport onImport={doImport} onCancel={() => setMode("목록")} /></div>;
  // 편집 대상은 스토어에서 다시 찾는다 — 저장 후 새 리비전이 에디터에 반영되도록
  const stored = sel ? mqaCases.find((c) => c.id === sel.id) : null;
  const selCase = stored || sel;
  if (mode === "edit" && selCase) return <div><Back /><MqaCaseEditor key={selCase.id} tc={selCase} isNew={!stored} onDirty={(d) => { editorDirty.current = d; }} onOpen={(c) => { editorDirty.current = false; setSel(c); }} /></div>;

  return (
    <div className="space-y-4">
      <PageToolbar desc="앱 기능 TC 저장소 · 자연어 절차 → 실행 스텝 · 생성·편집·관리" />
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><Search size={15} className="text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TC·스위트·태그 검색" className="flex-1 bg-transparent text-sm text-slate-800 outline-none" /></div>
        <div style={{ width: 150 }}><Select value={suiteF} onChange={(e) => setSuiteF(e.target.value)}><option value="전체">전체</option>{mqaSuites.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}</Select></div>
        <div style={{ width: 120 }}><Select value={tagF} onChange={(e) => setTagF(e.target.value)}><option>전체</option>{TAGS.map((t) => <option key={t}>{t}</option>)}</Select></div>
        {/* FQA 의 '접점' 필터 자리 — MQA 케이스는 대상(앱)에 속한다 */}
        <div style={{ width: 150 }}><Select value={sysF} onChange={(e) => setSysF(e.target.value)}><option value="전체">전체 앱</option>{mqaSystems.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</Select></div>
        <div style={{ width: 110 }}><Select value={stf} onChange={(e) => setStf(e.target.value)}><option>전체</option><option>승인</option><option>검토중</option><option>초안</option></Select></div>
        <div className="relative">
          <Btn kind="primary" icon={Plus} onClick={() => setAddOpen(!addOpen)} disabled={mqaSuites.length === 0} title={mqaSuites.length === 0 ? "스위트를 먼저 만드세요 — 케이스는 스위트에 속해야 계획이 잡습니다" : ""}>새 TC</Btn>
          {addOpen && (
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-300 bg-white py-1 shadow-xl">
              {[["직접 작성", Pencil, "blank", ""], ["TC 임포트", FileText, "tc", ".xlsx · .csv"], ["스크립트 임포트", FileCode, "script", ".robot"]].map(([l, Ic, m, dsc]) => (
                <button key={l} onClick={() => startAdd(m)} className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"><Ic size={14} className="shrink-0 text-sky-600" />{l}{dsc && <span className="ml-auto pl-4 font-mono text-xs text-slate-400">{dsc}</span>}</button>
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
          <Btn icon={Layers} onClick={() => setSuiteModal(firstSuite)}>스위트 변경</Btn>
          <Btn icon={Tag} onClick={openTagModal}>태그 지정</Btn>
          <Btn kind="danger" icon={Trash2} onClick={bulkDel}>선택 삭제</Btn>
          <Btn onClick={() => setPicked(new Set())}>선택 해제</Btn>
        </div>
      )}
      {suiteModal !== null && (
        <Modal title={"스위트 일괄 변경 · " + picked.size + "건"} onClose={() => setSuiteModal(null)}>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-600">현재 스위트</div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(pickedCases().reduce((a, c) => { a[sn(c.suiteId) || "—"] = (a[sn(c.suiteId) || "—"] || 0) + 1; return a; }, {})).map(([k, v]) => <span key={k} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600">{k} <span className="text-slate-500">{v}</span></span>)}</div>
            </div>
            <Field label="이동할 스위트" hint="선택한 케이스 전부가 이 스위트로 옮겨집니다. 변경 이력에 리비전으로 남습니다."><Select value={String(suiteModal)} onChange={(e) => setSuiteModal(+e.target.value)}>{mqaSuites.map((su) => <option key={su.id} value={String(su.id)}>{su.name}</option>)}</Select></Field>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setSuiteModal(null)}>취소</Btn><Btn kind="primary" onClick={applySuite}>적용</Btn></div>
          </div>
        </Modal>
      )}
      {tagModal && (
        <Modal wide title={"태그 지정 · " + picked.size + "건"} onClose={() => setTagModal(null)}>
          <div className="space-y-3">
            <div className="text-xs text-slate-500">칸을 눌러 케이스별로 켜고 끕니다. <span className="text-slate-700">열 머리</span>를 누르면 전체에 한 번에 적용됩니다.</div>
            <div className="overflow-y-auto rounded-lg border border-slate-200" style={{ maxHeight: 380 }}>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500"><th className="py-2 pl-3 pr-2 font-medium">케이스</th>{TAGS.map((t) => <th key={t} className="w-24 px-2 py-1.5 text-center"><button onClick={() => togCol(t)} title={TAG_DESC[t] + " · 전체 토글"} className={"w-full rounded-full border px-2 py-0.5 text-xs " + (colAll(t) ? "border-sky-600 bg-sky-100 font-semibold text-sky-700" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100")}>{t}</button></th>)}</tr></thead>
                <tbody>{pickedCases().map((c) => (
                  <tr key={c.id} className="border-b border-slate-200"><td className="py-1.5 pl-3 pr-2"><span className="font-mono text-xs text-slate-500">{c.id}</span> <span className="text-slate-700">{c.name}</span> <span className="text-xs text-slate-500">· {sn(c.suiteId)}</span></td>{TAGS.map((t) => <td key={t} className="px-2 py-1.5 text-center"><button onClick={() => togTag(c.id, t)} className={"rounded-full border px-2.5 py-0.5 text-xs " + (tagOn(c.id, t) ? "border-sky-600 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-300 hover:bg-slate-100")}>{tagOn(c.id, t) ? t : "—"}</button></td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setTagModal(null)}>취소</Btn><Btn kind="primary" onClick={applyTags}>적용</Btn></div>
          </div>
        </Modal>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="w-8 py-2.5 pl-4"><input type="checkbox" checked={allPicked} onChange={toggleAll} className="accent-sky-600" title="전체 선택" /></th><th className="py-2.5 pr-4 font-medium">ID</th><th className="font-medium">이름</th><th className="font-medium">스위트</th><th className="font-medium">태그</th><th className="font-medium">구성</th><th className="font-medium">관리</th><th className="font-medium">상태</th><th className="font-medium">수정</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center">
                {mqaCases.length === 0 ? (<>
                  <div className="text-sm font-medium text-slate-700">등록된 테스트케이스가 없습니다</div>
                  {mqaSuites.length === 0
                    ? <><div className="mt-1.5 text-xs text-amber-600">테스트 스위트를 먼저 만드세요. 케이스는 스위트에 속해야 실행 계획이 잡습니다.</div><Btn className="mt-3" icon={Layers} onClick={() => goTo("mqa-suites")}>테스트 스위트 만들러 가기</Btn></>
                    : <div className="mt-1.5 text-xs text-slate-500">직접 작성하거나, 기존 TC(Excel · CSV)나 Robot Framework 스크립트를 임포트할 수 있습니다. 실행하려면 <span className="text-slate-500">승인</span> 상태여야 합니다.</div>}
                </>) : (<>
                  <div className="text-sm text-slate-700">조건에 맞는 케이스가 없습니다</div>
                  <div className="mt-1.5 text-xs text-slate-500">검색어·스위트·태그·앱·상태 필터를 확인하세요.</div>
                </>)}
              </td></tr>
            )}
            {list.map((c) => {
              const u = unresolvedOfCase(c);
              return (
                <tr key={c.id} onClick={() => setOpen(c)} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100 " + (picked.has(c.id) ? "bg-slate-100/60" : "")}>
                  <td className="pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(c.id)} onChange={() => togglePick(c.id)} className="accent-sky-600" /></td>
                  <td className="py-3 pr-4 font-mono text-sky-600">{c.id}</td>
                  <td className="text-slate-800">{c.name}{L.changedProcs(c).length > 0 && <span title={"절차 " + L.changedProcs(c).join(", ") + "번 문장이 바뀌어 스텝 확인이 필요합니다"} className="ml-1.5 text-amber-600">●</span>}</td>
                  <td className="text-slate-500">{sn(c.suiteId) || "—"}</td>
                  <td>{tagList(c.tags).length ? <div className="flex gap-1">{tagList(c.tags).map((t) => <span key={t} className="rounded-full border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t}</span>)}</div> : <span className="text-xs text-slate-500">-</span>}</td>
                  {/* 구성 — 어느 앱 · 전제조건 · 미확정 */}
                  <td className="whitespace-nowrap">
                    <Badge kind="info">{sysName(c.systemId)}</Badge>
                    {c.preCase && <button onClick={(e) => { e.stopPropagation(); const t = mqaCases.find((x) => x.id === c.preCase); if (t) setOpen(t); }} className="ml-1 font-mono text-slate-500 hover:text-sky-600" style={{ fontSize: 10 }} title={"전제조건 " + c.preCase + " — 클릭하면 그 케이스를 봅니다"}>← {c.preCase}</button>}
                    {u > 0 && <span className="ml-1 text-amber-700" style={{ fontSize: 10 }} title="요소가 정해지지 않은 스텝">미확정 {u}</span>}
                  </td>
                  <td><Badge kind={LV_K[c.level] || "active"}>{c.level || "Low-Code"}</Badge></td>
                  <td><Badge kind={ST_K[c.status]}>{c.status}</Badge></td>
                  <td className="whitespace-nowrap pr-2 text-xs text-slate-500">{c.updatedBy || "—"} · {c.updatedAt || "—"}</td>
                  <td className="whitespace-nowrap pr-4 text-right" onClick={(e) => e.stopPropagation()}><button onClick={() => { setSel(c); setMode("edit"); }} className="mr-3 text-xs text-slate-500 hover:text-sky-600">편집</button><button onClick={() => delCase(c)} className="text-slate-500 hover:text-red-600" title="삭제"><X size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {open && (() => {
        const oc = mqaCases.find((c) => c.id === open.id) || open;
        const u = unresolvedOfCase(oc);
        return (
          <Portal><div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setOpen(null)}>
            <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><span className="font-mono text-sky-600">{oc.id}</span><button onClick={() => setOpen(null)} className="text-slate-500 hover:text-slate-700"><X size={20} /></button></div>
              <div className="space-y-4 text-sm">
                <div><div className="text-slate-900">{oc.name}</div><div className="mt-1.5 flex flex-wrap gap-1.5"><Badge kind="info">{sysName(oc.systemId)}</Badge><Badge kind="info">{sn(oc.suiteId) || "스위트 없음"}</Badge><Badge kind={LV_K[oc.level] || "active"}>{oc.level || "Low-Code"}</Badge><Badge kind={ST_K[oc.status]}>{oc.status}</Badge></div></div>
                <div className="space-y-0.5 rounded-lg bg-slate-100 p-3 text-xs text-slate-500"><div>생성 <span className="text-slate-700">{oc.createdBy || "—"}</span> · {oc.createdAt || "—"}</div><div>수정 <span className="text-slate-700">{oc.updatedBy || "—"}</span> · {oc.updatedAt || "—"}</div></div>
                <div><div className="mb-1 text-xs text-slate-500">자연어 절차</div>{(oc.proc || []).length ? <ol className="space-y-0.5 text-xs text-slate-700">{oc.proc.map((p, i) => <li key={i}>{i + 1}. {p.t}{p.e && <span className="text-slate-500"> → {p.e}</span>}</li>)}</ol> : <div className="text-xs text-slate-500">없음</div>}</div>
                <div><div className="mb-1 text-xs text-slate-500">실행 스텝</div><div className="text-xs text-slate-700">{oc.level === "Full-Code" ? "Full-Code(.robot 원문)로 관리" : (oc.steps || []).length + "개"}{u > 0 && <span className="ml-1.5 text-amber-700">· 미확정 {u}개</span>}{oc.baseBuild && <span className="ml-1.5 text-slate-500">· v{oc.baseBuild} 기준</span>}</div></div>
                <div><div className="mb-1 text-xs text-slate-500">전제조건</div><div className="text-xs text-slate-700">{oc.preCase ? oc.preCase + " · " + ((mqaCases.find((x) => x.id === oc.preCase) || {}).name || "—") + (oc.acctRole ? " (" + oc.acctRole + " 계정)" : "") : "없음"}</div></div>
                <div><div className="mb-1 text-xs text-slate-500">태그</div>{tagList(oc.tags).length ? <div className="flex flex-wrap gap-1.5">{tagList(oc.tags).map((t) => <span key={t} className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>)}</div> : <div className="text-xs text-slate-500">없음</div>}</div>
                <div><div className="mb-1 text-xs text-slate-500">생성 경로</div><div className="text-xs text-slate-500">{oc.origin || "—"}</div></div>
                {(() => { const sy = mqaSystems.find((x) => x.id === oc.systemId); const e = sy && ((sy.envs || []).find((x) => x.env === "스테이징") || (sy.envs || [])[0]); const curB = envBuild(e); const ok = !oc.baseBuild || !curB || oc.baseBuild === curB || (oc.lastDry && oc.lastDry.build === curB && oc.lastDry.result === "통과"); return ok ? null : <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" />기준 앱 v{oc.baseBuild} · 현재 {e.env} 앱 v{curB} — 요소가 바뀌었을 수 있습니다. 디버그 실행으로 확인한 뒤 승인하세요.</div>; })()}
                {oc.lastDry && <div><div className="mb-1 text-xs text-slate-500">마지막 디버그 실행</div><div className={"text-xs " + (oc.lastDry.result === "통과" ? "text-emerald-700" : "text-red-700")}>{oc.lastDry.at} · {oc.lastDry.env || ""} 앱 v{oc.lastDry.build} · {oc.lastDry.result}{oc.lastDry.failStep ? " (스텝 " + oc.lastDry.failStep + ")" : ""}</div></div>}
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  {oc.status !== "승인"
                    ? <Btn kind="primary" icon={CheckCircle2} disabled={!approvable(oc)} title={approvable(oc) ? "" : u ? "미확정 스텝을 채워야 승인할 수 있습니다" : oc.level === "Full-Code" && String(oc.code || "").trim() ? "스크립트 문법 오류를 고쳐야 승인할 수 있습니다" : "스텝이 없어 승인할 수 없습니다"} onClick={() => { setMqaCaseStatus(oc.id, "승인"); flash(oc.id + " 승인됨"); }}>승인</Btn>
                    : <Btn icon={RefreshCw} onClick={() => { setMqaCaseStatus(oc.id, "검토중"); flash(oc.id + " 검토중으로"); }}>검토중으로</Btn>}
                  <Btn icon={Code2} onClick={() => { setSel(oc); setMode("edit"); setOpen(null); }}>편집(에디터)</Btn>
                  <div className="flex-1" />
                  <Btn kind="danger" icon={X} onClick={() => delCase(oc, () => setOpen(null))}>삭제</Btn>
                </div>
              </div>
            </div>
          </div></Portal>
        );
      })()}
      {blank && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBlank(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Pencil size={15} className="text-sky-600" />직접 작성</span><button onClick={() => setBlank(null)} className="text-slate-500 hover:text-slate-700"><X size={18} /></button></div>
            <div className="space-y-3.5 px-5 py-4">
              <Field label="TC 이름"><Input value={blank.name} onChange={(e) => setBlank({ ...blank, name: e.target.value })} placeholder="예: 장바구니에 상품 담기" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="대상 (앱)"><Select value={blank.systemId} onChange={(e) => setBlank({ ...blank, systemId: e.target.value })}>{mqaSystems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                <Field label="스위트"><Select value={String(blank.suiteId)} onChange={(e) => setBlank({ ...blank, suiteId: +e.target.value })}>{mqaSuites.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}</Select></Field>
              </div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">자연어 절차로 시작합니다. 기존 Robot Framework 원문은 <span className="text-slate-800">스크립트 임포트</span>로 들여오세요.</div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5"><Btn onClick={() => setBlank(null)}>취소</Btn><Btn kind="primary" icon={Code2} onClick={createBlank}>에디터 열기</Btn></div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}

/* 입력 값 + 변수 넣기 — 값 전체를 ${키} 로 바꾼다 (FQA VarRefInput 과 같은 방식)
   맨 위는 계정: 실행할 때 대상·환경의 계정 풀에서 주입되는 값이라 조직 변수 목록에 없다.
   목록은 카드 밖으로 띄운다(스텝 카드가 넘치는 부분을 자르므로) */
const ACCT_VARS = [{ key: "계정 ID", desc: "실행 시 대상·환경의 테스트 계정" }, { key: "계정 비밀번호", desc: "실행 시 주입 · 화면·로그에 가려짐", secret: true }];
const ValInput = ({ value, onChange, vars }) => {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const toggle = () => { if (pos) { setPos(null); return; } const r = btn.current.getBoundingClientRect(); setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 288) }); };
  const put = (k) => { onChange("${" + k + "}"); setPos(null); };
  const Item = ({ v }) => (
    <button onClick={() => put(v.key)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sky-50">
      <span className="font-mono text-xs text-sky-700">{"${" + v.key + "}"}</span>{v.secret && <Lock size={11} className="text-slate-400" />}
      <span className="ml-auto truncate text-xs text-slate-500">{v.desc}</span>
    </button>
  );
  return (
    <div className="flex w-48 shrink-0 items-center gap-1">
      <div className="min-w-0 flex-1"><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="입력할 값" className={/^\$\{.+\}$/.test(value) ? "font-mono text-xs text-sky-700" : ""} /></div>
      <button ref={btn} onClick={toggle} title="변수 넣기" className={"shrink-0 rounded-lg border px-1.5 py-1.5 " + (pos ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-500 hover:text-sky-700")}><Braces size={14} /></button>
      {pos && <Portal>
        <div className="fixed inset-0 z-50" onClick={() => setPos(null)} />
        <div style={{ top: pos.top, left: pos.left }} className="fixed z-50 max-h-80 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <div className="flex items-center gap-1 px-3 pb-1 pt-1.5 text-xs font-semibold text-slate-500"><KeyRound size={11} />계정 · 실행 시 주입</div>
          {ACCT_VARS.map((v) => <Item key={v.key} v={v} />)}
          <div className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-xs font-semibold text-slate-500">조직 변수</div>
          {vars.length === 0 && <div className="px-3 py-1.5 text-xs text-slate-500">등록된 변수가 없습니다</div>}
          {vars.map((v) => <Item key={v.id} v={v} />)}
        </div>
      </Portal>}
    </div>
  );
};

/* ═══════════ 에디터 ═══════════ */
export function MqaCaseEditor({ tc, isNew, onDirty, onOpen }) {
  const { addMqaCase, commitMqaCase, updateMqaCase, mqaCases = [], mqaSystems = [], mqaSuites = [], mqaRunners = [], lockMqaDevice, releaseMqaDevice, setNavGuard, mqaWork = {}, setMqaWork, setMqaCaseStatus, variables = [] } = useApp();
  const [msg, flash] = useToast();
  const [d, setD] = useState(() => clone(pickFields(tc)));
  const [gen, setGen] = useState(false);       // AI 생성 진행 창
  const held = useRef(null);                     // 디버그 실행이 점유한 단말 — 화면을 떠나면 반납
  /* 자연어 절차 카드 — 절차가 있으면 보이고, 없으면 'AI로 스텝 만들기' 를 누를 때만 연다.
     (스텝부터 바로 쓰는 경우가 있다. TC 임포트로 들어온 케이스는 절차만 있으므로 처음부터 보인다) */
  const [showProc, setShowProc] = useState((tc.proc || []).length > 0);
  const [focusRow, setFocusRow] = useState(null);
  const [rowDrag, setRowDrag] = useState(null);
  const [paste, setPaste] = useState(null);      // 여러 줄 붙여넣기 { text }
  const [pick, setPick] = useState(null);
  const [showRobot, setShowRobot] = useState(false);
  const [hoverN, setHoverN] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [qa, setQa] = useState(null);           // run | ver
  const [runRes, setRunRes] = useState(null);
  const [raw, setRaw] = useState({});            // 로케이터 원문 편집을 펼친 스텝
  const [focusStep, setFocusStep] = useState(null);   // '이 스텝으로 이동' 강조
  /* 편집 세션 — 요소 집기는 그 스텝 직전 화면이 필요하다. 매번 처음부터 실행하면 느리므로
     단말을 붙잡아 두고 화면을 이어간다. at = 마지막으로 실행된 스텝 index (-1 = 앱만 실행)
     · 단말을 바꾸거나 · 디버그 실행/AI 생성을 시작하거나 · 화면을 떠나거나 · 10분 동안 쓰지 않으면 반납 */
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const idleRef = useRef(null);
  const [prep, setPrep] = useState(null);        // 화면 준비 진행
  const [pickCtx, setPickCtx] = useState(null);
  const [verSel, setVerSel] = useState(null);
  const [more, setMore] = useState(false);       // 동작 줄 더보기 메뉴
  const timers = useRef([]);
  useEffect(() => { setD(clone(pickFields(tc))); }, [tc.id, tc.rev]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(idleRef.current); if (held.current) releaseMqaDevice(held.current); if (sessionRef.current) releaseMqaDevice(sessionRef.current.devId); }, []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const dirty = isNew || JSON.stringify(d) !== JSON.stringify(pickFields(tc));
  useEffect(() => { if (onDirty) onDirty(dirty); setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);

  const sys = mqaSystems.find((s) => s.id === tc.systemId);
  const envs = envsOf(sys);
  /* 작업 조건 — 마지막 선택을 이어받는다. 이 앱에 그 환경이 없으면 스테이징 → 첫 환경 순 */
  const [dbgEnv, setDbgEnvRaw] = useState(() => (envs.find((e) => e.env === mqaWork.env) || envs.find((e) => e.env === "스테이징") || envs[0] || {}).env || "");
  const setDbgEnv = (v) => { setDbgEnvRaw(v); setMqaWork({ env: v }); };
  const dbg = envs.find((e) => e.env === dbgEnv) || envs[0] || null;
  const build = dbg ? dbg.build : "";
  const buildObj = dbg ? dbg.buildObj : null;
  const devs = flatDevices(mqaRunners);
  const [devId, setDevIdRaw] = useState(() => (devs.some((x) => x.id === mqaWork.devId) ? mqaWork.devId : (pickDefault(devs, buildObj) || {}).id || ""));
  const setDevId = (v) => { if (sessionRef.current) endSession(true); setDevIdRaw(v); setMqaWork({ devId: v }); };
  const dev = devs.find((x) => x.id === devId) || null;
  const ownDev = !!(session && dev && session.devId === dev.id);
  const devForCheck = ownDev ? { ...dev, state: "사용 가능", busy: null } : dev;
  const isFull = d.level === "Full-Code";
  const unresolved = isFull ? (String(d.code || "").match(/# \[미확정\]/g) || []).length : L.unresolvedOf(d.steps);
  /* Full-Code 문법 검사 — 구조 오류는 검토중 저장 · 디버그 실행 · 승인을 막는다 */
  const syn = isFull ? L.checkRobot(d.code) : null;
  const synErr = syn ? syn.errors.length : 0;
  const curRev = tc.rev || (isNew ? 0 : 1);
  const versions = tc.versions || [];
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  /* 절차 행 편집 — 절차 번호가 바뀌면 스텝의 연결(n)도 같이 옮긴다. 스텝은 항상 절차 순서로 정렬 */
  const cleanProc = (rows) => (rows || []).map((p) => ({ t: String(p.t || "").trim(), e: String(p.e || "").trim() })).filter((p) => p.t);
  const hasProc = cleanProc(d.proc).length > 0;
  const seal = (x, n) => (n >= 1 && n <= x.proc.length ? { ...x, proc: x.proc.map((p, j) => (j === n - 1 ? { ...p, b: L.procKey(p) } : p)) } : x);   // 이 절차의 스텝을 맞췄다
  const sorted = (x) => ({ ...x, steps: x.proc.length ? L.sortByProc(x.steps, x.proc.length) : x.steps });
  const updRow = (i, patch) => setD((x) => ({ ...x, proc: x.proc.map((p, j) => (j === i ? { ...p, ...(p.b === undefined ? { b: L.procKey(p) } : {}), ...patch } : p)) }));
  const addRow = (after) => { const at = after == null ? d.proc.length : after + 1; setD((x) => { const rows = x.proc.slice(); rows.splice(at, 0, { t: "", e: "" }); return { ...x, proc: rows, steps: x.steps.map((st) => (st.n > at ? { ...st, n: st.n + 1 } : st)) }; }); setFocusRow(at); };
  const delRow = (i) => {
    const k = i + 1; const moved = d.steps.filter((st) => st.n === k).length;
    if (moved && d.proc.length > 1 && !window.confirm("절차 " + k + "에 스텝 " + moved + "개가 연결되어 있습니다. 절차를 지우면 스텝은 " + (k > 1 ? "절차 " + (k - 1) : "다음 절차") + "로 옮겨집니다.\n\n지울까요?")) return;
    setD((x) => { const rows = x.proc.filter((_, j) => j !== i); const map = {}; x.proc.forEach((_, j) => { map[j + 1] = j < i ? j + 1 : j === i ? Math.max(1, k - 1) : j; }); return { ...x, proc: rows, steps: rows.length ? L.remapSteps(x.steps, map, rows.length) : x.steps }; });
  };
  const moveRow = (from, to) => setD((x) => {
    const order = x.proc.map((_, j) => j); const [m] = order.splice(from, 1); order.splice(to, 0, m);
    const map = {}; order.forEach((old, ni) => { map[old + 1] = ni + 1; });
    return { ...x, proc: order.map((j) => x.proc[j]), steps: L.remapSteps(x.steps, map, x.proc.length) };
  });
  const applyPaste = (replace) => {
    const rows = L.procFromText(paste.text); if (!rows.length) { flash("붙여넣은 내용에 절차가 없습니다"); return; }
    setD((x) => { if (replace) return sorted({ ...x, proc: rows }); const c = L.compactProc(x.proc, x.steps); return { ...x, proc: [...c.proc, ...rows], steps: c.steps }; });
    setPaste(null); flash(rows.length + "개 절차 " + (replace ? "로 바꿈" : "추가"));
  };
  const updStep = (id, patch) => { invalidate(d.steps.findIndex((s) => s.id === id)); setStepPatch(id, patch); };
  const setStepPatch = (id, patch) => setD((x) => { const st = x.steps.find((s) => s.id === id); return seal({ ...x, steps: x.steps.map((s) => (s.id === id ? { ...s, ...patch, why: "" } : s)) }, st ? st.n : 0); });
  /* 스텝 추가 — 절차가 있으면 그 절차 묶음 끝에, 없으면 맨 끝에 */
  const addStepTo = (n) => setD((x) => sorted(seal({ ...x, steps: [...x.steps, { id: L.sid(), n: n || (x.steps[x.steps.length - 1] || {}).n || 1, act: "탭", loc: "" }] }, n)));
  const delStep = (id) => { invalidate(d.steps.findIndex((s) => s.id === id)); delStepRaw(id); };
  const delStepRaw = (id) => setD((x) => { const st = x.steps.find((s) => s.id === id); return seal({ ...x, steps: x.steps.filter((s) => s.id !== id) }, st ? st.n : 0); });
  /* 드래그 — 다른 묶음의 스텝 위에 놓으면 그 절차로 옮겨진다 */
  const moveStep = (from, to) => { invalidate(Math.min(from, to)); moveStepRaw(from, to); };
  const moveStepRaw = (from, to) => setD((x) => { const a = x.steps.slice(); const tn = (a[to] || {}).n; const [m] = a.splice(from, 1); a.splice(to, 0, hasProc && tn ? { ...m, n: tn } : m); return sorted(seal({ ...x, steps: a }, tn)); });
  const dropToGroup = (n) => { if (dragIdx === null) return; invalidate(Math.min(dragIdx, d.steps.findIndex((s) => s.n >= n))); setD((x) => { const a = x.steps.slice(); const [m] = a.splice(dragIdx, 1); const at = a.findIndex((s) => s.n >= n); a.splice(at < 0 ? a.length : at, 0, { ...m, n }); return sorted(seal({ ...x, steps: a }, n)); }); setDragIdx(null); };
  const stepsOf = (n) => d.steps.filter((s) => s.n === n);
  const orphan = hasProc ? d.steps.filter((s) => !(s.n >= 1 && s.n <= d.proc.length)) : [];
  const changedN = hasProc ? d.proc.map((p, k) => (L.procChanged(p, stepsOf(k + 1).length > 0) ? k + 1 : 0)).filter(Boolean) : [];

  /* 전제조건 후보 — 같은 앱의 승인된 스텝 케이스 (FQA 와 같은 규칙: 초안을 전제로 쓰면 실행이 불안정해진다) */
  const preOpts = mqaCases.filter((c) => c.id !== tc.id && c.systemId === tc.systemId && c.status === "승인" && c.level !== "Full-Code" && !c.preCase);
  const roleOpts = [...new Set(((sys && sys.envs) || []).flatMap((e) => (e.accts || []).map((a) => a.role)).filter(Boolean))];
  const usesAcct = (d.steps || []).some((s) => /\$\{계정/.test(String(s.val || "")));

  /* 저장 = 새 리비전. 저장하면 검토중으로 — 미확정이 남거나 스텝이 없으면 초안으로 남는다 */
  const target = unresolved > 0 || synErr > 0 || (!isFull && !d.steps.length) || (isFull && !String(d.code || "").trim()) ? "초안" : "검토중";
  const save = () => {
    if (!d.name.trim()) { flash("TC 이름을 입력하세요"); return; }
    if (tc.status === "승인" && !window.confirm("승인된 케이스를 수정하면 " + target + "(으)로 바뀌고, 다시 승인받기 전까지 실행 계획에서 빠집니다.\n\n저장할까요?")) return;
    const c = L.compactProc(d.proc, d.steps);
    const patch = { ...d, proc: c.proc, steps: c.steps, mismatch: false, status: target };
    if (isNew) { const { isNew: _n, ...rest } = tc; addMqaCase({ ...rest, ...patch }); }
    else commitMqaCase(tc.id, patch);
    flash((target === "초안" ? "초안으로 저장" : "저장 · 검토 요청됨 (검토중)") + (target === "초안" && unresolved ? " — 미확정 " + unresolved + "개를 채우면 검토중으로 저장됩니다" : target === "초안" && synErr ? " — 문법 오류를 고치면 검토중으로 저장됩니다" : ""));
  };
  /* AI로 스텝 만들기 — 단말에서 앱을 조작하며 만든다 (진행 창). 절차가 없으면 열지 않는다 */
  const preOk = !d.preCase || preOpts.some((c) => c.id === d.preCase);
  const runAi = () => {
    if (!cleanProc(d.proc).length) { setShowProc(true); if (!d.proc.length) addRow(null); flash("자연어 절차를 입력한 뒤 다시 'AI로 스텝 만들기'를 누르세요"); return; }
    if (sessionRef.current) endSession(true);
    setGen(true);
  };
  const applyGen = (steps, b) => { setD((x) => ({ ...x, proc: L.compactProc(x.proc, []).proc.map((p) => ({ ...p, b: L.procKey(p) })), steps, mismatch: false, baseBuild: b || x.baseBuild })); setGen(false); flash("스텝 " + steps.length + "개 반영 (저장 전)" + (L.unresolvedOf(steps) ? " · 미확정 " + L.unresolvedOf(steps) + "개" : "")); };
  const toScript = () => {
    if (!window.confirm("Full-Code로 변환하면 스텝 편집은 읽기 전용이 되고, 되돌릴 수 없습니다.\n(변경 이력에서 이전 리비전으로 복원하는 방법만 남습니다)\n\n변환할까요?")) return;
    set({ level: "Full-Code", code: L.toRobot({ ...tc, ...d }) });
  };
  /* 디버그 실행 — 편집 중인 내용으로 이 환경에서 한 번. 실행 이력·품질 게이트에 집계되지 않는다 */
  const runBlock = !dbg ? "대상·환경에 환경이 없습니다" : !build ? dbgEnv + " 환경에 앱 설치 파일이 없습니다" : unresolved ? "미확정 " + unresolved + "개를 먼저 채우세요" : synErr ? "스크립트 문법 오류 " + synErr + "개를 먼저 고치세요" : !isFull && !d.steps.length ? "실행할 스텝이 없습니다" : !preOk ? "전제조건 케이스가 승인 상태가 아닙니다" : deviceBlock(devForCheck, buildObj);
  /* 기준 버전 — 케이스를 만든(요소를 집은) 앱 버전과 지금 작업 환경의 앱 버전이 다르면 로케이터가 바뀌었을 수 있다.
     그 버전에서 디버그 실행이 통과했으면 확인된 것으로 본다 */
  const verified = !d.baseBuild || !build || d.baseBuild === build || !!(tc.lastDry && tc.lastDry.build === build && tc.lastDry.result === "통과");
  const runOne = () => {
    if (runBlock) { flash(runBlock); return; }
    if (sessionRef.current) endSession(true);
    lockMqaDevice(dev.id, "디버그 실행 " + tc.id); held.current = dev.id;
    const rows = isFull
      ? String(d.code).split("\n").filter((l) => /^\s{2,}\S/.test(l)).map((l) => l.trim()).filter((l) => !l.startsWith("#") && !l.startsWith("[")).map((l) => ({ act: l.split(/\s{2,}/)[0], name: l.split(/\s{2,}/).slice(1).join("  "), res: { st: "ok", msg: "" } }))
      : d.steps.map((x, i) => ({ i, id: x.id, act: x.act, name: (L.ACT[x.act] || { needs: [] }).needs.includes("loc") ? L.elName(x) : "", val: x.val || "", loc: x.loc || "", res: L.simulateStep(x, build) }));
    const pre = d.preCase ? [{ pre: true, act: "전제조건 " + d.preCase, name: ((mqaCases.find((x) => x.id === d.preCase) || {}).name || "") + (d.acctRole ? " · " + d.acctRole + " 계정" : ""), res: { st: "ok", msg: "" } }] : [];
    const all = [...pre, ...rows];
    const failAt = all.findIndex((r) => r.res.st === "fail");
    setRunRes({ steps: all.map((r) => ({ ...r, st: "wait" })), done: false, fail: null });
    setQa("run");
    const last = failAt >= 0 ? failAt : all.length - 1;
    for (let i = 0; i <= last; i++) later(() => setRunRes((r) => r && { ...r, steps: r.steps.map((x, j) => (j === i ? { ...x, st: x.res.st } : x)) }), 350 * (i + 1));
    later(() => {
      const at = new Date().toTimeString().slice(0, 5);
      const fail = failAt >= 0 ? all[failAt] : null;
      setRunRes((r) => r && { ...r, done: true, at, fail, steps: r.steps.map((x, j) => (failAt >= 0 && j > failAt ? { ...x, st: "skip" } : x)) });
      releaseMqaDevice(held.current); held.current = null;
      if (!isNew) updateMqaCase(tc.id, { lastDry: { at, build, env: dbgEnv, device: dev.model, result: fail ? "실패" : "통과", ...(fail && !fail.pre ? { failStep: fail.i + 1 } : {}) } });
    }, 350 * (last + 1) + 250);
  };
  /* 검토 — 에디터에서 바로 승인 · 반려한다 (목록으로 돌아가 서랍을 열지 않아도 되게)
     승인 조건은 목록과 같다: 저장된 상태 · 미확정 0 · 스텝(또는 문법 오류 없는 스크립트)
     권한: 목업은 FQA 와 같이 제한하지 않는다 — 실 구현의 승인 권한 정책은 검토 항목 */
  const approveWhy = isNew ? "먼저 저장하세요" : dirty ? "저장한 뒤 승인할 수 있습니다" : unresolved ? "미확정 " + unresolved + "개를 채워야 승인할 수 있습니다" : synErr ? "문법 오류를 고쳐야 승인할 수 있습니다" : (!isFull && !d.steps.length) || (isFull && !String(d.code || "").trim()) ? "스텝이 없어 승인할 수 없습니다" : "";
  const approve = () => {
    if (approveWhy) { flash(approveWhy); return; }
    if (changedN.length && !window.confirm("절차 " + changedN.join(", ") + "번 문장이 바뀌었는데 스텝은 확인되지 않았습니다.\n\n그래도 승인할까요?")) return;
    if (!verified && !window.confirm("작업 환경 앱 v" + build + "에서 아직 디버그 실행으로 확인하지 않았습니다 (기준 v" + d.baseBuild + ").\n요소를 못 찾아 실행이 실패할 수 있습니다.\n\n그래도 승인할까요?")) return;
    setMqaCaseStatus(tc.id, "승인"); flash(tc.id + " 승인 — 실행 계획에 들어갈 수 있습니다");
  };
  const reject = () => { setMqaCaseStatus(tc.id, "초안"); flash(tc.id + " 반려 — 초안으로 돌렸습니다"); };
  const unapprove = () => { setMqaCaseStatus(tc.id, "검토중"); flash(tc.id + " 검토중으로 — 실행 계획에서 빠집니다"); };
  const goStep = (id) => { setQa(null); setFocusStep(id); later(() => { const el = typeof document !== "undefined" && document.getElementById("step-" + id); if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" }); }, 50); later(() => setFocusStep(null), 4000); };
  const endSession = (quiet) => {
    clearTimeout(idleRef.current);
    if (sessionRef.current) releaseMqaDevice(sessionRef.current.devId);
    sessionRef.current = null; setSession(null);
    if (!quiet) flash("편집 세션 종료 — 단말을 반납했습니다");
  };
  const bumpIdle = () => { clearTimeout(idleRef.current); idleRef.current = setTimeout(() => { endSession(true); flash("10분 동안 쓰지 않아 편집 세션을 종료했습니다"); }, 10 * 60 * 1000); };
  /* 앞쪽 스텝을 고치면 단말 화면이 더 이상 그 스텝들을 반영하지 않는다 → 다음 요소 집기는 처음부터 */
  const invalidate = (i) => { const cur = sessionRef.current; if (cur && i <= cur.at) { const ns = { ...cur, at: -1, fresh: true }; sessionRef.current = ns; setSession(ns); } };
  /* 요소 집기 — 그 스텝 직전 화면까지 단말에서 실행한 뒤 캡처한다 */
  const openPick = (stepId) => {
    const idx = d.steps.findIndex((x) => x.id === stepId);
    const pb = !build ? dbgEnv + " 환경에 앱 설치 파일이 없어 화면을 볼 수 없습니다" : deviceBlock(devForCheck, buildObj);
    if (pb) { flash(pb); return; }
    const before = d.steps.slice(0, idx).findIndex((x) => L.stateOf(x) === "미확정");
    if (before >= 0) { flash("앞선 스텝 " + (before + 1) + "번이 미확정이라 그 화면까지 갈 수 없습니다 — 앞 스텝부터 채우세요"); return; }
    let cur = sessionRef.current;
    if (!cur || cur.devId !== dev.id) { if (cur) endSession(true); lockMqaDevice(dev.id, "편집 세션 " + tc.id); cur = { devId: dev.id, at: -1, fresh: true }; sessionRef.current = cur; setSession(cur); }
    const restart = cur.at > idx - 1;
    const launch = cur.fresh || restart;
    const from = restart ? 0 : cur.at + 1;
    const need = idx - from;
    bumpIdle();
    if (need <= 0 && !launch) { setPickCtx({ idx, from, need: 0, launch: false }); setPick(stepId); return; }
    setPrep({ idx, from, need, done: 0, launch });
    let t = launch ? 600 : 0;
    for (let k = 0; k < need; k++) { t += 300; later(() => setPrep((p) => p && { ...p, done: p.done + 1 }), t); }
    later(() => { const ns = { devId: dev.id, at: idx - 1, fresh: false }; sessionRef.current = ns; setSession(ns); setPrep(null); setPickCtx({ idx, from, need, launch }); setPick(stepId); }, t + 250);
  };
  const onPick = (el) => {
    const s = d.steps.find((x) => x.id === pick);
    if (!s) return;
    bumpIdle();
    if (s.act === "화면 확인") { if (!el.text) { flash("이 요소에는 글자가 없습니다 — 다른 요소를 고르세요"); return; } updStep(s.id, { val: el.text }); }
    else { updStep(s.id, { loc: L.recommendLoc(el).loc, el: el.label }); setRaw((r) => ({ ...r, [s.id]: false })); }
    set({ baseBuild: build });
    setPick(null); flash("요소를 채웠습니다");
  };
  const duplicate = () => {
    if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 편집 중인 내용으로 복제할까요?")) return;
    const c2 = { ...clone(d), id: nextTcId(mqaCases), name: d.name + " (복제)", systemId: tc.systemId, origin: tc.origin, status: "초안", isNew: true, steps: d.steps.map((s) => ({ ...s, id: L.sid() })) };
    onOpen(c2); flash(c2.id + " 로 복제 — 저장하면 목록에 들어갑니다");
  };
  const restore = (v) => {
    const x = v.x || {};
    set({ name: v.name, suiteId: x.suiteId != null ? x.suiteId : d.suiteId, tags: v.tags || "", acctRole: v.acctRole || "", steps: clone(v.steps || []), proc: clone(x.proc || []), level: v.level || "Low-Code", code: v.code || "", preCase: x.preCase || "", prodCaution: !!x.prodCaution, pre: x.pre || "" });
    setShowProc((x.proc || []).length > 0);
    setQa(null); flash("rev " + v.rev + " 내용으로 되돌림 — 저장하면 rev " + (curRev + 1) + "이 됩니다");
  };
  const robotText = isFull ? d.code : L.toRobot({ ...tc, ...d });

  return (
    <div className="space-y-3">
      <Hdr icon={Code2} title="테스트케이스 에디터" />
      {/* 동작 줄 — 스크롤해도 위에 고정. 만들기 → 확인 → 저장 → 검토 순서로 한 줄에 둔다 */}
      <div className="sticky top-0 z-20 -mx-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="min-w-0 flex-1 truncate text-xs">
          {runBlock ? <span className="text-amber-700" title={runBlock}>⚠ {runBlock}</span>
            : dirty ? <span className="text-slate-500">저장하지 않은 변경이 있습니다</span>
            : <span className="text-slate-500">저장됨 · rev {curRev}</span>}
        </div>
        {!isFull && <Btn icon={Sparkles} onClick={runAi} title="단말에서 앱을 조작하며 자연어 절차를 스텝으로 만듭니다 (스테이징 전용)">AI로 스텝 만들기</Btn>}
        <Btn icon={Play} disabled={!!runBlock} title={runBlock || "편집 중인 내용으로 이 환경에서 한 번 실행 — 실행 이력·품질 게이트에 집계되지 않습니다"} onClick={runOne}>디버그 실행</Btn>
        <Btn kind="primary" icon={Save} disabled={!dirty} onClick={save} title={target === "초안" ? (unresolved ? "미확정이 남아 초안으로 저장됩니다" : synErr ? "문법 오류가 있어 초안으로 저장됩니다" : "스텝이 없어 초안으로 저장됩니다") : "저장하면 검토중이 되어 검토자가 승인할 수 있습니다" + (tc.status === "승인" ? " — 승인이 풀립니다" : "")}>{dirty ? (target === "초안" ? "초안 저장" : "저장 · 검토 요청") : "저장됨"}</Btn>
        {!isNew && tc.status === "검토중" && <>
          <span className="mx-0.5 h-5 w-px bg-slate-200" />
          <Btn icon={XCircle} onClick={reject} title="초안으로 돌려 다시 고치게 합니다">반려</Btn>
          <Btn kind="primary" icon={CheckCircle2} disabled={!!approveWhy} title={approveWhy || "승인하면 실행 계획에 넣을 수 있습니다"} onClick={approve}>승인</Btn>
        </>}
        {!isNew && tc.status === "승인" && <><span className="mx-0.5 h-5 w-px bg-slate-200" /><Btn icon={RefreshCw} onClick={unapprove} title="승인을 풀어 실행 계획에서 뺍니다">검토중으로</Btn></>}
        <div className="relative">
          <button onClick={() => setMore((v) => !v)} title="더보기" className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-600 hover:bg-slate-50"><MoreHorizontal size={16} /></button>
          {more && <>
            <div className="fixed inset-0 z-30" onClick={() => setMore(false)} />
            <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
              {!isFull && <button disabled={!d.steps.length} onClick={() => { setMore(false); toScript(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"><ArrowRight size={14} />Full-Code로 변환</button>}
              <button onClick={() => { setMore(false); duplicate(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"><Copy size={14} />복제</button>
              <button onClick={() => { setMore(false); setVerSel(null); setQa("ver"); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"><History size={14} />변경 이력{versions.length > 0 && <span className="text-slate-500">({versions.length})</span>}</button>
            </div>
          </>}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-4">
        {/* ── 좌: 속성 ── */}
        <div className="col-span-3 space-y-3">
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">태그</div>
            <TagPicker value={d.tags} onChange={(v) => set({ tags: v })} />
            <div className="mt-1.5 text-xs text-slate-500">실행 계획이 태그로 대상을 고릅니다.</div>
          </Card>
          <Card className="p-3">
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={!!d.prodCaution} onChange={(e) => set({ prodCaution: e.target.checked })} className="accent-amber-500" /><span className="text-sm text-slate-800">운영주의</span></label>
            <div className="mt-1.5 text-xs text-slate-500">주문·결제 등 데이터 변경 — 운영 환경 테스트 시 주의</div>
          </Card>
          {/* 전제조건 — 로그인처럼 '들어가기 위한 절차' 는 케이스로 만들고 여기서 가리킨다 (FQA 와 동일) */}
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">전제조건</div>
            <Select value={d.preCase} onChange={(e) => set({ preCase: e.target.value })}>
              <option value="">없음 (비로그인 흐름 · 로그인 자체 검증)</option>
              {preOpts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}
              {d.preCase && !preOpts.some((c) => c.id === d.preCase) && <option value={d.preCase}>{d.preCase} (승인 안 됨)</option>}
            </Select>
            {(d.preCase || usesAcct) && (
              <div className="mt-2">
                <Select value={d.acctRole} onChange={(e) => set({ acctRole: e.target.value })}><option value="">기본 (풀의 첫 계정)</option>{roleOpts.map((r) => <option key={r}>{r}</option>)}</Select>
                <div className="mt-1.5 text-xs text-slate-500">{d.preCase
                  ? <>이 역할의 계정으로 <span className="font-mono text-sky-600">{d.preCase}</span>을 먼저 수행한 상태에서 시작합니다. 스텝에 로그인을 쓰지 않습니다.</>
                  : <>스텝이 계정 변수를 사용합니다 — 이 역할의 계정이 <span className="font-mono text-sky-600">{"${계정 ID}"}</span>·<span className="font-mono text-sky-600">{"${계정 비밀번호}"}</span>에 주입됩니다.</>}</div>
              </div>
            )}
            <div className="mt-1.5 text-xs text-slate-500">같은 앱의 승인된 스텝 케이스만 고를 수 있습니다.</div>
            {d.preCase && !preOpts.some((c) => c.id === d.preCase) && <div className="mt-1 text-xs text-amber-600">지정한 전제조건 케이스가 승인 상태가 아닙니다 — 실행이 막힙니다.</div>}
          </Card>
          {d.pre && <Card className="p-3"><div className="mb-1 text-xs font-semibold text-slate-500">사전조건 (가져온 원문)</div><div className="text-xs text-slate-600">{d.pre}</div><div className="mt-1 text-xs text-slate-500">로그인 상태라면 위 전제조건에 로그인 케이스를 지정하세요.</div></Card>}
        </div>

        {/* ── 우: 정체 · 모드·디버그 · 절차 · 스텝 ── */}
        <div className="col-span-9 space-y-3">
          {/* 정체 + 스크립트를 만들려면 정해야 하는 것 — 한곳에 모은다 (시선이 화면을 돌아다니지 않게)
              윗줄: 케이스 속성(저장) — 대상 앱(만들 때 정해지고 바뀌지 않음) · 스위트
              아랫줄: 작업 조건(저장 안 함) — AI 생성 · 요소 집기 · 디버그 실행이 쓰는 환경과 단말 */}
          <Card className="p-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-sm text-sky-600">{tc.id}</span>
            <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="TC 이름" className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 outline-none hover:border-slate-300 focus:border-sky-500 focus:bg-slate-100" />
            <div className="flex shrink-0 items-center gap-2"><span className="font-mono text-xs text-slate-500">{isNew ? "새 케이스" : "rev " + curRev}</span><Badge kind={LV_K[d.level]}>{d.level} 관리</Badge><Badge kind={ST_K[tc.status] || "draft"}>{tc.status}</Badge></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-200 pt-3">
            <FieldRow label="대상 앱"><ReadonlyField value={(sys ? sys.name : "—") + " · Android"} title="대상 앱은 케이스를 만들 때 정해지며 바꿀 수 없습니다 — 로케이터가 앱마다 다르기 때문입니다" /></FieldRow>
            <FieldRow label="스위트"><Select value={String(d.suiteId)} onChange={(e) => set({ suiteId: +e.target.value })}>{mqaSuites.map((sx) => <option key={sx.id} value={String(sx.id)}>{sx.name}</option>)}</Select></FieldRow>
            <FieldRow label="작업 환경"><EnvSelect envs={envs} value={dbgEnv} onChange={setDbgEnv} /></FieldRow>
            <FieldRow label="작업 단말"><DeviceSelect devs={devs} value={devId} onChange={setDevId} build={buildObj} /></FieldRow>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Info size={12} className="shrink-0" />작업 환경 · 단말은 케이스에 저장하지 않습니다 — AI로 스텝 만들기 · 요소 집기 · 디버그 실행에 씁니다{d.baseBuild ? " · 이 케이스는 앱 v" + d.baseBuild + " 기준으로 만들어졌습니다" : ""}</div>
          {!verified && <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>이 케이스는 <b className="font-medium">앱 v{d.baseBuild}</b> 기준인데, 작업 환경의 앱은 <b className="font-medium">v{build}</b>입니다. 화면이 바뀌어 요소를 못 찾을 수 있으니 디버그 실행으로 확인하세요. 통과하면 이 안내는 사라집니다.</span></div>}
          {session && <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"><RefreshCw size={13} className="shrink-0" /><span className="flex-1">편집 세션 — <b className="font-medium">{dev ? devLabel(dev) : ""}</b> 점유 중 · {session.at >= 0 ? "스텝 " + (session.at + 1) + "까지 실행된 화면" : "앱을 다시 실행해야 하는 상태"} · 10분 동안 쓰지 않으면 자동 반납</span><button onClick={() => endSession(false)} className="shrink-0 font-medium text-sky-900">세션 종료</button></div>}
          </Card>

          {tc.note && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{tc.note}</div>}

          {/* MQA — 자연어 절차 (무엇을 검증하나 · AI가 스텝을 만드는 근거). 절차가 있거나 AI 생성을 고를 때만 보인다 */}
          {(showProc || d.proc.length > 0) && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
              <span className="text-sm font-semibold text-slate-800">자연어 절차</span><span className="text-xs text-slate-500">AI로 스텝 만들기의 입력 · 검토할 때 무엇을 검증하는지 보여줍니다</span>
              <div className="ml-auto flex items-center gap-3">
                <button onClick={() => setPaste({ text: "" })} className="text-xs text-sky-600">여러 줄 붙여넣기</button>
                {!cleanProc(d.proc).length && <button onClick={() => { setShowProc(false); set({ proc: [] }); }} className="text-slate-400 hover:text-slate-700" title="절차 닫기"><X size={14} /></button>}
              </div>
            </div>
            <div className="space-y-1.5 px-4 py-3">
              {d.proc.map((p, i) => (
                <div key={i} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (rowDrag !== null && rowDrag !== i) moveRow(rowDrag, i); setRowDrag(null); }} onMouseEnter={() => setHoverN(i + 1)} onMouseLeave={() => setHoverN(null)}
                  className={"flex items-center gap-2 rounded-lg px-1 py-0.5 " + (hoverN === i + 1 ? "bg-sky-50" : "")}>
                  <span draggable onDragStart={() => setRowDrag(i)} onDragEnd={() => setRowDrag(null)} className="cursor-grab" title="드래그로 순서 변경"><GripVertical size={14} className="text-slate-400" /></span>
                  <span className="w-12 shrink-0 text-xs text-slate-500">절차 {i + 1}</span>
                  <div className="min-w-0 flex-1"><Input value={p.t} autoFocus={focusRow === i} onFocus={() => setFocusRow(null)} onChange={(e) => updRow(i, { t: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addRow(i); } }} placeholder="예: 검색창을 누른다" /></div>
                  <div className="w-72 shrink-0"><Input value={p.e} onChange={(e) => updRow(i, { e: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addRow(i); } }} placeholder="기대 결과 (선택)" /></div>
                  <button onClick={() => delRow(i)} className="shrink-0 text-slate-400 hover:text-red-600" title="절차 삭제"><X size={13} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button onClick={() => addRow(null)} className="text-xs text-sky-600">+ 절차 추가</button>
                <span className="text-xs text-slate-500">Enter로 다음 절차 · 로그인은 절차에 쓰지 말고 왼쪽 <span className="text-slate-700">전제조건</span>으로 지정</span>
              </div>
            </div>
          </Card>
          )}

          {/* 실행 스텝 / 스크립트 */}
          <Card className="overflow-hidden">
            {isFull && <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-amber-700"><Lock size={13} />스텝 편집 없음 — 이 케이스는 Full-Code(.robot 원문)로 관리됩니다. 되돌리려면 변경 이력에서 복원하세요.</div>}
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
              <span className="text-sm font-semibold text-slate-800">{isFull ? "Full-Code (.robot)" : "실행 스텝"}</span>
              {unresolved > 0 && <Badge kind="warn">미확정 {unresolved}</Badge>}
              {changedN.length > 0 && <Badge kind="warn">절차 변경 {changedN.length}곳 · 확인 필요</Badge>}
              <span className="ml-auto text-xs text-slate-500">앱 실행·계정은 실행 시 <span className="text-slate-700">대상·환경</span>에서 주입</span>
            </div>
            {isFull ? (
              <div className="p-4">
                <textarea value={d.code} onChange={(e) => set({ code: e.target.value })} rows={18} spellCheck={false} className={taCls + " font-mono text-xs leading-relaxed" + (synErr ? " border-red-300" : "")} />
                <div className={"mt-2 rounded-lg px-3 py-2 text-xs " + (synErr ? "bg-red-50 text-red-800" : syn.warns.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>
                  {!synErr && !syn.warns.length && <div className="flex items-center gap-1.5"><CheckCircle2 size={13} />문법 검사 통과 — 구조만 확인합니다. 실제 동작은 디버그 실행으로 확인하세요.</div>}
                  {syn.errors.map((e, i) => <div key={"e" + i} className="flex items-start gap-1.5"><XCircle size={13} className="mt-0.5 shrink-0" />{e.line ? <span className="shrink-0 font-mono">{e.line}행</span> : null}<span>{e.msg}</span></div>)}
                  {syn.warns.map((e, i) => <div key={"w" + i} className="flex items-start gap-1.5 text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span className="shrink-0 font-mono">{e.line}행</span><span>{e.msg}</span></div>)}
                  {synErr > 0 && <div className="mt-1 text-red-700">오류가 있으면 초안으로만 저장되고 디버그 실행 · 승인을 할 수 없습니다.</div>}
                </div>
                <div className="mt-1.5 text-xs text-slate-500">Robot Framework 원문입니다. <span className="font-mono">proba.resource</span>의 앱 실행·계정 변수는 실행 시 자동으로 들어갑니다. <span className="font-mono"># [미확정]</span> 줄이 남아 있으면 검토중으로 저장·실행할 수 없습니다.</div>
              </div>
            ) : (
              <div>
                {d.steps.length === 0 && <div className="px-3 py-10 text-center text-sm text-slate-500">스텝이 없습니다. 아래 <span className="text-sky-600">+ 스텝 추가</span>로 직접 만들거나, 위 <span className="text-sky-600">AI로 스텝 만들기</span>를 쓰세요.</div>}
                {(() => { const renderStep = (s) => { const i = d.steps.indexOf(s);
                  const a = L.ACT[s.act] || {};
                  const st = L.stateOf(s);
                  const canPick = (a.needs || []).includes("loc") || s.act === "화면 확인";
                  return (
                    <div key={s.id} id={"step-" + s.id} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIdx !== null && dragIdx !== i) moveStep(dragIdx, i); setDragIdx(null); }} onMouseEnter={() => setHoverN(s.n)} onMouseLeave={() => setHoverN(null)}
                      className={"border-b border-slate-200 py-2 pr-3 " + (hasProc ? "pl-9 " : "pl-3 ") + (focusStep === s.id ? "bg-red-50 ring-2 ring-inset ring-red-300 " : st === "미확정" ? "bg-amber-50/50" : hoverN === s.n ? "bg-sky-50" : "")}>
                      <div className="flex items-center gap-2">
                        <span draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)} className="cursor-grab" title="드래그로 순서 변경"><GripVertical size={14} className="text-slate-500" /></span>
                        <span className="w-5 shrink-0 text-right font-mono text-xs text-slate-500">{i + 1}</span>
                        <div className="w-28 shrink-0"><Select value={s.act} onChange={(e) => updStep(s.id, { act: e.target.value })}>{L.ACTS.map((x) => <option key={x.id}>{x.id}</option>)}</Select></div>
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          {(a.needs || []).includes("loc") && (raw[s.id] || !s.loc
                            ? <Input value={s.loc || ""} autoFocus={!!raw[s.id]} onChange={(e) => updStep(s.id, { loc: e.target.value, el: "" })} onBlur={() => s.loc && setRaw((r) => ({ ...r, [s.id]: false }))} placeholder="요소 집기로 고르거나 로케이터 입력 (id=…)" className="font-mono text-xs" />
                            : <button onClick={() => setRaw((r) => ({ ...r, [s.id]: true }))} title={s.loc + "\n눌러서 로케이터를 직접 고칩니다"} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-slate-300">
                                <span className="truncate text-sm text-slate-800">{L.elName(s)}</span>
                                <span className={"ml-auto shrink-0 rounded px-1.5 text-xs " + (L.locKind(s.loc) === "위치" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600")}>{L.locKind(s.loc)}</span>
                              </button>)}
                          {s.act === "입력" && <ValInput value={s.val || ""} onChange={(v) => updStep(s.id, { val: v })} vars={variables} />}
                          {s.act === "화면 확인" && <Input value={s.val || ""} onChange={(e) => updStep(s.id, { val: e.target.value })} placeholder="화면에 보여야 하는 문구" />}
                          {s.act === "스와이프" && <div className="w-28"><Select value={s.val || "위로"} onChange={(e) => updStep(s.id, { val: e.target.value })}><option>위로</option><option>아래로</option></Select></div>}
                          {s.act === "대기" && <><div className="w-16"><Input value={s.val || ""} onChange={(e) => updStep(s.id, { val: e.target.value })} placeholder="2" /></div><span className="text-xs text-slate-500">초</span></>}
                          {s.act === "뒤로" && <span className="text-xs text-slate-500">이전 화면으로</span>}
                        </div>
                        <Badge kind={st === "확정" ? "pass" : "warn"}>{st}</Badge>
                        {canPick ? <button onClick={() => openPick(s.id)} title="기기 화면에서 요소 집기" className="shrink-0 text-sky-600 hover:text-sky-800"><MousePointerClick size={15} /></button> : <span className="w-[15px] shrink-0" />}
                        <button onClick={() => delStep(s.id)} className="shrink-0 text-slate-400 hover:text-red-600" title="스텝 삭제"><X size={13} /></button>
                      </div>
                      {st === "미확정" && s.why && <div className="mt-1 pl-14 text-xs text-amber-700">{s.why}</div>}
                    </div>
                  );
                };
                  if (!hasProc) return d.steps.map(renderStep);
                  return <>
                    {d.proc.map((p, k) => { const n = k + 1; const ss = stepsOf(n); if (!String(p.t || "").trim() && !ss.length) return null; const ch = changedN.includes(n); return (
                      <div key={"g" + k}>
                        <div onDragOver={(e) => e.preventDefault()} onDrop={() => dropToGroup(n)} onMouseEnter={() => setHoverN(n)} onMouseLeave={() => setHoverN(null)}
                          className={"flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 " + (ch ? "bg-amber-50" : hoverN === n ? "bg-sky-50" : "bg-slate-50")}>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs text-slate-600">{n}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{p.t || <span className="text-slate-400">(빈 절차)</span>}{p.e && <span className="text-xs text-slate-500"> → {p.e}</span>}</span>
                          {ch && <span className="flex shrink-0 items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} />절차가 바뀌었습니다 — 아래 스텝이 맞는지 확인하세요<button onClick={() => setD((x) => seal(x, n))} className="ml-1 font-medium text-amber-900">확인함</button></span>}
                          {!ss.length && <span className="shrink-0 text-xs text-slate-500">스텝 없음</span>}
                          <button onClick={() => addStepTo(n)} className="shrink-0 text-xs text-sky-600">+ 스텝</button>
                        </div>
                        {ss.map(renderStep)}
                      </div>
                    ); })}
                    {orphan.length > 0 && <div><div className="flex items-center gap-2 border-b border-slate-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"><AlertTriangle size={12} />연결된 절차가 없는 스텝 — 절차 묶음으로 끌어다 놓으세요</div>{orphan.map(renderStep)}</div>}
                  </>;
                })()}
                <div className="flex items-center justify-between px-4 py-2">
                  {hasProc ? <span className="text-xs text-slate-500">스텝은 절차 묶음의 <span className="text-sky-600">+ 스텝</span>으로 추가 · 드래그로 다른 절차로 옮김</span> : <button onClick={() => addStepTo(0)} className="shrink-0 text-xs text-sky-600">+ 스텝 추가</button>}
                  <button onClick={() => setShowRobot((v) => !v)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><FileCode size={12} />.robot 미리보기 <ChevronDown size={12} className={showRobot ? "rotate-180" : ""} /></button>
                </div>
                {showRobot && <pre className="mx-4 mb-3 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">{robotText}</pre>}
              </div>
            )}
          </Card>
        </div>
      </div>

      {qa && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setQa(null)}>
          <div className={"w-full rounded-xl border border-slate-200 bg-white shadow-xl " + (qa === "ver" ? "max-w-3xl" : "max-w-xl")} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{qa === "run" ? "디버그 실행" : "변경 이력"} <span className="font-mono text-xs text-sky-600">{tc.id}</span>{qa === "ver" && <span className="ml-2 text-xs font-normal text-slate-500">현재 rev {curRev}</span>}</h3><button onClick={() => setQa(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 p-5">
              {qa === "run" && runRes && (<>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><Badge kind="info">{dbg ? envText(dbg) : dbgEnv}</Badge><span>{dev ? devLabel(dev) : "—"}</span><span className="text-slate-500">· 집계되지 않음</span></div>
                {!verified && <div className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">기준 앱 v{d.baseBuild} → 실행 앱 v{build} — 버전이 달라 요소를 못 찾을 수 있습니다</div>}
                <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                  {runRes.steps.map((x, i) => (
                    <div key={i} className={"border-b border-slate-200 px-3 py-1.5 text-xs last:border-0 " + (x.st === "fail" ? "bg-red-50" : "")}>
                      <div className="flex items-center gap-2">
                        {x.st === "ok" ? <CheckCircle2 size={13} className="text-emerald-600" /> : x.st === "warn" ? <AlertTriangle size={13} className="text-amber-600" /> : x.st === "fail" ? <XCircle size={13} className="text-red-600" /> : x.st === "skip" ? <span className="h-[13px] w-[13px] rounded-full border border-slate-300" /> : <RefreshCw size={13} className="animate-spin text-slate-400" />}
                        <span className={"shrink-0 " + (x.pre ? "text-slate-500" : x.st === "skip" ? "text-slate-400" : "text-slate-700")}>{x.pre ? "" : (x.i != null ? x.i + 1 + ". " : "")}{x.act}</span>
                        <span className={"flex-1 truncate " + (x.st === "skip" ? "text-slate-400" : "text-slate-600")}>{x.name}{x.act === "화면 확인" ? "\"" + x.val + "\"" : x.val ? " · \"" + x.val + "\"" : ""}</span>
                        {x.st === "skip" && <span className="shrink-0 text-slate-400">실행 안 함</span>}
                      </div>
                      {(x.st === "fail" || x.st === "warn") && x.res.msg && <div className={"mt-0.5 pl-5 " + (x.st === "fail" ? "text-red-700" : "text-amber-700")}>{x.res.msg}</div>}
                    </div>
                  ))}
                </div>
                {runRes.done && !runRes.fail && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 size={14} />통과 · {runRes.at}</div>}
                {runRes.done && runRes.fail && (
                  <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="flex h-24 w-14 shrink-0 flex-col items-center justify-center rounded-md border border-slate-300 bg-white text-slate-400" title="실패한 순간의 화면"><Smartphone size={14} /><span className="mt-1 text-[10px]">실패 화면</span></div>
                    <div className="min-w-0 flex-1 space-y-1 text-xs">
                      <div className="text-sm font-medium text-red-800">{runRes.fail.pre ? "전제조건에서 실패" : "스텝 " + (runRes.fail.i + 1) + " · " + runRes.fail.act + (runRes.fail.name ? " · " + runRes.fail.name : "") + " 에서 실패"}</div>
                      <div className="text-red-700">{runRes.fail.res.msg}</div>
                      {runRes.fail.loc && <div className="truncate font-mono text-slate-500" title={runRes.fail.loc}>{runRes.fail.loc}</div>}
                      <div className="text-slate-500">{runRes.at} · 이후 스텝은 실행하지 않았습니다</div>
                      {!runRes.fail.pre && runRes.fail.id && <div className="flex gap-2 pt-1"><Btn onClick={() => goStep(runRes.fail.id)}>이 스텝으로 이동</Btn><Btn kind="primary" icon={MousePointerClick} onClick={() => { const id = runRes.fail.id; setQa(null); setFocusStep(id); openPick(id); }}>요소 다시 집기</Btn></div>}
                    </div>
                  </div>
                )}
              </>)}
              {qa === "ver" && (versions.length === 0 ? <div className="text-xs text-slate-500">저장 이력이 없습니다 — 저장할 때마다 리비전이 여기에 쌓입니다.</div> : (
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-2 max-h-80 space-y-1 overflow-y-auto">
                    {versions.map((v) => (
                      <button key={v.rev} onClick={() => setVerSel(v.rev)} className={"block w-full rounded-lg border px-3 py-2 text-left text-xs " + (verSel === v.rev ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:bg-slate-50")}>
                        <div className="flex justify-between"><span className="font-mono text-slate-800">rev {v.rev}{v.rev === curRev && <span className="ml-1 text-sky-600">현재</span>}</span><span className="text-slate-500">{v.by}</span></div>
                        <div className="mt-0.5 text-slate-500">{v.at}{v.note ? " · " + v.note : ""}</div>
                      </button>
                    ))}
                  </div>
                  <div className="col-span-3 rounded-lg border border-slate-200 p-3 text-xs">
                    {(() => { const v = versions.find((x) => x.rev === verSel); if (!v) return <div className="py-12 text-center text-slate-500">리비전을 선택하세요.</div>; const x = v.x || {}; return (
                      <div className="space-y-1.5">
                        <div className="flex justify-between"><span className="text-slate-500">이름</span><span className="text-slate-800">{v.name}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">스위트 · 태그</span><span className="text-slate-800">{((mqaSuites.find((x) => x.id === (v.x || {}).suiteId) || {}).name) || v.suite || "—"} · {v.tags || "—"}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">관리</span><span className="text-slate-800">{v.level || "Low-Code"}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">자연어 절차</span><span className="text-slate-800">{(x.proc || []).length}줄</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">실행 스텝</span><span className="text-slate-800">{(v.steps || []).length}개 · 미확정 {L.unresolvedOf(v.steps)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">전제조건</span><span className="text-slate-800">{x.preCase || "없음"}</span></div>
                        {v.rev !== curRev && <Btn className="mt-2 w-full" icon={History} onClick={() => restore(v)}>이 리비전으로 되돌리기</Btn>}
                      </div>
                    ); })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div></Portal>
      )}
      {paste && (
        <Modal title="여러 줄 붙여넣기" onClose={() => setPaste(null)}>
          <div className="space-y-3">
            <textarea value={paste.text} onChange={(e) => setPaste({ text: e.target.value })} rows={9} autoFocus className={taCls} placeholder={"다른 문서의 절차를 그대로 붙여넣으세요.\n한 줄이 절차 하나, → 뒤는 기대 결과입니다.\n\n검색창을 누른다\n\"립밤\"을 입력한다 → 결과 목록이 뜬다"} />
            <div className="flex items-center justify-between text-xs">
              <button onClick={() => setPaste({ text: L.tidyProc(paste.text) })} className="flex items-center gap-1 text-sky-600"><Sparkles size={12} />AI로 양식 정리 <span className="text-slate-500">— 문단처럼 이어 쓴 글을 한 줄 한 절차로</span></button>
              <span className="text-slate-500">{L.procFromText(paste.text).length}개 절차</span>
            </div>
            <div className="flex items-start gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-slate-500" /><span>AI로 양식 정리는 붙여넣은 글을 AI에 보냅니다. 전화번호 · 이메일 · 카드번호 형태는 서버에서 가린 뒤 보내고, 결과에서 원래 값으로 되돌립니다.{L.maskText(paste.text).count > 0 && <b className="ml-1 font-medium text-slate-800">지금 글에서 {L.maskText(paste.text).count}건 가림</b>}</span></div>
            <div className="flex justify-end gap-2"><Btn onClick={() => setPaste(null)}>취소</Btn>{d.proc.some((p) => p.t.trim()) && <Btn onClick={() => applyPaste(true)}>모두 바꾸기</Btn>}<Btn kind="primary" onClick={() => applyPaste(false)}>{d.proc.some((p) => p.t.trim()) ? "뒤에 추가" : "추가"}</Btn></div>
          </div>
        </Modal>
      )}
      {prep && (
        <Modal title="화면 준비" onClose={() => {}}>
          <div className="space-y-2 text-sm">
            <div className="text-slate-700">스텝 {prep.idx + 1}의 요소를 고르려면 그 직전 화면이 필요합니다.</div>
            <div className="flex items-center gap-2 text-xs text-slate-600"><RefreshCw size={13} className="animate-spin text-sky-600" />{prep.launch ? "앱 실행" + (d.preCase ? " · 전제조건 " + d.preCase + " 수행" : "") + (prep.need ? " → " : "") : ""}{prep.need ? "스텝 " + (prep.from + 1) + (prep.need > 1 ? "~" + prep.idx : "") + " 실행 (" + prep.done + "/" + prep.need + ")" : ""}</div>
            <div className="text-xs text-slate-500">{dev ? devLabel(dev) : ""} · 편집 세션 동안 화면을 이어 쓰므로 다음 요소 집기는 더 빠릅니다.</div>
          </div>
        </Modal>
      )}
      {pick && <PickModal step={d.steps.find((s) => s.id === pick)} ctx={pickCtx} build={build} device={dev} onPick={onPick} onClose={() => { setPick(null); setFocusStep(null); }} />}
      {gen && <GenModal tc={tc} d={{ ...d, proc: L.compactProc(d.proc, []).proc }} sys={sys} env={dbg} dev={dev} preOk={preOk} preName={(mqaCases.find((x) => x.id === d.preCase) || {}).name || ""} onApply={applyGen} onClose={() => setGen(false)} />}
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ AI로 스텝 만들기 — 진행 창 ═══════════
   러너가 단말에서 앱을 조작하며 절차 한 줄씩 스텝을 만든다 (Confluence 'AI 활용 저작' 1~12 단계)
   · 시작 전 사전 조건: 절차 · 비운영 환경 · 앱 설치 파일 · 단말(deviceBlock) · 전제조건 승인
   · 단말은 시작할 때 점유하고, 끝나거나 멈추거나 화면을 떠날 때 반납한다 (1단말 1작업)
   · AI가 요소를 특정하지 못한 스텝은 '확인 필요' — 사용자가 후보·화면에서 고르면 이어서 진행
   · 결과는 스텝 표에 '반영' 할 뿐 저장하지 않는다 — 저장·검토·승인은 에디터의 원래 흐름을 탄다
   목업: 판단은 caseLogic.draftSteps 규칙으로 흉내 낸다 */
const GEN_ICON = { "대기": "text-slate-300", "진행": "text-sky-600", "완료": "text-emerald-600", "확인 필요": "text-amber-600", "건너뜀": "text-slate-400", "미확정": "text-amber-700" };
const GEN_K = { "대기": "draft", "진행 중": "active", "완료": "pass", "확인 필요": "warn", "미확정": "warn" };
const AI_SEND = [
  { k: "보냄", c: "text-slate-600", v: "자연어 절차 · 각 시점 화면 구조 (요소 종류 · 글자 · ID)" },
  { k: "가려서 보냄", c: "text-amber-700", v: "화면 글자 중 전화번호 · 이메일 · 카드번호 형태 · 비밀번호 칸 내용" },
  { k: "보내지 않음", c: "text-emerald-700", v: "화면 캡처 이미지 · 계정과 변수의 값 (이름만) · 앱 설치 파일" },
];
const unitText = (u) => u.act + (u.loc ? " · " + u.loc : "") + (u.val ? " · \"" + u.val + "\"" : "");
function GenModal({ tc, d, env, dev, preOk, preName, onApply, onClose }) {
  const { lockMqaDevice, releaseMqaDevice } = useApp();
  const [phase, setPhase] = useState("setup");   // setup | run | done | stopped
  const envName = env ? env.env : "";
  const buildObj = env ? env.buildObj : null;
  const [units, setUnits] = useState([]);
  const [prep, setPrep] = useState([]);
  const [cur, setCur] = useState(-1);
  const [ask, setAsk] = useState(null);
  const [pick, setPick] = useState(false);
  const held = useRef(null); const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const release = () => { if (held.current) { releaseMqaDevice(held.current); held.current = null; } };
  useEffect(() => () => { timers.current.forEach(clearTimeout); if (held.current) releaseMqaDevice(held.current); }, []);

  const devBlock = deviceBlock(dev, buildObj);
  const checks = [
    { label: "자연어 절차 " + d.proc.length + "줄", ok: d.proc.length > 0, fix: "절차를 먼저 쓰세요" },
    { label: "작업 환경 " + (env ? envText(env) : "없음"), ok: !!env && !env.prod && !!buildObj, fix: !env ? "대상·환경에 환경을 등록하세요" : env.prod ? "운영 환경에서는 만들 수 없습니다 — 앱을 실제로 조작해 데이터가 생깁니다. 에디터 상단에서 작업 환경을 바꾸세요" : "대상·환경에서 이 환경의 앱 설치 파일을 올리세요" },
    { label: "작업 단말 " + (dev ? devLabel(dev) : "없음"), ok: !devBlock, fix: devBlock + (dev ? " — 에디터 상단에서 작업 단말을 바꾸세요" : "") },
    ...(d.preCase ? [{ label: "전제조건 " + d.preCase + (preName ? " · " + preName : ""), ok: preOk, fix: "전제조건 케이스가 승인 상태여야 합니다" }] : []),
  ];
  const blocked = checks.find((c) => !c.ok);
  const start = () => {
    if (blocked) return;
    if (d.steps.length && !window.confirm("지금 스텝을 새로 만든 스텝으로 바꿉니다. 계속할까요?")) return;
    lockMqaDevice(dev.id, "AI 생성 " + tc.id); held.current = dev.id;
    setUnits(L.draftSteps(d.proc).map((s) => ({ ...s, gs: "대기" })));
    const pr = [{ label: "앱 v" + buildObj.ver + " 설치 · 데이터 초기화 · 실행", gs: "진행" }, ...(d.preCase ? [{ label: "전제조건 " + d.preCase + " 수행" + (d.acctRole ? " (" + d.acctRole + " 계정)" : ""), gs: "대기" }] : [])];
    setPrep(pr); setPhase("run");
    let t = 700;
    pr.forEach((_, i) => { later(() => setPrep((x) => x.map((p, j) => (j === i ? { ...p, gs: "완료" } : j === i + 1 ? { ...p, gs: "진행" } : p))), t); t += 700; });
    later(() => setCur(0), t);
  };
  /* 한 스텝씩 — 화면 캡처 → 판단 → 실행 (목업: 규칙으로 판단) */
  useEffect(() => {
    if (phase !== "run" || cur < 0) return;
    if (cur >= units.length) { setPhase("done"); release(); return; }
    setUnits((x) => x.map((u, i) => (i === cur ? { ...u, gs: "진행" } : u)));
    const u = units[cur];
    later(() => {
      if (d.preCase && /로그인 절차/.test(u.why || "")) { setUnits((x) => x.map((v, i) => (i === cur ? { ...v, gs: "건너뜀", why: "전제조건에서 이미 로그인 — 스텝을 만들지 않음" } : v))); setCur(cur + 1); return; }
      if (L.stateOf(u) === "확정") { setUnits((x) => x.map((v, i) => (i === cur ? { ...v, gs: "완료", why: "" } : v))); setCur(cur + 1); return; }
      setUnits((x) => x.map((v, i) => (i === cur ? { ...v, gs: "확인 필요" } : v))); setAsk(cur);
    }, 650);
  }, [cur, phase]);
  const answer = (el) => {
    const u = units[ask];
    if (u.act === "화면 확인" && !el.text) return;
    const patch = u.act === "화면 확인" ? { val: el.text } : { loc: L.recommendLoc(el).loc };
    setUnits((x) => x.map((v, i) => (i === ask ? { ...v, ...patch, gs: "완료", why: "", by: "사용자 선택" } : v)));
    const next = ask + 1; setAsk(null); setPick(false); setCur(next);
  };
  const skip = () => { const next = ask + 1; setUnits((x) => x.map((v, i) => (i === ask ? { ...v, gs: "미확정" } : v))); setAsk(null); setCur(next); };
  const halt = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setUnits((x) => x.map((v) => (["대기", "진행", "확인 필요"].includes(v.gs) ? { ...v, gs: "미확정", loc: (L.ACT[v.act] || { needs: [] }).needs.includes("loc") ? "" : v.loc, val: v.act === "화면 확인" ? "" : v.val, why: "생성을 멈춰 실행으로 확인되지 않음" } : v)));
    setAsk(null); setPhase("stopped"); release();
  };
  const stop = () => { if (window.confirm("생성을 멈출까요? 지금까지 만든 스텝은 반영할 수 있고, 나머지는 미확정으로 남습니다.")) halt(); };
  const close = () => { if (phase === "run") { if (!window.confirm("진행 중인 생성을 멈추고 닫을까요?")) return; halt(); } onClose(); };
  const apply = () => onApply(units.filter((u) => u.gs !== "건너뜀").map(({ gs, by, ...s }) => s), buildObj ? buildObj.ver : "");

  const lineState = (n) => {
    const us = units.filter((u) => u.n === n); const gs = us.map((u) => u.gs);
    if (gs.includes("확인 필요")) return "확인 필요";
    if (gs.includes("진행")) return "진행 중";
    if (gs.length && gs.every((g) => g === "완료" || g === "건너뜀")) return "완료";
    if (gs.includes("미확정")) return "미확정";
    return "대기";
  };
  const done = units.filter((u) => u.gs === "완료").length;
  const left = units.filter((u) => u.gs === "미확정").length;
  const askU = ask !== null ? units[ask] : null;
  const forText = askU && askU.act === "화면 확인";
  const cands = askU ? L.candidatesFor(askU.src, forText) : [];

  return (
    <Modal title={"AI로 스텝 만들기 · " + tc.id} onClose={close} wide>
      {phase === "setup" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="space-y-1.5 rounded-lg border border-slate-200 p-3 text-sm">
                <FieldRow label="작업 환경"><span className="text-slate-800">{env ? envText(env) : "—"}</span></FieldRow>
                <FieldRow label="작업 단말"><span className="text-slate-800">{dev ? devLabel(dev) : "—"}</span></FieldRow>
                <div className="pt-1 text-xs text-slate-500">에디터 상단에서 고른 작업 조건을 그대로 씁니다.</div>
              </div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">단말에서 앱을 <b className="font-medium">실제로 조작</b>하며 절차 한 줄씩 스텝을 만듭니다. 장바구니 같은 스테이징 데이터가 생길 수 있습니다.</div>
              <div className="rounded-lg border border-slate-200 p-3 text-xs">
                <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-600"><ShieldCheck size={13} />AI에 보내는 정보</div>
                <div className="space-y-1.5">
                  {AI_SEND.map((r) => <div key={r.k} className="flex gap-2"><span className={"w-20 shrink-0 " + r.c}>{r.k}</span><span className="text-slate-700">{r.v}</span></div>)}
                </div>
                <div className="mt-2 border-t border-slate-100 pt-2 text-slate-500">단말 → 러너 → PROBA 서버에서 가린 뒤 AI를 호출합니다. AI 키는 서버에만 있고, 러너 · 단말은 AI에 직접 연결하지 않습니다.</div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-600">사전 조건</div>
              <div className="space-y-1.5">{checks.map((c) => (
                <div key={c.label} className="flex items-start gap-2 text-xs">{c.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />}<span><span className="text-slate-700">{c.label}</span>{!c.ok && <span className="block text-amber-700">{c.fix}</span>}</span></div>
              ))}</div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="text-xs text-slate-500">결과는 스텝 표에 반영만 하고 저장하지 않습니다.</span><div className="flex gap-2"><Btn onClick={onClose}>취소</Btn><Btn kind="primary" icon={Sparkles} disabled={!!blocked} title={blocked ? blocked.fix : ""} onClick={start}>시작</Btn></div></div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge kind={phase === "run" ? "active" : phase === "done" ? "pass" : "warn"}>{phase === "run" ? (ask !== null ? "확인 대기" : "진행 중") : phase === "done" ? "완료" : "멈춤"}</Badge>
            <span>{dev ? devLabel(dev) : ""}</span><span>· {env ? envText(env) : ""}</span>
            <span className="ml-auto flex items-center gap-1"><ShieldCheck size={12} className="text-slate-400" />AI 요청 {units.filter((u) => !["대기", "건너뜀"].includes(u.gs)).length}회 · 화면 구조만 전송 <span className="mx-1 text-slate-300">|</span> 스텝 {done}/{units.length}{left ? " · 미확정 " + left : ""}</span>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            {prep.map((p, i) => <div key={"p" + i} className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500">{p.gs === "완료" ? <CheckCircle2 size={13} className="text-emerald-600" /> : p.gs === "진행" ? <RefreshCw size={13} className="animate-spin text-sky-600" /> : <span className="w-[13px]" />}{p.label}</div>)}
            {d.proc.map((p, i) => { const ls = lineState(i + 1); return (
              <div key={i} className={"border-b border-slate-200 px-3 py-2 last:border-0 " + (ls === "확인 필요" ? "bg-amber-50" : "")}>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">{i + 1}</span>
                  <span className="flex-1 text-sm text-slate-800">{p.t}{p.e && <span className="text-xs text-slate-500"> → {p.e}</span>}</span>
                  {ls !== "대기" && <span className="flex h-7 w-5 items-center justify-center rounded border border-slate-300 bg-slate-50" title="그 시점 화면"><Smartphone size={10} className="text-slate-400" /></span>}
                  <Badge kind={GEN_K[ls]}>{ls}</Badge>
                </div>
                {units.filter((u) => u.n === i + 1 && u.gs !== "대기").map((u) => (
                  <div key={u.id} className="mt-1 flex items-center gap-1.5 pl-7 text-xs">
                    {u.gs === "진행" ? <RefreshCw size={12} className="animate-spin text-sky-600" /> : <span className={GEN_ICON[u.gs]}>●</span>}
                    <span className={"truncate font-mono " + (u.gs === "건너뜀" ? "text-slate-400 line-through" : "text-slate-600")}>{unitText(u)}</span>
                    {u.by && <span className="shrink-0 rounded bg-sky-50 px-1.5 text-sky-700">사용자 선택</span>}
                    {(u.gs === "건너뜀" || u.gs === "미확정") && u.why && <span className="shrink-0 text-slate-500">— {u.why}</span>}
                  </div>
                ))}
              </div>
            ); })}
          </div>

          {askU && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="text-sm text-amber-900"><b className="font-medium">절차 {askU.n}</b> · {askU.src || askU.act} — {forText ? "화면에서 확인할 문구를 골라 주세요" : "이 화면에서 어느 요소인지 확인해 주세요"}</div>
              {askU.why && <div className="text-xs text-amber-800">{askU.why}</div>}
              <div className="flex flex-wrap gap-2">
                {cands.map((el) => { const r = L.recommendLoc(el); return (
                  <button key={el.key} onClick={() => answer(el)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-left text-xs hover:border-sky-500">
                    <span className="block text-slate-800">{el.text || el.label}</span>
                    <span className="block text-slate-500">{forText ? "문구" : r.kind + (r.stable ? "" : " · 깨지기 쉬움")}</span>
                  </button>
                ); })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-800">응답이 없으면 10분 뒤 여기까지 저장하고 종료합니다.</span>
                <div className="flex gap-2"><Btn icon={MousePointerClick} onClick={() => setPick(true)}>화면에서 직접 고르기</Btn><Btn onClick={skip}>건너뛰기 (미확정으로 남김)</Btn></div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-xs text-slate-500">{phase === "run" ? "단말 사용 중 — 끝나거나 멈추면 반납합니다" : "반영하면 스텝 표가 바뀝니다. 저장은 에디터에서 합니다."}</span>
            <div className="flex gap-2">
              {phase === "run" ? <Btn onClick={stop}>멈추기</Btn> : <><Btn onClick={onClose}>닫기</Btn><Btn kind="primary" icon={CheckCircle2} disabled={!units.length} onClick={apply}>스텝 표에 반영 ({units.filter((u) => u.gs !== "건너뜀").length}개)</Btn></>}
            </div>
          </div>
        </div>
      )}
      {pick && askU && <PickModal title="화면에서 직접 고르기" step={askU} build={buildObj ? buildObj.ver : ""} device={dev} onPick={answer} onClose={() => setPick(false)} />}
    </Modal>
  );
}

/* ═══════════ 요소 집기 — 기기 화면 한 장 + 화면 구조에서 요소 선택 ═══════════
   목업: 샘플 화면. 실 구현: 실행 PC 기기에서 현재 화면 캡처 + 화면 구조(XML) 수신 */
export function PickModal({ step, build, device, onPick, onClose, title, ctx }) {
  const forText = step && step.act === "화면 확인";
  /* AI 추천 — 스텝 원문과 가장 가까운 요소를 먼저 골라 둔다 (목업: 단어 일치. 실 구현: 판단 요청의 후보) */
  const rec0 = step ? (L.candidatesFor(step.src || step.el || "", forText)[0] || null) : null;
  const [sel, setSel] = useState(rec0 && (step.src || step.el) ? rec0.key : null);
  const screen = L.elementsFor(build);
  const el = screen.find((e) => e.key === sel);
  const rec = el ? L.recommendLoc(el) : null;
  return (
    <Modal title={title || "요소 집기"} onClose={onClose} wide>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>{ctx ? "스텝 " + (ctx.idx + 1) + " 직전 화면 · " : ""}{device ? devLabel(device) : "단말"} · v{build}</span><button className="flex items-center gap-1 text-sky-600"><RefreshCw size={12} />다시 캡처</button></div>
          <div className="mx-auto w-60 rounded-3xl border-4 border-slate-800 bg-white p-2">
            <div className="space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2.5" style={{ maxHeight: 420 }}>
              {screen.map((e) => (
                <button key={e.key} onClick={() => setSel(e.key)} className={"block w-full rounded-md border px-2 py-1.5 text-left text-xs " + (sel === e.key ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200" : "border-slate-200 bg-white hover:border-sky-300")}><span className="text-slate-800">{e.text || e.label}</span><span className="ml-1 text-slate-400">{e.cls}</span>{rec0 && rec0.key === e.key && (step.src || step.el) && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-700">AI 추천</span>}</button>
              ))}
            </div>
          </div>
          <div className="mt-2 text-center text-xs text-slate-400">목업 화면 — 실제로는 기기의 현재 화면이 캡처됩니다</div>
        </div>
        <div className="col-span-7 space-y-3">
          <div className="text-sm text-slate-700">{forText ? "확인할 문구가 있는 요소를 고르세요. 그 글자가 화면 확인 값이 됩니다." : "누르거나 입력할 요소를 고르세요. 가장 안정적인 로케이터를 자동으로 고릅니다."}</div>
          {el ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">요소</span><span className="text-slate-800">{el.label} · {el.cls}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">글자</span><span className="text-slate-800">{el.text || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">고유 ID</span><span className="font-mono text-slate-800">{el.id || "없음"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">접근성 ID</span><span className="font-mono text-slate-800">{el.acc || "없음"}</span></div>
              <div className="border-t border-slate-200 pt-2">
                <div className="mb-1 flex items-center gap-1.5 text-slate-500">{forText ? "넣을 값" : "추천 로케이터"}{!forText && <Badge kind={rec.stable ? "pass" : "warn"}>{rec.kind} · {rec.stable ? "안정" : "깨지기 쉬움"}</Badge>}</div>
                <div className="break-all rounded bg-slate-100 px-2 py-1.5 font-mono text-slate-800">{forText ? (el.text || "(글자 없음)") : rec.loc}</div>
                {!forText && !rec.stable && <div className="mt-1 text-amber-700">이 요소에는 고유 ID가 없어 화면 위치로 찾습니다. 화면이 바뀌면 깨질 수 있어, 앱 개발 측에 ID 추가를 요청하는 것이 좋습니다.</div>}
              </div>
            </div>
          ) : <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-xs text-slate-500">왼쪽 화면에서 요소를 누르세요</div>}
          <div className="flex justify-end gap-2"><Btn onClick={onClose}>취소</Btn><Btn kind="primary" icon={MousePointerClick} disabled={!el} onClick={() => onPick(el)}>이 요소 사용</Btn></div>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════ 가져오기 공통 조각 (전체 화면 — FQA 레코딩·API 임포트와 같은 자리) ═══════════ */
function ImportTarget({ opt, setOpt }) {
  const { mqaSystems = [], mqaSuites = [] } = useApp();
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
      <div className="w-44"><Field label="대상 (앱)"><Select value={opt.systemId} onChange={(e) => setOpt({ ...opt, systemId: e.target.value })}>{mqaSystems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field></div>
      <div className="w-44"><Field label="스위트 (파일에 없을 때)"><Select value={opt.suiteId ? String(opt.suiteId) : ""} onChange={(e) => setOpt({ ...opt, suiteId: e.target.value ? +e.target.value : null })}><option value="">미지정</option>{mqaSuites.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</Select></Field></div>
      <div className="mb-2 text-xs text-slate-500">스텝은 가져온 뒤 각 케이스에서 <span className="text-slate-700">AI로 스텝 만들기</span>로 만듭니다 (단말 필요)</div>
    </div>
  );
}
const useImportOpt = (ai) => { const { mqaSystems = [] } = useApp(); return useState({ systemId: (mqaSystems[0] || {}).id || "", suiteId: null, aiAfter: ai }); };
function FilePick({ accept, multiple, onFiles, onSample, hint }) {
  const ref = useRef(null);
  return (
    <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) onFiles(fs); }} />
      <Upload size={22} className="mx-auto text-slate-400" />
      <div className="mt-2 text-sm text-slate-700">{hint}</div>
      <div className="mt-3 flex justify-center gap-2"><Btn kind="primary" icon={Upload} onClick={() => ref.current && ref.current.click()}>파일 고르기</Btn><Btn onClick={onSample}>샘플 파일로 해보기</Btn></div>
    </div>
  );
}

/* ═══════════ 엑셀 가져오기 ═══════════
   양식을 강제하지 않는다 — 올린 뒤 어느 열이 제목·절차·기대 결과인지 고르기만 한다.
   목업: .csv 는 실제로 읽고, .xlsx 는 샘플 행을 보여준다 (실 구현은 서버에서 엑셀을 읽는다) */
const COL_KEYS = [["name", "제목", true], ["pre", "사전조건", false], ["proc", "절차", true], ["exp", "기대 결과", false], ["suite", "스위트", false]];
const COL_GUESS = { name: /시나리오|제목|케이스명|테스트명|이름|항목/, pre: /사전|전제/, proc: /절차|스텝|단계|수행/, exp: /기대|예상/, suite: /분류|스위트|모듈|카테고리|구분/ };
export function ExcelImport({ onImport, onCancel }) {
  const [msg, flash] = useToast();
  const [rows, setRows] = useState(null);
  const [file, setFile] = useState("");
  const [note, setNote] = useState("");
  const [map, setMap] = useState({});
  const [off, setOff] = useState({});
  const [opt, setOpt] = useImportOpt(false);
  const load = (r, name, n) => {
    const hdr = r[0] || [];
    const m = {}; COL_KEYS.forEach(([k]) => { const i = hdr.findIndex((h) => COL_GUESS[k].test(String(h))); m[k] = i >= 0 ? String(i) : ""; });
    setRows(r); setFile(name); setNote(n || ""); setMap(m); setOff({});
  };
  const onFiles = async ([f]) => {
    const low = f.name.toLowerCase();
    if (low.endsWith(".csv")) { const r = L.parseCsv(await readText(f)); if (r.length < 2) { flash("읽을 행이 없습니다"); return; } load(r, f.name); }
    else if (/\.xlsx?$/.test(low)) load(L.SAMPLE_EXCEL, f.name, "목업: 엑셀 파일 내용 대신 샘플 행을 보여줍니다 (실 구현은 서버에서 읽습니다)");
    else flash("엑셀(.xlsx) 또는 CSV 파일을 올려 주세요");
  };
  const body = rows ? rows.slice(1) : [];
  const items = body.map((r, i) => ({ i, ...L.rowToCase(r, map) })).filter((x) => x.name || x.proc.length);
  const chosen = items.filter((x) => !off[x.i]);
  const missing = COL_KEYS.filter(([k, , req]) => req && map[k] === "").map(([, t]) => t);
  const go = () => {
    if (missing.length) { flash(missing.join("·") + " 열을 골라 주세요"); return; }
    if (!chosen.length) { flash("가져올 행을 골라 주세요"); return; }
    onImport(chosen.map((x) => ({ name: x.name || "이름 없음", pre: x.pre, suite: x.suite, proc: x.proc, origin: "TC 임포트" })), opt);
  };
  return (
    <div className="space-y-3">
      <Hdr icon={FileText} title="TC 임포트" desc="Excel · CSV → 자연어 절차 · 양식은 자유, 열만 고르면 됩니다" />
      <Card className="space-y-3 p-4">
        {!rows ? <FilePick accept=".xlsx,.xls,.csv" onFiles={onFiles} onSample={() => load(L.SAMPLE_EXCEL, "sample_tc.xlsx")} hint="수동 TC 엑셀(.xlsx) 또는 CSV — 테스트 관리 도구(Jira Xray · Zephyr, TestRail 등)에서 내보낸 CSV도 됩니다" /> : (<>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-600"><FileText size={13} className="mr-1 inline" />{file} · {body.length}행</span><button onClick={() => setRows(null)} className="text-sky-600">다른 파일</button></div>
          {note && <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">{note}</div>}
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-700">열 고르기 <span className="font-normal text-slate-500">· 이름이 비슷한 열은 자동으로 골랐습니다</span></div>
            <div className="grid grid-cols-5 gap-2">{COL_KEYS.map(([k, t, req]) => <Field key={k} label={t + (req ? " *" : "")}><Select value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })}><option value="">{req ? "선택" : "없음"}</option>{(rows[0] || []).map((h, i) => <option key={i} value={String(i)}>{h || "열 " + (i + 1)}</option>)}</Select></Field>)}</div>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="sticky top-0 bg-slate-50 text-left text-slate-500"><th className="w-8 px-2 py-2"></th><th className="font-medium">제목</th><th className="font-medium">절차</th><th className="font-medium">기대 결과</th><th className="font-medium">스위트</th></tr></thead>
              <tbody>{items.map((x) => (
                <tr key={x.i} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2"><input type="checkbox" checked={!off[x.i]} onChange={(e) => setOff({ ...off, [x.i]: !e.target.checked })} className="accent-sky-600" /></td>
                  <td className="py-2 text-slate-800">{x.name || <span className="text-red-600">제목 없음</span>}</td>
                  <td className="py-2 text-slate-600">{x.proc.length}단계 <span className="text-slate-400">{x.proc[0] ? "· " + x.proc[0].t : ""}</span></td>
                  <td className="py-2 text-slate-600">{x.proc.some((p) => p.e) ? "있음" : "—"}</td>
                  <td className="py-2 text-slate-600">{x.suite || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ImportTarget opt={opt} setOpt={setOpt} />
          <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="text-xs text-slate-500">가져온 케이스는 모두 <span className="text-slate-700">초안</span>으로 들어옵니다.</span><div className="flex gap-2"><Btn onClick={onCancel}>취소</Btn><Btn kind="primary" icon={Upload} onClick={go}>{chosen.length}건 가져오기</Btn></div></div>
        </>)}
      </Card>
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ .robot 가져오기 ═══════════
   아는 키워드(AppiumLibrary)만 있으면 Low-Code(스텝)로, 반복·조건·모르는 키워드가 있으면 Full-Code로.
   사용자 키워드(*** Keywords ***)는 따로 등록하지 않고 호출 자리에 펼쳐 넣는다 */
export function RobotImport({ onImport, onCancel }) {
  const [msg, flash] = useToast();
  const [parsed, setParsed] = useState(null);
  const [off, setOff] = useState({});
  const [opt, setOpt] = useImportOpt(false);
  const load = (list) => {
    const acc = { files: list.map((x) => x.name), tests: [], keywords: [], notes: [] };
    list.forEach(({ name, text }) => { const r = L.parseRobot(text, name); acc.tests.push(...r.tests); acc.keywords.push(...r.keywords); acc.notes.push(...r.notes); });
    acc.notes = [...new Set(acc.notes)];
    if (!acc.tests.length) { flash("테스트를 찾지 못했습니다 — Robot Framework 테스트 파일인지 확인하세요"); return; }
    setParsed(acc); setOff({});
  };
  const onFiles = async (fs) => {
    const ok = fs.filter((f) => /\.(robot|resource|txt)$/i.test(f.name));
    if (!ok.length) { flash(".robot 또는 .resource 파일을 올려 주세요"); return; }
    load(await Promise.all(ok.map(async (f) => ({ name: f.name, text: await readText(f) }))));
  };
  const kwMap = parsed ? Object.fromEntries(parsed.keywords.map((k) => [k.name, k])) : {};
  const judged = parsed ? parsed.tests.map((t, i) => ({ i, t, ...L.robotTestToSteps(t, kwMap) })) : [];
  const go = () => {
    const chosen = judged.filter((x) => !off[x.i]);
    if (!chosen.length) { flash("가져올 테스트를 골라 주세요"); return; }
    const items = chosen.map(({ t, steps, reasons, expanded }) => {
      const base = { name: t.name, tags: t.tags.join(","), origin: "스크립트 임포트", proc: [], note: expanded.length ? "키워드 " + expanded.join(", ") + " 의 내용을 펼쳐 넣었습니다" : "" };
      if (!reasons.length) return { ...base, steps, level: "Low-Code" };
      const used = parsed.keywords.filter((k) => t.lines.some((tk) => tk[0] === k.name));
      const script = ["*** Settings ***", "Library    AppiumLibrary", "Resource    proba.resource    # 앱 실행 · 계정 변수 (실행 시 자동 주입)", "Test Setup    앱 실행", "Test Teardown    Close Application", "", "*** Test Cases ***", ...t.raw, ...(used.length ? ["", "*** Keywords ***", ...used.flatMap((k) => k.raw)] : [])].join("\n");
      return { ...base, steps: [], level: "Full-Code", code: script, note: "Full-Code로 가져옴 — " + reasons.join(" · ") };
    });
    onImport(items, opt);
  };
  return (
    <div className="space-y-3">
      <Hdr icon={FileCode} title="스크립트 임포트" desc="Robot Framework (.robot · .resource) → Low-Code(스텝) 또는 Full-Code" />
      <Card className="space-y-3 p-4">
        {!parsed ? <FilePick accept=".robot,.resource,.txt" multiple onFiles={onFiles} onSample={() => load([L.SAMPLE_ROBOT])} hint="테스트 파일(.robot)과 키워드 파일(.resource)을 함께 올리세요" /> : (<>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-600"><FileCode size={13} className="mr-1 inline" />{parsed.files.join(", ")}</span><button onClick={() => setParsed(null)} className="text-sky-600">다른 파일</button></div>
          {parsed.notes.map((n) => <div key={n} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{n}</div>)}
          {parsed.keywords.length > 0 && <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">키워드 {parsed.keywords.map((k) => k.name).join(", ")} — 따로 등록하지 않고 호출한 자리에 내용을 펼쳐 넣습니다. 로그인처럼 여러 케이스가 쓰는 절차는 가져온 뒤 <span className="text-slate-800">전제조건 케이스</span>로 정리하세요.</div>}
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="sticky top-0 bg-slate-50 text-left text-slate-500"><th className="w-8 px-2 py-2"></th><th className="font-medium">테스트</th><th className="font-medium">가져오는 방식</th><th className="font-medium">태그</th></tr></thead>
              <tbody>{judged.map((x) => (
                <tr key={x.i} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2"><input type="checkbox" checked={!off[x.i]} onChange={(e) => setOff({ ...off, [x.i]: !e.target.checked })} className="accent-sky-600" /></td>
                  <td className="py-2 text-slate-800">{x.t.name}</td>
                  <td className="py-2">{x.reasons.length ? <><Badge kind="warn">Full-Code로</Badge><span className="ml-1.5 text-slate-500">{x.reasons.join(" · ")}</span></> : <><Badge kind="pass">Low-Code로</Badge><span className="ml-1.5 text-slate-500">{x.steps.length}개{x.expanded.length ? " · 키워드 펼침: " + x.expanded.join(", ") : ""}</span></>}</td>
                  <td className="py-2 text-slate-500">{x.t.tags.join(", ") || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <ImportTarget opt={opt} setOpt={setOpt} />
          <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="text-xs text-slate-500">가져온 케이스는 모두 <span className="text-slate-700">초안</span>이고, 자연어 절차는 비어 있습니다.</span><div className="flex gap-2"><Btn onClick={onCancel}>취소</Btn><Btn kind="primary" icon={Upload} onClick={go}>가져오기</Btn></div></div>
        </>)}
      </Card>
      <Toast msg={msg} />
    </div>
  );
}
