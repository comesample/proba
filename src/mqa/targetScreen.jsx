// ============================================================
// MQA 대상·환경 — 대상(앱) → 환경(스테이징·운영·개발) · 앱 설치 파일 · 테스트 계정 · 앱 실행 확인
// ============================================================
import { useState, useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Play, Plus, RefreshCw, Save, Smartphone, Trash2, Upload, X, XCircle } from "lucide-react";
import { Card, Badge, Btn, Field, Input, Select, Toast, useToast, PageToolbar, Portal, SEL_CARD, SEL_IDLE } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { VarRefInput } from "../common/VarRefInput.jsx";
import { flatDevices, deviceBlock, devLabel, pickDefault, osName } from "./devices.js";
import { DeviceSelect } from "./workPickers.jsx";
import { useRunner, isOnNewBuild } from "./flow.jsx";

const ENV_NAMES = ["스테이징", "운영", "개발"];
const PLATFORMS = [{ id: "Android", ready: true, ext: ".apk" }, { id: "iOS", ready: false, ext: ".ipa" }];
const mqaStamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
const verCode = (v) => { const [a, b, c] = String(v).split(".").map((n) => parseInt(n, 10) || 0); return a * 10000 + b * 100 + c; };
/* 앱 파일 판독 — 실 구현은 업로드 시 서버가 APK 의 AndroidManifest 를 읽는다 (aapt2 dump badging 등).
     · 앱 ID(package) · versionName(표시용, 자유 문자열) · versionCode(정수, 새 빌드일수록 큼) · minSdk(최소 지원 OS)
     · 🔑 정렬·중복·최신 판단은 versionCode 로 한다 — versionName 은 "3.2.0-rc1", "2026.10" 처럼 형식이 제각각이다
     · 앱 ID 가 대상과 다른 파일은 거부한다 (다른 앱의 파일)
   목업은 파일명에서 versionName 을 찾고(없으면 최신의 다음 값), versionCode 는 그 숫자부에서 만든다. */
const SDK_OS = { 24: "7.0", 26: "8.0", 28: "9", 29: "10", 30: "11", 31: "12", 33: "13", 34: "14", 35: "15" };
const osOf = (sdk) => "Android " + (SDK_OS[sdk] || "API " + sdk) + " 이상";
const readAppFile = (name, app, sysId) => {
  const m = name.match(/(\d+\.\d+\.\d+(?:[-_][A-Za-z0-9]+)?)/);
  const latest = (app.builds || [])[0];
  let ver = m ? m[1] : "1.0.0";
  if (!m && latest) { const [a, b, c] = latest.ver.split(/[.\-_]/).map(Number); ver = [a, b, (c || 0) + 1].join("."); }
  /* 목업: 파일명에 release 가 있으면 WebView 디버깅이 꺼진 빌드로 흉내 낸다 (실제로는 앱 실행 확인에서 드러난다) */
  const sim = { web: !/release/i.test(name), url: ((latest && latest._sim) || {}).url || "https://m-stg.example.com/main" };
  return { ver, code: verCode(ver.split(/[-_]/)[0]), appId: app.appId || "com.example.app" + sysId, minSdk: (latest && latest.minSdk) || 26, _sim: sim };
};
const ST_K = { "확인됨": "pass", "미확인": "warn", "실패": "fail" };
const newEnv = (name, appId) => ({ env: name, prod: name === "운영", status: "미확인", ver: "-", accts: [], deploy: { mode: "수동" }, app: { platform: "Android", appId: appId || "", builds: [], defBuild: null } });

/* 앱 실행 확인 — 별도 카드. 진행 중이든 결과든 같은 3줄(설치·실행 / 웹 화면 연결 / 열린 주소)을 유지해
   화면이 들썩이지 않게 한다. 각 줄은 상태 아이콘 + 이름 + 값, 글자 크기는 한 가지 */
const StepIcon = ({ st }) => (st === "ok" ? <CheckCircle2 size={16} className="text-emerald-600" /> : st === "fail" ? <XCircle size={16} className="text-red-600" /> : st === "run" ? <RefreshCw size={16} className="animate-spin text-sky-600" /> : st === "skip" ? <span className="block h-4 w-4 rounded-full border-2 border-slate-300 bg-slate-100" /> : <span className="block h-4 w-4 rounded-full border-2 border-slate-200" />);
/* 줄 높이 고정(h-11) — 진행 중 안내 · 버튼 · 실패 안내가 들어와도 줄 높이가 변하지 않는다 */
const StepRow = ({ st, label, children }) => (
  <div className="flex h-11 items-center gap-3">
    <span className="shrink-0"><StepIcon st={st} /></span>
    <span className="w-28 shrink-0 text-sm text-slate-500">{label}</span>
    <div className="flex min-w-0 flex-1 items-center text-sm text-slate-800">{children}</div>
  </div>
);
function CheckPanel({ check, last, stale, devs, dev, setDevId, defB, onRun, goTo }) {
  const busy = !!(check && (check.s === "run" || check.s === "wait"));
  const r = busy ? null : last;
  const s1 = check && check.s === "run" ? "run" : busy || r ? "ok" : "idle";
  const s2 = check && check.s === "wait" ? "run" : r ? (r.web === true ? "ok" : r.web === false ? "fail" : "skip") : "idle";
  const s3 = r && r.web && r.url ? "ok" : r ? "skip" : "idle";
  const ver = busy ? check.ver : r ? r.ver : "";
  const mmss = (n) => Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">앱 실행 확인</span>
        <span className="text-xs text-slate-500">{busy ? check.device : r ? r.device + " · " + r.at : "아직 확인하지 않았습니다"}</span>
        {stale && !busy && <Badge kind="warn">기본 버전 변경됨 · 다시 확인</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <div style={{ width: 380 }}><DeviceSelect devs={devs} value={dev ? dev.id : ""} onChange={setDevId} build={defB} /></div>
          <Btn kind="primary" icon={Play} onClick={onRun} disabled={busy}>{busy ? "확인 중" : "실행"}</Btn>
        </div>
      </div>
      {check && check.s === "err" && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><XCircle size={15} className="shrink-0" /><span className="flex-1">{check.m}</span>{check.dev && <button onClick={() => goTo("mqa-devices")} className="shrink-0 text-sky-600">테스트 기기로</button>}</div>}
      <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-1">
        <div className="flex h-24 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-50 text-slate-300" title="첫 화면"><Smartphone size={16} /></div>
        <div className="min-w-0 flex-1 divide-y divide-slate-100">
          <StepRow st={s1} label="설치 · 실행">{s1 === "run" ? <span className="text-slate-500">설치하고 실행하는 중</span> : ver ? "v" + ver : <span className="text-slate-400">—</span>}</StepRow>
          <StepRow st={s2} label="웹 화면 연결">
            {s2 === "run" ? (
              <div className="flex w-full items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sky-800">단말에서 웹 화면까지 직접 진행하세요 <span className="text-slate-500">· 나오면 자동으로 확인합니다</span></span>
                <span className="w-10 shrink-0 text-right font-mono tabular-nums text-sky-800">{mmss(check.left)}</span>
                <button onClick={() => check.finish(null)} className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">건너뛰기</button>
              </div>
            ) : s2 === "ok" ? "연결됨" : s2 === "fail" ? <span className="min-w-0 truncate" title="WebView 디버깅이 꺼진 빌드입니다. 앱 개발 측에 테스트 빌드의 디버깅 활성화를 요청하세요."><span className="text-red-700">연결 안 됨</span><span className="ml-2 text-xs text-slate-500">WebView 디버깅이 꺼진 빌드 — 앱 개발 측에 테스트 빌드의 디버깅 활성화를 요청하세요</span></span> : s2 === "skip" ? <span className="text-slate-500">확인 안 함</span> : <span className="text-slate-400">—</span>}
          </StepRow>
          <StepRow st={s3} label="열린 주소">{s3 === "ok" ? <span className="font-mono">{r.url}</span> : <span className="text-slate-400">—</span>}</StepRow>
        </div>
      </div>
    </Card>
  );
}
export function MqaTargetScreen() {
  const [msg, flash] = useToast();
  const { mqaSystems: systems, addMqaSystem, updateMqaSystem, removeMqaSystem, mqaPlans, setNavGuard, currentUser, mqaRunners = [], lockMqaDevice, releaseMqaDevice, goTo, mqaWork = {}, setMqaWork } = useApp();
  const [sel, setSel] = useState(0);
  const [envIdx, setEnvIdx] = useState(0);
  const [check, setCheck] = useState(null);      // 앱 실행 확인 결과 (화면 표시용)
  const [modal, setModal] = useState(null);      // "target" | "env"
  const [block, setBlock] = useState(null);      // 참조 중이라 삭제가 막힌 경우
  const [pending, setPending] = useState(null);  // 올린 파일 확인 대기
  const [tf, setTf] = useState({ name: "", env: "스테이징" });
  const [ef, setEf] = useState({ env: "개발" });
  const [draft, setDraft] = useState({});
  const [nameDraft, setNameDraft] = useState(null);
  const fileRef = useRef(null);
  /* 신규 조직은 대상 0건으로 시작한다 — sys.envs 접근 전에 막는다 */
  const sys = systems[sel] || systems[0] || null;
  const env = sys ? (sys.envs[envIdx] || sys.envs[0]) : null;
  const app = (env && env.app) || { platform: "Android", appId: "", builds: [], defBuild: null };
  const defB = (app.builds || []).find((b) => b.id === app.defBuild) || null;
  const secretRef = (val, setVal, ph) => <VarRefInput value={val} onChange={setVal} placeholder={ph} />;
  /* 저장 버튼으로 반영되는 것 = 대상 이름 · 테스트 계정 (draft).
     앱 파일 작업(올리기·기본 지정·삭제)은 즉시 반영한다 — 파일을 올리고 저장을 잊으면 파일이 사라지는 게 더 나쁘다. */
  const cfg = { accts: [], ...env, ...draft };
  const setEnvCfg = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = Object.keys(draft).length > 0 || (nameDraft !== null && nameDraft !== ((sys || {}).name || ""));
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  useEffect(() => { setDraft({}); setNameDraft(null); setCheck(null); }, [(sys || {}).id]);
  const guardSwitch = (fn) => { if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이동하시겠습니까?")) return; setDraft({}); setNameDraft(null); fn(); };
  const choose = (i) => guardSwitch(() => { setSel(i); setEnvIdx(0); setCheck(null); });
  const patchEnv = (patch) => updateMqaSystem(sys.id, { envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, ...patch } : e)) });
  const patchApp = (patch, extra) => patchEnv({ app: { ...app, ...patch }, ...(extra || {}) });
  const saveCfg = () => { updateMqaSystem(sys.id, { ...(nameDraft !== null ? { name: nameDraft } : {}), envs: sys.envs.map((e, i) => (i === envIdx ? { ...e, ...draft } : e)) }); setDraft({}); setNameDraft(null); flash("설정 저장됨"); };

  /* ── 참조 무결성 — 실행 계획이 쓰고 있는 대상·환경은 지울 수 없다 ── */
  const usedEnvs = ((sys || {}).envs || []).map((e) => e.env);
  const envOpts = ENV_NAMES.filter((n) => !usedEnvs.includes(n));
  const plansUsing = (systemId, envName) => (mqaPlans || []).filter((p) => { const r = { systemId: p.systemId, env: p.env }; return r.systemId === systemId && (envName == null || r.env === envName); });
  const delTarget = (sy) => {
    const used = plansUsing(sy.id, null);
    if (used.length) { setBlock({ what: sy.name + " 대상", plans: used }); return; }
    if (!window.confirm(sy.name + " 대상을 삭제할까요?\n\n올려 둔 앱 파일과 테스트 계정도 함께 삭제됩니다.")) return;
    guardSwitch(() => { removeMqaSystem(sy.id); setSel(0); setEnvIdx(0); setCheck(null); flash(sy.name + " 삭제됨"); });
  };
  const delEnv = () => {
    if (sys.envs.length <= 1) { flash("대상에는 환경이 최소 1개 필요합니다 — 대상을 지우려면 대상 삭제를 쓰세요"); return; }
    const used = plansUsing(sys.id, env.env);
    if (used.length) { setBlock({ what: sys.name + " · " + env.env + " 환경", plans: used }); return; }
    if (!window.confirm(env.env + " 환경을 삭제할까요?")) return;
    guardSwitch(() => { updateMqaSystem(sys.id, { envs: sys.envs.filter((_, i) => i !== envIdx) }); setEnvIdx(0); setCheck(null); flash(env.env + " 환경 삭제됨"); });
  };
  const addTarget = () => {
    if (!tf.name.trim()) { flash("대상 이름을 입력하세요"); return; }
    if (systems.some((s) => s.name === tf.name.trim())) { flash("같은 이름의 대상이 이미 있습니다"); return; }
    const ns = { id: Date.now(), name: tf.name.trim(), platforms: ["Android"], envs: [newEnv(tf.env, "")] };
    guardSwitch(() => { addMqaSystem(ns); setSel(0); setEnvIdx(0); setModal(null); setCheck(null); flash("대상이 추가되었습니다 — 앱 설치 파일을 올려 주세요"); });
  };
  const addEnv = () => {
    if (!ef.env || usedEnvs.includes(ef.env)) { flash("추가할 수 있는 환경이 없습니다"); return; }
    const appId = (sys.envs.map((e) => (e.app || {}).appId).find(Boolean)) || "";   // 같은 앱 — 환경마다 빌드만 다르다
    guardSwitch(() => { updateMqaSystem(sys.id, { envs: [...sys.envs, newEnv(ef.env, appId)] }); setEnvIdx(sys.envs.length); setModal(null); setCheck(null); flash(ef.env + " 환경이 추가되었습니다"); });
  };

  /* ── 앱 설치 파일 ── */
  const pickFile = () => { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".aab")) { flash("AAB 파일은 아직 지원하지 않습니다 — APK 파일로 올려 주세요"); return; }
    if (!lower.endsWith(".apk")) { flash("Android 앱 설치 파일(.apk)만 올릴 수 있습니다"); return; }
    const info = readAppFile(f.name, app, sys.id);
    if ((app.builds || []).some((b) => b.code === info.code)) { flash("빌드 번호 " + info.code + " 은(는) 이미 올라와 있습니다 — 같은 빌드입니다"); return; }
    setPending({ file: f.name, size: f.size, ...info, makeDefault: !defB || info.code > defB.code, note: "" });
  };
  const confirmUpload = () => {
    const p = pending;
    const b = { id: "B" + Date.now(), ver: p.ver, code: p.code, minSdk: p.minSdk, _sim: p._sim, file: p.file, size: p.size, at: mqaStamp(), by: currentUser || "—", note: p.note };
    const builds = [b, ...(app.builds || [])].sort((x, y) => y.code - x.code);
    patchApp({ appId: p.appId, builds, ...(p.makeDefault ? { defBuild: b.id } : {}) }, p.makeDefault ? { ver: p.ver, status: "미확인" } : {});
    setPending(null); setCheck(null);
    flash("v" + p.ver + " 올림" + (p.makeDefault ? " · 기본 테스트 버전으로 지정" + onNewDefault(b) : ""));
  };
  /* 새 기본 테스트 버전 — '새 버전 지정 시' 이벤트로 설정된 활성 계획을 바로 실행한다 */
  const { autoRun } = useRunner();
  const onNewDefault = (b) => {
    const ps = (mqaPlans || []).filter((p) => p.status === "활성" && p.systemId === sys.id && p.env === env.env && isOnNewBuild(p.schedule));
    const rs = ps.map((p) => autoRun(p, "새 버전", b));
    return ps.length ? " · 계획 " + ps.length + "건 " + (rs.some((r) => r.blocked) ? "실행 (일부 실행 불가)" : "실행 시작") : "";
  };
  const makeDefault = (b) => { patchApp({ defBuild: b.id }, { ver: b.ver, status: "미확인" }); setCheck(null); flash("기본 테스트 버전 → v" + b.ver + onNewDefault(b)); };
  const delBuild = (b) => {
    if (b.id === app.defBuild) { flash("기본 테스트 버전은 삭제할 수 없습니다 — 다른 버전을 기본으로 지정한 뒤 삭제하세요"); return; }
    if (!window.confirm("v" + b.ver + " 파일을 삭제할까요?")) return;
    patchApp({ builds: app.builds.filter((x) => x.id !== b.id) }); flash("v" + b.ver + " 삭제됨");
  };

  /* ── 앱 실행 확인 — 테스트 기기의 단말에 기본 버전을 설치 → 실행 → 첫 화면 캡처.
     올린 파일이 실제로 설치·실행되는지가 이 화면에서 확인할 수 있는 유일한 '연결' 이다.
     단말은 확인하는 동안 점유한다 (1단말 1작업). 쓸 수 없는 단말이면 사유를 보여주고 시작하지 않는다 ── */
  const devs = flatDevices(mqaRunners);
  const devId = mqaWork.devId || "";
  const setDevId = (v) => setMqaWork({ devId: v });   // 테스트케이스의 작업 단말과 같은 선택을 공유한다
  const dev = devs.find((x) => x.id === devId) || pickDefault(devs, defB);
  /* 앱 실행 확인 — 설치 · 실행 → 웹 화면 대기 → 판정.
     상용 앱은 권한 안내 · 로그인 같은 앞 화면이 네이티브인 경우가 많아 첫 화면에서는 웹뷰가 없다.
     사람이 단말에서 웹 화면까지 직접 진행하는 동안 러너가 몇 초마다 웹 영역(WEBVIEW 컨텍스트)을 찾는다.
       · 웹 영역이 생김 → 연결됨, 현재 주소를 읽는다
       · 화면에 WebView 요소는 있는데 웹 영역이 안 생김 → 디버깅이 꺼진 빌드
       · 3분 안에 웹 화면에 가지 않음 / 건너뛰기 → 확인 안 함
     목업: 4초 뒤 사용자가 웹 화면에 도착한 것으로 처리한다 */
  const WAIT_SEC = 180;
  const ckTimers = useRef([]); const ckDev = useRef(null);
  const ckClear = () => { ckTimers.current.forEach((t) => clearTimeout(t)); ckTimers.current = []; };
  useEffect(() => () => { ckClear(); if (ckDev.current) releaseMqaDevice(ckDev.current); }, []);
  const ckFinish = (web, url, d, b) => {
    ckClear(); releaseMqaDevice(d.id); ckDev.current = null;
    const r = { at: mqaStamp(), device: d.model + " · " + osName(d.sdk), ver: b.ver, web, url: web ? url : "" };
    setCheck({ s: "ok", ...r });
    patchEnv({ status: "확인됨", lastCheck: r });
  };
  const runCheck = () => {
    if (!defB) { setCheck({ s: "err", m: "기본 테스트 버전이 없습니다 — 앱 설치 파일을 먼저 올리세요" }); patchEnv({ status: "실패" }); return; }
    const b = deviceBlock(dev, defB);
    if (b) { setCheck({ s: "err", m: b, dev: true }); return; }   // 단말 문제는 앱 문제가 아니다 — 환경 상태를 '실패'로 바꾸지 않는다
    const d = dev, bd = defB, sim = defB._sim || { web: true, url: "" };
    lockMqaDevice(d.id, "앱 실행 확인 " + sys.name); ckDev.current = d.id;
    setCheck({ s: "run", device: devLabel(d), ver: bd.ver });
    ckTimers.current.push(setTimeout(() => {
      const until = Date.now() + WAIT_SEC * 1000;
      setCheck({ s: "wait", device: devLabel(d), ver: bd.ver, left: WAIT_SEC, finish: (web) => ckFinish(web, sim.url, d, bd) });
      const tick = () => { const left = Math.max(0, Math.round((until - Date.now()) / 1000)); if (!left) { ckFinish(null, "", d, bd); return; } setCheck((c) => (c && c.s === "wait" ? { ...c, left } : c)); ckTimers.current.push(setTimeout(tick, 1000)); };
      ckTimers.current.push(setTimeout(tick, 1000));
      ckTimers.current.push(setTimeout(() => ckFinish(!!sim.web, sim.url, d, bd), 4000));
    }, 1200));
  };
  const last = check && check.s === "ok" ? check : (env || {}).lastCheck && (env || {}).status === "확인됨" ? env.lastCheck : null;

  const header = (
    <PageToolbar desc="대상(앱) → 환경(스테이징·운영·개발) · 앱 설치 파일 · 테스트 계정" />
  );
  const targetModal = modal && (
    <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">{modal === "target" ? "대상 추가" : "환경 추가"}</h3><button onClick={() => setModal(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
        <div className="space-y-3.5 p-5">
          {modal === "target" && (<>
            <Field label="대상 이름"><Input value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} placeholder="예: 샘플 쇼핑 앱" /></Field>
            <Field label="첫 환경"><Select value={tf.env} onChange={(e) => setTf({ ...tf, env: e.target.value })}>{ENV_NAMES.map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500">앱 설치 파일은 대상을 만든 뒤 환경별로 올립니다.</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addTarget}>추가</Btn></div>
          </>)}
          {modal === "env" && (<>
            <Field label="환경" hint="이미 등록된 환경은 선택할 수 없습니다"><Select value={ef.env} onChange={(e) => setEf({ env: e.target.value })}>{envOpts.map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-500">같은 앱의 다른 환경입니다 — 환경마다 테스트할 앱 버전과 계정을 따로 둡니다.</div>
            <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={Save} onClick={addEnv}>추가</Btn></div>
          </>)}
        </div>
      </div>
    </div></Portal>
  );

  if (!sys) return (
    <div className="space-y-4">
      {header}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징" }); setModal("target"); }}>대상 추가</Btn>
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 대상이 없습니다.</div>
        </div>
        <div className="col-span-9">
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Smartphone size={26} className="text-slate-400" />
            <div className="mt-3 text-sm font-medium text-slate-700">테스트할 앱을 먼저 등록하세요</div>
            <div className="mt-1.5 max-w-md text-xs text-slate-500">대상(앱)과 환경을 만들고 앱 설치 파일을 올리면 테스트케이스를 만들고 실행할 수 있습니다.</div>
            <div className="mt-4"><Btn kind="primary" icon={Plus} onClick={() => { setTf({ name: "", env: "스테이징" }); setModal("target"); }}>대상 추가</Btn></div>
          </Card>
        </div>
      </div>
      {targetModal}
      <Toast msg={msg} />
    </div>
  );

  return (
    <div className="space-y-4">
      {header}
      <input ref={fileRef} type="file" accept=".apk,.aab" className="hidden" onChange={onFile} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setTf({ name: "", env: "스테이징" }); setModal("target"); }}>대상 추가</Btn>
          {systems.map((sy, i) => (
            <Card key={sy.id} className={"cursor-pointer p-3 " + (sel === i ? SEL_CARD : SEL_IDLE)}>
              <div onClick={() => choose(i)}>
                <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Smartphone size={13} className="text-slate-500" />{sy.name}</span><button onClick={(e) => { e.stopPropagation(); delTarget(sy); }} className="text-slate-500 hover:text-red-600" title="대상 삭제"><X size={12} /></button></div>
                <div className="mt-1.5 flex flex-wrap gap-1">{sy.envs.map((e) => <Badge key={e.env} kind={e.prod ? "warn" : "info"}>{e.env}</Badge>)}</div>
              </div>
            </Card>
          ))}
        </div>

        <div className="col-span-9 space-y-3">
          {/* 헤더 — 이름·상태·플랫폼 / 앱 실행 확인·설정 저장 / 환경 탭 (FQA 와 같은 배치) */}
          <Card className="space-y-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="w-56 shrink-0"><Input value={nameDraft ?? sys.name} onChange={(e) => setNameDraft(e.target.value)} className="text-base font-semibold" /></div>
                <Badge kind={env.status === "확인됨" && (env.lastCheck || {}).web === false ? "warn" : ST_K[env.status] || "warn"}>{env.status === "확인됨" ? ((env.lastCheck || {}).web === false ? "웹 화면 연결 안 됨" : "실행 확인됨") : env.status === "실패" ? "확인 실패" : "실행 미확인"}</Badge>
              </div>
              <div className="flex shrink-0 items-center gap-2">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2.5">
              <span className="mr-1 text-xs text-slate-500">환경</span>
              {sys.envs.map((e, i) => (<button key={e.env} onClick={() => guardSwitch(() => { setEnvIdx(i); setCheck(null); })} className={"rounded-lg px-3 py-1.5 text-xs font-medium " + (envIdx === i ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-800")}>{e.env}{e.prod ? " ●" : ""}</button>))}
              {envOpts.length > 0 && <button onClick={() => { setEf({ env: envOpts[0] }); setModal("env"); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">+ 환경</button>}
              {sys.envs.length > 1 && <button onClick={delEnv} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:text-red-600" title="현재 환경 삭제">− 환경</button>}
              {env.prod && <span className="ml-1 text-xs text-amber-700">● 운영 — 실제 사용자 데이터가 있는 환경입니다</span>}
            </div>
          </Card>
          <div className="text-xs text-slate-500">생성 {sys.createdBy || "—"} · {sys.createdAt || "—"} · 수정 {sys.updatedBy || "—"} · {sys.updatedAt || "—"}</div>
          <CheckPanel check={check} last={last} stale={!!last && !!defB && last.ver !== defB.ver} devs={devs} dev={dev} setDevId={setDevId} defB={defB} onRun={runCheck} goTo={goTo} />

          <div className="grid grid-cols-2 items-start gap-3">
            {/* 앱 (Android) — FQA '접점' 자리. 파일 작업은 즉시 반영 */}
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Smartphone size={15} className="text-sky-600" />앱 (Android) <span className="text-xs font-normal text-slate-500">· 접점</span></div>
                <span className="text-xs text-slate-500">파일 작업은 즉시 반영</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs">
                <span className="text-slate-500">앱 ID</span>
                {app.appId ? <span className="font-mono text-slate-700">{app.appId}</span> : <span className="text-slate-500">첫 파일을 올리면 자동 확인</span>}
              </div>
              {(app.builds || []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center">
                  <div className="text-xs text-slate-500">이 환경에서 테스트할 앱 설치 파일이 없습니다</div>
                  <div className="mt-3"><Btn kind="primary" icon={Upload} onClick={pickFile}>앱 설치 파일 올리기</Btn></div>
                </div>
              ) : (<>
                <div className="space-y-1.5">
                  {app.builds.map((b) => {
                    const isDef = b.id === app.defBuild;
                    return (
                      <div key={b.id} className={"rounded-lg border px-3 py-2 " + (isDef ? "border-sky-300 bg-sky-50" : "border-slate-200")}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2"><span className="font-mono text-sm font-semibold text-slate-800">v{b.ver}</span><span className="font-mono text-xs text-slate-500">({b.code})</span>{isDef && <Badge kind="active">기본 테스트 버전</Badge>}</div>
                          <div className="flex shrink-0 items-center gap-2">
                            {!isDef && <button onClick={() => makeDefault(b)} className="text-xs text-sky-600 hover:underline">기본으로</button>}
                            {!isDef && <button onClick={() => delBuild(b)} className="text-slate-400 hover:text-red-600" title="파일 삭제"><Trash2 size={13} /></button>}
                          </div>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">{osOf(b.minSdk || 26)} · {b.file} · {fmtSize(b.size)}</div>
                        <div className="truncate text-xs text-slate-500">{b.at} · {b.by}</div>
                        {b.note && <div className="mt-0.5 text-xs text-slate-600">{b.note}</div>}
                      </div>
                    );
                  })}
                </div>
                <Btn icon={Upload} className="w-full" onClick={pickFile}>새 버전 올리기</Btn>
              </>)}
              <div className="text-xs text-slate-500">버전·빌드 번호·앱 ID·최소 지원 OS는 파일에서 자동으로 읽습니다. 괄호 안 숫자가 빌드 번호이고, 최신 판단은 빌드 번호로 합니다. 실행 계획에서 버전을 지정하지 않으면 <span className="text-slate-700">기본 테스트 버전</span>으로 실행합니다.</div>
            </Card>

            {/* 테스트 계정 — FQA 계정 풀과 동일. 로그인은 '흐름'이므로 케이스가 수행하고, 환경은 '누구로' 만 제공한다 */}
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">테스트 계정</div>
                <button onClick={() => setEnvCfg({ accts: [...(cfg.accts || []), { role: "", acct: "", secretRef: "" }] })} className="text-xs text-sky-600">+ 계정</button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-1 text-xs text-slate-500"><span className="w-20 shrink-0">역할</span><span className="w-28 shrink-0">계정 ID</span><span className="flex-1">비밀번호 (변수 참조)</span><span className="w-4" /></div>
                {(cfg.accts || []).map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-20 shrink-0"><Input value={a.role || ""} onChange={(e) => setEnvCfg({ accts: cfg.accts.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} placeholder="일반" /></div>
                    <div className="w-28 shrink-0"><Input value={a.acct || ""} onChange={(e) => setEnvCfg({ accts: cfg.accts.map((x, j) => (j === i ? { ...x, acct: e.target.value } : x)) })} placeholder="qa_user02" className="font-mono text-xs" /></div>
                    <div className="min-w-0 flex-1">{secretRef(a.secretRef, (val) => setEnvCfg({ accts: cfg.accts.map((x, j) => (j === i ? { ...x, secretRef: val } : x)) }), "${stg_test_pw}")}</div>
                    <button onClick={() => setEnvCfg({ accts: cfg.accts.filter((_, j) => j !== i) })} className="shrink-0 text-slate-500 hover:text-red-600" title="계정 삭제"><X size={12} /></button>
                  </div>
                ))}
                {(!cfg.accts || cfg.accts.length === 0) && <div className="px-1 py-2 text-xs text-slate-500">이 환경의 계정이 없습니다 — + 계정으로 추가</div>}
              </div>
              <div className="text-xs text-slate-500">케이스의 <span className="text-slate-700">실행 계정 역할</span>과 같은 역할의 계정이 <span className="font-mono text-sky-600">{"${계정 ID}"}</span>·<span className="font-mono text-sky-600">{"${계정 비밀번호}"}</span>로 주입됩니다.{env.prod && " 운영 환경은 테스트 전용(합성) 계정만 쓰세요."}</div>
            </Card>
          </div>
        </div>
      </div>

      {targetModal}

      {/* 올린 파일 확인 — 자동으로 읽은 값을 보여주고 기본 버전 지정 여부만 묻는다 */}
      {pending && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPending(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"><h3 className="font-semibold text-slate-900">앱 설치 파일 확인</h3><button onClick={() => setPending(null)} className="text-slate-500 hover:text-slate-800"><X size={18} /></button></div>
            <div className="space-y-3 p-5 text-sm">
              <div className="space-y-1.5 rounded-lg bg-slate-100 p-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">파일</span><span className="truncate pl-3 text-slate-700">{pending.file} · {fmtSize(pending.size)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">버전</span><span className="font-mono text-slate-800">v{pending.ver} <span className="text-slate-500">· 빌드 번호 {pending.code}</span></span></div>
                <div className="flex justify-between"><span className="text-slate-500">최소 지원 OS</span><span className="text-slate-800">{osOf(pending.minSdk)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">앱 ID</span><span className="font-mono text-slate-800">{pending.appId}</span></div>
                <div className="text-slate-500">위 값은 파일에서 자동으로 읽었습니다.</div>
                <div className="flex justify-between"><span className="text-slate-500">환경</span><span className="text-slate-700">{sys.name} · {env.env}</span></div>
              </div>
              <Field label="메모 (선택)"><Input value={pending.note} onChange={(e) => setPending({ ...pending, note: e.target.value })} placeholder="예: 보안 기능 해제 테스트 빌드" /></Field>
              <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={pending.makeDefault} onChange={(e) => setPending({ ...pending, makeDefault: e.target.checked })} />이 버전을 기본 테스트 버전으로 지정</label>
              <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setPending(null)}>취소</Btn><Btn kind="primary" icon={Upload} onClick={confirmUpload}>올리기</Btn></div>
            </div>
          </div>
        </div></Portal>
      )}

      {block && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBlock(null)}>
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5"><AlertTriangle size={16} className="text-amber-600" /><h3 className="font-semibold text-slate-900">삭제할 수 없습니다</h3></div>
            <div className="space-y-3 p-5 text-sm">
              <div className="text-slate-700"><span className="font-semibold text-amber-700">{block.what}</span>을(를) 참조하는 실행 계획이 <span className="font-semibold text-amber-700">{block.plans.length}건</span> 있습니다.</div>
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">{block.plans.map((p) => (<div key={p.id} className="flex items-center gap-2 text-xs"><ClipboardList size={12} className="text-slate-500" /><span className="text-slate-700">{p.name}</span></div>))}</div>
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
