import { useState, useEffect } from "react";
import { useApp } from "../common/context.js";
import { C } from "../common/theme.js";
import { VarRefInput } from "../common/VarRefInput.jsx";
import { DatasetPicker } from "../common/DatasetPicker.jsx";
import { Card, PageToolbar, Badge, Btn, Field, Input, Select, Toggle, Seg, Toast, useToast, RunTime, stampPlus, Portal, SEL_CARD, SEL_IDLE, SEL_ROW } from "../common/ui.jsx";
import { Gauge, Plus, X, Save, Smartphone, Cpu, Wifi, Package, Upload, Link2, CheckCircle2, Globe, Monitor, Server, Zap, Activity, AlertTriangle, TrendingUp, Bug, Pencil, ChevronLeft, FileDown, Layers, Code2, Play, ClipboardList } from "lucide-react";
import { NQA_SUBTYPES, NQA_HTTP_METHODS, NQA_AUTH_TYPES, NQA_LOAD_UNITS, NQA_LOAD_SHAPES } from "./data.js";


// 워크스페이스 전환(앱 성능/부하)은 App.jsx 사이드바에서 1회 선택 — 화면별 탭 제거(2026-07).

/* ═══════════ 측정 대상·환경 (부하 대상 SUT · 인증 · 부하 생성 인프라) — 기능 QA 독립 ═══════════ */
const M_LK = { GET: "info", POST: "pass", PUT: "warn", DELETE: "fail", PATCH: "warn" };
/* 엔드포인트에 상관(추출→참조)이 있는가 — 워크로드 모드(비율 혼합/순차 진행) 자동 판정 기준 */
const epCorrelated = (eps) => {
  const produced = new Set((eps || []).flatMap((ep) => (ep.extracts || []).map((x) => x.var).filter(Boolean)));
  if (!produced.size) return false;
  return (eps || []).some((ep) => { const txt = (ep.body || "") + " " + ((ep.headers || []).map((h) => h.v).join(" ")); return (txt.match(/\$\{([a-zA-Z0-9_]+)\}/g) || []).some((m) => produced.has(m.replace(/\$\{|\}/g, ""))); });
};
export function NqaTargetScreen() {
  const { nqaSystems, addNqaSystem, updateNqaSystem, removeNqaSystem, variables, setNavGuard } = useApp();
  const [msg, flash] = useToast();
  const systems = nqaSystems || [];
  const [sel, setSel] = useState(0);
  const sys = systems[sel] || systems[0] || {};
  const [draft, setDraft] = useState({});
  const cfg = { ...sys, ...draft };
  const dirty = Object.keys(draft).length > 0;
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const setCfg = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const saveCfg = () => { if (!(cfg.baseUrl || "").trim()) { flash("Base URL을 입력하세요"); return; } updateNqaSystem(sys.id, draft); setDraft({}); flash("설정 저장됨"); };
  const guardSwitch = (fn) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; setDraft({}); fn(); };
  useEffect(() => { setDraft({}); setChk(null); }, [sys.id]);
  const choose = (i) => guardSwitch(() => setSel(i));
  const [modal, setModal] = useState(false);
  const [nf, setNf] = useState({ name: "", baseUrl: "", protocol: "HTTP/HTTPS" });
  const [chk, setChk] = useState(null);
  const loadgen = cfg.loadgen || {};
  const auth = cfg.auth || {};
  const secretRef = (val, setVal, ph) => <VarRefInput value={val} onChange={setVal} placeholder={ph} />;
  const runCheck = () => { setChk({ s: "run" }); setTimeout(() => { setChk({ s: cfg.baseUrl ? "ok" : "warn", m: (cfg.baseUrl ? "대상 접근 OK" : "⚠ Base URL 없음") }); }, 800); };
  const addSut = () => {
    if (!nf.name.trim()) { flash("대상 이름을 입력하세요"); return; }
    if (!nf.baseUrl.trim()) { flash("Base URL을 입력하세요"); return; }
    guardSwitch(() => { const ns = { id: Date.now(), name: nf.name, subtype: "load", baseUrl: nf.baseUrl, protocol: nf.protocol, loadgen: { tool: "k6" }, auth: { type: "없음" } }; addNqaSystem(ns); setSel(0); setModal(false); flash("부하 대상이 추가되었습니다"); });
  };
  const delSut = (i, sy) => { if (!window.confirm(sy.name + " 대상을 삭제할까요?" + (systems.length <= 1 ? "\n\n마지막 대상입니다 — 삭제하면 부하 테스트를 만들 대상이 없어집니다." : ""))) return; guardSwitch(() => { removeNqaSystem(sy.id); setSel(0); flash(sy.name + " 삭제됨"); }); };
  return (
    <div className="space-y-4">
      <PageToolbar desc="부하 대상(SUT) · 인증 · 부하 생성 인프라" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setNf({ name: "", baseUrl: "", protocol: "HTTP/HTTPS", env: "스테이징" }); setModal(true); }}>부하 대상 추가</Btn>
          {systems.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 대상이 없습니다.</div>}
          {systems.map((sy, i) => (
            <Card key={sy.id} className={"cursor-pointer p-3 " + (sel === i ? SEL_CARD : SEL_IDLE)}>
              <div onClick={() => choose(i)}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{sy.name}</span><div className="flex items-center gap-1.5"><Badge kind="warn">부하</Badge><button onClick={(e) => { e.stopPropagation(); delSut(i, sy); }} className="text-slate-500 hover:text-red-600" title="대상 삭제"><X size={12} /></button></div></div>
                <div className="mt-1 truncate text-xs text-slate-500">{sy.baseUrl}</div>
                <div className="mt-1 text-xs text-slate-500">{sy.protocol}</div>
              </div>
            </Card>
          ))}
        </div>
        <div className="col-span-9 space-y-3">
          {systems.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <Server size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">부하 대상을 먼저 등록하세요</div>
              <div className="mt-1.5 max-w-md text-xs text-slate-500">테스트할 서비스와 Base URL을 등록해야 부하 테스트를 만들고 측정할 수 있습니다.</div>
            </Card>
          ) : (<>
          <Card className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2"><div className="w-56 shrink-0"><Input value={cfg.name || ""} onChange={(e) => setCfg({ name: e.target.value })} className="text-base font-semibold" /></div><span className="shrink-0"><Badge kind="info">{sys.protocol}</Badge></span><span className="truncate text-xs text-slate-500">{cfg.baseUrl}</span></div>
            <div className="flex shrink-0 items-center gap-2">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn icon={Link2} onClick={runCheck}>{chk && chk.s === "run" ? "확인 중…" : "연결 확인"}</Btn><Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
          </Card>
          <div className="text-xs text-slate-500">생성 <span className="text-slate-500">{sys.createdBy || "—"}</span> · {sys.createdAt || "—"} · 수정 <span className="text-slate-500">{sys.updatedBy || "—"}</span> · {sys.updatedAt || "—"}</div>
          {chk && chk.s !== "run" && <div className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-xs " + (chk.s === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{chk.s === "ok" && <CheckCircle2 size={13} />}{chk.m}</div>}
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Server size={15} className="text-sky-600" />대상 시스템</div>
            <div className="grid grid-cols-4 gap-3 items-end">
              <div className="col-span-2"><Field label="대상 URL"><Input value={cfg.baseUrl || ""} onChange={(e) => setCfg({ baseUrl: e.target.value })} placeholder="https://api-stg.example.com" /></Field></div>
              <Field label="프로토콜"><div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700">{cfg.protocol || "HTTP/HTTPS"}</div></Field>
              <div className="flex items-center gap-2 pb-2.5"><Toggle on={!!cfg.tlsSkip} onClick={() => setCfg({ tlsSkip: !cfg.tlsSkip })} /><span className={"text-xs " + (cfg.tlsSkip ? "text-amber-700" : "text-slate-500")}>TLS 검증 생략</span></div>
            </div>
          </Card>
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Link2 size={15} className="text-sky-600" />인증</div>
            <Field label="인증 방식"><div style={{ maxWidth: 260 }}><Select value={auth.type || ""} onChange={(e) => setCfg({ auth: { ...auth, type: e.target.value } })}>{NQA_AUTH_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></div></Field>
            {auth.type === "Bearer 토큰" && <Field label="토큰 (변수 참조)">{secretRef(auth.ref, (val) => setCfg({ auth: { ...auth, ref: val } }), "${stg_token}")}</Field>}
            {auth.type === "API Key" && <div className="grid grid-cols-2 gap-3"><Field label="헤더명"><Input value={auth.keyName || ""} onChange={(e) => setCfg({ auth: { ...auth, keyName: e.target.value } })} placeholder="X-API-Key" /></Field><Field label="키 값 (변수 참조)">{secretRef(auth.ref, (val) => setCfg({ auth: { ...auth, ref: val } }), "${api_key}")}</Field></div>}
            {auth.type === "OAuth 2.0 (client credentials)" && <div className="grid grid-cols-6 gap-3"><div className="col-span-2"><Field label="토큰 URL"><Input value={auth.tokenUrl || ""} onChange={(e) => setCfg({ auth: { ...auth, tokenUrl: e.target.value } })} placeholder="https://auth.../token" /></Field></div><Field label="scope"><Input value={auth.scope || ""} onChange={(e) => setCfg({ auth: { ...auth, scope: e.target.value } })} placeholder="read write" /></Field><Field label="client id"><Input value={auth.clientId || ""} onChange={(e) => setCfg({ auth: { ...auth, clientId: e.target.value } })} /></Field><div className="col-span-2"><Field label="client secret (변수 참조)">{secretRef(auth.ref, (val) => setCfg({ auth: { ...auth, ref: val } }), "${client_secret}")}</Field></div></div>}
          </Card>
          </>)}
        </div>
      </div>
      {modal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900">부하 대상 추가</div>
            <Field label="대상 이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="온마켓 API 부하" /></Field>
            <Field label="Base URL / 게이트웨이"><Input value={nf.baseUrl} onChange={(e) => setNf({ ...nf, baseUrl: e.target.value })} placeholder="https://api-stg.onmarket.io" /></Field>
            <Field label="프로토콜"><div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700">HTTP/HTTPS</div></Field>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={addSut}>추가</Btn></div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ 측정 시나리오 (부하 · 대상 선택 + 워크로드 + 부하 형상) ═══════════ */
const SHAPE_PROFILES = {
  "스테디": [[0, 0], [8, 90], [92, 90], [100, 0]],
  "램프업": [[0, 0], [72, 100], [90, 100], [100, 0]],
  "스파이크": [[0, 22], [44, 22], [50, 100], [56, 22], [100, 22]],
  "스트레스": [[0, 0], [12, 32], [32, 32], [38, 58], [58, 58], [64, 82], [82, 82], [88, 100], [100, 100]],
  "소크": [[0, 0], [9, 68], [94, 68], [100, 0]],
};
function ShapeChart({ cfg }) {
  const c = cfg || {};
  const s = c.shape || "스테디";
  let pts;
  if (s === "램프업") {
    const up = Math.max(0, c.rampUp || 0), hold = Math.max(0, c.sustain || 0), down = Math.max(0, c.rampDown || 0);
    const tot = up + hold + down || 1;
    pts = [[0, 0], [up / tot * 100, 100], [(up + hold) / tot * 100, 100], [100, 0]];
  } else if (s === "스파이크") {
    const peak = c.peak || 1, base = Math.min(peak, Math.max(0, c.baseline || 0));
    const bp = Math.round(base / peak * 100);
    pts = [[0, bp], [34, bp], [42, 100], [58, 100], [66, bp], [100, bp]];
  } else if (s === "스트레스") {
    const n = Math.max(1, Math.min(12, c.steps || 1));
    pts = [[0, 0]];
    for (let i = 1; i <= n; i++) { const y = i / n * 100; pts.push([(i - 1) / n * 100, y], [i / n * 100, y]); }
  } else {
    pts = [[0, 100], [100, 100]];
  }
  const line = pts.map((p) => (+p[0]).toFixed(1) + "," + (38 - p[1] / 100 * 34).toFixed(1)).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-16 w-full rounded-lg bg-slate-50">
      <polygon points={"0,38 " + line + " 100,38"} fill={C.skyBg} opacity="0.45" />
      <polyline points={line} fill="none" stroke={C.sky} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
export function NqaScenarioScreen() {
  const { nqaScenarios, addNqaScenario, updateNqaScenario, removeNqaScenario, nqaSystems, datasets, nqaScnFocus, setNqaScnFocus, setNavGuard, goTo } = useApp();
  const [msg, flash] = useToast();
  const list = nqaScenarios || [];
  const systems = (nqaSystems || []).filter((s) => s.subtype === "load");
  const [sel, setSel] = useState(0);
  useEffect(() => { if (nqaScnFocus != null) { const i = list.findIndex((s) => s.id === nqaScnFocus); if (i >= 0) setSel(i); if (setNqaScnFocus) setNqaScnFocus(null); } }, [nqaScnFocus]);
  const scn = list[sel] || list[0] || {};
  const [draft, setDraft] = useState({});
  const cfg = { ...scn, ...draft };
  const dirty = Object.keys(draft).length > 0;
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const setScn = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const sut = systems.find((s) => s.id === cfg.sutId) || {};
  const endpoints = cfg.endpoints || [];
  const wsum = endpoints.reduce((a, e) => a + (e.weight || 0), 0);
  const selDataset = (datasets || []).find((d) => d.name === cfg.dataset);
  const feedCols = selDataset ? selDataset.columns : [];
  const usedRowVars = [...new Set(endpoints.flatMap((ep) => { const txt = (ep.body || "") + " " + (ep.path || "") + " " + ((ep.headers || []).map((h) => h.v).join(" ")); return (txt.match(/\$\{row\.([a-zA-Z0-9_]+)\}/g) || []).map((x) => x.replace(/\$\{row\.|\}/g, "")); }))];
  const missingCols = usedRowVars.filter((v) => !feedCols.includes(v));
  const producedVars = [...new Set(endpoints.flatMap((ep) => (ep.extracts || []).map((x) => x.var).filter(Boolean)))];
  const usedCorrVars = [...new Set(endpoints.flatMap((ep) => { const txt = (ep.body || "") + " " + (ep.path || "") + " " + ((ep.headers || []).map((h) => h.v).join(" ")); return (txt.match(/\$\{([a-zA-Z0-9_]+)\}/g) || []).map((x) => x.replace(/\$\{|\}/g, "")); }))];
  const missingVars = usedCorrVars.filter((v) => !producedVars.includes(v));
  const hasCorrelation = usedCorrVars.some((v) => producedVars.includes(v));
  const journey = cfg.journey || [];
  const isJourney = hasCorrelation || !!cfg.forceOrder;
  const unit = cfg.unit || "가상 사용자(VU)";
  const isVu = unit.indexOf("VU") >= 0;
  const totalMin = (cfg.rampUp || 0) + (cfg.sustain || 0) + (cfg.rampDown || 0);
  const shapeHint = (NQA_LOAD_SHAPES.find((s) => s.id === cfg.shape) || {}).hint || "";
  const mag = isVu ? "VU" : "RPS";
  const sla = cfg.sla || {};
  const isStress = cfg.shape === "스트레스"; const isSoak = cfg.shape === "소크"; const isSpike = cfg.shape === "스파이크";
  const numv = (v) => (v === "" || v == null ? "" : Number(v));
  const setSla = (patch) => setScn({ sla: { ...(cfg.sla || {}), ...patch } });
  const slaParts = [];
  if (sla.p95) slaParts.push("p95 ≤ " + sla.p95 + "ms");
  if (sla.p99) slaParts.push("p99 ≤ " + sla.p99 + "ms");
  if (sla.errRate !== "" && sla.errRate != null) slaParts.push("에러율 ≤ " + sla.errRate + "%");
  if (sla.minRps) slaParts.push("처리량 ≥ " + sla.minRps + " RPS");
  const slaText = slaParts.length ? slaParts.join(" · ") : "임계 미설정";
  const k6Constant = cfg.shape === "스테디" || cfg.shape === "소크";
  const k6Exec = isVu ? (k6Constant ? "constant-vus" : "ramping-vus") : (k6Constant ? "constant-arrival-rate" : "ramping-arrival-rate");
  const k6Summary = (() => {
    const cap = isVu ? "" : " · 최대 VU " + (cfg.maxVU || 0);
    if (cfg.shape === "스테디") return k6Exec + " · 목표 " + (cfg.peak || 0) + mag + " · " + (cfg.sustain || 0) + "분" + cap;
    if (cfg.shape === "램프업") return k6Exec + " · 3 stages · 피크 " + (cfg.peak || 0) + mag + " (↑" + (cfg.rampUp || 0) + " · 유지" + (cfg.sustain || 0) + " · ↓" + (cfg.rampDown || 0) + "분)" + cap;
    if (cfg.shape === "스파이크") return k6Exec + " · 기저 " + (cfg.baseline || 0) + " → 피크 " + (cfg.peak || 0) + mag + " · " + (cfg.spikeHold || 0) + "초 급증/급감" + cap;
    if (cfg.shape === "스트레스") return k6Exec + " · " + (cfg.steps || 0) + "단계 계단 · " + (cfg.start || 0) + " → " + ((cfg.start || 0) + (cfg.step || 0) * (cfg.steps || 0)) + mag + " (단계당 " + (cfg.stepHold || 0) + "분)" + cap;
    if (cfg.shape === "소크") return k6Exec + " · 목표 " + (cfg.peak || 0) + mag + " · " + (cfg.soakH || 0) + "시간" + cap;
    return k6Exec + cap;
  })();
  const SHAPE_DEF = { "스테디": { peak: 500, sustain: 15 }, "램프업": { peak: 800, rampUp: 5, sustain: 20, rampDown: 3 }, "스파이크": { baseline: 100, peak: 800, spikeHold: 30 }, "스트레스": { start: 100, step: 100, stepHold: 3, steps: 5 }, "소크": { peak: 300, soakH: 2 } };
  const onShape = (shape) => { const d = SHAPE_DEF[shape] || {}; const patch = { shape }; Object.keys(d).forEach((k) => { if (!cfg[k]) patch[k] = d[k]; }); setScn(patch); };
  const saveCfg = () => {
    if (!cfg.sutId) { flash("부하 대상을 선택하세요"); return; }
    if (!endpoints.length) { flash("요청을 1개 이상 추가하세요"); return; }
    if (isJourney && journey.length === 0) { flash("순차 진행에 스텝을 1개 이상 추가하세요"); return; }
    if (cfg.shape === "스트레스") { if (!cfg.start || !cfg.steps) { flash("시작 부하와 단계 수를 입력하세요"); return; } }
    else if (!cfg.peak) { flash("피크 부하를 입력하세요"); return; }
    updateNqaScenario(scn.id, draft); setDraft({}); flash("부하 테스트 저장됨");
  };
  const guardSwitch = (fn) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; setDraft({}); fn(); };
  useEffect(() => { setDraft({}); }, [scn.id]);
  const choose = (i) => guardSwitch(() => setSel(i));
  const [modal, setModal] = useState(false);
  const [nf, setNf] = useState({ name: "", sutId: 0, shape: "스테디" });
  const [epModal, setEpModal] = useState(false);
  const [epEdit, setEpEdit] = useState(null);
  const [ef, setEf] = useState({ method: "GET", path: "", weight: 10, headers: [], body: "", expect: 200, extracts: [] });
  const openModal = () => { setNf({ name: "", sutId: (systems[0] || {}).id || 0, shape: "스테디" }); setModal(true); };
  const create = () => {
    if (!nf.sutId) { flash("부하 대상을 선택하세요"); return; }
    const s0 = systems.find((s) => s.id === nf.sutId) || {};
    const name = nf.name.trim() || (s0.name || "부하") + " 부하";
    const id = Math.max(0, ...list.map((x) => x.id)) + 1;
    const ns = { id, name, sutId: nf.sutId, unit: "가상 사용자(VU)", shape: nf.shape, peak: 500, rampUp: 3, sustain: 15, rampDown: 2, thinkTime: 2, maxVU: 1000, baseline: 100, spikeHold: 30, start: 100, step: 100, steps: 5, stepHold: 3, soakH: 2, sla: { p95: 2000, p99: 3000, errRate: 1.0, minRps: 360}, endpoints: [], dataset: "", forceOrder: false, journey: [] };
    guardSwitch(() => { addNqaScenario(ns); setSel(0); setModal(false); flash(name + " 생성"); });
  };
  const delScn = (i, s) => { if (!window.confirm(s.name + " 시나리오를 삭제할까요?" + (list.length <= 1 ? "\n\n마지막 부하 테스트입니다 — 삭제하면 측정 계획을 만들 수 없습니다." : ""))) return; guardSwitch(() => { removeNqaScenario(s.id); setSel(0); flash(s.name + " 삭제됨"); }); };
  const setJourney = (j) => setScn({ journey: j });
  const addJourneyStep = () => { const e0 = endpoints[0]; if (!e0) { flash("엔드포인트를 먼저 추가하세요"); return; } setJourney([...journey, { method: e0.method, path: e0.path }]); };
  const openEpAdd = () => { setEpEdit(null); setEf({ method: "GET", path: "", weight: 10, headers: [], body: "", expect: 200, extracts: [] }); setEpModal(true); };
  const openEpEdit = (idx) => { const e = endpoints[idx] || {}; setEpEdit(idx); setEf({ method: e.method || "GET", path: e.path || "", weight: e.weight != null ? e.weight : 10, headers: e.headers || [], body: e.body || "", expect: e.expect || 200, extracts: e.extracts || [] }); setEpModal(true); };
  const saveEp = () => { if (!ef.path.trim()) { flash("경로를 입력하세요"); return; } const bodyOk = ["POST", "PUT", "PATCH"].includes(ef.method); const rec = { ...ef, weight: +ef.weight || 0, expect: (typeof ef.expect === "string" ? ef.expect.trim() : ef.expect) || 200, body: bodyOk ? ef.body : "" }; if (epEdit != null) setScn({ endpoints: endpoints.map((e, j) => (j === epEdit ? rec : e)) }); else setScn({ endpoints: [...endpoints, rec] }); setEpModal(false); flash(epEdit != null ? "엔드포인트가 수정되었습니다" : "엔드포인트가 추가되었습니다"); setEpEdit(null); };
  const updEp = (idx, patch) => setScn({ endpoints: endpoints.map((e, j) => (j === idx ? { ...e, ...patch } : e)) });
  const delEp = (idx) => setScn({ endpoints: endpoints.filter((_, j) => j !== idx) });
  const normalize = () => { if (!wsum) return; setScn({ endpoints: endpoints.map((e) => ({ ...e, weight: Math.round((e.weight || 0) / wsum * 100) })) }); flash("비율 100%로 정규화됨"); };
  const updJourney = (i, patch) => setJourney(journey.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const delJourney = (i) => setJourney(journey.filter((_, j) => j !== i));
  const mvJourney = (i, d) => { const j = i + d; if (j < 0 || j >= journey.length) return; const a = journey.slice(); const t = a[i]; a[i] = a[j]; a[j] = t; setJourney(a); };
  return (
    <div className="space-y-4">
      <PageToolbar desc="환경 · 워크로드(비율 혼합/순차 진행) · 부하 형상 · SLA 판정" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={openModal} disabled={systems.length === 0} title={systems.length === 0 ? "부하 대상을 먼저 등록하세요" : ""}>새 부하 테스트</Btn>
          {list.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 부하 테스트가 없습니다.</div>}
          {list.map((s, i) => {
            const su = systems.find((x) => x.id === s.sutId) || {};
            const j = epCorrelated(s.endpoints) || s.forceOrder;
            return (
              <Card key={s.id} className={"cursor-pointer p-3 " + (sel === i ? SEL_CARD : SEL_IDLE)}>
                <div onClick={() => choose(i)}>
                  <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{s.name}</span><button onClick={(e) => { e.stopPropagation(); delScn(i, s); }} className="text-slate-500 hover:text-red-600" title="삭제"><X size={12} /></button></div>
                  <div className="mt-1 flex flex-wrap items-center gap-1"><Badge kind="info">{su.name || "대상 미지정"}</Badge><Badge kind={j ? "active" : "info"}>{j ? "순차 진행" : "비율 혼합"}</Badge></div>
                  <div className="mt-1 text-xs text-slate-500">{s.shape} · 피크 {s.peak} {(s.unit || "").indexOf("VU") >= 0 ? "VU" : "RPS"}</div>
                  <div className="mt-0.5 text-xs text-slate-500">수정 {s.updatedBy || "—"} · {s.updatedAt || "—"}</div>
                </div>
              </Card>
            );
          })}
        </div>
        <div className="col-span-9 space-y-3">
          {list.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <Activity size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">부하 테스트를 먼저 만드세요</div>
              <div className="mt-1.5 max-w-md text-xs text-slate-500">부하 형상(스테디·램프)과 엔드포인트를 정의합니다. 측정 계획이 이것을 골라 실행합니다.</div>
              {systems.length === 0 && <Btn className="mt-3" icon={Server} onClick={() => goTo("nqa-targets")}>부하 대상 등록하러 가기</Btn>}
            </Card>
          ) : (<>
          <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5"><div className="w-64 shrink-0"><Input value={cfg.name || ""} onChange={(e) => setScn({ name: e.target.value })} /></div><span className="shrink-0"><Badge kind="info">{sut.name || "대상 미지정"}</Badge></span><span className="shrink-0"><Badge kind={isJourney ? "active" : "info"}>{isJourney ? "순차 진행" : "비율 혼합"}</Badge></span></div>
            <div className="flex items-center gap-3">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>부하 테스트 저장</Btn></div>
          </Card>

          <div className="flex items-center gap-3 text-xs text-slate-500"><span>생성 <span className="text-slate-500">{cfg.createdBy || "—"}</span> · {cfg.createdAt || "—"}</span><span className="text-slate-500">·</span><span>수정 <span className="text-slate-500">{cfg.updatedBy || "—"}</span> · {cfg.updatedAt || "—"}</span></div>
          <div className="grid grid-cols-2 gap-3 items-start">
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Link2 size={15} className="text-sky-600" />환경 <span className="text-xs font-normal text-slate-500">· 교체 가능</span></div>
            <Select value={cfg.sutId || ""} onChange={(e) => setScn({ sutId: Number(e.target.value) })}><option value="">선택하세요</option>{systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            {sut.baseUrl && <div className="truncate font-mono text-xs text-slate-500">{sut.baseUrl} · {sut.protocol || "-"} · 인증 {(sut.auth || {}).type || "-"}</div>}
          </Card>
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Link2 size={15} className="text-sky-600" />테스트 데이터</div>
            <Field label="데이터셋" hint="컬럼을 ${row.X}로 참조 · 반복마다 행을 순환"><DatasetPicker value={cfg.dataset || ""} onChange={(v) => setScn({ dataset: v })} noneLabel="선택 안 함" /></Field>
            {selDataset && <div className="text-xs text-slate-500">컬럼: <span className="text-slate-700">{selDataset.columns.join(", ")}</span> · {(selDataset.rowCount != null ? selDataset.rowCount : selDataset.rows.length).toLocaleString()}행{selDataset.desc ? " · " + selDataset.desc : ""}</div>}
            {usedRowVars.length > 0 && <div className="text-xs text-slate-500">본문/헤더 참조: <span className="text-slate-700">{usedRowVars.join(", ")}</span>{!cfg.dataset ? <span className="text-amber-700"> · ⚠ 데이터셋 미선택</span> : missingCols.length > 0 && <span className="text-amber-700"> · ⚠ 데이터셋에 없는 컬럼: {missingCols.join(", ")}</span>}</div>}
          </Card>
          </div>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Package size={15} className="text-sky-600" />워크로드 <span className="text-xs font-normal text-slate-500">· {isJourney ? "순차 진행 (정해진 순서)" : "비율 혼합 (무순서·비율)"}</span>{!isJourney && <span className="text-xs" style={{ color: wsum === 100 ? C.ok : C.warn }}>비율 {wsum}%{wsum !== 100 ? " ⚠" : ""}</span>}{!isJourney && endpoints.length > 0 && wsum !== 100 && wsum > 0 && <button onClick={normalize} className="text-xs text-sky-600 hover:underline">100%로 정규화</button>}</div>
              <div className="flex items-center gap-3">{hasCorrelation ? <span className="text-xs text-sky-600">상관 감지 → 순차 진행 자동</span> : <div className="flex items-center gap-2 text-xs text-slate-500"><span>순서 강제</span><Toggle on={!!cfg.forceOrder} onClick={() => setScn({ forceOrder: !cfg.forceOrder })} /></div>}<Btn icon={Plus} onClick={openEpAdd}>요청 추가</Btn></div>
            </div>
            {isJourney && missingVars.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">⚠ 미정의 상관 변수: {missingVars.map((v) => "${" + v + "}").join(", ")} — 요청 추출(extract)로 생산되지 않았습니다.</div>}
            {endpoints.length === 0 ? <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">요청이 없습니다 — 부하를 걸 요청을 추가하세요.</div> : (
              <div className="space-y-1.5">
                {endpoints.map((ep, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <Badge kind={M_LK[ep.method] || "info"}>{ep.method}</Badge>
                    <span className="font-mono text-xs text-slate-700">{ep.path}</span>
                    {ep.body && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">본문</span>}
                    {(ep.extracts && ep.extracts.length > 0) && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-sky-600">추출 {ep.extracts.length}</span>}
                    <div className="flex-1" />
                    <span className="text-xs text-slate-500">→ {ep.expect || 200}</span>
                    {!isJourney && <div className="flex items-center gap-1"><input type="number" value={ep.weight || 0} onChange={(e) => updEp(idx, { weight: Number(e.target.value) })} className="w-14 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-right text-xs text-slate-800 outline-none focus:border-sky-500" /><span className="text-xs text-slate-500">%</span></div>}
                    <button onClick={() => openEpEdit(idx)} className="text-slate-500 hover:text-sky-600" title="수정"><Pencil size={13} /></button>
                    <button onClick={() => delEp(idx)} className="text-slate-500 hover:text-red-600" title="삭제"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            {isJourney && (
              <div className="space-y-1.5 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">진행 순서</div>
                  <Btn icon={Plus} onClick={addJourneyStep}>스텝 추가</Btn>
                </div>
                {journey.length === 0 ? <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">스텝이 없습니다 — 위 요청을 순서대로 배치하세요.</div> : journey.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">{i + 1}</span>
                    <div className="flex-1"><Select value={s.method + " " + s.path} onChange={(e) => { const ep = endpoints.find((x) => x.method + " " + x.path === e.target.value); if (ep) updJourney(i, { method: ep.method, path: ep.path }); }}>{endpoints.map((ep, j) => <option key={j} value={ep.method + " " + ep.path}>{ep.method} {ep.path}</option>)}</Select></div>
                    <button onClick={() => mvJourney(i, -1)} className="text-xs text-slate-500 hover:text-slate-700">▲</button><button onClick={() => mvJourney(i, 1)} className="text-xs text-slate-500 hover:text-slate-700">▼</button>
                    <button onClick={() => delJourney(i)} className="text-slate-500 hover:text-red-600"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><TrendingUp size={15} className="text-sky-600" />부하 형상</div>
              <Seg options={NQA_LOAD_UNITS} value={unit} onChange={(v) => setScn({ unit: v })} />
            </div>
            <div className="grid grid-cols-3 gap-3 items-start">
              <Field label="부하 유형"><Select value={cfg.shape || "스테디"} onChange={(e) => onShape(e.target.value)}>{NQA_LOAD_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
              {isVu
                ? <Field label="생각시간(초)"><Input type="number" value={cfg.thinkTime || 0} onChange={(e) => setScn({ thinkTime: Number(e.target.value) })} /></Field>
                : <Field label="최대 VU" hint="도착률 유지에 필요한 VU 상한 · 부족하면 목표 도착률 미달"><Input type="number" value={cfg.maxVU || 0} onChange={(e) => setScn({ maxVU: Number(e.target.value) })} /></Field>}
              <div className="text-right"><div className="text-xs font-semibold text-slate-500 mb-1.5">부하 생성기</div><div className="text-sm text-slate-800">전용 VM 1대</div><div className="text-xs text-slate-500">k6는 단일 프로세스로 전 코어를 씁니다</div></div>
            </div>
            {shapeHint && <div className="text-xs text-slate-500">{shapeHint}</div>}
            <ShapeChart cfg={cfg} />
            {cfg.shape === "스테디" && <div className="grid grid-cols-2 gap-2"><Field label={"목표 " + mag}><Input type="number" value={cfg.peak || 0} onChange={(e) => setScn({ peak: Number(e.target.value) })} /></Field><Field label="지속(분)"><Input type="number" value={cfg.sustain || 0} onChange={(e) => setScn({ sustain: Number(e.target.value) })} /></Field></div>}
            {cfg.shape === "램프업" && <div className="grid grid-cols-4 gap-2"><Field label={"피크 " + mag}><Input type="number" value={cfg.peak || 0} onChange={(e) => setScn({ peak: Number(e.target.value) })} /></Field><Field label="램프업(분)"><Input type="number" value={cfg.rampUp || 0} onChange={(e) => setScn({ rampUp: Number(e.target.value) })} /></Field><Field label="유지(분)"><Input type="number" value={cfg.sustain || 0} onChange={(e) => setScn({ sustain: Number(e.target.value) })} /></Field><Field label="램프다운(분)"><Input type="number" value={cfg.rampDown || 0} onChange={(e) => setScn({ rampDown: Number(e.target.value) })} /></Field></div>}
            {cfg.shape === "스파이크" && <div className="grid grid-cols-3 gap-2"><Field label={"기저 " + mag}><Input type="number" value={cfg.baseline || 0} onChange={(e) => setScn({ baseline: Number(e.target.value) })} /></Field><Field label={"피크 " + mag}><Input type="number" value={cfg.peak || 0} onChange={(e) => setScn({ peak: Number(e.target.value) })} /></Field><Field label="피크 유지(초)"><Input type="number" value={cfg.spikeHold || 0} onChange={(e) => setScn({ spikeHold: Number(e.target.value) })} /></Field></div>}
            {cfg.shape === "스트레스" && <div className="grid grid-cols-4 gap-2"><Field label={"시작 " + mag}><Input type="number" value={cfg.start || 0} onChange={(e) => setScn({ start: Number(e.target.value) })} /></Field><Field label={"단계 증가 " + mag}><Input type="number" value={cfg.step || 0} onChange={(e) => setScn({ step: Number(e.target.value) })} /></Field><Field label="단계 유지(분)"><Input type="number" value={cfg.stepHold || 0} onChange={(e) => setScn({ stepHold: Number(e.target.value) })} /></Field><Field label="단계 수"><Input type="number" value={cfg.steps || 0} onChange={(e) => setScn({ steps: Number(e.target.value) })} /></Field></div>}
            {cfg.shape === "소크" && <div className="grid grid-cols-2 gap-2"><Field label={"목표 " + mag}><Input type="number" value={cfg.peak || 0} onChange={(e) => setScn({ peak: Number(e.target.value) })} /></Field><Field label="지속(시간)"><Input type="number" value={cfg.soakH || 0} onChange={(e) => setScn({ soakH: Number(e.target.value) })} /></Field></div>}
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500"><span className="text-slate-700">→ k6:</span> {k6Summary} · {isVu ? "닫힌 모델" : "열린 모델"}<span className="text-slate-500"> · 전용 VM 1대</span></div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Activity size={15} className="text-sky-600" />SLA 판정 임계</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="p95 응답 ≤ (ms)"><Input type="number" value={sla.p95 ?? ""} onChange={(e) => setSla({ p95: numv(e.target.value) })} /></Field>
              <Field label="p99 응답 ≤ (ms)" hint="비우면 미적용"><Input type="number" value={sla.p99 ?? ""} onChange={(e) => setSla({ p99: numv(e.target.value) })} /></Field>
              <Field label="에러율 ≤ (%)"><Input type="number" value={sla.errRate ?? ""} onChange={(e) => setSla({ errRate: numv(e.target.value) })} /></Field>
              <Field label="최소 처리량 ≥ (RPS)" hint="비우면 미적용"><Input type="number" value={sla.minRps ?? ""} onChange={(e) => setSla({ minRps: numv(e.target.value) })} /></Field>
            </div>
            {(isStress || isSoak || isSpike) && <div className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500">
              {isStress ? "용량(포화점)" : isSoak ? "성능 드리프트" : "복구 시간"}은 k6 요약에 없는 <strong>시계열 파생값</strong>이라 자동 판정하지 않습니다 — 결과에서 사람이 읽습니다.
            </div>}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">합격 조건: <span className="text-emerald-800">{slaText}</span> 를 모두 만족</div>
          </Card>
          </>)}
        </div>
      </div>
      {modal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-300 bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900">새 부하 테스트</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="이름 (비우면 자동)"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="테스트 이름" /></Field>
              <Field label="부하 대상"><Select value={nf.sutId || ""} onChange={(e) => setNf({ ...nf, sutId: Number(e.target.value) })}><option value="">선택하세요</option>{systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            </div>
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500">생성 후 &quot;워크로드&quot;에서 요청·순서·비율을, &quot;부하 형상&quot;에서 부하량을 설정합니다.</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={create}>생성</Btn></div>
          </div>
        </div></Portal>
      )}
      {epModal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEpModal(false)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-300 bg-white p-5 space-y-3" style={{ maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900">{epEdit != null ? "요청 수정" : "요청 추가"}</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="메서드"><Select value={ef.method} onChange={(e) => setEf({ ...ef, method: e.target.value })}>{NQA_HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
              <div className={isJourney ? "col-span-3" : "col-span-2"}><Field label="경로"><Input value={ef.path} onChange={(e) => setEf({ ...ef, path: e.target.value })} placeholder="/v1/plans" /></Field></div>
              {!isJourney && <Field label="비율(%)"><Input type="number" value={ef.weight} onChange={(e) => setEf({ ...ef, weight: e.target.value })} /></Field>}
            </div>
            <Field label="요청 헤더">
              {(ef.headers || []).map((h, i) => (<div key={i} className="mb-1.5 flex gap-2"><Input value={h.k} onChange={(e) => setEf({ ...ef, headers: ef.headers.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} placeholder="Header" /><Input value={h.v} onChange={(e) => setEf({ ...ef, headers: ef.headers.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })} placeholder="Value (예: Bearer ${token})" /><button onClick={() => setEf({ ...ef, headers: ef.headers.filter((_, j) => j !== i) })} className="px-1 text-slate-500 hover:text-red-600"><X size={14} /></button></div>))}
              <button onClick={() => setEf({ ...ef, headers: [...(ef.headers || []), { k: "", v: "" }] })} className="text-xs text-sky-600">+ 헤더 추가</button>
            </Field>
            {["POST", "PUT", "PATCH"].includes(ef.method) && <Field label="요청 본문 (Body) · 파라미터화 지원"><textarea value={ef.body} onChange={(e) => setEf({ ...ef, body: e.target.value })} rows={3} className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-sky-500" placeholder={'{ "phone": "${row.phone}" }'} /></Field>}
            <Field label="응답 추출 (상관)" hint="JSONPath로 값 추출 → 다음 요청에 재사용">
              {(ef.extracts || []).map((x, i) => (<div key={i} className="mb-1.5 flex gap-2"><Input value={x.var} onChange={(e) => setEf({ ...ef, extracts: ef.extracts.map((y, j) => (j === i ? { ...y, var: e.target.value } : y)) })} placeholder="변수명 (token)" /><Input value={x.path} onChange={(e) => setEf({ ...ef, extracts: ef.extracts.map((y, j) => (j === i ? { ...y, path: e.target.value } : y)) })} placeholder="$.data.token" /><button onClick={() => setEf({ ...ef, extracts: ef.extracts.filter((_, j) => j !== i) })} className="px-1 text-slate-500 hover:text-red-600"><X size={14} /></button></div>))}
              <button onClick={() => setEf({ ...ef, extracts: [...(ef.extracts || []), { var: "", path: "" }] })} className="text-xs text-sky-600">+ 추출 추가</button>
            </Field>
            <Field label="기대 상태코드"><Input value={ef.expect} onChange={(e) => setEf({ ...ef, expect: e.target.value })} placeholder="200 또는 200,201" className="w-40" /></Field>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => { setEpModal(false); setEpEdit(null); }}>취소</Btn><Btn kind="primary" icon={epEdit != null ? Save : Plus} onClick={saveEp}>{epEdit != null ? "저장" : "추가"}</Btn></div>
          </div>
        </div></Portal>
      )}
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ 측정 실행 · 실행 이력 · 성능 추이 ═══════════ */
const nqaNow = () => { const d = new Date(); const z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes()); };
const durMinOf = (s) => { if (s.shape === "소크") return Math.round((s.soakH || 0) * 60) || 60; if (s.shape === "스트레스") return ((s.steps || 0) * (s.stepHold || 0)) || 15; if (s.shape === "스테디") return (s.sustain || 0) || 15; return ((s.rampUp || 0) + (s.sustain || 0) + (s.rampDown || 0)) || 10; };
const SIM_MS = 54000;

const nqaPhaseOf = (s, pr) => {
  const sh = s.shape;
  if (sh === "스트레스") { const n = Math.min(s.steps || 1, Math.floor(pr * (s.steps || 1)) + 1); return "단계 " + n + "/" + (s.steps || 1); }
  if (sh === "소크") return pr < 0.05 ? "워밍업" : "장시간 유지";
  if (sh === "스테디") return pr < 0.05 ? "워밍업" : "목표 부하 유지";
  const tot = (s.rampUp || 0) + (s.sustain || 0) + (s.rampDown || 0) || 1;
  const up = (s.rampUp || 0) / tot; const dn = 1 - (s.rampDown || 0) / tot;
  if (sh === "스파이크") return pr < up ? "기저 부하" : pr > dn ? "복구" : "스파이크";
  return pr < up ? "램프업" : pr > dn ? "램프다운" : "목표 부하 유지";
};
const nzh = (i) => { const x = Math.sin((i + 1) * 127.1) * 43758.5453; return x - Math.floor(x); };
const nqaSeries = (r, s, N, curPArg) => {
  const t = r.result || r.target || {};
  const curP = curPArg != null ? curPArg : Math.max(0, Math.min(1, (Date.now() - (r.simStart || Date.now())) / SIM_MS));
  const isVu = (s.unit || "").indexOf("VU") >= 0;
  const peak = s.shape === "스트레스" ? (s.start || 0) + (s.step || 0) * (s.steps || 0) : (s.peak || 0);
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const f = curP * (i / N); const reach = Math.min(1, f / 0.15); const j = 0.9 + nzh(i) * 0.2;
    pts.push({
      rps: Math.max(0, Math.round((t.rps || 0) * reach * j)),
      errPct: Math.max(0, +(((t.errRate || 0) * reach) * (0.5 + nzh(i * 3))).toFixed(2)),
      p50: Math.max(0, Math.round((t.p50 || 0) * reach * (0.85 + nzh(i * 11) * 0.3))),
      p95: Math.max(0, Math.round((t.p95 || 0) * reach * (0.85 + nzh(i * 7) * 0.3))),
      p99: Math.max(0, Math.round((t.p99 || 0) * reach * (0.8 + nzh(i * 13) * 0.5))),
      vu: Math.max(0, Math.round((isVu ? peak : (s.maxVU || 0) * 0.7) * reach * j)),
    });
  }
  return pts;
};
const NQA_ERR_KINDS = [
  { type: "HTTP 500", status: 500, msg: "Internal Server Error", body: '{ "error": "InternalServerError", "traceId": "a1b2c3d4" }' },
  { type: "HTTP 503", status: 503, msg: "Service Unavailable", body: '{ "error": "ServiceUnavailable" }' },
  { type: "HTTP 504", status: 504, msg: "Gateway Timeout", body: "upstream request timed out" },
  { type: "타임아웃", status: "—", msg: "request timeout (30s 초과)", body: "" },
  { type: "check 실패", status: 200, msg: "검증 실패 — 응답에 data.id 없음", body: '{ "data": null }' },
];
const nqaErrors = (r, s, curPArg) => {
  const t = r.result || r.target || {};
  const curP = curPArg != null ? curPArg : Math.max(0, Math.min(1, (Date.now() - (r.simStart || Date.now())) / SIM_MS));
  const eps = (s.endpoints || []).filter((e) => e.path);
  const durMin = (r.durationSec || 0) / 60;
  const rate = t.errRate || 0;
  const cadence = rate > 0 ? durMin / (rate * 6) : 0;
  const count = cadence > 0 ? Math.min(24, Math.floor((durMin * curP) / cadence)) : 0;
  const arr = [];
  for (let i = count - 1; i >= 0; i--) {
    const ep = eps[Math.floor(nzh(i * 5) * eps.length)] || {};
    const k = NQA_ERR_KINDS[Math.floor(nzh(i * 9) * NQA_ERR_KINDS.length)] || NQA_ERR_KINDS[0];
    const tsec = Math.floor((i + 1) * cadence * 60); const hh = Math.floor(tsec / 3600); const mm = Math.floor((tsec % 3600) / 60); const ss = tsec % 60;
    const at = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    arr.push({ i, at, method: ep.method || "GET", path: ep.path || "/", type: k.type, status: k.status, respStatus: k.status === "—" ? "응답 없음" : "HTTP " + k.status, msg: k.msg, respBody: k.body, reqBody: ep.body || "" });
  }
  return arr;
};
function TSPanel({ title, points, pick, color, unit }) {
  const vals = points.map(pick); const max = Math.max(1, ...vals); const W = 300, H = 80, n = vals.length;
  const px = (i) => (n <= 1 ? 0 : (i / (n - 1)) * W); const py = (v) => H - (v / max) * H;
  const line = vals.map((v, i) => (i === 0 ? "M" : "L") + px(i).toFixed(1) + " " + py(v).toFixed(1)).join(" ");
  const area = "M0 " + H + " " + vals.map((v, i) => "L" + px(i).toFixed(1) + " " + py(v).toFixed(1)).join(" ") + " L" + W + " " + H + " Z";
  const last = vals[vals.length - 1] || 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">{title}</div><div className="text-sm font-semibold" style={{ color }}>{last.toLocaleString()}<span className="text-xs text-slate-500"> {unit}</span></div></div>
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" className="mt-2 h-20 w-full">
        <path d={area} fill={color} opacity="0.15" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
function TSMulti({ title, points, series, unit }) {
  const max = Math.max(1, ...series.flatMap((sr) => points.map(sr.pick)));
  const W = 300, H = 80, n = points.length;
  const px = (i) => (n <= 1 ? 0 : (i / (n - 1)) * W); const py = (v) => H - (v / max) * H;
  const lineOf = (pick) => points.map((d, i) => (i === 0 ? "M" : "L") + px(i).toFixed(1) + " " + py(pick(d)).toFixed(1)).join(" ");
  const lastP = points[points.length - 1] || {};
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-700">{title} <span className="font-normal text-slate-500">({unit})</span></div>
        <div className="flex items-center gap-2 text-xs">{series.map((sr, k) => <span key={k} className="flex items-center gap-1" style={{ color: sr.color }}><span className="inline-block h-1.5 w-2 rounded-sm" style={{ background: sr.color }} />{sr.label} {Math.round(sr.pick(lastP) || 0).toLocaleString()}</span>)}</div>
      </div>
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" className="mt-2 h-20 w-full">
        {series.map((sr, k) => <path key={k} d={lineOf(sr.pick)} fill="none" stroke={sr.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
  );
}
/* 목표 부하 미달 임계(초안) — 순간 스파이크로 몇 건 밀리는 것까지 미달로 보지 않는다. */
export const SHORTFALL_PCT = 1;
export const VK = (v) => (v === "합격" ? "pass" : v === "불합격" ? "fail" : "warn");
export const GATE_OF = (v) => (v === "합격" ? "통과" : v === "불합격" ? "실패" : "판정 없음");
/* 회차에 부하 조건을 스탬프한다 — 시나리오는 나중에 바뀐다(F5·F7). */
/* 생성기를 고치면 같은 시나리오가 다른 스크립트를 낸다 — 버전을 회차에 남긴다(F8 러너 버전과 같은 원칙) */
export const SCRIPT_GEN = "1.4.0";
/* 생성 스크립트 지문 — 엔드포인트·본문까지 반영한다. cond 스냅샷이 못 덮는 부분을 이것이 덮는다. */
export const scriptSigOf = (scn) => {
  const src = JSON.stringify([scn.unit, scn.shape, scn.peak, scn.maxVU, scn.thinkTime, scn.dataset, scn.endpoints, scn.journey]);
  let h = 0; for (let i = 0; i < src.length; i++) { h = ((h << 5) - h + src.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
};
export const condOf = (scn) => ({ unit: scn.unit, shape: scn.shape, peak: scn.peak, maxVU: scn.maxVU, gen: SCRIPT_GEN, sig: scriptSigOf(scn) });
const simResult = (scn, sla) => {
  const isVu = (scn.unit || "").indexOf("VU") >= 0;
  const peak = scn.peak || 500;
  const rps = Math.round((isVu ? peak * 0.8 : peak) * (0.9 + Math.random() * 0.15));
  const p95 = Math.round((sla.p95 || 1500) * (0.7 + Math.random() * 0.55));
  const p50 = Math.round(p95 * (0.35 + Math.random() * 0.1));
  const p99 = Math.round(p95 * (1.4 + Math.random() * 0.3));
  const errRate = +(Math.random() * 1.6).toFixed(2);
  const durMin = durMinOf(scn);
  const totalReq = Math.round(rps * durMin * 60);
  const breaches = [];
  if (sla.p95 && p95 > sla.p95) breaches.push("p95 " + p95 + " > " + sla.p95 + "ms");
  if (sla.p99 && p99 > sla.p99) breaches.push("p99 " + p99 + " > " + sla.p99 + "ms");
  if (sla.errRate != null && sla.errRate !== "" && errRate > sla.errRate) breaches.push("에러율 " + errRate + " > " + sla.errRate + "%");
  if (sla.minRps && rps < sla.minRps) breaches.push("처리량 " + rps + " < " + sla.minRps + " RPS");
  /* 🔑 목표 부하 미달 — RPS 목표(개방형 executor)에서만 발생한다.
     VU 단위는 우리가 띄우는 값이라 미달 개념이 없다.
     스트레스(계단)도 제외한다 — 포화점을 찾는 것이 목적이라 목표 미달이 곧 결과다. */
  const short = (!isVu && scn.shape !== "스트레스") ? Math.max(0, +(((peak - rps) / peak) * 100).toFixed(1)) : 0;
  const shortfall = short > SHORTFALL_PCT ? short : 0;
  /* 🔑 한 방향으로만 유효하다 — 더 적게 쐈는데도 무너졌으면 불합격은 유효하다.
     반대로 합격은 무효다: 낮은 부하에서 좋았을 뿐 목표를 검증한 적이 없다. */
  const verdict = breaches.length ? "불합격" : (shortfall ? "판정 없음" : "합격");
  return { rps, errRate, p50, p95, p99, throughput: rps, totalReq, verdict, gateResult: GATE_OF(verdict), breaches, target: peak, shortfall, cond: condOf(scn) };
};

export function NqaRunScreen({ nav }) {
  const { nqaScenarios, nqaSystems, nqaRuns, addNqaRun, updateNqaRun, removeNqaRun, currentUser, defects, addDefect, jiraConfig, notify, goTo } = useApp();
  const [msg, flash] = useToast();
  /* 🔑 실행 단위는 부하 테스트(시나리오)다 — 별도 계획 계층을 두지 않는다. */
  const scns = nqaScenarios || [];
  const [scnId, setScnId] = useState((scns[0] || {}).id || 0);
  const scn = scns.find((x) => x.id === scnId) || scns[0] || {};
  const sut = (nqaSystems || []).find((s) => s.id === scn.sutId) || {};
  const sla = scn.sla || {};
  const magR = (scn.unit || "").indexOf("VU") >= 0 ? "VU" : "RPS";
  const peakR = scn.shape === "스트레스" ? (scn.start || 0) + (scn.step || 0) * (scn.steps || 0) : (scn.peak || 0);
  const modeR = (epCorrelated(scn.endpoints) || scn.forceOrder) ? "순차 진행" : "비율 혼합";
  const slaBits = [];
  if (sla.p95) slaBits.push("p95 ≤ " + sla.p95 + "ms");
  if (sla.p99) slaBits.push("p99 ≤ " + sla.p99 + "ms");
  if (sla.errRate != null && sla.errRate !== "") slaBits.push("에러율 ≤ " + sla.errRate + "%");
  if (sla.minRps) slaBits.push("처리량 ≥ " + sla.minRps + " RPS");
  const [, setTick] = useState(0);
  const [resv, setResv] = useState(false);
  const [when, setWhen] = useState("");
  const [obsId, setObsId] = useState(null);
  const [errRow, setErrRow] = useState(null);
  useEffect(() => {
    const t = setInterval(() => {
      setTick((x) => x + 1);
      const runs = nqaRuns || [];
      runs.forEach((r) => { if (r.status === "실행중" && r.simStart && Date.now() - r.simStart >= SIM_MS) { updateNqaRun(r.id, { status: "완료", endedAt: stampPlus(r.durationSec || 0), result: r.target }); const p = (nqaScenarios || []).find((x) => x.id === r.scnId) || {}; if (notify) notify({ icon: "play", text: "부하 테스트 완료 · " + (p.name || "부하") + " · " + (r.target || {}).verdict, to: { domain: "NQA", view: "nqa-history" } }); } });
      /* 🔑 부하 생성기는 전용 VM 1대다 — 두 부하가 한 머신에서 겹치면 양쪽 측정이 다 흔들린다.
         워커 산술이 아니라 '실행 중이면 대기'다 (PQA P4와 같은 모델). */
      let busy = runs.some((r) => r.status === "실행중" && !(r.simStart && Date.now() - r.simStart >= SIM_MS));
      runs.filter((r) => r.status === "대기").sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0)).forEach((r) => { if (!busy) { updateNqaRun(r.id, { status: "실행중", startedAt: nqaNow(), simStart: Date.now() }); busy = true; } });
    }, 1000);
    return () => clearInterval(t);
  }, [nqaRuns]);
  const runningRuns = (nqaRuns || []).filter((r) => r.status === "실행중");
  const queued = (nqaRuns || []).filter((r) => r.status === "대기").slice().sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
  const anyRunning = runningRuns.length > 0;
  /* 🔑 같은 SUT에 두 부하가 겹치면 서로의 부하를 자기 결과로 읽는다 — 시나리오가 아니라 대상 기준으로 막는다.
     읽기·쓰기를 섞고 싶으면 한 시나리오 안에서 엔드포인트 가중치로 한다(이미 지원). */
  const sutOf = (id) => (scns.find((x) => x.id === id) || {}).sutId;
  const busySut = (r) => sutOf(r.scnId) != null && sutOf(r.scnId) === scn.sutId;
  const thisRunning = runningRuns.some(busySut) || queued.some(busySut);
  const sameSutOther = (runningRuns.concat(queued)).find((r) => busySut(r) && r.scnId !== scnId);
  const prog = (r) => Math.max(0, Math.min(1, (Date.now() - (r.simStart || Date.now())) / SIM_MS));
  const fmtDur = (m) => (m >= 60 ? Math.round((m / 60) * 10) / 10 + "시간" : Math.round(m) + "분");
  const runNow = () => {
    if (!scn.id) { flash("실행할 부하 테스트를 선택하세요"); return; }
    if (thisRunning) { flash(sameSutOther ? "같은 대상에 " + (scns.find((x) => x.id === sameSutOther.scnId) || {}).name + " 이(가) 진행 중입니다 — 부하가 섞이면 양쪽 결과가 무의미해집니다" : "이미 실행 중이거나 대기 중입니다"); return; }
    const target = simResult(scn, sla);
    const dm = durMinOf(scn);
    const fits = !anyRunning;
    const runId = "RUN-" + nqaNow().slice(5, 16).replace(/[- :]/g, "") + "-" + Math.floor(Math.random() * 90 + 10);
    const no = (nqaRuns || []).filter((r) => r.scnId === scn.id).length + 1;
    addNqaRun({ id: runId, scnId: scn.id, no, startedAt: fits ? nqaNow() : "", status: fits ? "실행중" : "대기", by: currentUser || "이민준", durationSec: dm * 60, simStart: fits ? Date.now() : null, target, queuedAt: Date.now() });
    flash(fits ? "실행 시작 · " + (scn.name || "부하 테스트") : "다른 부하가 실행 중입니다 — 대기열에 추가됨");
  };
  const abort = (r) => { if (!window.confirm("실행을 중단할까요?")) return; removeNqaRun(r.id); const nx = queued[0]; if (nx) updateNqaRun(nx.id, { status: "실행중", startedAt: nqaNow(), simStart: Date.now() }); flash("실행 중단됨"); };
  const padz = (n) => String(n).padStart(2, "0");
  const fmtDt = (d) => d.getFullYear() + "-" + padz(d.getMonth() + 1) + "-" + padz(d.getDate()) + "T" + padz(d.getHours()) + ":" + padz(d.getMinutes());
  const presetTonight = () => { const d = new Date(); d.setHours(22, 0, 0, 0); return fmtDt(d); };
  const presetTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(2, 0, 0, 0); return fmtDt(d); };
  const presetPlus1 = () => { const d = new Date(Date.now() + 3600000); d.setSeconds(0, 0); return fmtDt(d); };
  const scheduled = (nqaRuns || []).filter((r) => r.status === "예약").slice().sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || ""));
  const openResv = () => { setWhen(presetTonight()); setResv(true); };
  const reserve = () => {
    if (!scn.id) { flash("부하 테스트를 선택하세요"); return; }
    if (!when) { flash("실행 시각을 지정하세요"); return; }
    const at = when.replace("T", " ");
    addNqaRun({ id: "RUN-" + when.replace(/[-T:]/g, "").slice(0, 12), scnId: scn.id, no: (nqaRuns || []).filter((r) => r.scnId === scn.id).length + 1, status: "예약", scheduledAt: at, by: currentUser || "이민준" });
    setResv(false); flash("예약됨 · " + at);
  };
  const promote = (r) => { const p = scns.find((x) => x.id === r.scnId) || {}; const target = simResult(p, p.sla || {}); const fits = !anyRunning; updateNqaRun(r.id, { status: fits ? "실행중" : "대기", startedAt: fits ? nqaNow() : "", durationSec: durMinOf(s) * 60, simStart: fits ? Date.now() : null, target, queuedAt: Date.now() }); flash(fits ? "실행 시작 · " + (p.name || "부하 테스트") : "러너 여유 없음 — 대기열에 추가됨"); };
  const cancelResv = (r) => { removeNqaRun(r.id); flash("예약 취소됨"); };
  if (!scns.length) return (
    <div className="space-y-4">
      <PageToolbar desc="부하 주입 · 백그라운드 실행" />
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <Play size={26} className="text-slate-400" />
        <div className="mt-3 text-sm font-medium text-slate-700">실행할 부하 테스트가 없습니다</div>
        <div className="mt-1.5 max-w-md text-xs text-slate-500">부하 테스트를 만들고 활성화해야 부하를 주입할 수 있습니다.</div>
        <Btn className="mt-3" icon={Code2} onClick={() => goTo("nqa-scenarios")}>부하 테스트 만들러 가기</Btn>
      </Card>
    </div>
  );
  return (
    <div className="space-y-4">
      <PageToolbar desc="부하 주입 · 백그라운드 실행 + 실시간 관측(트래픽·오류·응답시간·VU)" />
      {/* 🔑 실행 화면의 좌우 비율은 네 도메인이 같은 뜻으로 읽히게 맞춘다 —
          좌측 "무엇을 실행할 것인가 · 대기열", 우측 "지금 무슨 일이 벌어지는가".
          LQA·FQA 는 6:6, PQA·NQA 는 5:7 이다. 부하는 생성기가 하나뿐이라
          좌측에 고를 큐가 없고(예약만 있다) 우측 관측 지표가 넓어야 해서 5:7 로 둔다. */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 space-y-3">
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Gauge size={15} className="text-sky-600" />실행할 부하 테스트</div>
            <Field label="부하 테스트"><Select value={scnId} onChange={(e) => setScnId(Number(e.target.value))}>{scns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <div className="rounded-lg bg-slate-100 p-3 text-xs space-y-2">
              <div><div className="text-slate-500">대상</div><div className="text-slate-800">{sut.name || "-"}{sut.baseUrl && <span className="font-mono text-slate-500"> · {sut.baseUrl}</span>}</div></div>
              <div><div className="text-slate-500">워크로드</div><div className="text-slate-700">{modeR} · 요청 {(scn.endpoints || []).length}개{scn.dataset ? " · 데이터셋 " + scn.dataset : ""}</div></div>
              <div><div className="text-slate-500">부하 형상</div><div className="text-slate-700">{scn.shape || "-"} · 목표 {peakR.toLocaleString()} {magR} · 예상 소요 {fmtDur(durMinOf(scn))}</div></div>
              <div><div className="text-slate-500">합격 기준</div><div className="text-emerald-700">{slaBits.join(" · ") || "미설정"}</div></div>
            </div>
            <div className="flex gap-2"><Btn kind="primary" icon={Gauge} onClick={runNow} disabled={thisRunning}>{thisRunning ? sameSutOther ? "대상 사용 중" : "실행 중…" : "즉시 실행"}</Btn><Btn icon={Zap} onClick={openResv}>예약 실행</Btn></div>
          </Card>
          {scheduled.length > 0 && (
            <Card className="p-4 space-y-2">
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Zap size={15} className="text-sky-600" />예약된 실행 <span className="text-xs font-normal text-slate-500">· {scheduled.length}건</span></div>
              {scheduled.map((r) => { const p = scns.find((x) => x.id === r.scnId) || {}; return (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <Badge kind="warn">예약</Badge>
                  <div className="min-w-0 flex-1"><div className="truncate text-slate-700">{p.name || "-"}</div><div className="text-xs text-slate-500">{r.scheduledAt}</div></div>
                  <button onClick={() => promote(r)} className="text-xs text-sky-600 hover:underline">지금 실행</button>
                  <button onClick={() => cancelResv(r)} className="text-slate-500 hover:text-red-600" title="예약 취소"><X size={13} /></button>
                </div>
              ); })}
            </Card>
          )}
        </div>
        <div className="col-span-7 space-y-3">
          <Card className="p-3">
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">부하 생성기</span><span className={anyRunning ? "text-amber-700" : "text-slate-700"}>{anyRunning ? "사용 중 — 한 번에 하나만 실행합니다" : "대기 중"}</span></div>
            {queued.length > 0 && <div className="mt-1.5 text-xs text-amber-700">대기 {queued.length}건 — 러너 여유가 생기면 자동 시작됩니다.</div>}
          </Card>
          {runningRuns.length === 0 && queued.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><Activity size={22} className="text-sky-600" /></div><div className="text-sm text-slate-500">부하 테스트를 선택하고 &quot;즉시 실행&quot;을 누르면 백그라운드로 실행됩니다.</div></Card>
          ) : (<>
            {runningRuns.map((r) => {
              const p = scns.find((x) => x.id === r.scnId) || {};
              const s = p;
              const su = (nqaSystems || []).find((x) => x.id === p.sutId) || {};
              const pr = prog(r); const dm = (r.durationSec || 0) / 60; const el = pr * dm; const t = r.target || {}; const rsla = p.sla || {};
              const isVuModel = (s.unit || "").indexOf("VU") >= 0;
              const peakLoad = s.shape === "스트레스" ? (s.start || 0) + (s.step || 0) * (s.steps || 0) : (s.peak || 0);
              const reach = Math.min(1, pr / 0.15);
              const phase = nqaPhaseOf(s, pr);
              const p50Now = Math.round((t.p50 || 0) * reach); const p95Now = Math.round((t.p95 || 0) * reach); const p99Now = Math.round((t.p99 || 0) * reach);
              const errNow = +(((t.errRate || 0) * reach).toFixed(2)); const checkPass = Math.max(0, 100 - errNow).toFixed(1);
              const iters = Math.round((t.totalReq || 0) * pr);
              const maxAlloc = s.maxVU || 0; const avgLat = Math.max(0.05, (p50Now || 300) / 1000); const curLoad = Math.round(peakLoad * reach);
              const reqVU = isVuModel ? curLoad : Math.ceil(curLoad * avgLat);
              const vuLimited = !isVuModel && maxAlloc > 0 && reqVU > maxAlloc;
              const activeVU = isVuModel ? curLoad : Math.min(maxAlloc || reqVU, reqVU);
              const vuCap = isVuModel ? peakLoad : maxAlloc;
              const rpsNow = vuLimited ? Math.round(maxAlloc / avgLat) : Math.round((t.rps || 0) * reach);
              return (
                <Card key={r.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between"><div className="text-sm font-semibold text-slate-800">{p.name || "부하"} · <span className="text-sky-600">실행 중</span></div><div className="flex items-center gap-2"><Badge kind="info">{phase}</Badge><Badge kind="warn">실행중</Badge></div></div>
                  <div className="text-xs text-slate-500">대상 {su.name || "-"} · 경과 {fmtDur(el)} / {fmtDur(dm)} · 남음 {fmtDur(Math.max(0, dm - el))}</div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: Math.round(pr * 100) + "%" }} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-xs text-slate-500">활성 VU</div><div className={"text-lg font-semibold " + (vuLimited ? "text-amber-700" : "text-slate-900")}>{activeVU.toLocaleString()}<span className="text-xs text-slate-500"> / {vuCap.toLocaleString()}</span></div></div>
                    <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-xs text-slate-500">처리량</div><div className="text-lg font-semibold text-slate-900">{rpsNow.toLocaleString()} <span className="text-xs text-slate-500">req/s</span></div></div>
                    <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-xs text-slate-500">에러율</div><div className={"text-lg font-semibold " + (rsla.errRate != null && rsla.errRate !== "" && errNow > rsla.errRate ? "text-red-600" : "text-slate-900")}>{errNow}<span className="text-xs text-slate-500">%</span></div></div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="rounded bg-slate-100 px-2 py-1.5"><span className="text-slate-500">p50 </span><span className="text-slate-800">{p50Now}ms</span></div>
                    <div className="rounded bg-slate-100 px-2 py-1.5"><span className="text-slate-500">p95 </span><span className={rsla.p95 && p95Now > rsla.p95 ? "text-red-700" : "text-slate-800"}>{p95Now}ms</span></div>
                    <div className="rounded bg-slate-100 px-2 py-1.5"><span className="text-slate-500">p99 </span><span className="text-slate-800">{p99Now}ms</span></div>
                    <div className="rounded bg-slate-100 px-2 py-1.5"><span className="text-slate-500">checks </span><span className="text-slate-800">{checkPass}%</span></div>
                  </div>
                  <div className="text-xs text-slate-500">누적 요청 <span className="text-slate-700">{iters.toLocaleString()}</span></div>
                  {vuLimited && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">⚠ 활성 VU가 최대 {maxAlloc.toLocaleString()}에 도달 — 목표 도착률을 못 채워 iteration drop 발생</div>}
                  <div className="flex justify-end gap-2"><Btn icon={Activity} onClick={() => { setObsId(r.id); setErrRow(null); }}>실시간 관측</Btn><Btn kind="danger" icon={X} onClick={() => abort(r)}>중단</Btn></div>
                </Card>
              );
            })}
            {queued.length > 0 && (
              <Card className="p-4 space-y-2">
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Activity size={15} className="text-amber-600" />대기 중 <span className="text-xs font-normal text-slate-500">· {queued.length}건</span></div>
                {queued.map((r, i) => { const p = scns.find((x) => x.id === r.scnId) || {}; return (
                  <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">{i + 1}</span>
                    <div className="min-w-0 flex-1 truncate text-slate-700">{p.name || "-"}</div>
                    <button onClick={() => { removeNqaRun(r.id); flash("대기 취소됨"); }} className="text-slate-500 hover:text-red-600" title="대기 취소"><X size={13} /></button>
                  </div>
                ); })}
              </Card>
            )}
          </>)}
        </div>
      </div>
      {resv && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResv(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-xl border border-slate-300 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900">예약 실행</div>
            <div className="text-xs text-slate-500">{scn.name || "-"} 을(를) 지정 시각에 1회 실행합니다.</div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setWhen(presetTonight())} className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200">오늘 22:00</button>
              <button onClick={() => setWhen(presetTomorrow())} className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200">내일 02:00</button>
              <button onClick={() => setWhen(presetPlus1())} className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200">1시간 후</button>
            </div>
            <Field label="실행 시각"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500" /></Field>
            <div className="text-xs text-slate-500">부하는 보통 야간·오프피크에 예약합니다.</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setResv(false)}>취소</Btn><Btn kind="primary" icon={Zap} onClick={reserve}>예약</Btn></div>
          </div>
        </div></Portal>
      )}
      {obsId && (() => {
        const r = (nqaRuns || []).find((x) => x.id === obsId);
        if (!r || r.status !== "실행중") return null;
        const p = scns.find((x) => x.id === r.scnId) || {};
        const s = p;
        const su = (nqaSystems || []).find((x) => x.id === p.sutId) || {};
        const series = nqaSeries(r, s, 48); const errs = nqaErrors(r, s);
        /* 진행분 기준 실패 추정 — t·pr 은 목록 쪽 지역 변수라 여기서 다시 구한다 */
        const t = r.target || {}; const pr = prog(r);
        const failN = (t.totalReq != null && t.errRate != null) ? Math.round(t.totalReq * t.errRate / 100 * pr) : null;
        return (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setObsId(null); setErrRow(null); }}>
            <div className="flex w-full max-w-4xl flex-col gap-4 rounded-xl border border-slate-300 bg-white p-5" style={{ height: "82vh" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div><div className="text-base font-semibold text-slate-900">실시간 관측 · {p.name || "부하"}</div><div className="text-xs text-slate-500">실시간 집계(5s) · 자동 새로고침</div></div>
                <div className="flex items-center gap-3"><span className="flex items-center gap-1 text-xs text-sky-600"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />LIVE</span><button onClick={() => { setObsId(null); setErrRow(null); }} className="text-slate-500 hover:text-red-600"><X size={16} /></button></div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-3">
                <TSPanel title="트래픽 (req/s)" points={series} pick={(d) => d.rps} color={C.sky} unit="req/s" />
                <TSPanel title="오류율" points={series} pick={(d) => d.errPct} color={C.err} unit="%" />
                <TSMulti title="응답시간" points={series} unit="ms" series={[{ pick: (d) => d.p50, color: C.axis, label: "p50" }, { pick: (d) => d.p95, color: C.warn, label: "p95" }, { pick: (d) => d.p99, color: C.err, label: "p99" }]} />
                <TSPanel title="활성 VU" points={series} pick={(d) => d.vu} color={C.skyDark} unit="VU" />
              </div>
              <div className="shrink-0 rounded-lg bg-slate-100/60 px-2.5 py-1.5 text-xs text-slate-500">실시간 값은 <span className="text-slate-700">전체 구간</span>입니다 — 판정은 워밍업을 뺀 <span className="text-slate-700">목표 부하 구간</span>에서 하므로 결과와 다를 수 있습니다.</div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-800"><Bug size={14} className="text-red-600" />오류 <span className="text-xs font-normal text-slate-500">· 샘플 {errs.length}건{failN != null ? " / 실패 " + failN.toLocaleString() + "건" : ""} · 최근순 <span className="text-slate-500">(전량이 아니라 상한까지만 보관합니다)</span></span></div>
                {errs.length === 0 ? <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">아직 집계된 오류가 없습니다.</div> : (
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200">
                    {errs.map((e) => (
                      <div key={e.i} className="border-b border-slate-200 last:border-0">
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
                          <span className="w-16 shrink-0 font-mono text-slate-500">{e.at}</span>
                          <Badge kind={M_LK[e.method] || "info"}>{e.method}</Badge>
                          <span className="min-w-0 flex-1 truncate font-mono text-slate-700">{e.path}</span>
                          <span className="shrink-0 text-red-700">{e.type}</span>
                          <span className="w-10 shrink-0 text-right text-slate-500">{e.status}</span>
                          <button onClick={() => setErrRow(errRow === e.i ? null : e.i)} className="w-16 shrink-0 text-right text-sky-600 hover:underline">{errRow === e.i ? "닫기" : "응답 보기"}</button>
                        </div>
                        {errRow === e.i && (
                          <div className="space-y-2 bg-slate-50 px-3 py-2 text-xs">
                            <div><div className="mb-0.5 text-slate-500">요청</div><div className="font-mono text-slate-700">{e.method} {su.baseUrl}{e.path}</div>{e.reqBody && <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-slate-500">{e.reqBody}</pre>}</div>
                            <div><div className="mb-0.5 text-slate-500">응답</div><div className="text-slate-700">{e.respStatus} · {e.msg}</div>{e.respBody && <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-slate-500">{e.respBody}</pre>}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div></Portal>
        );
      })()}
      <Toast msg={msg} />
    </div>
  );
}

function NqaResultView({ run, back }) {
  const { nqaRuns, nqaScenarios, nqaSystems, defects, openModal } = useApp();
  const [msg, flash] = useToast();
  const [errRow, setErrRow] = useState(null);
  const r = run;
  const p = (nqaScenarios || []).find((x) => x.id === r.scnId) || {};
  const s = p;
  const su = (nqaSystems || []).find((x) => x.id === p.sutId) || {};
  const res = r.result || {};
  const dExists = (defects || []).some((d) => d.tc === r.id);
  const fmtD = (m) => (m >= 60 ? Math.round((m / 60) * 10) / 10 + "시간" : Math.round(m) + "분");
  const series = nqaSeries(r, s, 48, 1);
  const errs = nqaErrors(r, s, 1);
  const failN = (res.totalReq != null && res.errRate != null) ? Math.round(res.totalReq * res.errRate / 100) : null;
  const same = (nqaRuns || []).filter((x) => x.scnId === r.scnId && x.status === "완료").slice().sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
  const idx = same.findIndex((x) => x.id === r.id);
  const prevPass = same.slice(0, idx).reverse().find((x) => (x.result || {}).verdict === "합격");
  const base = prevPass ? (prevPass.result || {}).p95 : null;
  const deltaPct = base != null ? Math.round((((res.p95 || 0) - base) / base) * 100) : null;
  const regDefect = () => {
    if (res.verdict !== "불합격") return;
    if ((defects || []).some((d) => d.tc === r.id)) { flash("이미 결함이 등록된 실행입니다"); return; }
    const sla = p.sla || {};
    const slaStr = [sla.p95 && ("p95 ≤ " + sla.p95 + "ms"), (sla.errRate != null && sla.errRate !== "") && ("에러율 ≤ " + sla.errRate + "%"), sla.minRps && ("처리량 ≥ " + sla.minRps + " RPS")].filter(Boolean).join(" · ");
    openModal("jira", {
      domain: "NQA", sev: "Major", tc: r.id, target: su.name || "", labels: "nqa, load",
      title: "SLA 불합격 · " + (p.name || "부하 테스트"),
      desc: "부하 테스트: " + (p.name || "-") + "\n형상: " + (s.shape || "-") + " · 대상 " + (su.name || "-") + " (" + (su.baseUrl || "-") + ")\n결과: 처리량 " + res.rps + " RPS · p95 " + res.p95 + "ms · p99 " + res.p99 + "ms · 에러율 " + res.errRate + "%",
      steps: "1. 부하 테스트 '" + (p.name || "-") + "' 실행 (" + (s.shape || "-") + " · 전용 VM)\n2. 목표 부하 도달 후 판정 구간 집계\n3. SLA 임계 대비 판정",
      expected: "SLA 충족 — " + (slaStr || "임계 미설정"),
      actual: "SLA 위반 — " + ((res.breaches || []).join(" · ") || "-"),
      env: (su.name || "") + (su.baseUrl ? " · " + su.baseUrl : ""),
      artifacts: [{ k: "summary", label: "부하 결과 요약", file: "loadtest_summary.json", size: "3 KB" }, { k: "script", label: "실행 스크립트", file: "k6_script.js", size: "4 KB" }, { k: "errors", label: "오류 샘플", file: "error_samples.json", size: "5 KB" }, { k: "metrics", label: "시계열 메트릭", file: "metrics.csv", size: "180 KB" }],
    });
  };
  return (
    <div className="space-y-4">
      <PageToolbar desc={<span><button onClick={back} className="text-sky-600 hover:underline">실행 이력</button> <span className="text-slate-500">›</span> <span className="text-slate-700 font-medium">{r.id} 결과</span></span>}>
        <Btn icon={FileDown} onClick={() => flash("Excel 다운로드 — 요약·시계열·오류(증적) 포함")}>Excel</Btn>
        <Btn icon={FileDown} onClick={() => flash("PDF 리포트 다운로드")}>PDF</Btn>
        <Btn icon={ChevronLeft} onClick={back}>실행 이력으로</Btn>
      </PageToolbar>
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{p.name || "부하 테스트"} <span className="text-xs font-normal text-slate-500">· {r.id} · #{r.no}</span></div>
            <div className="mt-0.5 text-xs text-slate-500">대상 {su.name || "-"} · {r.startedAt} ~ {(r.endedAt || "").slice(11) || "-"} · 실행자 {r.by || "-"}</div>
          </div>
          <Badge kind={VK(res.verdict)}>{res.verdict}</Badge>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">처리량 </span><span className="text-slate-800">{res.rps} RPS</span></div>
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">에러율 </span><span className="text-slate-800">{res.errRate}%</span></div>
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">p50 </span><span className="text-slate-800">{res.p50}ms</span></div>
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">p95 </span><span className="text-slate-800">{res.p95}ms</span></div>
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">p99 </span><span className="text-slate-800">{res.p99}ms</span></div>
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">총 요청 </span><span className="text-slate-800">{(res.totalReq || 0).toLocaleString()}</span></div>
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">소요 </span><span className="text-slate-800">{fmtD((r.durationSec || 0) / 60)}</span></div>
          <div className="rounded bg-slate-100 px-2.5 py-1.5"><span className="text-slate-500">p95 마지막 합격 대비 </span>{deltaPct == null ? <span className="text-slate-500">기준</span> : deltaPct > 10 ? <span className="font-semibold text-amber-700">▲{deltaPct}%</span> : <span className="text-slate-700">{deltaPct >= 0 ? "+" : ""}{deltaPct}%</span>}</div>
        </div>
        {res.shortfall > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
          목표 {res.target} RPS · 실제 {res.rps} — <strong>미달 {res.shortfall}%</strong>{res.verdict === "판정 없음"
            ? " · 목표 부하에 도달하지 못해 판정하지 않았습니다 (낮은 부하에서 좋았을 뿐입니다)"
            : " · 더 적은 부하에서도 SLA를 넘었으므로 불합격은 유효합니다"}
        </div>}
        {res.cond && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-100/60 px-2.5 py-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">부하 조건</span>
          <span>{res.cond.shape}</span><span>{res.cond.unit} {res.cond.peak}</span>
          {res.cond.maxVU ? <span>maxVU {res.cond.maxVU}</span> : null}
          {res.cond.gen ? <span>생성기 <span className="font-mono text-slate-700">{res.cond.gen}</span></span> : null}
          <span>집계 <span className="text-slate-700">목표 부하 구간</span>(워밍업 제외)</span>
          {res.cond.sig ? <span>스크립트 <button onClick={() => flash("k6_script.js 내려받음 · 지문 " + res.cond.sig)} className="font-mono text-sky-600 hover:text-sky-700">{res.cond.sig}</button></span> : null}
          <span className="text-slate-500">조건이 다르면 회차 간 비교가 성립하지 않습니다</span>
        </div>}
        {(res.breaches || []).length > 0 ? <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">SLA 위반: {res.breaches.join(" · ")}</div> : <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700">모든 SLA 임계 충족</div>}
        {res.verdict === "불합격" && <div className="flex items-center justify-end">{dExists ? <span className="text-xs text-slate-500">결함 등록됨</span> : <Btn icon={Bug} onClick={regDefect}>결함 등록</Btn>}</div>}
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-800">시계열 관측 <span className="text-xs font-normal text-slate-500">· 실행 전 구간</span></div>
        <div className="grid grid-cols-2 gap-3">
          <TSPanel title="트래픽 (req/s)" points={series} pick={(d) => d.rps} color={C.sky} unit="req/s" />
          <TSPanel title="오류율" points={series} pick={(d) => d.errPct} color={C.err} unit="%" />
          <TSMulti title="응답시간" points={series} unit="ms" series={[{ pick: (d) => d.p50, color: C.axis, label: "p50" }, { pick: (d) => d.p95, color: C.warn, label: "p95" }, { pick: (d) => d.p99, color: C.err, label: "p99" }]} />
          <TSPanel title="활성 VU" points={series} pick={(d) => d.vu} color={C.skyDark} unit="VU" />
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Bug size={14} className="text-red-600" />오류 <span className="text-xs font-normal text-slate-500">· 샘플 {errs.length}건{failN != null ? " / 실패 " + failN.toLocaleString() + "건" : ""} · 최근순 <span className="text-slate-500">(전량이 아니라 상한까지만 보관합니다)</span></span></div>
        {errs.length === 0 ? <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">집계된 오류가 없습니다.</div> : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {errs.map((e) => (
              <div key={e.i} className="border-b border-slate-200 last:border-0">
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="w-16 shrink-0 font-mono text-slate-500">{e.at}</span>
                  <Badge kind={M_LK[e.method] || "info"}>{e.method}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-700">{e.path}</span>
                  <span className="shrink-0 text-red-700">{e.type}</span>
                  <span className="w-10 shrink-0 text-right text-slate-500">{e.status}</span>
                  <button onClick={() => setErrRow(errRow === e.i ? null : e.i)} className="w-16 shrink-0 text-right text-sky-600 hover:underline">{errRow === e.i ? "닫기" : "응답 보기"}</button>
                </div>
                {errRow === e.i && (
                  <div className="space-y-2 bg-slate-50 px-3 py-2 text-xs">
                    <div><div className="mb-0.5 text-slate-500">요청</div><div className="font-mono text-slate-700">{e.method} {su.baseUrl}{e.path}</div>{e.reqBody && <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-slate-500">{e.reqBody}</pre>}</div>
                    <div><div className="mb-0.5 text-slate-500">응답</div><div className="text-slate-700">{e.respStatus} · {e.msg}</div>{e.respBody && <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-slate-500">{e.respBody}</pre>}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Toast msg={msg} />
    </div>
  );
}
export function NqaHistoryScreen() {
  const { nqaScenarios, nqaRuns } = useApp();
  const runs = (nqaRuns || []).filter((r) => r.status === "완료");
  const [detail, setDetail] = useState(null);
  const [fPlan, setFPlan] = useState("all");
  const [fVerdict, setFVerdict] = useState("all");
  const scnName = (id) => ((nqaScenarios || []).find((p) => p.id === id) || {}).name || "-";
  const regMap = {};
  const byPlan = {};
  runs.forEach((r) => { (byPlan[r.scnId] = byPlan[r.scnId] || []).push(r); });
  Object.keys(byPlan).forEach((pid) => {
    const sorted = byPlan[pid].slice().sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
    sorted.forEach((r, i) => {
      const prevPass = sorted.slice(0, i).reverse().find((x) => (x.result || {}).verdict === "합격");
      const base = prevPass ? (prevPass.result || {}).p95 : null;
      const cur = (r.result || {}).p95 || 0;
      const deltaPct = base ? Math.round(((cur - base) / base) * 100) : null;
      regMap[r.id] = { deltaPct, regression: base != null && deltaPct > 10 };
    });
  });
  const shown = runs.filter((r) => (fPlan === "all" || String(r.scnId) === fPlan) && (fVerdict === "all" || (r.result || {}).verdict === fVerdict)).slice().sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  if (detail) return <NqaResultView run={detail} back={() => setDetail(null)} />;
  return (
    <div className="space-y-4">
      <PageToolbar desc="부하 실행 이력 · 행 클릭 → 실행 결과 상세" />
      <div className="flex items-center gap-2">
        <div style={{ width: 120 }}><Select value={fVerdict} onChange={(e) => setFVerdict(e.target.value)}><option value="all">전체 판정</option><option value="합격">합격</option><option value="불합격">불합격</option></Select></div>
        <div style={{ width: 200 }}><Select value={fPlan} onChange={(e) => setFPlan(e.target.value)}><option value="all">전체 부하 테스트</option>{(nqaScenarios || []).map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</Select></div>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-2 text-left">실행 ID</th><th className="px-3 py-2 text-left">부하 테스트</th><th className="px-3 py-2 text-left">시각</th><th className="px-3 py-2 text-right">처리량</th><th className="px-3 py-2 text-right">p95</th><th className="px-3 py-2 text-right">에러율</th><th className="px-3 py-2 text-center">p95 마지막 합격 대비</th><th className="px-3 py-2 text-center">판정</th></tr></thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-500">{runs.length === 0 ? "실행 이력이 없습니다." : "조건에 맞는 실행이 없습니다."}</td></tr> : shown.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-slate-200 last:border-0 hover:bg-slate-100/50" onClick={() => setDetail(r)}>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{r.id}</td>
                <td className="px-3 py-2 text-slate-700">{scnName(r.scnId)} <span className="text-xs text-slate-500">#{r.no}</span></td>
                <td className="px-3 py-2 text-xs"><RunTime start={r.startedAt} end={r.endedAt} /></td>
                <td className="px-3 py-2 text-right text-slate-700">{(r.result || {}).rps} RPS</td>
                <td className="px-3 py-2 text-right text-slate-700">{(r.result || {}).p95}ms</td>
                <td className="px-3 py-2 text-right text-slate-700">{(r.result || {}).errRate}%</td>
                <td className="px-3 py-2 text-center">{(() => { const rg = regMap[r.id] || {}; return rg.deltaPct == null ? <span className="text-slate-500">기준</span> : rg.regression ? <span className="font-semibold text-amber-600">▲{rg.deltaPct}%</span> : <span className="text-slate-500">{rg.deltaPct >= 0 ? "+" : ""}{rg.deltaPct}%</span>; })()}</td>
                <td className="px-3 py-2 text-center"><Badge kind={VK((r.result || {}).verdict)}>{(r.result || {}).verdict}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function NqaDashboardScreen({ nav }) {
  const { nqaRuns, nqaScenarios, nqaSystems, defects } = useApp();
  const scns = nqaScenarios || [];
  const [fPlan, setFPlan] = useState("all");
  const allCompleted = (nqaRuns || []).filter((r) => r.status === "완료");
  const inScope = (sid) => fPlan === "all" || String(sid) === fPlan;
  const regMap = {};
  const byPlan = {};
  allCompleted.forEach((r) => { (byPlan[r.scnId] = byPlan[r.scnId] || []).push(r); });
  Object.keys(byPlan).forEach((pid) => {
    const sorted = byPlan[pid].slice().sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
    sorted.forEach((r, i) => {
      const prevPass = sorted.slice(0, i).reverse().find((x) => (x.result || {}).verdict === "합격");
      const base = prevPass ? (prevPass.result || {}).p95 : null;
      const cur = (r.result || {}).p95 || 0;
      const deltaPct = base ? Math.round(((cur - base) / base) * 100) : null;
      regMap[r.id] = { deltaPct, regression: base != null && deltaPct > 10 };
    });
  });
  const completed = allCompleted.filter((r) => inScope(r.scnId));
  const desc = completed.slice().sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  const asc = completed.slice().sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || "")).slice(-12);
  const recent = desc.slice(0, 10);
  /* 🔑 합격률은 판정한 회차 안에서만 센다 — 판정 없음을 분모에 넣으면 불합격처럼 비율을 깎는다 (P6와 동일) */
  const judged = recent.filter((r) => { const v = (r.result || {}).verdict; return v === "합격" || v === "불합격"; });
  const noJudgeN = recent.length - judged.length;
  const passN = judged.filter((r) => (r.result || {}).verdict === "합격").length;
  const rate = judged.length ? Math.round((passN / judged.length) * 100) : null;
  const scopedRunIds = new Set((nqaRuns || []).filter((r) => inScope(r.scnId)).map((r) => r.id));
  const openDef = (defects || []).filter((d) => d.domain === "NQA" && d.status !== "Resolved" && d.status !== "Closed" && (fPlan === "all" || scopedRunIds.has(d.tc))).length;
  const regCount = completed.filter((r) => (regMap[r.id] || {}).regression).length;
  const running = (nqaRuns || []).filter((r) => r.status === "실행중" && inScope(r.scnId));
  const queuedN = (nqaRuns || []).filter((r) => r.status === "대기" && inScope(r.scnId)).length;
  const last = desc[0];
  const scnName = (id) => (scns.find((p) => p.id === id) || {}).name || "-";
  const sutOfScn = (id) => { const p = scns.find((x) => x.id === id) || {}; return (nqaSystems || []).find((x) => x.id === p.sutId) || {}; };
  const maxP95 = Math.max(1, ...asc.map((r) => (r.result || {}).p95 || 0));
  const latestOf = (pid) => desc.find((r) => r.scnId === pid);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <PageToolbar desc="부하 KPI · SLA 판정 추이 · 부하 테스트별 요약" />
        <div className="w-56 shrink-0"><Select value={fPlan} onChange={(e) => setFPlan(e.target.value)}><option value="all">전체 부하 테스트</option>{scns.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</Select></div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14} className="text-sky-600" />SLA 합격률</div><div className="mt-1 text-2xl font-semibold text-slate-900">{rate == null ? "—" : rate}{rate != null && <span className="text-sm text-slate-500">%</span>}</div>{noJudgeN > 0 && <div className="text-xs text-amber-600">판정 없음 {noJudgeN}건 제외</div>}<div className="text-xs text-slate-500">최근 {recent.length}회 중 {passN} 합격</div></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Bug size={14} className="text-red-600" />미해결 성능 결함</div><div className={"mt-1 text-2xl font-semibold " + (openDef > 0 ? "text-red-700" : "text-slate-900")}>{openDef}</div><div className="text-xs text-slate-500">SLA 불합격 결함 (Open)</div></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><TrendingUp size={14} className="text-amber-600" />성능 회귀</div><div className={"mt-1 text-2xl font-semibold " + (regCount > 0 ? "text-amber-700" : "text-slate-900")}>{regCount}</div><div className="text-xs text-slate-500">마지막 합격 대비 p95 +10% 초과</div></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Activity size={14} className="text-sky-600" />진행 중 실행</div><div className={"mt-1 text-2xl font-semibold " + (running.length > 0 ? "text-sky-600" : "text-slate-900")}>{running.length}</div><div className="text-xs text-slate-500">대기 {queuedN} · 한 번에 하나</div></Card>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-800">SLA 판정 추이 <span className="text-xs font-normal text-slate-500">· 최근 {asc.length}회</span></div>
          {asc.length === 0 ? <div className="rounded-lg bg-slate-100 p-4 text-center text-xs text-slate-500">실행 이력이 없습니다.</div> : (
            <div className="flex flex-wrap gap-1.5">{asc.map((r) => { const vd = (r.result || {}).verdict; const pass = vd === "합격"; const nj = vd !== "합격" && vd !== "불합격"; return <div key={r.id} className={"flex w-16 flex-col items-center justify-center rounded py-1 text-xs " + (nj ? "border-amber-300 bg-amber-50 text-amber-700" : pass ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")} title={scnName(r.scnId) + " · " + r.startedAt}>{pass ? "합격" : "불합격"}<span className="text-slate-500">{(r.startedAt || "").slice(5, 10)}</span></div>; })}</div>
          )}
        </Card>
        <Card className="p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-800">p95 추이 <span className="text-xs font-normal text-slate-500">· 최근 {asc.length}회</span></div>
          {asc.length === 0 ? <div className="rounded-lg bg-slate-100 p-4 text-center text-xs text-slate-500">실행 이력이 없습니다.</div> : (
            <div className="flex items-end gap-2" style={{ height: 96 }}>{asc.map((r) => { const p = (r.result || {}).p95 || 0; const h = Math.round((p / maxP95) * 76); const pass = (r.result || {}).verdict === "합격"; const reg = (regMap[r.id] || {}).regression; return <div key={r.id} className="flex flex-1 flex-col items-center justify-end"><div className={"w-full rounded-t " + (!pass ? "bg-red-600" : reg ? "bg-amber-500" : "bg-sky-600")} style={{ height: h }} title={(r.result || {}).p95 + "ms"} /></div>; })}</div>
          )}
        </Card>
      </div>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-800">최근 실행 판정 <span className="text-xs font-normal text-slate-500">· 최근 {Math.min(8, desc.length)}건</span></div>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-2 text-left">부하 테스트</th><th className="px-3 py-2 text-left">유형</th><th className="px-3 py-2 text-left">대상 환경</th><th className="px-3 py-2 text-left">실행 시각</th><th className="px-3 py-2 text-right">p95</th><th className="px-3 py-2 text-right">에러율</th><th className="px-3 py-2 text-center">회귀</th><th className="px-3 py-2 text-center">판정</th></tr></thead>
          <tbody>{desc.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-500">실행 이력이 없습니다.</td></tr> : desc.slice(0, 8).map((r) => { const p = scns.find((x) => x.id === r.scnId) || {}; const su = sutOfScn(r.scnId); const psc = p; const reg = regMap[r.id] || {}; return (
            <tr key={r.id} className="border-b border-slate-200 last:border-0">
              <td className="px-3 py-2 text-slate-700">{p.name || "-"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{psc.shape || "-"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{su.name || "-"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{r.startedAt}</td>
              <td className="px-3 py-2 text-right text-slate-700">{(r.result || {}).p95}ms</td>
              <td className="px-3 py-2 text-right text-slate-700">{(r.result || {}).errRate}%</td>
              <td className="px-3 py-2 text-center">{reg.regression ? <span className="font-semibold text-amber-600">▲{reg.deltaPct}%</span> : reg.deltaPct != null ? <span className="text-slate-500">{reg.deltaPct >= 0 ? "+" : ""}{reg.deltaPct}%</span> : <span className="text-slate-500">기준</span>}</td>
              <td className="px-3 py-2 text-center"><Badge kind={VK((r.result || {}).verdict)}>{(r.result || {}).verdict}</Badge></td>
            </tr>
          ); })}</tbody></table>
        </div>
      </Card>
    </div>
  );
}
