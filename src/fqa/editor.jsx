// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Code2, Copy, GripVertical, History, Lock, Play, RefreshCw, Save, Send, X, XCircle } from "lucide-react";
import { Badge, Btn, Card, Portal, SEL_CARD, Select, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { DatasetPicker } from "../common/DatasetPicker.jsx";
import { STEP_ACTS } from "./data.js";
import { SURF_K, envCovers, envOpts, lastOf, nextTcId, refKey, surfacesOf } from "./logic.js";
import { Hdr, TagPicker, taCls } from "./parts.jsx";
import { ASSERTS, DIFF_CLS, DIFF_MARK, DS_MAX_ROWS, LOC_HINT, LOC_PH, LV, REQ_METHODS, VAL_PH, assertDef, fieldDiff, hasBody, isStatusTarget, lcsDiff, parseAssert, reqJoin, reqParts, respCond, simCode, simRun, stepErrors, stepKey, stepText, stepsToCode } from "./stepLogic.js";
export function FqaEditorScreen({ entry = "Low-Code", tc, onDirty, onOpen }) {
  const { commitFqaCase, addFqaCase, fqaSuites, fqaCases, fqaRuns, fqaSystems, datasets, debugEnv, setDebugEnv, setNavGuard } = useApp();
  const [msg, flash] = useToast();
  const [status, setStatus] = useState(tc && tc.status ? tc.status : "검토중");
  const stEK = { "승인": "pass", "검토중": "warn", "초안": "draft" };
  const [qa, setQa] = useState(null);
  const [runRes, setRunRes] = useState(null);
  const ei = Math.max(0, LV.indexOf(entry));
  const [committed, setCommitted] = useState(ei);
  const [view, setView] = useState(entry);
  // 에디터는 언제나 케이스와 함께 열린다 — 스텝이 비어 있으면 비어 있는 채로(직접 작성)
  const initSteps = (tc && tc.steps) || [];
  const [steps, setSteps] = useState(initSteps);
  // Full-Code 코드는 케이스에 저장된다. 없으면 스텝에서 생성한 것을 초기값으로.
  const initCode = (tc && tc.code) || stepsToCode(initSteps, tc || {});
  const [code, setCode] = useState(initCode);
  const [suite, setSuite] = useState(tc ? tc.suiteId : ((fqaSuites[0] || {}).id || 0));
  const [name, setName] = useState((tc && tc.name) || "");
  const [tags, setTags] = useState((tc && tc.tags) || "");
  const [dataset, setDataset] = useState(tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "");
  const [acctRole, setAcctRole] = useState((tc && tc.acctRole) || "");
  const [preCase, setPreCase] = useState((tc && tc.preCase) || "");
  // 운영주의 — 운영 환경에서 실데이터를 변경/삭제하는 케이스. 태그와 별개 플래그.
  const [prodCaution, setProdCaution] = useState(!!(tc && tc.prodCaution));
  // 등록된 모든 환경의 계정 역할 (케이스는 역할만 고르고, 실제 계정은 실행 계획의 환경이 주입)
  const roleOpts = [...new Set((fqaSystems || []).flatMap((sy) => (sy.envs || []).flatMap((e) => (e.accts || []).map((a) => a.role))).filter(Boolean))];
  // 계정 변수 사용 여부 — Full-Code는 V['계정 ID'] 형태로 나타난다
  /* 스텝이 계정 변수를 직접 쓰는가 — 로그인 자체를 검증하는 케이스가 여기 해당한다.
     🔴 문자열 검사라 변수 이름 규칙에 기능이 매달려 있다. 전제조건 로그인을 쓰는 케이스는 이 검사에 안 걸리므로
     실 구현에서는 값을 구조({ref:"acct"})로 저장해 이름과 무관하게 판별해야 한다. */
  const usesAcct = steps.some((s) => /\$\{계정/.test((s.val || "") + (s.loc || "") + (s.code || ""))) || /계정 (ID|비밀번호)/.test(code || "");
  /* 전제조건 후보 = 승인된 다른 케이스. 별도 '로그인 프로필' 엔티티를 두지 않는다 —
     로그인도 케이스이므로 레코딩·리비전·디버그 실행·승인 워크플로가 그대로 따라온다.
     🔑 전제조건을 가진 케이스는 후보에서 뺀다 — 중첩을 허용하면 순환이 생긴다(1단계만). */
  const preOpts = (fqaCases || []).filter((c) => c.id !== (tc && tc.id) && c.status === "승인" && !c.preCase
    // Full-Code 제외 — 전제조건은 globalSetup에서 도는 함수여야 하는데 사용자 코드는 test()로 감싸여 있어 벗길 수 없다
    && c.level !== "Full-Code"
    // 데이터셋 제외 — 행마다 로그인한다는 뜻이 되어 성립하지 않는다
    && (!c.dataset || c.dataset === "-"));
  const [dragIdx, setDragIdx] = useState(null);
  const [codeOpen, setCodeOpen] = useState({});
  const toggleCode = (i) => setCodeOpen((m) => ({ ...m, [i]: !m[i] }));
  const reorder = (from, to) => { setSteps((prev) => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m); return arr; }); setCodeOpen({}); };
  const vi = LV.indexOf(view);
  const [snap, setSnap] = useState(() => JSON.stringify({ steps: initSteps, code: initCode, committed: ei, suite: tc ? tc.suiteId : ((fqaSuites[0] || {}).id || 0), name: (tc && tc.name) || "", tags: (tc && tc.tags) || "", dataset: tc ? (tc.dataset && tc.dataset !== "-" ? tc.dataset : "") : "", acctRole: (tc && tc.acctRole) || "", preCase: (tc && tc.preCase) || "", prodCaution: !!(tc && tc.prodCaution) }));
  const dirty = snap !== JSON.stringify({ steps, code, committed, suite, name, tags, dataset, acctRole, preCase, prodCaution });
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const versions = (tc && tc.versions) || [];
  const curRev = (tc && tc.rev) || 1;
  /* 내가 편집을 시작한 리비전 — 저장 시 낙관적 잠금의 기준.
     그 사이 다른 사람이 저장했으면 rev가 어긋나므로 덮어쓰기를 막는다. 저장에 성공하면 갱신된다. */
  const baseRev = useRef(curRev);
  const [verSel, setVerSel] = useState(versions[1] ? versions[1].rev : (versions[0] ? versions[0].rev : null));
  const verObj = versions.find((v) => v.rev === verSel) || null;
  // 비교 대상 = 저장된 현재 리비전 (편집 중 내용이 아니라 커밋된 것끼리 비교한다)
  const headObj = versions.find((v) => v.rev === curRev) || null;
  const selDs = (datasets || []).find((d) => d.name === dataset);
  const dsCols = selDs ? selDs.columns : [];
  /* row 변수 참조 — Low-Code는 스텝에서, Full-Code는 코드에서 찾는다.
     코드가 rows를 도는데 데이터셋이 없으면 rows=[] → 테스트가 0개 생성된다(실패도 통과도 아닌 무동작). */
  const rowSrc = committed === 1 ? (code || "") : steps.map((s) => (s.val || "") + " " + (s.loc || "") + " " + (s.code || "")).join(" ");
  const usedRowVars = [...new Set((rowSrc.match(/\$\{row\.([a-zA-Z0-9_]+)\}|\brow\.([a-zA-Z0-9_]+)/g) || []).map((x) => x.replace(/^\$\{row\.|\}$|^row\./g, "")))];
  const usesRows = usedRowVars.length > 0 || /\bof\s+rows\b/.test(rowSrc);
  const missingDsCols = dataset ? usedRowVars.filter((v) => !dsCols.includes(v)) : [];
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty]);
  const editable = vi === committed;
  const readonly = vi < committed;
  /* 코드 생성의 입력은 '편집 중인 케이스'다 — 저장된 tc를 쓰면 미저장 이름·데이터셋이 코드에서 빠진다.
     ※ 실 구현에서는 생성기를 서버가 소유한다(프론트·서버 이중 구현은 반드시 어긋난다). */
  const asCase = () => ({ ...(tc || {}), name: name.trim() || (tc && tc.name) || "", dataset: dataset || "-" });
  const preview = () => stepsToCode(steps, asCase());
  /* 🔑 이 케이스를 전제조건으로 쓰는 케이스들 — 그러면 생성기가 두 형태를 내야 한다.
     케이스로 실행: test(...)  /  전제조건으로 실행: globalSetup에서 도는 async 함수.
     스텝 본문은 같고 껍데기만 다르다. 통으로 test()를 만들면 전제조건으로 못 쓴다(F1). */
  const usedAsPre = (fqaCases || []).filter((c) => c.preCase === (tc && tc.id));
  const preForm = () => {
    const body = stepsToCode(steps, asCase()).split("\n").filter((l) => /^\s{2}/.test(l)).map((l) => l.slice(2)).join("\n");
    return "// globalSetup — 역할·슬롯 조합마다 1회\nexport async function setup(page, V) {\n" + body + "\n}";
  };
  const descend = () => {
    if (!window.confirm("Full-Code로 변환하면 스텝 편집은 읽기 전용이 되고, 되돌릴 수 없습니다.\n(변경 이력에서 이전 리비전으로 복원하는 방법만 남습니다)\n\n변환할까요?")) return;
    setCode(preview()); setCommitted(1); setView("Full-Code");
    flash("Full-Code로 변환됨 — 이제 코드가 관리 기준입니다");
  };

  /* ── 디버그 실행 ──
     케이스는 환경을 모른다. 그래서 디버그용 환경을 여기서 고른다 —
     이 선택은 케이스에 저장되지 않고 세션에만 남는다(실행 계획의 targetRef와 무관).
     편집 중인 내용을 그대로 돌리며, 실행 이력·품질 게이트에는 집계되지 않는다. */
  // 접점은 편집 중인 내용에서 파생 (Full-Code면 코드에서 추정)
  const surf = surfacesOf({ steps, code: committed === 1 ? code : "" });
  const isFull = committed === 1;
  /* 저장·실행을 막는 오류 —
       Low-Code : 스텝 자체의 결함
       공통     : 데이터셋 불일치 (없는 컬럼 참조 / rows를 쓰는데 데이터셋 없음) */
  const errs = [
    ...(isFull ? [] : stepErrors(steps)),
    ...missingDsCols.map((c) => "데이터셋 '" + dataset + "'에 '" + c + "' 컬럼이 없습니다"),
    ...(usesRows && !dataset ? ["데이터셋이 없는데 " + (isFull ? "코드가 rows를 참조합니다" : "스텝이 ${row.…}를 참조합니다") + " — 실행해도 0건이 됩니다"] : []),
  ];
  const saveErr = errs.length ? errs[0] : "";
  // 케이스의 접점을 감당하는 환경만 — API 스텝이 있는데 apiUrl이 없으면 반드시 실패한다
  const dbgOpts = envOpts(fqaSystems).filter((o) => envCovers(o, surf));
  const dbg = dbgOpts.find((o) => refKey(o) === refKey(debugEnv)) || dbgOpts[0] || null;
  const dbgEnvRec = (() => { const sy = (fqaSystems || []).find((s) => s.id === (dbg || {}).systemId); return sy ? (sy.envs || []).find((e) => e.env === dbg.env) : null; })();
  const dbgAccts = (dbgEnvRec && dbgEnvRec.accts) || [];
  const acctOk = !usesAcct || (acctRole ? dbgAccts.some((a) => a.role === acctRole) : dbgAccts.length > 0);
  // 디버그 실행 고유 오류 — 환경·계정. 스텝/데이터셋 오류(errs)는 하단 패널이 전담하므로 여기서 문구로 반복하지 않는다.
  const envErr =
    !dbg ? "이 케이스의 접점(" + surf + ")에 맞는 대상·환경이 없습니다"
    : !acctOk ? (acctRole ? "이 환경에 '" + acctRole + "' 역할의 계정이 없습니다" : "이 환경의 계정 풀이 비어 있습니다")
    : (!isFull && steps.length === 0) ? "스텝이 없습니다"
    : "";
  const runBlocked = !!envErr || errs.length > 0;   // 실행 차단 = 환경 문제 또는 스텝/데이터셋 오류
  const runOne = () => {
    if (runBlocked) return;
    setRunRes(null); setQa("run");
    const last = tc ? lastOf(fqaRuns, tc.id) : "-";
    setTimeout(() => setRunRes(isFull ? simCode(code, last) : simRun(steps, tc, last)), 900);
  };

  /* Low-Code는 스텝이 진실 — code를 저장하면 스텝과 어긋난 낡은 코드가 DB에 남는다(실행 시 서버가 스텝에서 생성한다).
     Full-Code는 code가 진실 — 스텝은 참고용으로 그대로 둔다(변환 시점의 흔적). */
  // origin(생성 경로)은 최초 생성 때 정해지고 이후 바뀌지 않는다 — 편집·변환·복제와 무관한 '출생' 정보
  const body = () => ({ steps, code: isFull ? code : "", level: LV[committed], suiteId: suite, name: name.trim(), tags, dataset: dataset || "-", preCase, acctRole: (preCase || usesAcct) ? acctRole : "", prodCaution, origin: (tc && tc.origin) || "직접 작성" });
  /* 저장 = 새 리비전 INSERT. baseRev로 낙관적 잠금 — 그 사이 남이 저장했으면 거부한다. */
  /* 충돌 후 탈출구 — 최신본을 다시 읽어 편집 상태를 갈아끼운다.
     이게 없으면 baseRev가 낡은 채로 남아 다시 저장해도 또 충돌한다(영원히 저장 불가). */
  const reload = () => {
    const c = tc || {};
    setSteps(c.steps || []); setCode(c.code || ""); setCommitted(Math.max(0, LV.indexOf(c.level)));
    setView(c.level || "Low-Code"); setName(c.name || ""); setTags(c.tags || ""); setSuite(c.suiteId || 0);
    setDataset(c.dataset && c.dataset !== "-" ? c.dataset : ""); setAcctRole(c.acctRole || ""); setPreCase(c.preCase || ""); setProdCaution(!!c.prodCaution);
    setStatus(c.status || "검토중");
    baseRev.current = c.rev || 1;
    setSnap(JSON.stringify({ steps: c.steps || [], code: c.code || "", committed: Math.max(0, LV.indexOf(c.level)), suite: c.suiteId || 0, name: c.name || "", tags: c.tags || "", dataset: c.dataset && c.dataset !== "-" ? c.dataset : "", acctRole: c.acctRole || "", preCase: c.preCase || "", prodCaution: !!c.prodCaution }));
    flash("rev " + (c.rev || 1) + " 최신본을 불러왔습니다");
  };
  /* 저장하면 상태는 검토중으로 수렴한다 — 내용이 바뀌었으니 다시 검토 대상이 된다.
       초안  → 검토중 (작성 완료, 검토 요청)
       검토중 → 검토중 (유지)
       승인  → 검토중 (승인 해제 · 재검토 필요)
     API 임포트의 '초안'은 편집 없이 대량 생성된 골격 — 에디터에서 저장할 때 비로소 검토중이 된다. */
  const save = () => {
    if (!name.trim()) { flash("TC 이름을 입력하세요"); return false; }
    if (saveErr) { flash(saveErr); return false; }
    const wasApproved = status === "승인";
    // 아직 목록에 없는 케이스(직접 작성)면 첫 저장 = 생성 → 검토중
    if (!fqaCases.some((c) => c.id === tc.id)) {
      addFqaCase({ id: tc.id, ...body(), status: "검토중" });
      baseRev.current = 1; setStatus("검토중");
      setSnap(JSON.stringify({ steps, code, committed, suite, name, tags, dataset, acctRole, preCase, prodCaution }));
      flash("검토중으로 저장됨");
      return true;
    }
    const ok = commitFqaCase(tc.id, { ...body(), status: "검토중" }, { baseRev: baseRev.current });
    if (!ok) {
      // 내 편집을 덮어쓰지 않는다 — 최신을 불러올지(내 변경 폐기) 사용자가 정한다
      if (window.confirm("다른 사람이 이 케이스를 수정했습니다 (rev " + baseRev.current + " → rev " + curRev + ").\n\n최신본을 불러올까요?\n지금 편집 중인 내용은 사라집니다. (취소하면 변경 이력에서 차이를 확인할 수 있습니다)")) reload();
      else setQa("ver");
      return false;
    }
    baseRev.current = curRev + 1;
    setStatus("검토중");
    setSnap(JSON.stringify({ steps, code, committed, suite, name, tags, dataset, acctRole, preCase, prodCaution }));
    flash(wasApproved ? "rev " + (curRev + 1) + " 저장 · 승인 해제(검토중)" : "rev " + (curRev + 1) + " 검토중으로 저장");
    return true;
  };
  /* 복제 — 사본은 '지금 편집 중인 내용'을 받는다. 원본에 미저장 변경이 있으면 먼저 저장한다. */
  const duplicate = () => {
    if (dirty) {
      if (!window.confirm("저장하지 않은 변경이 있습니다.\n원본을 저장하고 사본을 열까요?")) return;
      if (!save()) return;
    }
    const nid = nextTcId(fqaCases);
    const copy = { id: nid, ...body(), name: name + " (사본)", status: "검토중" };
    addFqaCase(copy);
    if (onOpen) { onOpen({ ...copy, rev: 1 }); flash(nid + " 사본을 열었습니다"); }
    else flash(nid + " 사본 생성 · 목록에 추가");
  };
  return (
    <div className="space-y-4">
      <Hdr icon={Code2} title="테스트케이스 에디터" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">태그</div>
            <TagPicker value={tags} onChange={setTags} />
            <div className="mt-1.5 text-xs text-slate-500">실행 계획이 태그로 대상을 고릅니다.</div>
          </Card>
          {/* 운영주의 — 태그와 별개 플래그. 운영 환경 실행 시 경고(막지 않고 알린다). */}
          <Card className="p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={prodCaution} onChange={(e) => setProdCaution(e.target.checked)} className="accent-amber-500" />
              <span className="text-sm text-slate-800">운영주의</span>
            </label>
            <div className="mt-1.5 text-xs text-slate-500">데이터 변경/삭제 — 운영 환경 테스트 시 주의</div>
          </Card>
          {/* 🔑 전제조건 — 로그인은 대부분의 케이스에서 '검증 대상'이 아니라 '들어가기 위한 절차'다.
              스텝으로 넣으면 케이스마다 같은 다섯 줄이 복사되고, 워커마다 로그인해서 계정이 충돌한다(F4).
              별도 '로그인 프로필' 엔티티를 만들지 않고 케이스를 그대로 가리킨다 —
              그래야 레코딩·리비전·디버그 실행·승인 워크플로가 공짜로 따라오고, 로그인 자체도 테스트 대상이 된다.
              로그인을 검증하는 케이스(TC-0031)는 '없음'으로 두고 스텝으로 직접 쓴다. */}
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">전제조건</div>
            <Select value={preCase} onChange={(e) => setPreCase(e.target.value)}>
              <option value="">없음 (비로그인 흐름 · 로그인 자체 검증)</option>
              {preOpts.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}
            </Select>
            {(preCase || usesAcct) && (
              <div className="mt-2">
                <Select value={acctRole} onChange={(e) => setAcctRole(e.target.value)}>
                  <option value="">기본 (풀의 첫 계정)</option>
                  {roleOpts.map((r) => <option key={r}>{r}</option>)}
                </Select>
                <div className="mt-1.5 text-xs text-slate-500">
                  {preCase
                    ? <>이 역할의 계정으로 <span className="font-mono text-sky-600">{preCase}</span>을 먼저 수행한 세션에서 시작합니다. 스텝에 로그인을 쓰지 않습니다.<br />전제조건 수행은 <span className="text-slate-500">집계에 세지 않습니다</span> — 실패하면 이 케이스가 <span className="text-slate-500">전제조건 실패</span>로 기록됩니다.</>
                    : <>스텝이 계정 변수를 사용합니다 — 이 역할의 계정이 <span className="font-mono text-sky-600">{"${계정 ID}"}</span>·<span className="font-mono text-sky-600">{"${계정 비밀번호}"}</span>에 주입됩니다.</>}
                </div>
              </div>
            )}
            {/* 승인된 케이스만 후보다 — 초안을 전제로 쓰면 실행이 불안정해진다.
                전제조건 케이스를 수정하면 승인이 풀리므로 이 케이스도 실행이 막힌다(F9). 그게 의도다. */}
            <div className="mt-1.5 text-xs text-slate-500">승인된 Low-Code 케이스만 고를 수 있습니다.</div>
            {preOpts.length === 0 && <div className="mt-1 text-xs text-amber-600">해당하는 케이스가 없습니다.</div>}
          </Card>
          {/* 케이스가 행마다 반복 실행된다 — 부하용 대량 데이터셋(NQA 몫)은 고를 수 없다 */}
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">데이터셋 (데이터 드리븐)</div>
            <DatasetPicker value={dataset} onChange={setDataset} noneLabel="없음 (단일 실행)" maxRows={DS_MAX_ROWS} />
            {selDs && <div className="mt-1.5 text-xs text-slate-500">컬럼 <span className="font-mono text-slate-700">{selDs.columns.join(", ")}</span> · <span className="font-mono text-sky-600">{"${row.컬럼}"}</span>로 참조 · <span className="text-amber-700">{(selDs.rowCount != null ? selDs.rowCount : selDs.rows.length).toLocaleString()}회 반복</span></div>}
          </Card>
          <Card className="p-3">
            <div className="space-y-1.5">
              <Btn className="w-full" icon={Copy} onClick={duplicate}>복제</Btn>
              <Btn className="w-full" icon={History} onClick={() => setQa("ver")}>변경 이력{versions.length > 0 && <span className="ml-1 text-slate-500">({versions.length})</span>}</Btn>
            </div>
          </Card>
        </div>
        <div className="col-span-9 space-y-3">
          {/* 케이스의 정체 — ID · 소속 스위트 · 이름 · 리비전 · 상태 */}
          <Card className="flex items-center gap-2 p-3">
            <span className="shrink-0 font-mono text-sm text-sky-600">{tc ? tc.id : ""}</span>
            <div className="shrink-0" style={{ width: 160 }}>
              <Select value={String(suite)} onChange={(e) => setSuite(+e.target.value)}>{fqaSuites.map((sx) => <option key={sx.id} value={String(sx.id)}>{sx.name}</option>)}</Select>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="TC 이름" className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 outline-none hover:border-slate-300 focus:border-sky-500 focus:bg-slate-100" />
            {/* 관리 수준은 현재 committed 기준 — entry(진입 시점)로 표시하면 변환 후에도 옛 값이 남는다 */}
            <div className="flex shrink-0 items-center gap-2"><span className="font-mono text-xs text-slate-500">rev {curRev}</span><Badge kind={isFull ? "warn" : "active"}>{LV[committed]} 관리</Badge><Badge kind={stEK[status] || "warn"}>{status}</Badge></div>
          </Card>

          {/* 왼쪽: 관리 수준(Low-Code → Full-Code · 단방향) / 오른쪽: 디버그 실행.
              스텝·코드를 고치며 반복해서 누르는 자리라 편집기 바로 위에 둔다.
              디버그 환경은 케이스에 저장되지 않는다(실행 계획의 대상·환경과 무관). */}
          <div className="flex items-center gap-1.5">
            {LV.map((l, i) => {
              // Full-Code인데 스텝이 없으면(=직접 Full-Code로 작성) Low-Code 과거가 없다 — 탭을 잠근다.
              // eject된 케이스는 스텝이 남아 있어 읽기 전용으로 열람 가능.
              const off = i > committed || (i === 0 && committed === 1 && steps.length === 0);
              return (
              <Fragment key={l}>
                <button disabled={off} onClick={() => !off && setView(l)} className={"rounded-lg border px-3 py-1.5 text-xs " + (view === l ? "border-sky-500 bg-sky-100 text-sky-700" : !off ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200" : "border-slate-200 bg-white text-slate-500 cursor-not-allowed")}>
                  {l}
                </button>
                {i < LV.length - 1 && <ArrowRight size={14} className={i < committed ? "text-sky-600" : "text-slate-700"} />}
              </Fragment>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              {envErr && <span className="text-xs text-amber-700" title={envErr}>⚠ {envErr}</span>}
              <div style={{ width: 190 }}>
                <Select value={refKey(dbg)} onChange={(e) => { const o = dbgOpts.find((x) => refKey(x) === e.target.value); if (o) setDebugEnv({ systemId: o.systemId, env: o.env }); }}>
                  {dbgOpts.length === 0 && <option>맞는 환경 없음</option>}
                  {dbgOpts.map((o) => <option key={refKey(o)} value={refKey(o)}>{o.label}</option>)}
                </Select>
              </div>
              <Btn kind="primary" icon={Play} disabled={runBlocked} title={envErr || (errs.length ? "스텝 오류를 먼저 해결하세요" : "편집 중인 내용으로 이 환경에서 한 번 실행 — 실행 이력·품질 게이트에 집계되지 않습니다")} onClick={runOne}>디버그 실행</Btn>
            </div>
          </div>

          <Card className="overflow-hidden">
            {readonly && (
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-amber-700"><Lock size={13} />읽기 전용 — 이 케이스는 Full-Code로 관리됩니다. 되돌리려면 변경 이력에서 복원하세요.</div>
            )}

            {view === "Low-Code" && (
              <div>
                <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
                  <Badge kind={SURF_K[surfacesOf({ steps })] || "info"}>{surfacesOf({ steps })}</Badge>
                  <span className="ml-auto text-xs text-slate-500">경로는 <span className="font-mono text-slate-500">상대경로</span> — base URL은 실행 계획의 환경에서 주입</span>
                </div>
                <div>
                  {steps.length === 0 && <div className="px-3 py-10 text-center text-sm text-slate-500">스텝이 없습니다. 아래 <span className="text-sky-600">+ 스텝 추가</span>로 시작하세요.</div>}
                  {steps.map((s, i) => {
                    const setStep = (patch) => setSteps(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    const isCode = s.act === "코드 스텝";
                    const isReq = s.act === "요청";
                    const isResp = s.act === "응답 검증";
                    const isAssert = s.act === "화면 검증";
                    const reqSum = s.save ? "저장 " + s.save : s.body ? "본문 있음" : "";
                    return (
                    <div key={i} className={"border-b border-slate-200 " + (dragIdx === i ? "opacity-40" : "")}>
                      <div
                        onDragOver={editable ? (e) => e.preventDefault() : undefined}
                        onDrop={editable ? () => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); } : undefined}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm">
                        <span draggable={editable} onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)} className={editable ? "cursor-grab" : ""} title={editable ? "드래그로 순서 변경" : undefined}><GripVertical size={14} className={editable ? "text-slate-500" : "text-slate-800"} /></span>
                        <span className="w-4 text-xs text-slate-500">{i + 1}</span>
                        {editable ? (
                          <>
                            <select value={s.act} onChange={(e) => { const v = e.target.value; const init = v === "코드 스텝" ? { act: v, code: s.code || "await page.locator('').click();" } : v === "요청" ? { act: v, loc: reqJoin("GET", "") } : v === "응답 검증" ? { act: v, loc: "상태코드", val: "200" } : v === "화면 검증" ? { act: v, val: "visible = true" } : { act: v }; setStep(init); if (v === "코드 스텝") setCodeOpen((m) => ({ ...m, [i]: true })); }} className="w-32 shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500">{STEP_ACTS.map((a) => <option key={a}>{a}</option>)}</select>

                            {isCode && (
                              <button onClick={() => toggleCode(i)} className="flex flex-1 items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-left text-xs text-sky-600 hover:border-sky-500"><Code2 size={12} />{codeOpen[i] ? "코드 접기 ▲" : "코드 편집 ▼"}<span className="ml-1 truncate font-mono text-slate-500">{(s.code || "").split("\n")[0]}</span></button>
                            )}

                            {/* 요청 — 메서드는 고르고 경로만 적는다 */}
                            {isReq && (() => { const { m, path } = reqParts(s.loc); const bodyOk = hasBody(m); return (
                              <>
                                {/* 메서드를 본문 없는 것으로 바꾸면 남아 있던 본문을 버린다 — 저장돼 봐야 무시된다 */}
                                <select value={m} onChange={(e) => { const nm = e.target.value; setStep({ loc: reqJoin(nm, path), ...(hasBody(nm) ? {} : { body: "" }) }); }} className="w-20 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-sky-600 outline-none focus:border-sky-500">{REQ_METHODS.map((x) => <option key={x}>{x}</option>)}</select>
                                <input value={path} onChange={(e) => setStep({ loc: reqJoin(m, e.target.value) })} placeholder={LOC_PH["요청"]} className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                <button onClick={() => toggleCode(i)} className="flex w-36 shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-left text-xs text-sky-600 hover:border-sky-500"><Send size={12} />{(bodyOk ? "본문·헤더·저장 " : "헤더·저장 ") + (codeOpen[i] ? "▲" : "▼")}</button>
                              </>
                            ); })()}

                            {/* 응답 검증 — 대상(상태코드 | 본문 필드) × 조건(존재 | 값 일치) */}
                            {isResp && (() => { const st = isStatusTarget(s.loc); const cond = respCond(s.val); const raw = (String(s.val || "").match(/"([\s\S]*)"/) || [])[1] || ""; return (
                              <>
                                <select value={st ? "상태코드" : "본문 필드"} onChange={(e) => setStep(e.target.value === "상태코드" ? { loc: "상태코드", val: "200" } : { loc: "$.orderId", val: "존재" })} className="w-24 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>상태코드</option><option>본문 필드</option></select>
                                {st ? (
                                  <input type="number" value={s.val} onChange={(e) => setStep({ val: e.target.value })} placeholder="200" className="w-24 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" />
                                ) : (
                                  <>
                                    <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder="$.orderId" className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                    <select value={cond} onChange={(e) => setStep({ val: e.target.value === "존재" ? "존재" : '"' + raw + '"' })} className="w-20 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>존재</option><option>값 일치</option></select>
                                    {cond === "값 일치" && <input value={raw} onChange={(e) => setStep({ val: '"' + e.target.value + '"' })} placeholder="결제완료" className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />}
                                  </>
                                )}
                                {st && <span className="flex-1" />}
                              </>
                            ); })()}

                            {/* 화면 검증 — 검증 종류를 고른다. 값은 종류가 필요로 할 때만. */}
                            {isAssert && (() => { const pa = parseAssert(s.val); const def = assertDef(pa.k); return (
                              <>
                                <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder="[data-testid=welcome]" className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                <select value={pa.k} onChange={(e) => { const d = assertDef(e.target.value); setStep({ val: d.build(d.arg ? pa.arg : "") }); }} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-amber-700 outline-none focus:border-sky-500">{ASSERTS.map((a) => <option key={a.k}>{a.k}</option>)}</select>
                                {def.arg && <input type={def.arg === "num" ? "number" : "text"} value={pa.arg} onChange={(e) => setStep({ val: def.build(e.target.value) })} placeholder={def.ph} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />}
                              </>
                            ); })()}

                            {/* 그 밖 (이동·입력·클릭·선택·체크·키 누르기) */}
                            {!isCode && !isReq && !isResp && !isAssert && (
                              <>
                                <input value={s.loc} onChange={(e) => setStep({ loc: e.target.value })} placeholder={LOC_PH[s.act] || "[data-testid=login-btn]"} className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                                {s.act === "체크" ? (
                                  <select value={/해제/.test(s.val || "") ? "해제" : "체크"} onChange={(e) => setStep({ val: e.target.value })} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500"><option>체크</option><option>해제</option></select>
                                ) : (s.act === "클릭" || s.act === "이동") ? (
                                  <span className="w-28 shrink-0" />
                                ) : (
                                  <input value={s.val} onChange={(e) => setStep({ val: e.target.value })} placeholder={VAL_PH[s.act] || "값"} className="w-28 shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-sky-500" />
                                )}
                              </>
                            )}
                            <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="shrink-0 text-slate-500 hover:text-red-600" title="스텝 삭제"><X size={13} /></button>
                          </>
                        ) : (
                          <>
                            <span className={"w-28 font-medium " + (isCode ? "text-sky-600" : s.act.includes("검증") ? "text-amber-700" : "text-slate-800")}>{s.act}</span>
                            {isCode ? <span className="flex-1 truncate font-mono text-xs text-slate-500">{(s.code || "").split("\n")[0]}</span> : <><span className="flex-1 font-mono text-xs text-slate-500">{s.loc}</span><span className="text-xs text-slate-500">{isReq ? reqSum : s.val}</span></>}
                          </>
                        )}
                      </div>
                      {isCode && (codeOpen[i] || !editable) && (
                        <div className="px-10 pb-2.5">
                          <textarea value={s.code || ""} onChange={(e) => setStep({ code: e.target.value })} readOnly={!editable} rows={4} placeholder="await page.getByTestId('x').click();" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-sky-700 outline-none focus:border-sky-500" />
                        </div>
                      )}
                      {isReq && (codeOpen[i] || !editable) && (
                        <div className="grid grid-cols-2 gap-3 px-10 pb-3">
                          {/* 본문은 POST·PUT·PATCH만 — GET/DELETE의 body는 서버가 무시한다 */}
                          {hasBody(reqParts(s.loc).m) && (
                            <div className="col-span-2">
                              <div className="mb-1 text-xs text-slate-500">요청 본문 (JSON)</div>
                              <textarea value={s.body || ""} onChange={(e) => setStep({ body: e.target.value })} readOnly={!editable} rows={3} placeholder={'{ "payment": "card" }'} className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-sky-700 outline-none focus:border-sky-500" />
                            </div>
                          )}
                          <div>
                            <div className="mb-1 text-xs text-slate-500">추가 헤더 (선택 · 한 줄에 하나)</div>
                            <textarea value={s.headers || ""} onChange={(e) => setStep({ headers: e.target.value })} readOnly={!editable} rows={2} placeholder="Idempotency-Key: ${주문키}" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                            <div className="mt-1 text-xs text-slate-500">인증 헤더는 환경에서 주입 — 여기 적지 않습니다.</div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-500">응답 저장 (스텝 간 전달)</div>
                            <input value={s.save || ""} onChange={(e) => setStep({ save: e.target.value })} readOnly={!editable} placeholder="orderId = $.orderId" className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500" />
                            <div className="mt-1 text-xs text-slate-500">이후 스텝에서 <span className="font-mono text-sky-600">{"${orderId}"}</span>로 사용 · 쉼표로 여러 개 · 이름은 영문·숫자·_</div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
                {editable && (
                  <div className="flex items-center gap-3 border-t border-slate-200 px-3 py-2">
                    <button onClick={() => setSteps([...steps, steps.length === 0 ? { act: "이동", loc: "/", val: "-" } : { act: "클릭", loc: "", val: "-" }])} className="shrink-0 text-xs text-sky-600">+ 스텝 추가</button>
                    <span className="truncate text-xs text-slate-500">로케이터 {LOC_HINT}</span>
                  </div>
                )}
              </div>
            )}

            {view === "Full-Code" && (
              <div className="p-3">
                <div className="mb-2 text-xs text-slate-500">Playwright · TypeScript</div>
                <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={16} className={taCls} style={{ fontFamily: "monospace" }} />
              </div>
            )}
            {/* 전제조건으로 쓰이는 케이스는 생성기가 두 형태를 낸다 — 껍데기만 다르고 본문은 같다 */}
            {usedAsPre.length > 0 && view === "Low-Code" && (
              <div className="border-t border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge kind="active">전제조건으로 사용 {usedAsPre.length}건</Badge>
                  <span className="font-mono text-slate-500">{usedAsPre.slice(0, 4).map((c) => c.id).join(", ")}{usedAsPre.length > 4 && " 외 " + (usedAsPre.length - 4) + "건"}</span>
                </div>
                <div className="mb-1.5 text-slate-500" style={{ fontSize: 11 }}>같은 스텝이 <span className="text-slate-500">케이스용 <span className="font-mono">test(...)</span></span> 와 <span className="text-slate-500">전제조건용 <span className="font-mono">async 함수</span></span> 두 형태로 생성됩니다. 실행 시작 시 이 함수로 세션을 만들어 위 케이스들이 재사용합니다.</div>
                <pre className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-slate-500" style={{ fontSize: 11 }}>{preForm()}</pre>
              </div>
            )}

            {errs.length > 0 && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-2">
                {errs.slice(0, 5).map((e, i) => <div key={i} className="text-xs text-amber-700">⚠ {e}</div>)}
                {errs.length > 5 && <div className="text-xs text-amber-600">외 {errs.length - 5}건</div>}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              {committed < 1 && view === LV[committed] && (
                <Btn icon={ArrowRight} disabled={!!errs.length || steps.length === 0} onClick={descend}>Full-Code로 변환</Btn>
              )}
              {/* 저장하면 검토중으로 수렴 — 라벨이 결과를 말해준다 */}
              <Btn kind="primary" icon={Save} disabled={!dirty || !!saveErr} title={saveErr || undefined} onClick={save}>{dirty ? "검토중으로 저장" : "저장됨"}</Btn>
            </div>
          </Card>
        </div>
      </div>
      {qa && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setQa(null)}>
          <div className={"w-full rounded-xl border border-slate-200 bg-white shadow-xl " + (qa === "ver" ? "max-w-4xl" : "max-w-md")} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{qa === "run" ? "디버그 실행" : "변경 이력"} <span className="font-mono text-xs text-sky-600">{tc ? tc.id : ""}</span>{qa === "ver" && <span className="ml-2 text-xs font-normal text-slate-500">현재 rev {curRev}</span>}</h3><button onClick={() => setQa(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 p-5 text-sm">
              {qa === "ver" && (versions.length === 0 ? (
                <div className="text-xs text-slate-500">저장 이력이 없습니다 — 저장할 때마다 직전 리비전이 여기에 쌓입니다.</div>
              ) : (
                <div className="flex gap-3" style={{ height: 420 }}>
                  {/* 리비전 목록 */}
                  <div className="w-52 shrink-0 space-y-1.5 overflow-y-auto">
                    {versions.map((v, i) => (
                      <button key={v.rev} onClick={() => setVerSel(v.rev)} className={"w-full rounded-lg border px-2.5 py-2 text-left " + (verSel === v.rev ? SEL_CARD : "border-slate-200 bg-slate-50 hover:bg-white")}>
                        <div className="flex items-center gap-1.5 text-xs"><span className="font-mono text-sky-600">rev {v.rev}</span><Badge kind={v.level === "Full-Code" ? "warn" : "active"}>{v.level}</Badge>{v.rev === curRev && <span className="ml-auto text-xs text-slate-500">현재</span>}{i === versions.length - 1 && v.rev !== curRev && <span className="ml-auto text-xs text-slate-500">최초</span>}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{v.at}</div>
                        <div className="text-xs text-slate-500">{v.by}</div>
                      </button>
                    ))}
                  </div>
                  {/* 현재본과의 차이 */}
                  <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {!verObj || !headObj ? <div className="py-16 text-center text-xs text-slate-500">리비전을 선택하세요.</div> : verObj.rev === curRev ? (
                      <div className="py-16 text-center text-xs text-slate-500">현재 리비전입니다. 이전 리비전을 선택하면 차이가 표시됩니다.</div>
                    ) : (() => {
                      const fd = fieldDiff(verObj, headObj, fqaSuites);
                      const sd = lcsDiff(verObj.steps || [], headObj.steps || [], stepKey).filter((d) => d.t !== "same");
                      const cd = lcsDiff((verObj.code || "").split("\n"), (headObj.code || "").split("\n"), (x) => x);
                      const cdChanged = cd.some((d) => d.t !== "same");
                      const none = fd.length === 0 && sd.length === 0 && !cdChanged;
                      return (
                        <div className="space-y-3">
                          <div className="text-xs text-slate-500">rev {verObj.rev} <ArrowRight size={11} className="inline text-slate-400" /> rev {curRev} <span className="text-slate-500">(현재)</span></div>
                          {none && <div className="py-12 text-center text-xs text-slate-500">이 리비전과 현재 내용이 같습니다.</div>}
                          {fd.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">속성</div>
                              <div className="space-y-1">
                                {fd.map((d) => (
                                  <div key={d.k} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs">
                                    <span className="w-20 shrink-0 text-slate-500">{d.label}</span>
                                    <span className="text-red-700 line-through">{d.from}</span>
                                    <ArrowRight size={11} className="shrink-0 text-slate-400" />
                                    <span className="text-emerald-700">{d.to}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {sd.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">스텝</div>
                              <div className="overflow-hidden rounded border border-slate-200">
                                {sd.map((d, i) => (
                                  <div key={i} className={"flex gap-2 px-2 py-1 font-mono text-xs " + DIFF_CLS[d.t]}><span className="w-3 shrink-0">{DIFF_MARK[d.t]}</span><span className="min-w-0 flex-1 truncate">{stepText(d.v)}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
                          {cdChanged && (
                            <div>
                              <div className="mb-1 text-xs font-semibold text-slate-500">코드</div>
                              <div className="overflow-hidden rounded border border-slate-200">
                                {cd.map((d, i) => (
                                  <div key={i} className={"flex gap-2 px-2 py-0.5 font-mono text-xs " + DIFF_CLS[d.t]}><span className="w-3 shrink-0">{DIFF_MARK[d.t]}</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{d.v || " "}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
                          <Btn className="w-full" icon={History} onClick={() => { setSteps(verObj.steps || []); setCode(verObj.code || ""); setCommitted(Math.max(0, LV.indexOf(verObj.level))); setView(verObj.level || "Low-Code"); setName(verObj.name || name); setSuite(verObj.suiteId || suite); setTags(verObj.tags || ""); setDataset(verObj.dataset && verObj.dataset !== "-" ? verObj.dataset : ""); setAcctRole(verObj.acctRole || ""); setQa(null); flash("rev " + verObj.rev + " 내용으로 되돌림 — 저장하면 rev " + (curRev + 1) + "이 됩니다"); }}>이 리비전으로 되돌리기</Btn>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
              {qa === "run" && (runRes === null ? (
                <div className="flex items-center gap-2 text-slate-500"><RefreshCw size={14} className="text-sky-600" />실행 중…</div>
              ) : (
                <>
                  <div className="flex items-center gap-2"><Badge kind={runRes.verdict === "PASS" ? "pass" : "fail"}>{runRes.verdict}</Badge><span className="text-xs text-slate-500">{dbg ? dbg.label : ""}</span></div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    {runRes.steps.map((s, i) => (
                      <div key={i} className={"flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs last:border-0 " + (s.ok ? "" : "bg-red-50")}>{s.ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <XCircle size={13} className="text-red-600" />}<span className={"shrink-0 " + (s.ok ? "text-slate-700" : "text-red-700")}>{s.act}</span><span className="flex-1 truncate font-mono text-slate-500">{s.loc}</span></div>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500">＊ 목업 시뮬레이션</div>
                </>
              ))}
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}