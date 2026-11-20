// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Copy, Globe, Plus, RefreshCw, Save, Server, Wrench, X, XCircle } from "lucide-react";
import { Badge, Btn, Card, Field, Input, PageToolbar, Portal, SEL_CARD, SEL_IDLE, Select, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { VarRefInput } from "../common/VarRefInput.jsx";
import { TG } from "./parts.jsx";
/* ═══════════ 10. 대상·환경 (대상→환경 계층) ═══════════ */
/* 환경 이름은 실행 계획의 참조 키(targetRef.env) — 대상 안에서 유니크해야 한다 */
const ENV_NAMES = ["스테이징", "운영", "개발"];
const TRow = ({ label, on, set, hint }) => (
  <div className="flex items-center justify-between py-1 text-sm text-slate-700"><span>{label}{hint && <span className="ml-1 text-xs text-slate-500">{hint}</span>}</span><TG on={on} onClick={() => set(!on)} /></div>
);
/* 접점 그룹 — 웹/API base URL 두 칸을 하나의 묶음으로 보여준다(둘 중 하나 이상 · 둘 다면 혼합) */
const EndpointGroup = ({ webUrl, apiUrl, set }) => {
  const both = !!webUrl && !!apiUrl;
  return (
    <div className="rounded-lg border border-slate-300 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Globe size={13} className="text-sky-600" />
        <span className="text-xs font-semibold text-slate-700">접점 (Base URL)</span>
        <span className="text-xs text-slate-500">· 둘 중 하나 이상</span>
        {both && <Badge kind="active">혼합 케이스 가능</Badge>}
      </div>
      <div className="space-y-2.5">
        <Field label="웹"><Input value={webUrl} onChange={(e) => set({ webUrl: e.target.value })} placeholder="https://stg.onmarket.io" className="font-mono text-xs" /></Field>
        <Field label="API"><Input value={apiUrl} onChange={(e) => set({ apiUrl: e.target.value })} placeholder="https://api-stg.onmarket.io" className="font-mono text-xs" /></Field>
      </div>
    </div>
  );
};
export function FqaTargetScreen() {
  const [msg, flash] = useToast();
  const { fqaSystems: systems, addFqaSystem, updateFqaSystem, removeFqaSystem, fqaPlans, fqaCases, setNavGuard } = useApp();
  const [sel, setSel] = useState(0);
  const [envIdx, setEnvIdx] = useState(0);
  const [test, setTest] = useState(null);
  const [modal, setModal] = useState(null);
  const [block, setBlock] = useState(null); // 참조 중이라 삭제가 막힌 경우
  const [tf, setTf] = useState({ name: "", env: "스테이징", webUrl: "", apiUrl: "" });
  const [ef, setEf] = useState({ env: "개발", webUrl: "", apiUrl: "" });
  const [draft, setDraft] = useState({});
  const [nameDraft, setNameDraft] = useState(null);
  const stK = { "연결됨": "pass", "미확인": "warn", "오류": "fail" };
  /* 🔴 신규 조직은 대상이 0건으로 시작한다 — sys.envs 접근 전에 막지 않으면 첫 화면에서 터진다.
     지금은 "최소 1개 유지" 가드 덕에 도달하지 않지만, 실 구현에서는 반드시 겪는 상태다. */
  const sys = systems[sel] || systems[0] || null;
  const env = sys ? (sys.envs[envIdx] || sys.envs[0]) : null;
  const secretRef = (val, setVal, ph) => <VarRefInput value={val} onChange={setVal} placeholder={ph} />;
  // 환경 = 한 배포본이 노출하는 접점(webUrl/apiUrl) + 공유 계정 + API 인증
  // 웹 로그인은 환경 설정이 아니다 — UI 흐름이므로 테스트케이스의 스텝이 수행한다.
  // API 스펙(계약)도 환경 설정이 아니다 — 케이스 생성 소스일 뿐이므로 "API 스펙 임포트" 화면에서만 다룬다.
  const CFG_DEF = {
    webUrl: "", apiUrl: "",
    apiAuth: { type: "없음", header: "X-API-Key", secretRef: "" },
    access: { basicAuth: false, baUser: "", baPw: "", tlsIgnore: false },
    deploy: { mode: "수동", verUrl: "", verPath: "$.version", interval: "15분" },
  };
  const cfg = { ...CFG_DEF, ...env, ...draft };
  const setEnvCfg = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setSub = (key, patch) => setEnvCfg({ [key]: { ...(cfg[key] || {}), ...patch } });
  const hasWeb = !!cfg.webUrl;
  const hasApi = !!cfg.apiUrl;
  const apiT = (cfg.apiAuth || {}).type || "없음";
  const verMode = (cfg.deploy || {}).mode || "수동";
  const dirty = Object.keys(draft).length > 0 || (nameDraft !== null && nameDraft !== ((sys || {}).name || ""));
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  // 접점·인증이 바뀌면 이전 연결 결과는 무효 → 미확인으로 되돌린다
  const invalidates = ["webUrl", "apiUrl", "apiAuth", "access"].some((k) => k in draft);
  const saveCfg = () => { updateFqaSystem(sys.id, { ...(nameDraft !== null ? { name: nameDraft } : {}), envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, ...draft, ...(invalidates ? { status: "미확인" } : {}) } : e)) }); setDraft({}); setNameDraft(null); setTest(null); flash("설정 저장됨" + (invalidates ? " · 연결 테스트 필요" : "")); };
  const guardSwitch = (fn) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; setDraft({}); setNameDraft(null); fn(); };
  useEffect(() => { setDraft({}); setNameDraft(null); }, [(sys || {}).id]);
  const envSlug = { "스테이징": "stg", "운영": "prod", "개발": "dev" }[(env || {}).env] || "env";
  const hookUrl = "https://proba.co.kr/api/hooks/t" + ((sys || {}).id || 0) + "-" + envSlug + "-3f9a2c";
  const choose = (i) => guardSwitch(() => { setSel(i); setEnvIdx(0); setTest(null); });
  // 참조 중이면 삭제 불가 — 계획의 targetRef가 조용히 끊어지는 것을 막는다
  /* '최소 1개 유지' 가드는 두지 않는다 — 업무 규칙이 아니라 sys.envs 접근 크래시를 피하려던 장치였다.
     크래시를 막았으므로 0건도 정상 상태다. 신규 조직은 어차피 0건에서 시작한다.
     실제로 막아야 하는 것은 '참조 중인 대상 삭제'이고 그건 아래 plansUsing이 한다. */
  const delTarget = (i, sy) => {
    const used = plansUsing(sy.id, null);
    if (used.length) { setBlock({ what: sy.name + " 대상", plans: used }); return; }
    if (!window.confirm(sy.name + " 대상을 삭제할까요?" + (systems.length <= 1 ? "\n\n마지막 대상입니다 — 삭제하면 케이스를 실행할 대상이 없어집니다." : ""))) return;
    guardSwitch(() => { removeFqaSystem(sy.id); setSel(0); setEnvIdx(0); setTest(null); setNameDraft(null); setDraft({}); flash(sy.name + " 삭제됨"); });
  };
  const delEnv = () => {
    // 환경이 없는 대상은 실행 대상이 될 수 없다 — 이건 크래시 회피가 아니라 업무 규칙이다
    if (sys.envs.length <= 1) { flash("대상에는 환경이 최소 1개 필요합니다 — 대상을 지우려면 대상 삭제를 쓰세요"); return; }
    const used = plansUsing(sys.id, env.env);
    if (used.length) { setBlock({ what: sys.name + " · " + env.env + " 환경", plans: used }); return; }
    if (!window.confirm(env.env + " 환경을 삭제할까요?")) return;
    guardSwitch(() => { updateFqaSystem(sys.id, { envs: sys.envs.filter((_, i) => i !== envIdx) }); setEnvIdx(0); flash(env.env + " 환경 삭제됨"); });
  };
  const delAcct = (idx) => { setEnvCfg({ accts: (cfg.accts || []).filter((_, j) => j !== idx) }); flash("계정 삭제됨"); };
  const updAcct = (idx, patch) => setEnvCfg({ accts: (cfg.accts || []).map((a, j) => (j === idx ? { ...a, ...patch } : a)) });
  const appendAcct = () => setEnvCfg({ accts: [...(cfg.accts || []), { role: "", acct: "", secretRef: "" }] });

  /* 연결 테스트 — 목업이라 실제 HTTP는 못 쏘지만, 설정 유효성만으로 실패 판정이 가능하다.
     그래야 status 배지가 의미를 갖는다. */
  const cfgErrors = () => {
    const e = [];
    if (!hasWeb && !hasApi) e.push("접점(웹 또는 API base URL)이 없습니다");
    if (hasApi) {
      /* 방식이 "없음"이면 아래 세 조건에 걸리지 않아 통과한다 —
         인증 없는 공개 API(헬스체크·공개 조회)와, 접속 조건의 Basic Auth 로 보호되는 API 가 여기 해당한다. */
      const a = cfg.apiAuth || {};
      if (a.type === "API Key" && (!a.header || !a.secretRef)) e.push("API Key — 헤더 이름·키가 필요합니다");
      if (a.type === "Bearer 토큰 (정적)" && !a.secretRef) e.push("Bearer — 토큰이 필요합니다");
      if (a.type === "OAuth 2.0 (Client Credentials)" && (!a.tokenUrl || !a.clientId || !a.clientSecret)) e.push("OAuth — 토큰 엔드포인트·client_id·client_secret이 필요합니다");
    }
    const ac = cfg.access || {};
    if (ac.basicAuth && (!ac.baUser || !ac.baPw)) e.push("Basic Auth — 사용자명·비밀번호가 필요합니다");
    if ((cfg.deploy || {}).mode === "버전 엔드포인트 폴링") {
      const u = (cfg.deploy || {}).verUrl || "";
      if (!u) e.push("배포 감지 — 폴링 대상 URL이 필요합니다");
      else if (!/^https?:\/\//i.test(u)) e.push("배포 감지 — 폴링 대상 URL은 절대 URL이어야 합니다 (https://…)");
    }
    return e;
  };
  const setEnvStatus = (status) => updateFqaSystem(sys.id, { envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, status } : e)) });
  const runTest = () => {
    const errs = cfgErrors();
    setTest({ s: "run" });
    setTimeout(() => {
      if (errs.length) { setTest({ s: "err", m: errs.join(" · ") }); setEnvStatus("오류"); return; }
      const parts = [];
      if (hasWeb) parts.push("웹 200 OK");
      if (hasApi) parts.push("API 200 OK · 인증 유효");
      setTest({ s: "ok", m: parts.join(" / ") });
      setEnvStatus("연결됨");
    }, 800);
  };

  /* 참조 무결성 — 환경 이름은 실행 계획의 참조 키(targetRef.env)다.
     ① 같은 대상 안에서 유니크해야 하고  ② 참조 중이면 삭제할 수 없다. */
  const usedEnvs = ((sys || {}).envs || []).map((e) => e.env);
  const envOpts = ENV_NAMES.filter((n) => !usedEnvs.includes(n));
  const plansUsing = (systemId, envName) => (fqaPlans || []).filter((p) => {
    const r = p.targetRef || {};
    return r.systemId === systemId && (envName == null || r.env === envName);
  });
  const addTarget = () => {
    if (!tf.name.trim()) { flash("대상 이름을 입력하세요"); return; }
    if (!tf.webUrl.trim() && !tf.apiUrl.trim()) { flash("웹 또는 API 접점 중 하나 이상을 입력하세요"); return; }
    const ns = { id: Date.now(), name: tf.name, envs: [{ env: tf.env, webUrl: tf.webUrl, apiUrl: tf.apiUrl, status: "미확인", ver: "-", prod: tf.env === "운영", accts: [] }] };
    guardSwitch(() => { addFqaSystem(ns); setSel(0); setEnvIdx(0); setModal(null); flash("대상이 추가되었습니다"); });
  };
  const addEnv = () => {
    if (!ef.env) { flash("추가할 수 있는 환경이 없습니다 — 이미 모두 등록되었습니다"); return; }
    if (usedEnvs.includes(ef.env)) { flash(ef.env + " 환경은 이미 있습니다"); return; }
    if (!ef.webUrl.trim() && !ef.apiUrl.trim()) { flash("웹 또는 API 접점 중 하나 이상을 입력하세요"); return; }
    guardSwitch(() => { updateFqaSystem(sys.id, { envs: [...sys.envs, { env: ef.env, webUrl: ef.webUrl, apiUrl: ef.apiUrl, status: "미확인", ver: "-", prod: ef.env === "운영", accts: [] }] }); setEnvIdx(sys.envs.length); setModal(null); flash("환경이 추가되었습니다"); });
  };
  // 빈 상태 — 무엇이 없는지와 다음에 할 일을 같이 준다. 여기서 막히면 이후 단계로 못 간다.
  if (!sys) return (
    <div className="space-y-4">
      <PageToolbar desc="대상(제품) → 환경(배포본) · 접점(웹/API) · 인증 · 접근" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징", webUrl: "", apiUrl: "" }); setModal("target"); }}>대상 추가</Btn>
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 대상이 없습니다.</div>
        </div>
        <div className="col-span-9">
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Server size={26} className="text-slate-400" />
            <div className="mt-3 text-sm font-medium text-slate-700">검증 대상을 먼저 등록하세요</div>
            <div className="mt-1.5 max-w-md text-xs text-slate-500">테스트할 제품과 환경(스테이징·운영)을 등록해야 케이스를 만들고 실행할 수 있습니다. 케이스는 환경을 모르고, 실행 시점에 여기서 주입받습니다.</div>
          </Card>
        </div>
      </div>
      {modal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">대상 추가</h3><button onClick={() => setModal(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 px-5 py-4">
              <Field label="대상 이름"><Input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} placeholder="예: 온마켓" /></Field>
              <Field label="첫 환경"><Select value={tf.env} onChange={(e) => setTf({ ...tf, env: e.target.value })}>{ENV_NAMES.map((n) => <option key={n}>{n}</option>)}</Select></Field>
              <EndpointGroup webUrl={tf.webUrl} apiUrl={tf.apiUrl} set={(pp) => setTf({ ...tf, ...pp })} />
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addTarget}>추가</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
  return (
    <div className="space-y-4">
      <PageToolbar desc="대상(제품) → 환경(배포본) · 접점(웹/API) · 인증 · 접근" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징", webUrl: "", apiUrl: "" }); setModal("target"); }}>대상 추가</Btn>
          {systems.map((sy, i) => (
            <Card key={sy.id} className={"cursor-pointer p-3 " + (sel === i ? SEL_CARD : SEL_IDLE)} >
              <div onClick={() => choose(i)}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{sy.name}</span><button onClick={(e) => { e.stopPropagation(); delTarget(i, sy); }} className="text-slate-500 hover:text-red-600" title="대상 삭제"><X size={12} /></button></div>
                <div className="mt-1.5 flex flex-wrap gap-1">{sy.envs.map((e) => <Badge key={e.env} kind={e.prod ? "warn" : "info"}>{e.env}</Badge>)}</div>
              </div>
            </Card>
          ))}
        </div>
        <div className="col-span-9 space-y-3">
          {/* 헤더 — 이름·상태 / 저장·연결 테스트 (LQA 챗봇 연결과 동일한 배치) */}
          <Card className="space-y-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2"><div className="w-56 shrink-0"><Input value={nameDraft ?? sys.name} onChange={(e) => setNameDraft(e.target.value)} className="text-base font-semibold" /></div><span className="shrink-0"><Badge kind={stK[env.status]}>{env.status}</Badge></span>{hasWeb && hasApi && <span className="shrink-0"><Badge kind="active">웹+API</Badge></span>}</div>
              <div className="flex shrink-0 items-center gap-2">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn icon={RefreshCw} onClick={runTest}>{test && test.s === "run" ? "테스트 중…" : "연결 테스트"}</Btn><Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2.5">
              <span className="mr-1 text-xs text-slate-500">환경</span>
              {sys.envs.map((e, i) => (<button key={e.env} onClick={() => guardSwitch(() => { setEnvIdx(i); setTest(null); })} className={"rounded-lg px-3 py-1.5 text-xs font-medium " + (envIdx === i ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-800")}>{e.env}{e.prod ? " ●" : ""}</button>))}
              {envOpts.length > 0 && <button onClick={() => { setEf({ env: envOpts[0], webUrl: "", apiUrl: "" }); setModal("env"); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">+ 환경</button>}
              {sys.envs.length > 1 && <button onClick={delEnv} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:text-red-600" title="현재 환경 삭제">− 환경</button>}
            </div>
            {test && test.s === "ok" && <div className="flex items-center gap-2 border-t border-slate-200 pt-2.5 text-xs text-emerald-700"><CheckCircle2 size={14} />{test.m}</div>}
            {test && test.s === "err" && <div className="flex items-start gap-2 border-t border-slate-200 pt-2.5 text-xs text-red-700"><XCircle size={14} className="mt-0.5 shrink-0" />{test.m}</div>}
          </Card>
          <div className="text-xs text-slate-500">생성 <span className="text-slate-500">{sys.createdBy || "—"}</span> · {sys.createdAt || "—"} · 수정 <span className="text-slate-500">{sys.updatedBy || "—"}</span> · {sys.updatedAt || "—"}</div>

          {/* 좌: 실행에 주입되는 것 (접점 · 계정 · API 인증) / 우: 접속·운영 조건 (접근 제어 · 배포 감지) */}
          <div className="grid grid-cols-2 items-start gap-3">
          <div className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Globe size={15} className="text-sky-600" />접점 (Endpoints) <span className="text-xs font-normal text-slate-500">· 케이스의 상대경로에 주입되는 base URL</span></div>
            <Field label="웹 Base URL"><Input value={cfg.webUrl || ""} onChange={(e) => setEnvCfg({ webUrl: e.target.value })} placeholder="https://stg.onmarket.io" className="font-mono text-xs" /></Field>
            <Field label="API Base URL"><Input value={cfg.apiUrl || ""} onChange={(e) => setEnvCfg({ apiUrl: e.target.value })} placeholder="https://api-stg.onmarket.io" className="font-mono text-xs" /></Field>
          </Card>

          {/* 계정 풀 — 웹 로그인은 '흐름'이므로 케이스가 수행한다. 환경은 '누구로' 만 제공한다. */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">계정 풀</div>
              <button onClick={appendAcct} className="text-xs text-sky-600">+ 계정</button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
                <span className="w-20 shrink-0">역할</span><span className="w-28 shrink-0">계정 ID</span><span className="flex-1">비밀번호 (변수 참조)</span><span className="w-4" />
              </div>
              {(cfg.accts || []).map((aR, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-20 shrink-0"><Input value={aR.role || ""} onChange={(e) => updAcct(i, { role: e.target.value })} placeholder="일반" /></div>
                  <div className="w-28 shrink-0"><Input value={aR.acct} onChange={(e) => updAcct(i, { acct: e.target.value })} placeholder="qa_user02" className="font-mono text-xs" /></div>
                  <div className="min-w-0 flex-1">{secretRef(aR.secretRef, (val) => updAcct(i, { secretRef: val }), "${stg_test_pw}")}</div>
                  <button onClick={() => delAcct(i)} className="shrink-0 text-slate-500 hover:text-red-600" title="계정 삭제"><X size={12} /></button>
                </div>
              ))}
              {(!cfg.accts || cfg.accts.length === 0) && <div className="px-1 py-2 text-xs text-slate-500">이 환경의 계정이 없습니다 — + 계정으로 추가</div>}
            </div>
            <div className="text-xs text-slate-500">케이스의 <span className="text-slate-500">실행 계정 역할</span>과 같은 역할의 계정이 <span className="font-mono text-sky-600">{"${계정 ID}"}</span>·<span className="font-mono text-sky-600">{"${계정 비밀번호}"}</span>로 주입됩니다.</div>
          </Card>


          {hasApi && (
            <Card className="p-4 space-y-3">
              <div className="text-sm font-semibold text-slate-800">API 인증</div>
              <Field label="방식">
                <Select value={apiT} onChange={(e) => setSub("apiAuth", { type: e.target.value })}>
                  <option>없음</option><option>API Key</option><option>Bearer 토큰 (정적)</option><option>OAuth 2.0 (Client Credentials)</option>
                </Select>
              </Field>

              {apiT === "API Key" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="헤더 이름"><Input value={(cfg.apiAuth || {}).header || ""} onChange={(e) => setSub("apiAuth", { header: e.target.value })} placeholder="X-API-Key" className="font-mono text-xs" /></Field>
                  <Field label="키 (변수 참조)">{secretRef((cfg.apiAuth || {}).secretRef, (val) => setSub("apiAuth", { secretRef: val }), "${stg_api_key}")}</Field>
                </div>
              )}

              {apiT === "Bearer 토큰 (정적)" && (
                <Field label="토큰 (변수 참조)" hint="만료되지 않는 장기 토큰만 — 만료 토큰이면 OAuth 2.0">{secretRef((cfg.apiAuth || {}).secretRef, (val) => setSub("apiAuth", { secretRef: val }), "${stg_onmarket_token}")}</Field>
              )}

              {apiT === "OAuth 2.0 (Client Credentials)" && (<>
                <Field label="토큰 엔드포인트"><Input value={(cfg.apiAuth || {}).tokenUrl || ""} onChange={(e) => setSub("apiAuth", { tokenUrl: e.target.value })} placeholder="https://auth-stg.onmarket.io/oauth2/token" className="font-mono text-xs" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="client_id"><Input value={(cfg.apiAuth || {}).clientId || ""} onChange={(e) => setSub("apiAuth", { clientId: e.target.value })} placeholder="proba-qa-runner" className="font-mono text-xs" /></Field>
                  <Field label="client_secret (변수 참조)">{secretRef((cfg.apiAuth || {}).clientSecret, (val) => setSub("apiAuth", { clientSecret: val }), "${stg_oauth_secret}")}</Field>
                </div>
                <Field label="scope (선택)"><Input value={(cfg.apiAuth || {}).scope || ""} onChange={(e) => setSub("apiAuth", { scope: e.target.value })} placeholder="orders.read orders.write" className="font-mono text-xs" /></Field>
              </>)}
            </Card>
          )}
          </div>

          <div className="space-y-3">
          {/* 접속 조건 — 플랫폼 러너가 이 환경에 닿기 위한 조건.
              (자체 실행 러너(Self-Hosted)는 향후 확장 — 지금은 플랫폼 러너가 유일한 실행 주체) */}
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800">접속 조건</div>
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">실행 러너 egress IP <span className="font-mono text-slate-700">203.248.252.0/24</span><button onClick={() => flash("egress IP 대역을 복사했습니다")} className="text-sky-600">복사</button></div>
              <div className="mt-1 text-slate-500">대상 방화벽·IP 화이트리스트에 등록해야 접속됩니다.</div>
            </div>
            <div className="border-t border-slate-200 pt-2">
              <TRow label="Basic Auth (htpasswd)" on={(cfg.access || {}).basicAuth} set={(v) => setSub("access", { basicAuth: v })} />
              {(cfg.access || {}).basicAuth && (
                <div className="mb-1 mt-2 grid grid-cols-2 gap-3">
                  <Field label="사용자명"><Input value={(cfg.access || {}).baUser || ""} onChange={(e) => setSub("access", { baUser: e.target.value })} placeholder="stg" className="font-mono text-xs" /></Field>
                  <Field label="비밀번호 (변수 참조)">{secretRef((cfg.access || {}).baPw, (val) => setSub("access", { baPw: val }), "${stg_basic_pw}")}</Field>
                </div>
              )}
              <TRow label="자체서명 TLS 무시" on={(cfg.access || {}).tlsIgnore} set={(v) => setSub("access", { tlsIgnore: v })} />
            </div>
          </Card>

          {/* 배포 감지 — LQA 챗봇 "모델·배포 소스"와 동일 구조: 3택 + 선택한 방식의 필드만 노출 */}
          <Card className="p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Wrench size={15} className="text-sky-600" />배포 감지 <span className="text-xs font-normal text-slate-500">· 실행 계획의 &quot;배포 시&quot; 트리거가 상속 · 실행 이력에 빌드 기록</span></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="배포 감지 방식"><Select value={verMode} onChange={(e) => setSub("deploy", { mode: e.target.value })}><option>수동</option><option>배포 웹훅 알림</option><option>버전 엔드포인트 폴링</option></Select></Field>
              <Field label="현재 배포 버전">
                {verMode === "수동"
                  ? <Input value={cfg.ver && cfg.ver !== "-" ? cfg.ver : ""} onChange={(e) => setEnvCfg({ ver: e.target.value || "-" })} placeholder="v5.12.0-rc" className="font-mono text-xs" />
                  : <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-700">{cfg.ver && cfg.ver !== "-" ? cfg.ver : "미감지"}</div>}
              </Field>
            </div>

            {verMode === "배포 웹훅 알림" && (
              <div className="space-y-2.5 rounded-lg border border-slate-200 p-3">
                <Field label="수신 웹훅 URL"><div className="flex items-center gap-2"><div className="flex-1 truncate rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-700">{hookUrl}</div><Btn icon={Copy} onClick={() => flash("웹훅 URL을 복사했습니다")}>복사</Btn></div></Field>
                <Field label="서명 시크릿"><div className="flex items-center gap-2"><div className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-500">whsec_••••••••••••</div><Btn icon={Copy} onClick={() => flash("서명 시크릿을 복사했습니다")}>복사</Btn><Btn onClick={() => flash("서명 시크릿이 재발급되었습니다")}>재발급</Btn></div></Field>
                <div className="text-xs text-slate-500">CD가 <span className="font-mono text-slate-500">{'{ "version": "…" }'}</span>를 이 URL로 전송 <span className="text-slate-500">· 마지막 수신 {cfg.ver && cfg.ver !== "-" ? "2시간 전" : "없음"}</span></div>
              </div>
            )}

              {verMode === "버전 엔드포인트 폴링" && (
              <div className="space-y-2.5 rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-3 gap-2">
                  {/* 버전 엔드포인트는 base URL과 다른 호스트일 수 있다 — 상대경로를 허용하면 기준이 모호해진다 */}
                  <div className="col-span-2"><Field label="폴링 대상 URL"><Input value={(cfg.deploy || {}).verUrl || ""} onChange={(e) => setSub("deploy", { verUrl: e.target.value })} placeholder="https://stg-cs.onmarket.io/health" className="font-mono text-xs" /></Field></div>
                  <Field label="폴링 주기"><Select value={(cfg.deploy || {}).interval || "15분"} onChange={(e) => setSub("deploy", { interval: e.target.value })}><option>5분</option><option>15분</option><option>1시간</option><option>6시간</option><option>24시간</option></Select></Field>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1"><Field label="버전 필드 경로 (JSONPath)"><Input value={(cfg.deploy || {}).verPath || ""} onChange={(e) => setSub("deploy", { verPath: e.target.value })} placeholder="$.version" className="font-mono text-xs" /></Field></div>
                  <Btn icon={RefreshCw} onClick={() => { const nv = "v" + (5 + sys.id) + "." + Math.floor(Math.random() * 20) + "." + Math.floor(Math.random() * 9); setEnvCfg({ ver: nv }); flash("버전 조회 완료 · " + nv); }}>지금 확인</Btn>
                </div>
              </div>
            )}
          </Card>
          </div>
          </div>
        </div>
      </div>

      {modal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{modal === "target" ? "대상 추가" : "환경 추가"}</h3><button onClick={() => setModal(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3.5 p-5">
              {modal === "target" && (<>
                <Field label="대상 이름"><Input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} placeholder="예: 온마켓" /></Field>
                <Field label="첫 환경"><Select value={tf.env} onChange={(e) => setTf({ ...tf, env: e.target.value })}>{ENV_NAMES.map((n) => <option key={n}>{n}</option>)}</Select></Field>
                <EndpointGroup webUrl={tf.webUrl} apiUrl={tf.apiUrl} set={(p) => setTf({ ...tf, ...p })} />
                <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addTarget}>추가</Btn></div>
              </>)}
              {modal === "env" && (<>
                {/* 이미 등록된 환경은 목록에서 제외 — 환경 이름은 계획의 참조 키라 중복될 수 없다 */}
                <Field label="환경" hint="이미 등록된 환경은 선택할 수 없습니다"><Select value={ef.env} onChange={(e) => setEf({ ...ef, env: e.target.value })}>{envOpts.map((n) => <option key={n}>{n}</option>)}</Select></Field>
                <EndpointGroup webUrl={ef.webUrl} apiUrl={ef.apiUrl} set={(p) => setEf({ ...ef, ...p })} />
                <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addEnv}>추가</Btn></div>
              </>)}
            </div>
          </div>
        </div></Portal>
      )}

      {/* 참조 무결성 — 실행 계획이 쓰고 있으면 삭제를 막는다 */}
      {block && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBlock(null)}>
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5"><AlertTriangle size={16} className="text-amber-600" /><h3 className="font-semibold text-slate-900">삭제할 수 없습니다</h3></div>
            <div className="space-y-3 p-5 text-sm">
              <div className="text-slate-700"><span className="font-semibold text-amber-700">{block.what}</span>을(를) 참조하는 실행 계획이 <span className="font-semibold text-amber-700">{block.plans.length}건</span> 있습니다.</div>
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {block.plans.map((p) => (<div key={p.id} className="flex items-center gap-2 text-xs"><ClipboardList size={12} className="text-slate-500" /><span className="text-slate-700">{p.name}</span></div>))}
              </div>
              <div className="text-xs text-slate-500">해당 계획의 대상·환경을 먼저 바꾸거나 계획을 삭제한 뒤 다시 시도하세요.</div>
              <div className="flex justify-end pt-1"><Btn kind="primary" onClick={() => setBlock(null)}>확인</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}