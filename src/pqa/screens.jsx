// ============================================================
// PQA(앱 성능) — 준비·설계 화면. 대상·환경 / 측정 시나리오 / 측정 계획.
// 목록=카드 + 좌측 추가버튼 + 3:9(좌:우) — 타 QA 도메인 대상·환경과 동일 구성.
// nqa/perf.jsx에서 분리(2026-07).
// ============================================================
import { useState, useEffect } from "react";
import { useApp } from "../common/context.js";
import { C, SERIES, TOOLTIP } from "../common/theme.js";
import { VarRefInput } from "../common/VarRefInput.jsx";
import { ScheduleConfig } from "../common/ScheduleConfig.jsx";
import { Card, PageToolbar, Badge, Btn, Field, Input, Select, Toggle, Toast, useToast, nowStamp, RunTime, Portal, SEL_CARD, SEL_IDLE, SEL_ROW } from "../common/ui.jsx";
import { Plus, X, Smartphone, Cpu, Zap, Package, Save, RefreshCw, Copy, Play, Activity, Code2, Gauge, ChevronLeft, Download, Bug, CheckCircle2, TrendingUp, AlertTriangle, ClipboardList } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { PERF_PLATFORMS, PERF_BUILD_SOURCES, PERF_VARIANTS, PERF_METRICS, PERF_DEVICES, PERF_LAB, PERF_ENV } from "./data.js";

const PQA_EVENTS = [{ key: "deploy", label: "배포 시", desc: "대상 앱에 새 빌드가 배포되면 자동 측정합니다", short: "배포", fields: [{ k: "detect", type: "readonly", label: "감지 방식", value: "대상 앱의 CI 배포 웹훅 (상속)" }] }];
const genSecret = () => "whsec_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

const cardCls = (on) => "cursor-pointer p-3 " + (on ? SEL_CARD : SEL_IDLE);
const Modal = ({ title, onClose, children }) => (
  <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="text-base font-semibold text-slate-900">{title}</div>
      {children}
    </div>
  </div></Portal>
);

/* ═══════════ 대상·환경 (앱 빌드 + 단말·환경) ═══════════ */
export function PqaTargetScreen() {
  const { perfApps, perfScenarios, perfPlans, addPerfApp, updatePerfApp, removePerfApp, toast, setNavGuard } = useApp();
  const [sel, setSel] = useState(0);
  const [modal, setModal] = useState(false);
  const [nf, setNf] = useState({ name: "", pkg: "" });
  const app = perfApps[sel] || perfApps[0];
  const [draft, setDraft] = useState({});
  const [syncedId, setSyncedId] = useState(null);
  useEffect(() => {
    if (app) { setDraft({ name: (app || {}).name, pkg: (app || {}).pkg, version: (app || {}).version, versionCode: (app || {}).versionCode || "", variant: (app || {}).variant || PERF_VARIANTS[0], source: (app || {}).source, build: (app || {}).build, signed: !!(app || {}).signed, artifactUrl: (app || {}).artifactUrl || "", benchApkUrl: (app || {}).benchApkUrl || "", benchApk: (app || {}).benchApk || "", tokenRef: (app || {}).tokenRef || "", buildFile: (app || {}).buildFile || "", benchModule: (app || {}).benchModule || ":benchmark", deploySecret: (app || {}).deploySecret || "" }); setSyncedId((app || {}).id); }
  }, [app && (app || {}).id]);
  const setD = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const FIELDS = ["name", "pkg", "version", "versionCode", "variant", "source", "build", "signed", "artifactUrl", "benchApkUrl", "benchApk", "tokenRef", "buildFile", "benchModule", "deploySecret"];
  const nz = (v) => (v == null ? "" : v);
  const dirty = !!app && syncedId === (app || {}).id && FIELDS.some((k) => (k === "signed" ? !!draft[k] !== !!app[k] : k === "variant" ? (draft[k] || PERF_VARIANTS[0]) !== (app[k] || PERF_VARIANTS[0]) : nz(draft[k]) !== nz(app[k])));
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const saveCfg = () => {
    if (!(draft.name || "").trim() || !(draft.pkg || "").trim()) { toast("앱 이름과 패키지 id는 비울 수 없습니다", "warn"); return; }
    updatePerfApp((app || {}).id, { name: draft.name.trim(), pkg: draft.pkg.trim(), version: draft.version, versionCode: draft.versionCode, variant: draft.variant, source: draft.source, build: draft.build, signed: draft.signed, artifactUrl: draft.artifactUrl, benchApkUrl: draft.benchApkUrl, benchApk: draft.benchApk, tokenRef: draft.tokenRef, buildFile: draft.buildFile, benchModule: draft.benchModule, deploySecret: draft.deploySecret });
    toast("저장되었습니다", "ok");
  };
  const parseBuild = () => {
    const src = draft.source;
    const ok = src === "CI 아티팩트" ? (draft.artifactUrl || "").trim() : (draft.buildFile || "").trim();
    // 벤치마크 APK가 없으면 파싱이 통과해도 측정할 수 없다 — 여기서 알려준다
    const benchOk = src === "CI 아티팩트" ? (draft.benchApkUrl || "").trim() : (draft.benchApk || "").trim();
    if (!ok) { toast(src === "직접 업로드" ? "빌드 파일을 먼저 선택하세요" : "아티팩트 URL을 먼저 입력하세요", "warn"); return; }
    const fname = src === "직접 업로드" ? draft.buildFile : ((draft.artifactUrl || "").split("/").pop() || "app-release.apk");
    setD({ version: draft.version && draft.version !== "-" ? draft.version : "1.0.0", versionCode: draft.versionCode && draft.versionCode !== "-" ? draft.versionCode : "10000", signed: true, build: fname });
    setD({ benchApk: benchOk ? (src === "CI 아티팩트" ? ((draft.benchApkUrl || "").split("/").pop() || "macrobenchmark.apk") : draft.benchApk) : "" });
    toast(benchOk ? "앱·벤치마크 APK에서 버전·versionCode·서명을 추출했습니다"
      : "앱 빌드는 확인했으나 벤치마크 테스트 APK가 없습니다 — 측정할 수 없습니다", benchOk ? "ok" : "warn");
  };
  const add = () => {
    if (!nf.name.trim() || !nf.pkg.trim()) { toast("앱 이름과 패키지 id를 입력하세요", "warn"); return; }
    addPerfApp({ id: Date.now(), name: nf.name.trim(), platform: "Android", pkg: nf.pkg.trim(), version: "-", versionCode: "-", variant: "release·profileable", source: "CI 아티팩트", build: "-", signed: false, artifactUrl: "", tokenRef: "", buildFile: "", benchModule: ":benchmark", deploySecret: genSecret() });
    setSel(0); setModal(false); toast("대상 앱 추가됨 — 상세에서 빌드를 연결하고 '빌드 파싱'을 실행하세요", "ok");
  };
  const deployHook = app ? ("https://proba.co.kr/api/hooks/perf/" + (app || {}).id + "-" + String((app || {}).pkg || "app").replace(/[^a-z0-9]+/gi, "-") + "-9c1e") : "";
  const selectApp = (i) => { if (i === sel) return; if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 저장하지 않고 다른 앱으로 이동할까요?")) return; setSel(i); };
  const del = (a) => {
    const scn = (perfScenarios || []).filter((s) => s.appId === a.id).length;
    const pln = (perfPlans || []).filter((p) => p.appId === a.id).length;
    const warn = (scn || pln) ? "\n\n연결된 측정 시나리오 " + scn + "건 · 측정 계획 " + pln + "건이 이 앱을 참조합니다. 삭제하면 해당 항목의 대상이 사라집니다." : "";
    if (!window.confirm(a.name + " 대상 앱을 삭제할까요?" + warn)) return;
    removePerfApp(a.id); setSel(0); toast(a.name + " 삭제됨", "warn");
  };
  return (
    <div className="space-y-4">
      <PageToolbar desc="대상 앱(빌드) — Android 우선, iOS 확장 예정" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-2">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={() => { setNf({ name: "", pkg: "" }); setModal(true); }}>대상 앱 추가</Btn>
          {perfApps.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 대상 앱이 없습니다.</div>}
          {perfApps.map((a, i) => (
            <Card key={a.id} className={cardCls(sel === i)}>
              <div onClick={() => selectApp(i)}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{a.name}</span><div className="flex items-center gap-1.5"><Badge kind="pass">{a.platform}</Badge><button onClick={(e) => { e.stopPropagation(); del(a); }} className="text-slate-500 hover:text-red-600" title="삭제"><X size={12} /></button></div></div>
                <div className="mt-1 truncate font-mono text-xs text-slate-500">{a.pkg}</div>
                <div className="mt-0.5 text-xs text-slate-500">v{a.version} · {a.source}</div>
              </div>
            </Card>
          ))}
        </div>
        <div className="col-span-9 space-y-4">
          {perfApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Smartphone size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">대상 앱을 먼저 등록하세요</div>
              <div className="mt-1.5 max-w-md text-xs text-slate-500">측정할 앱과 빌드 소스를 등록해야 시나리오를 만들고 단말에서 측정할 수 있습니다.</div>
            </div>
          ) : (<>
          {app && (
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2"><div className="w-64 shrink-0"><Input value={draft.name || ""} onChange={(e) => setD({ name: e.target.value })} className="text-base font-semibold" /></div><Badge kind="pass">{app.platform}</Badge></div>
              <div className="flex shrink-0 items-center gap-3">{dirty && <span className="text-xs text-amber-700">미저장 변경</span>}<Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="패키지 id"><Input value={draft.pkg || ""} onChange={(e) => setD({ pkg: e.target.value })} /></Field>
              <Field label="벤치마크 모듈" hint="Macrobenchmark 테스트 Gradle 모듈 (앱당 1개)"><Input value={draft.benchModule || ""} onChange={(e) => setD({ benchModule: e.target.value })} placeholder=":benchmark" className="font-mono text-xs" /></Field>
              <Field label="빌드 변형"><Select value={draft.variant || PERF_VARIANTS[0]} onChange={(e) => setD({ variant: e.target.value })}>{PERF_VARIANTS.map((v) => <option key={v}>{v}</option>)}</Select></Field>
              <Field label="빌드 소스"><Select value={draft.source || PERF_BUILD_SOURCES[0]} onChange={(e) => setD({ source: e.target.value, version: "-", versionCode: "-", build: "-", signed: false })}>{PERF_BUILD_SOURCES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            </div>
            {String(draft.variant || "").includes("debug") && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">debug 빌드는 최적화가 꺼져 측정값이 왜곡됩니다 — release·profileable 권장.</div>}

            <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-700">빌드 연결 · {draft.source}</span><Btn icon={Package} onClick={parseBuild}>빌드 파싱</Btn></div>
              {draft.source === "CI 아티팩트" && (
                <div className="space-y-3">
                  <Field label="아티팩트 URL"><Input value={draft.artifactUrl || ""} onChange={(e) => setD({ artifactUrl: e.target.value })} placeholder="https://ci.onmarket.io/artifacts/app/9.12.0/app-release.apk" className="font-mono text-xs" /></Field>
                  {/* 러너는 APK를 두 개 설치한다 — 앱과 벤치마크 테스트. 벤치마크 APK가 없으면 실행 자체가 불가능하다 */}
                  <Field label="벤치마크 테스트 APK URL" hint="Macrobenchmark 모듈의 androidTest 산출물"><Input value={draft.benchApkUrl || ""} onChange={(e) => setD({ benchApkUrl: e.target.value })} placeholder="https://ci.example.io/artifacts/macrobenchmark-1.0.0.apk" className="font-mono text-xs" /></Field>
                  <Field label="인증 토큰 (변수 참조)"><VarRefInput value={draft.tokenRef || ""} onChange={(v) => setD({ tokenRef: v })} placeholder="${ci_token}" /></Field>
                  <Field label="배포 웹훅 (CI가 호출)"><div className="flex items-center gap-2"><div className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 font-mono text-xs text-slate-700" title={deployHook}>{deployHook}</div><Btn icon={Copy} onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(deployHook); toast("웹훅 URL 복사됨", "ok"); }}>복사</Btn></div></Field>
                  <Field label="웹훅 서명 시크릿 (CI에서 HMAC 서명에 사용)"><div className="flex items-center gap-2"><div className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 font-mono text-xs text-slate-500">{draft.deploySecret ? "whsec_" + "•".repeat(20) + draft.deploySecret.slice(-4) : <span className="text-slate-500">미발급</span>}</div><Btn icon={Copy} onClick={() => { if (navigator.clipboard && draft.deploySecret) navigator.clipboard.writeText(draft.deploySecret); toast("서명 시크릿 복사됨", "ok"); }}>복사</Btn><Btn icon={RefreshCw} onClick={() => setD({ deploySecret: genSecret() })}>재생성</Btn></div></Field>
                  <div className="text-xs text-slate-500">CI 배포 잡 마지막에 이 웹훅을 <span className="text-slate-700">서명 시크릿으로 HMAC 서명</span>해 호출하면 측정 계획의 '배포 시' 이벤트가 트리거됩니다. 재생성 시 CI 설정도 갱신하세요.</div>
                </div>
              )}
              {draft.source === "직접 업로드" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-800 hover:border-sky-500">파일 선택<input type="file" accept=".apk" className="hidden" onChange={(e) => { const f = (e.target.files || [])[0]; if (f) setD({ buildFile: f.name }); }} /></label>
                    <span className="font-mono text-xs text-slate-500">{draft.buildFile || "선택된 파일 없음 (.apk)"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-800 hover:border-slate-400">벤치마크 APK 선택<input type="file" className="hidden" onChange={(e) => setD({ benchApk: (e.target.files && e.target.files[0] && e.target.files[0].name) || "" })} /></label>
                    <span className="font-mono text-xs text-slate-500">{draft.benchApk || "선택된 파일 없음 (macrobenchmark-*.apk)"}</span>
                  </div>
                  <div className="text-xs text-slate-500">CI 밖의 로컬·수동 빌드를 직접 업로드합니다.</div>
                </div>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold text-slate-500">빌드 메타 <span className="font-normal text-slate-500">· 빌드에서 자동 추출 (읽기 전용)</span></div>
              <div className="grid grid-cols-5 gap-3">
                <Field label="버전 이름"><div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 text-sm text-slate-700">{draft.version && draft.version !== "-" ? draft.version : <span className="text-slate-500">미확인</span>}</div></Field>
                <Field label="versionCode"><div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 text-sm text-slate-700">{draft.versionCode && draft.versionCode !== "-" ? draft.versionCode : <span className="text-slate-500">미확인</span>}</div></Field>
                <Field label="빌드 아티팩트"><div className="truncate rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 font-mono text-xs text-slate-700" title={draft.build}>{draft.build && draft.build !== "-" ? draft.build : <span className="text-slate-500">미확인</span>}</div></Field>
                <Field label="벤치마크 APK"><div className={"truncate rounded-lg border px-2.5 py-2 font-mono text-xs " + (draft.benchApk ? "border-slate-200 bg-slate-100/50 text-slate-700" : "border-red-200 bg-red-50 text-red-700")}>{draft.benchApk || "없음 — 측정 불가"}</div></Field>
                <Field label="서명"><div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2"><Badge kind={draft.signed ? "pass" : "warn"}>{draft.signed ? "서명됨" : "미서명"}</Badge></div></Field>
              </div>
            </div>
          </Card>
          )}
          </>)}
        </div>
      </div>
      {modal && (
        <Modal title="대상 앱 추가" onClose={() => setModal(false)}>
          <Field label="앱 이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 온마켓" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="플랫폼"><Select value="Android" onChange={() => {}}>{PERF_PLATFORMS.map((p) => <option key={p.id} value={p.id} disabled={!p.ready}>{p.label}{!p.ready ? " (준비중)" : ""}</option>)}</Select></Field>
            <Field label="패키지 id"><Input value={nf.pkg} onChange={(e) => setNf({ ...nf, pkg: e.target.value })} placeholder="com.onmarket.app" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={add}>추가</Btn></div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════ 측정 시나리오 (여정 + 지표 + 마커) ═══════════ */
export function PqaScenarioScreen() {
  const { perfScenarios, perfApps, perfPlans, addPerfScenario, updatePerfScenario, removePerfScenario, toast, goTo } = useApp();
  const [sel, setSel] = useState(0);
  const [modal, setModal] = useState(false);
  const [nf, setNf] = useState({ name: "", appId: "", scriptRef: "" });
  const scn = perfScenarios[sel] || perfScenarios[0];
  const appName = (id) => (perfApps.find((a) => a.id === id) || {}).name || "-";
  const scnApp = (perfApps.find((a) => a.id === (scn && (scn || {}).appId))) || {};
  const [draft, setDraft] = useState({});
  const [syncedId, setSyncedId] = useState(null);
  useEffect(() => {
    if (scn) { setDraft({ scriptRef: (scn || {}).scriptRef || "" }); setSyncedId((scn || {}).id); }
  }, [scn && (scn || {}).id]);
  const setD = (patch) => setDraft((d) => ({ ...d, ...patch }));
  /* 🔑 테스트 참조가 바뀌면 다른 테스트를 가리키게 된다 — 기존 확정 지표는 그 테스트의 것이 아니다.
     미확정으로 되돌려 다음 측정에서 다시 확정하게 한다. F7 리비전 원칙과 같다(참조가 바뀌면 연결이 끊긴다). */
  const applyRef = () => {
    const ref = (draft.scriptRef || "").trim();
    if (!ref) { toast("테스트(클래스#메서드)를 먼저 입력하세요", "warn"); return; }
    const was = (scn.metrics || []).length > 0;
    updatePerfScenario(scn.id, was ? { scriptRef: ref, metrics: [], journey: "", startMode: "", iterations: 0 } : { scriptRef: ref });
    setSyncedId(scn.id); setDraft({ scriptRef: ref });
    toast(was ? "다른 테스트이므로 미확정으로 되돌립니다 — 다음 측정에서 지표가 다시 확정됩니다" : "테스트 참조 저장됨", was ? "warn" : "ok");
  };
  const isStartup = String((scn && (scn || {}).journey) || "").startsWith("앱 시작");
  const refDirty = !!scn && syncedId === (scn || {}).id && (draft.scriptRef || "") !== ((scn || {}).scriptRef || "");
  /* 🔑 벤치마크 동기화를 하지 않는다.
     Macrobenchmark 코드는 앱 저장소에 있고 앱 개발자가 작성한다 — 플랫폼은 그 소스에 접근하지 않는다.
     무엇이 측정되는지는 '돌려봐야' 안다. 첫 측정 결과(benchmarkData)에서 지표·반복·유형이 확정된다.
     소스 파싱은 저장소 연동과 Kotlin 파싱을 요구하고, 상수 참조·헬퍼 래핑에서 조용히 깨진다. */
  const confirmed = (scn && (scn.metrics || []).length > 0);
  const selectScn = (i) => { if (i === sel) return; if (refDirty && !window.confirm("저장하지 않은 테스트 참조 변경이 있습니다. 그대로 이동할까요?")) return; setSel(i); };
  const add = () => {
    if (!nf.name.trim() || !nf.appId) { toast("이름과 대상 앱을 선택하세요", "warn"); return; }
    addPerfScenario({ id: Date.now(), name: nf.name.trim(), appId: Number(nf.appId), scriptRef: (nf.scriptRef || "").trim(), journey: "", startMode: "", desc: "", metrics: [], traceSection: "", iterations: 0, status: "초안" });
    setSel(0); setModal(false); toast("측정 시나리오 추가됨 — 첫 측정을 하면 산출 지표가 확정됩니다", "ok");
  };
  return (
    <div className="space-y-4">
      <PageToolbar desc="벤치마크 테스트 참조 · 산출 지표는 첫 측정에서 확정" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-2">
          <Btn kind="primary" icon={Plus} className="w-full" disabled={(perfApps || []).length === 0} title={(perfApps || []).length === 0 ? "대상 앱을 먼저 등록하세요" : ""} onClick={() => { setNf({ name: "", appId: perfApps[0] ? String(perfApps[0].id) : "", scriptRef: "" }); setModal(true); }}>시나리오 추가</Btn>
          {perfScenarios.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 시나리오가 없습니다.</div>}
          {perfScenarios.map((s, i) => (
            <Card key={s.id} className={cardCls(sel === i)}>
              <div onClick={() => selectScn(i)}>
                <div className="flex items-center justify-between gap-1.5"><span className="truncate text-sm font-semibold text-slate-900">{s.name}</span><button onClick={(e) => { e.stopPropagation(); const used = (perfPlans || []).filter((p) => (p.scenarioIds || []).includes(s.id)).length; const warn = used ? "\n\n측정 계획 " + used + "건이 이 시나리오를 참조합니다. 삭제하면 해당 계획에서 제외됩니다." : ""; if (!window.confirm(s.name + " 시나리오를 삭제할까요?" + warn)) return; removePerfScenario(s.id); setSel(0); toast(s.name + " 삭제됨", "warn"); }} className="shrink-0 text-slate-500 hover:text-red-600"><X size={12} /></button></div>
                <div className="mt-1 flex items-center gap-1.5"><Badge kind="info">{appName(s.appId)}</Badge>{(s.metrics || []).length ? <span className="text-xs text-slate-500">지표 {(s.metrics || []).length}</span> : <Badge kind="warn">미확정</Badge>}</div>
              </div>
            </Card>
          ))}
        </div>
        {(scn || perfScenarios.length === 0) && (
        <Card className="col-span-9 p-4 space-y-4">
          {perfScenarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">측정 시나리오를 먼저 만드세요</div>
              <div className="mt-1.5 max-w-md text-xs text-slate-500">시나리오는 앱의 어떤 흐름을 측정할지 정합니다. 벤치마크 모듈에서 지표를 인식합니다.</div>
              {(perfApps || []).length === 0 && <Btn className="mt-3" icon={Smartphone} onClick={() => goTo("perf-targets")}>대상 앱 등록하러 가기</Btn>}
            <div className="mt-4 w-64 space-y-1.5 text-left">
              {[["대상 앱 등록", (perfApps || []).length > 0]].map(([label, ok]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  {ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-amber-600" />}
                  <span className={ok ? "text-slate-500" : "text-amber-700"}>{label}</span>
                  <span className="ml-auto text-slate-500">{ok ? "완료" : "필요"}</span>
                </div>
              ))}
            </div>
            </div>
          ) : (<>
          <div className="flex items-center gap-2">
            <div className="w-64 shrink-0"><Input value={scn.name} onChange={(e) => updatePerfScenario(scn.id, { name: e.target.value })} className="text-base font-semibold" /></div><Badge kind="info">{appName(scn.appId)}</Badge>
          </div>
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-700">Macrobenchmark 테스트 참조 <span className="font-normal text-slate-500">· 앱 개발자가 작성한 코드를 가리킨다</span></span><div className="flex items-center gap-2">{refDirty && <><span className="text-xs text-amber-700">미저장 변경</span><Btn kind="primary" icon={Save} onClick={applyRef}>참조 저장</Btn></>}{confirmed ? <Badge kind="pass">확정</Badge> : <Badge kind="warn">미확정</Badge>}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="모듈" hint="대상 앱 설정에서 상속"><div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 font-mono text-xs text-slate-500">{scnApp.benchModule || ":benchmark"}</div></Field>
              <Field label="테스트 (클래스#메서드)"><Input value={draft.scriptRef || ""} onChange={(e) => setD({ scriptRef: e.target.value })} placeholder="HomeScrollBenchmark#scrollHome" className="font-mono text-xs" /></Field>
            </div>
            <Field label="흐름 설명" hint="플랫폼은 코드를 읽지 않는다 — 어떤 조작인지는 사람이 적는다"><Input value={scn.desc || ""} onChange={(e) => updatePerfScenario(scn.id, { desc: e.target.value })} placeholder="예: 로그인 → 홈 진입 → 상품 탭 → 리스트 스크롤 10회" /></Field>
            {!confirmed && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">아직 측정한 적이 없어 산출 지표를 모릅니다 — <span className="font-semibold">첫 측정을 마치면 지표·반복·유형이 확정</span>됩니다. 계획에는 지금도 담을 수 있고, 지표 임계(SLA)는 확정 후 설정합니다.</div>}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">측정에서 확정된 값 <span className="font-normal text-slate-500">· 첫 측정 결과에서 파생 (읽기 전용)</span></div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="측정 유형"><div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 text-sm text-slate-700">{scn.journey || <span className="text-slate-500">미인식</span>}</div></Field>
              {isStartup && <Field label="시작 모드"><div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 text-sm text-slate-700">{scn.startMode || "Cold"}</div></Field>}
              <Field label="반복(iterations)"><div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 text-sm text-slate-700">{scn.iterations != null ? scn.iterations : <span className="text-slate-500">—</span>}</div></Field>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">산출 지표</div>
            <div className="flex flex-wrap gap-1.5">
              {(scn.metrics || []).length === 0 ? <span className="text-xs text-amber-600">첫 측정을 마치면 확정됩니다.</span> : (scn.metrics || []).map((mid) => { const m = PERF_METRICS.find((x) => x.id === mid) || { label: mid, unit: "" }; return <span key={mid} className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs text-sky-700">{m.label} <span className="text-slate-500">({[m.agg, m.unit].filter(Boolean).join(" ") || "-"})</span></span>; })}
            </div>
          </div>

          {(scn.desc || "").trim() && (
            <div><div className="mb-1 text-xs font-semibold text-slate-500">흐름 <span className="font-normal text-slate-500">· 사람이 적은 설명 (시스템이 쓰지 않음)</span></div><div className="text-sm text-slate-700">{scn.desc}</div></div>
          )}

          {isStartup ? (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">E2E 측정 <span className="font-normal text-slate-500">· 내장 지표</span></div>
              <div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 text-sm text-slate-700">StartupTiming <span className="text-xs text-slate-500">· TTID(첫 프레임) / TTFD(reportFullyDrawn)</span></div>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">E2E 구간 (trace) <span className="font-normal text-slate-500">· 앱 코드의 trace 구간</span></div>
              <div className="rounded-lg border border-slate-200 bg-slate-100/50 px-2.5 py-2 font-mono text-sm text-slate-700">{scn.traceSection ? "trace(\"" + scn.traceSection + "\")" : <span className="text-slate-500">—</span>}</div>
            </div>
          )}
          <div className="text-xs text-slate-500">배터리는 사내 랩(전력 리그) 전용 · 시작(Startup) 유형은 여정 없이 콜드/웜/핫만 측정.</div>
          </>)}
        </Card>
        )}
      </div>
      {modal && (
        <Modal title="측정 시나리오 추가" onClose={() => setModal(false)}>
          <Field label="이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 홈→상품목록 스크롤" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="대상 앱"><Select value={nf.appId} onChange={(e) => setNf({ ...nf, appId: e.target.value })}><option value="">선택</option>{perfApps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="테스트 (클래스#메서드)"><Input value={nf.scriptRef} onChange={(e) => setNf({ ...nf, scriptRef: e.target.value })} placeholder="HomeScrollBenchmark#scrollHome" className="font-mono text-xs" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={add}>추가</Btn></div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════ 측정 계획 (조립 + 예산 + 트리거) ═══════════ */
export function PqaPlanScreen() {
  const { perfPlans, perfScenarios, perfApps, perfRuns, addPerfPlan, updatePerfPlan, removePerfPlan, toast, setNavGuard, goTo } = useApp();
  const [sel, setSel] = useState(0);
  const [modal, setModal] = useState(false);
  const [nf, setNf] = useState({ name: "", appId: "" });
  const plan = perfPlans[sel] || perfPlans[0];
  const appName = (id) => (perfApps.find((a) => a.id === id) || {}).name || "-";
  const mkDraft = (p) => ({ name: p.name, status: p.status, scenarioIds: [...(p.scenarioIds || [])], deviceIds: [...((p.matrix && p.matrix.deviceIds) || [])], budget: JSON.parse(JSON.stringify(p.budget || {})), schedule: p.schedule });
  const [draft, setDraft] = useState(() => (plan ? mkDraft(plan) : {}));
  const [syncedId, setSyncedId] = useState(plan ? (plan || {}).id : null);
  // 계획 전환 시 렌더 시점에 draft 동기 재초기화 — useEffect 지연으로 ScheduleConfig(key=(plan || {}).id)가 이전 계획 스케줄로 마운트되는 문제 방지
  if (plan && syncedId !== (plan || {}).id) { setDraft(mkDraft(plan)); setSyncedId((plan || {}).id); }
  const setD = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const add = () => {
    if (!nf.name.trim() || !nf.appId) { toast("이름과 대상 앱을 선택하세요", "warn"); return; }
    addPerfPlan({ id: Date.now(), name: nf.name.trim(), appId: Number(nf.appId), scenarioIds: [], matrix: { deviceIds: [] }, budget: {}, schedule: { mode: "manual", freq: "weekly", time: "09:00", dow: 1, dom: 1, cron: "0 9 * * 1", tz: "Asia/Seoul", active: true, ev: {}, summary: "예약 없음" }, status: "초안" });
    setSel(0); setModal(false); toast("측정 계획이 추가되었습니다", "ok");
  };
  const arrEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  // 스케줄 정규형: 파생 필드(summary)·비활성 ev 키는 무시 → ScheduleConfig 재마운트 방출로 인한 허위 dirty 방지
  const schedKey = (s) => { s = s || {}; const ev = Object.entries(s.ev || {}).filter(([, val]) => val).map(([k]) => k).sort(); return JSON.stringify({ mode: s.mode, freq: s.freq, time: s.time, dow: s.dow, dom: s.dom, cron: s.cron, tz: s.tz, active: s.active, ev }); };
  const dirty = !!plan && syncedId === (plan || {}).id && (
    (draft.name || "") !== ((plan || {}).name || "") ||
    draft.status !== (plan || {}).status ||
    !arrEq(draft.scenarioIds || [], (plan || {}).scenarioIds || []) ||
    !arrEq(draft.deviceIds || [], ((plan || {}).matrix && (plan || {}).matrix.deviceIds) || []) ||
    JSON.stringify(draft.budget || {}) !== JSON.stringify((plan || {}).budget || {}) ||
    schedKey(draft.schedule) !== schedKey((plan || {}).schedule)
  );
  /* 사이드바 이동은 화면 안의 dirty를 모른다 — 전역 가드에 등록하고 떠날 때 해제한다 */
  useEffect(() => { setNavGuard(dirty ? "저장하지 않은 변경이 있습니다. 이동하면 사라집니다.\n\n이동할까요?" : null); return () => setNavGuard(null); }, [dirty]);
  const saveCfg = () => {
    if (!(draft.name || "").trim()) { toast("계획 이름을 비울 수 없습니다", "warn"); return; }
    updatePerfPlan((plan || {}).id, { name: draft.name.trim(), status: draft.status, scenarioIds: draft.scenarioIds, matrix: { ...plan.matrix, deviceIds: draft.deviceIds }, budget: draft.budget, schedule: draft.schedule });
    toast("저장되었습니다", "ok");
  };
  const selectPlan = (i) => { if (i === sel) return; if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 저장하지 않고 다른 계획으로 이동할까요?")) return; setSel(i); };
  /* 임계는 실제로 얼마가 나오는지 봐야 정할 수 있다 — 결과 화면을 오가지 않도록 최근 측정 범위를 여기서 보여준다 */
  const lastRange = (sid, mid) => {
    const rs = (perfRuns || []).filter((r) => r.planId === (plan || {}).id && r.status === "완료").slice(0, 3);
    const vs = rs.flatMap((r) => (r.subjobs || []).filter((x) => x.sid === sid && x.metrics && x.metrics[mid] != null).map((x) => x.metrics[mid]));
    if (!vs.length) return null;
    return { lo: Math.min(...vs), hi: Math.max(...vs) };
  };
  const scnsOf = (id) => perfScenarios.filter((s) => s.appId === id);
  const selScns = perfScenarios.filter((s) => (draft.scenarioIds || []).includes(s.id));
  const setBudget = (sid, mid, val) => { const b = draft.budget || {}; const sb = { ...(b[String(sid)] || {}), [mid]: val === "" ? undefined : +val }; setD({ budget: { ...b, [String(sid)]: sb } }); };
  const planApp = perfApps.find((a) => a.id === (plan && (plan || {}).appId)) || {};
  const ciSource = planApp.source === "CI 아티팩트";
  // 러너는 앱 APK와 벤치마크 테스트 APK를 함께 설치한다 — 하나라도 없으면 이 계획은 실행 자체가 안 된다
  const planBuildOk = !!planApp.signed && planApp.build && planApp.build !== "-" && !!planApp.benchApk;
  const toggleScn = (sid) => { const has = (draft.scenarioIds || []).includes(sid); setD({ scenarioIds: has ? draft.scenarioIds.filter((x) => x !== sid) : [...(draft.scenarioIds || []), sid] }); };
  const toggleDevice = (did) => { const ids = draft.deviceIds || []; const has = ids.includes(did); setD({ deviceIds: has ? ids.filter((x) => x !== did) : [...ids, did] }); };
  const selDevices = PERF_DEVICES.filter((d) => (draft.deviceIds || []).includes(d.id));
  const hasPowerDevice = selDevices.some((d) => d.caps.power && d.status === "온라인");
  const needsPower = selScns.some((s) => (s.metrics || []).includes("batt"));
  /* 🔑 연결 끊김 단말도 선택은 허용한다 — 계획은 지금 만들고 실행은 나중이라,
     지금 끊겼다고 막으면 계획 자체를 못 만든다. 차단은 실행 시점(gate)에서 한다. */
  const offDevices = selDevices.filter((d) => d.status !== "온라인");
  return (
    <div className="space-y-4">
      <PageToolbar desc="대상 앱 + 시나리오 + 기기 매트릭스 + 지표별 SLA + 트리거" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-2">
          <Btn kind="primary" icon={Plus} className="w-full" disabled={(perfApps || []).length === 0} title={(perfApps || []).length === 0 ? "대상 앱을 먼저 등록하세요" : ""} onClick={() => { setNf({ name: "", appId: perfApps[0] ? String(perfApps[0].id) : "" }); setModal(true); }}>계획 추가</Btn>
          {perfPlans.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 계획이 없습니다.</div>}
          {perfPlans.map((p, i) => (
            <Card key={p.id} className={cardCls(sel === i)}>
              <div onClick={() => selectPlan(i)}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{p.name}</span><div className="flex items-center gap-1.5"><Badge kind={p.status === "활성" ? "pass" : "draft"}>{p.status}</Badge><button onClick={(e) => { e.stopPropagation(); if (!window.confirm(p.name + " 측정 계획을 삭제할까요?")) return; removePerfPlan(p.id); setSel(0); toast(p.name + " 삭제됨", "warn"); }} className="text-slate-500 hover:text-red-600"><X size={12} /></button></div></div>
                <div className="mt-1 text-xs text-slate-500">{appName(p.appId)} · 기기 {(p.matrix && p.matrix.deviceIds || []).length} · {(p.schedule && p.schedule.summary) || "예약 없음"}</div>
              </div>
            </Card>
          ))}
        </div>
        {(plan || perfPlans.length === 0) && (
        <Card className="col-span-9 p-4 space-y-4">
          {perfPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList size={26} className="text-slate-400" />
              <div className="mt-3 text-sm font-medium text-slate-700">측정 계획을 만드세요</div>
              <div className="mt-1.5 max-w-md text-xs text-slate-500">계획은 대상 앱과 시나리오·단말을 묶어 무엇을 어디서 측정할지 정합니다.</div>
              {(perfApps || []).length === 0 ? <Btn className="mt-3" icon={Smartphone} onClick={() => goTo("perf-targets")}>대상 앱 등록하러 가기</Btn> : (perfScenarios || []).length === 0 ? <Btn className="mt-3" icon={Activity} onClick={() => goTo("perf-scenarios")}>측정 시나리오 만들러 가기</Btn> : null}
            <div className="mt-4 w-64 space-y-1.5 text-left">
              {[["대상 앱 등록", (perfApps || []).length > 0], ["측정 시나리오 등록", (perfScenarios || []).length > 0]].map(([label, ok]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  {ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-amber-600" />}
                  <span className={ok ? "text-slate-500" : "text-amber-700"}>{label}</span>
                  <span className="ml-auto text-slate-500">{ok ? "완료" : "필요"}</span>
                </div>
              ))}
            </div>
            </div>
          ) : (<>
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2"><div className="w-64 shrink-0"><Input value={draft.name || ""} onChange={(e) => setD({ name: e.target.value })} className="text-base font-semibold" /></div><Badge kind="info">{appName(plan.appId)}</Badge></div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">활성 <Toggle on={draft.status === "활성"} onClick={() => setD({ status: draft.status === "활성" ? "초안" : "활성" })} /></div>
              {dirty && <span className="text-xs text-amber-700">미저장 변경</span>}
              <Btn kind="primary" icon={Save} onClick={saveCfg} disabled={!dirty}>설정 저장</Btn>
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Code2 size={13} className="text-sky-600" />측정 시나리오</div>
            <div className="flex flex-wrap gap-1.5">
              {scnsOf(plan.appId).map((s) => { const on = (draft.scenarioIds || []).includes(s.id); return (
                <button key={s.id} onClick={() => toggleScn(s.id)} className={"rounded-lg border px-2.5 py-1.5 text-xs " + (on ? "border-sky-500 bg-sky-100 text-sky-700" : "border-slate-300 bg-slate-100 text-slate-500")}>{s.name}{!(s.metrics || []).length && <span className="ml-1 text-amber-600" style={{ fontSize: 10 }}>미확정</span>}</button>
              ); })}
              {scnsOf(plan.appId).length === 0 && <span className="text-xs text-slate-500">이 앱의 시나리오가 없습니다 — 측정 시나리오에서 추가하세요.</span>}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Cpu size={13} className="text-sky-600" />단말 선택 <span className="font-normal text-slate-500">· 선택 {selDevices.length}대</span></div>
            {needsPower && !hasPowerDevice && <div className="mb-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">선택 시나리오가 전력(batt)을 수집하나 전력 리그 단말(Pixel)이 없습니다 — 전력 지표가 측정되지 않습니다.</div>}
            {!!offDevices.length && <div className="mb-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">선택 단말 중 {offDevices.length}대가 랩에서 연결이 끊겨 있습니다 — 실행 시점에 연결된 단말로만 측정합니다.</div>}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="w-9 px-3 py-2"></th><th className="font-medium">기기</th><th className="font-medium">OS</th><th className="font-medium">티어</th><th className="font-medium">슬롯</th><th className="font-medium">상태</th><th className="font-medium">역량</th></tr></thead>
                <tbody className="text-slate-700">
                  {PERF_DEVICES.map((d) => { const on = (draft.deviceIds || []).includes(d.id); return (
                    <tr key={d.id} onClick={() => toggleDevice(d.id)} className={"cursor-pointer border-b border-slate-200 last:border-0 hover:bg-slate-100/50 " + (on ? "bg-sky-50/40" : "")}>
                      <td className="px-3 py-2"><input type="checkbox" checked={on} readOnly className="accent-sky-600" /></td>
                      <td className="text-slate-800">{d.model}</td><td className="text-xs text-slate-500">{d.os}</td>
                      <td>{/* 티어는 분류이지 경고가 아니다 — 저사양만 warn 이면 같은 화면의 실제 경고(연결 끊김·전력 미측정)와 섞인다 */}
                      <Badge kind="info">{d.tier}</Badge></td>
                      <td className="font-mono text-xs text-slate-500">{d.slot}</td>
                      <td><Badge kind={d.status === "온라인" ? "ok" : "warn"}>{d.status}</Badge></td>
                      <td className="text-xs"><span className="text-slate-500">{[d.caps.trace && "trace", d.caps.fps && "frame"].filter(Boolean).join("·") || "—"}</span>{d.caps.power ? <span className="ml-1 text-sky-600">· 전력<Zap size={10} className="inline" /></span> : <span className="ml-1 text-slate-500">· 전력 X</span>}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </div>
          {!planBuildOk && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700">
              <span className="font-semibold">{planApp.name || "대상 앱"}</span>은 측정할 수 없습니다 — {!planApp.benchApk ? "벤치마크 테스트 APK가 없습니다" : "앱 빌드가 확보되지 않았습니다"}. 이 계획은 실행 시 차단됩니다.
              <Btn className="mt-2" icon={Smartphone} onClick={() => goTo("perf-targets")}>대상 앱에서 연결하기</Btn>
            </div>
          )}
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Gauge size={13} className="text-sky-600" />지표별 SLA <span className="font-normal text-slate-500">· 시나리오별 지표 임계 · 비우면 게이트 제외 · 미확정은 첫 측정 후 설정</span></div>
            {selScns.length === 0 ? (
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">시나리오를 선택하면 시나리오별 지표 SLA를 설정할 수 있습니다.</div>
            ) : (
              <div className="space-y-3">
                {selScns.map((s) => (
                  <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">{s.name}{s.journey && <Badge kind="info">{s.journey}</Badge>}</div>
                    {(s.metrics || []).length === 0 ? (
                      /* 미확정 시나리오 — 지표를 모르니 임계도 정할 수 없다. 계획에는 담기되 게이트에서 빠진다(AP-011). */
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700"><span className="font-semibold">미확정</span> — 아직 측정한 적이 없어 산출 지표를 모릅니다. <span className="font-semibold">첫 측정에서 지표가 확정</span>되며 그 회차는 임계가 없어 게이트에서 제외됩니다. 확정 후 여기서 임계를 설정하세요.</div>
                    ) : (
                      <>
                      {/* 지표는 확정됐는데 임계가 하나도 없으면 이 시나리오는 영원히 미판정이다 — 조용히 두지 않는다 */}
                      {!PERF_METRICS.some((m) => (s.metrics || []).includes(m.id) && (draft.budget || {})[String(s.id)] && (draft.budget || {})[String(s.id)][m.id] != null) && (
                        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">임계가 하나도 없습니다 — 이 시나리오는 계속 <span className="font-semibold">미판정</span>으로 남습니다.</div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        {PERF_METRICS.filter((m) => (s.metrics || []).includes(m.id)).map((m) => (
                          <div key={m.id} className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                            <div className="mb-0.5 text-xs text-slate-500">{m.label} <span className="text-slate-500">· {m.agg} {m.dir === "up" ? "≥" : "≤"} {m.unit}</span></div>
                            <input type="number" value={(draft.budget && draft.budget[String(s.id)] && draft.budget[String(s.id)][m.id]) != null ? draft.budget[String(s.id)][m.id] : ""} onChange={(e) => setBudget(s.id, m.id, e.target.value)} placeholder="—" className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-sky-500" />
                            {(() => { const r = lastRange(s.id, m.id); return r ? <div className="mt-0.5 text-slate-500" style={{ fontSize: 10 }}>최근 3회 {r.lo === r.hi ? r.lo : r.lo + "~" + r.hi}{m.unit}</div> : null; })()}
                          </div>
                        ))}
                      </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <ScheduleConfig key={plan.id} value={draft.schedule} onChange={(s) => setD({ schedule: s })} events={PQA_EVENTS} singleSelect allowEvent={ciSource} manualHint="자동 실행 없음 — 측정 실행 화면에서 수동으로만 수행합니다." toast={toast} />
            {!ciSource && <div className="mt-1.5 text-xs text-slate-500">배포 이벤트 트리거는 대상 앱 빌드 소스가 'CI 아티팩트'일 때만 사용할 수 있습니다.</div>}
          </div>
          </>)}
        </Card>
        )}
      </div>
      {modal && (
        <Modal title="측정 계획 추가" onClose={() => setModal(false)}>
          <Field label="이름"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 온마켓 릴리스 성능 게이트" /></Field>
          <Field label="대상 앱"><Select value={nf.appId} onChange={(e) => setNf({ ...nf, appId: e.target.value })}><option value="">선택</option>{perfApps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <div className="flex justify-end gap-2 pt-1"><Btn onClick={() => setModal(false)}>취소</Btn><Btn kind="primary" icon={Plus} onClick={add}>추가</Btn></div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════ 측정 실행 (계획 단위 직렬 큐 · 계획 안에서는 단말 병렬 · 시나리오 순차) ═══════════ */
const PRUN_MBASE = { e2e: 1500, frame: 20, jank: 6, mem: 380, batt: 300 };
export function PqaRunScreen() {
  const { perfPlans, perfScenarios, perfApps, perfRuns, addPerfRun, updatePerfRun, removePerfRun, currentUser, updatePerfScenario } = useApp();
  const [msg, flash] = useToast();
  const appNm = (id) => (perfApps.find((a) => a.id === id) || {}).name || "-";
  const runnable = (perfPlans || []).filter((p) => p.status === "활성");
  const [runPlanId, setRunPlanId] = useState((runnable[0] || {}).id || 0);
  const [selId, setSelId] = useState(null);
  const runPlan = (perfPlans || []).find((p) => p.id === runPlanId) || runnable[0] || {};
  const rpDevs = PERF_DEVICES.filter((d) => ((runPlan.matrix && runPlan.matrix.deviceIds) || []).includes(d.id));
  const rpScns = (perfScenarios || []).filter((s) => (runPlan.scenarioIds || []).includes(s.id));
  const rpApp = perfApps.find((a) => a.id === runPlan.appId) || {};
  const rpBuildOk = !!rpApp.signed && rpApp.build && rpApp.build !== "-" && !!rpApp.benchApk;
  const rpNeedsPower = rpScns.some((s) => (s.metrics || []).includes("batt"));
  /* 실행 시점에 랩에 붙어 있는 단말만 측정된다 — 계획이 고른 단말과 다를 수 있다. */
  const rpOnDevs = rpDevs.filter((d) => d.status === "온라인");
  const rpHasPowerDev = rpOnDevs.some((d) => d.caps.power);
  const rpSlaN = Object.values(runPlan.budget || {}).reduce((a, o) => a + Object.values(o || {}).filter((v) => v != null).length, 0);

  /* 🔑 미확정 시나리오는 첫 측정에서 지표가 드러난다.
     benchmarkData에 "무엇이 측정됐는가"가 들어 있다 — 소스를 읽지 않아도 결과로 알 수 있다.
     다만 '어떤 조작을 했는가'는 결과에 없으므로 흐름 설명은 사람이 적는다. */
  const discovered = (scn) => {
    const startup = /startup|cold|warm|hot|launch/i.test(scn.scriptRef || "");
    return startup
      ? { journey: "앱 시작(Startup)", startMode: "Cold", iterations: 10, metrics: ["e2e", "mem"] }
      : { journey: "사용 흐름(Flow)", startMode: "", iterations: 10, metrics: ["e2e", "frame", "jank", "mem"] };
  };
  const metricsOfScn = (scn) => ((scn.metrics || []).length ? scn.metrics : discovered(scn).metrics);
  /* 앱 개발자가 벤치마크에 지표를 추가·제거하면 결과에 그대로 드러난다.
     확정 목록만 보면 새 지표를 조용히 버리게 되므로 회차마다 결과 기준으로 스탬프한다 —
     과거 회차와 비교 축이 달라졌음을 추이 화면이 알아야 한다. */
  const metricSig = (mids) => (mids || []).slice().sort().join(",");
  const simSub = (scn, bdg, dev) => {
    const metrics = {}; let fail = false, gated = false;
    metricsOfScn(scn).forEach((mid) => {
      if (mid === "batt" && !(dev && dev.caps && dev.caps.power)) return; // 전력은 전력 단말에서만 수집
      const b = bdg ? bdg[mid] : undefined;
      const base = b != null ? b : (PRUN_MBASE[mid] || 100);
      const v = Math.round(base * (0.82 + Math.random() * 0.32) * 100) / 100;
      metrics[mid] = v;
      if (b != null) { gated = true; if (v > b) fail = true; }
    });
    return { metrics, batt: 60 + Math.floor(Math.random() * 35), temp: Math.round((29 + Math.random() * 4) * 10) / 10, verdict: gated ? (fail ? "FAIL" : "PASS") : "—" };
  };
  const buildSubjobs = (plan) => {
    const devs = PERF_DEVICES.filter((d) => ((plan.matrix && plan.matrix.deviceIds) || []).includes(d.id) && d.status === "온라인");
    const scns = (perfScenarios || []).filter((s) => (plan.scenarioIds || []).includes(s.id));
    const bud = plan.budget || {};
    const subs = [];
    devs.forEach((d) => scns.forEach((s) => { const r = simSub(s, bud[String(s.id)], d); subs.push({ base: (s.metrics || []).length === 0 || undefined, did: d.id, model: d.model, slot: d.slot, sid: s.id, scn: s.name, journey: s.journey, iters: s.iterations || 10, estIters: !s.iterations || undefined, iter: 0, status: "대기", metrics: r.metrics, verdict: r.verdict }); }));
    return subs;
  };
  const gate = (plan) => {
    if (!plan || !plan.id) { flash("실행할 측정 계획을 선택하세요"); return false; }
    if (plan.status !== "활성") { flash(plan.name + " — 초안 계획은 실행할 수 없습니다 (계획을 활성화)"); return false; }
    if (!(plan.scenarioIds || []).length) { flash(plan.name + " — 선택된 시나리오가 없습니다"); return false; }
    if (!((plan.matrix && plan.matrix.deviceIds) || []).length) { flash(plan.name + " — 선택된 단말이 없습니다"); return false; }
    /* 러너는 랩 호스트에 상주한다 — 랩이 죽어 있으면 큐에 넣어봐야 아무도 가져가지 않는다. */
    if (PERF_LAB.status !== "온라인") { flash(PERF_LAB.name + " 랩 러너가 오프라인입니다 — 랩 호스트 연결을 확인하세요"); return false; }
    if (!PERF_DEVICES.some((d) => ((plan.matrix && plan.matrix.deviceIds) || []).includes(d.id) && d.status === "온라인")) { flash(plan.name + " — 선택 단말이 모두 랩에서 연결이 끊겨 있습니다"); return false; }
    const app = perfApps.find((a) => a.id === plan.appId) || {};
    if (!(app.signed && app.build && app.build !== "-")) { flash(plan.name + " — 대상 앱 빌드가 확보되지 않았습니다 (대상 앱에서 빌드 연결·파싱)"); return false; }
    /* 러너는 앱 APK와 벤치마크 테스트 APK를 함께 설치해 am instrument로 실행한다 — 하나라도 없으면 시작조차 못 한다 */
    if (!app.benchApk) { flash(plan.name + " — 벤치마크 테스트 APK가 없습니다 (대상 앱에서 연결·파싱)"); return false; }
    return true;
  };
  const nextId = () => "PRUN-" + ((perfRuns || []).reduce((m, r) => Math.max(m, parseInt((r.id.split("-")[1] || "0"), 10)), 1000) + 1);
  const runNow = () => {
    const plan = runPlan;
    if (!gate(plan)) return;
    const id = nextId();
    addPerfRun({ id, planId: plan.id, plan: plan.name, app: appNm(plan.appId), ver: rpApp.version || "-", verCode: rpApp.versionCode || "-", no: (perfRuns || []).filter((r) => r.planId === plan.id).length + 1, status: "대기", by: currentUser || "이민준", trig: "수동", at: nowStamp(), queuedAt: Date.now(), devices: rpOnDevs.length, scns: (plan.scenarioIds || []).length, power: rpNeedsPower && rpHasPowerDev,
      /* 🔑 연결이 끊겨 빠진 단말을 회차에 남긴다 — 남기지 않으면 '왜 단말이 3대지'와
         '왜 지표 구성이 바뀌었지'를 나중에 설명할 수 없다. */
      skipped: rpDevs.filter((d) => d.status !== "온라인").map((d) => ({ model: d.model, slot: d.slot })),
      envLock: PERF_ENV,
      subjobs: buildSubjobs(plan) });
    setSelId(id);
    flash(plan.name + " 실행 요청 · " + id + " — 큐 맨끝에 적재");
  };
  // 큐 프로세서 — 계획 단위 FIFO(측정 격리). 계획 하나만 돌고, 그 안에서 단말은 병렬·시나리오는 순차.
  useEffect(() => {
    const t = setInterval(() => {
      const running = (perfRuns || []).find((r) => r.status === "실행중");
      if (running) {
        const subs = (running.subjobs || []).map((s) => ({ ...s }));
        [...new Set(subs.map((s) => s.did))].forEach((did) => {
          const cur = subs.find((s) => s.did === did && s.status !== "완료" && s.status !== "실패");
          if (!cur) return;
          if (cur.status === "대기") cur.status = "실행중";
          cur.iter = Math.min(cur.iters, cur.iter + 1);
          if (cur.iter >= cur.iters) cur.status = cur.verdict === "FAIL" ? "실패" : "완료";
        });
        const done = subs.every((s) => s.status === "완료" || s.status === "실패");
        if (done) {
          /* 지표를 확정한다 — 이 회차가 그 시나리오의 첫 측정이었다 */
          const newly = [...new Set(subs.filter((x) => x.base).map((x) => x.sid))];
          newly.forEach((sid) => { const sc = (perfScenarios || []).find((x) => x.id === sid); if (sc && (sc.metrics || []).length === 0) { updatePerfScenario(sid, discovered(sc)); flash(sc.name + " — 산출 지표가 확정되었습니다. 측정 계획에서 SLA를 설정하세요"); } });
          /* 임계가 없어 게이트를 못 태운 회차는 판정이 아니라 '기준선'이다 — 합격/불합격으로 세면 통계가 거짓말을 한다 */
          const verdict = subs.some((s) => s.verdict === "FAIL") ? "불합격" : (subs.some((s) => s.verdict === "PASS") ? "합격" : (newly.length ? "기준선" : "미판정"));
          /* 🔴 기준선·미판정은 '통과'가 아니다 — CI 게이트가 초록불로 읽으면 검증이 사라진 것을 아무도 모른다(F9 원칙).
             gateResult를 따로 남겨 게이트 조회 API가 통과/실패가 아닌 '판정 없음'을 반환하게 한다. */
          const gateResult = verdict === "합격" ? "통과" : verdict === "불합격" ? "실패" : "판정 없음";
          /* 단말마다 수집 지표가 다를 수 있다(전력은 전력 단말만) — 덮어쓰면 마지막 단말 값만 남아
             회차마다 sig가 흔들려 허위 '지표 구성 변경'이 뜬다. 시나리오별 합집합으로 모은다. */
          const acc = {}; subs.forEach((x) => { (acc[x.sid] = acc[x.sid] || new Set()); Object.keys(x.metrics || {}).forEach((k) => acc[x.sid].add(k)); });
          const sig = {}; Object.keys(acc).forEach((k) => { sig[k] = metricSig([...acc[k]]); });
          /* 이 회차에서 지표가 확정된 시나리오 — 판정이 합격이어도 "무엇이 새로 확정됐는지"는 알려야 한다 */
          const newScns = newly.map((sid) => ((perfScenarios || []).find((x) => x.id === sid) || {}).name).filter(Boolean);
          updatePerfRun(running.id, { gateResult, metricSig: sig, newScns, subjobs: subs, status: "완료", endedAt: nowStamp(), verdict }); }
        else updatePerfRun(running.id, { subjobs: subs });
        return;
      }
      const waiting = (perfRuns || []).filter((r) => r.status === "대기").slice().sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
      if (waiting.length) updatePerfRun(waiting[0].id, { status: "실행중", startedAt: nowStamp() });
    }, 1000);
    return () => clearInterval(t);
  }, [perfRuns]);

  const today = nowStamp().slice(0, 10);
  const dateOf = (r) => String(r.endedAt || r.startedAt || "").slice(0, 10);
  const _now = new Date(); const _dow = _now.getDay(), _dom = _now.getDate(); const _isWk = _dow >= 1 && _dow <= 5; const _nowMin = _now.getHours() * 60 + _now.getMinutes();
  const _tMin = (t) => { const p = String(t || "00:00").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); };
  const firesToday = (p) => { if (p.status !== "활성") return false; const s = p.schedule; if (!s || s.mode !== "schedule" || !s.active) return false; if (s.freq === "hourly") return _now.getHours() < 23; const up = _tMin(s.time) > _nowMin; if (s.freq === "daily") return up; if (s.freq === "weekdays") return _isWk && up; if (s.freq === "weekly") return s.dow === _dow && up; if (s.freq === "monthly") return s.dom === _dom && up; return false; };
  const cnt = (fn) => (perfRuns || []).filter(fn).length;
  const scheduledToday = (perfPlans || []).filter(firesToday).length;
  const KPI = [["실행 중", cnt((r) => r.status === "실행중"), "text-amber-600"], ["대기", cnt((r) => r.status === "대기"), "text-slate-900"], ["예약(오늘)", scheduledToday, "text-sky-600"], ["완료(오늘)", cnt((r) => r.status === "완료" && dateOf(r) === today), "text-emerald-600"], ["불합격(오늘)", cnt((r) => r.status === "완료" && r.verdict === "불합격" && dateOf(r) === today), "text-red-600"]];

  const queue = (perfRuns || []).filter((r) => r.status === "실행중" || r.status === "대기").slice().sort((a, b) => { const rk = (s) => (s === "실행중" ? 0 : 1); if (rk(a.status) !== rk(b.status)) return rk(a.status) - rk(b.status); return (a.queuedAt || 0) - (b.queuedAt || 0); });
  const liveRun = (perfRuns || []).find((r) => r.status === "실행중");
  const selRun = queue.find((r) => r.id === selId) || liveRun || queue[0] || null;
  const cancel = (r) => { if (!window.confirm(r.id + " 실행을 큐에서 취소할까요?")) return; removePerfRun(r.id); if (selId === r.id) setSelId(null); flash(r.id + " 취소됨"); };
  const stop = (r) => { if (!window.confirm(r.id + " 실행을 중지할까요? — 러너에 취소 신호를 보내고 큐에서 제거합니다")) return; removePerfRun(r.id); if (selId === r.id) setSelId(null); flash(r.id + " 중지됨"); };
  const progOf = (r) => { const t = (r.subjobs || []).length || 1; const d = (r.subjobs || []).filter((s) => s.status === "완료" || s.status === "실패").length; return { d, t, pct: Math.round(d / t * 100) }; };
  const fmtDur = (sec) => (sec >= 60 ? Math.floor(sec / 60) + "분 " + (sec % 60) + "초" : sec + "초");
  // 예상 소요 = 단말 병렬·시나리오 순차 기준, 가장 오래 걸리는 단말 경로(iters × 회당 소요). Startup ~4s/회, Flow ~8s/회.
  const estSec = (r) => { const per = (j) => (String(j).includes("Startup") ? 4 : 8); const byDev = {}; (r.subjobs || []).forEach((s) => { byDev[s.did] = (byDev[s.did] || 0) + (s.iters || 10) * per(s.journey); }); const v = Object.values(byDev); return v.length ? Math.max(...v) : 0; };
  const mstr = (s) => Object.entries(s.metrics || {}).map(([k, v]) => { const m = PERF_METRICS.find((x) => x.id === k) || { label: k, unit: "" }; return m.label + " " + v + (m.unit || ""); }).join(" · ");
  const sK = { "대기": "info", "실행중": "warn", "완료": "pass" };
  const vK = { "합격": "pass", "불합격": "fail", "미판정": "info", "기준선": "active" };
  const mtxDevs = selRun ? [...new Map((selRun.subjobs || []).map((s) => [s.did, { did: s.did, model: s.model, slot: s.slot }])).values()] : [];
  const mtxScns = selRun ? [...new Map((selRun.subjobs || []).map((s) => [s.sid, { sid: s.sid, scn: s.scn, journey: s.journey }])).values()] : [];
  const cellOf = (did, sid) => (selRun.subjobs || []).find((s) => s.did === did && s.sid === sid);

  return (
    <div className="space-y-4">
      <PageToolbar desc="계획 단위 직렬 큐(측정 격리) · 계획 안에서는 단말 병렬 · 시나리오 순차" />
      {/* 🔑 실행 화면의 좌우 비율은 네 도메인이 같은 뜻으로 읽히게 맞춘다 —
          좌측 "무엇을 실행할 것인가 · 실행 큐", 우측 "지금 무슨 일이 벌어지는가".
          LQA·FQA 와 같은 6:6 이다. 우측 단말×시나리오 매트릭스가 눌리면
          셀 크기를 줄이지, 비율을 되돌리지 않는다. */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {KPI.slice(0, 2).map((k) => (<Card key={k[0]} className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div></Card>))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1"><Select value={runPlanId} onChange={(e) => setRunPlanId(Number(e.target.value))} disabled={!runnable.length}>{runnable.length ? runnable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>) : <option value="">활성 계획 없음</option>}</Select></div>
            <Btn kind="primary" icon={Play} disabled={!runnable.length} onClick={runNow}>실행</Btn>
          </div>
          {!runnable.length && <div className="text-xs text-amber-600">활성 상태의 측정 계획이 없습니다 — 계획을 활성화해야 실행할 수 있습니다.</div>}
          {runnable.length > 0 && (
            <Card className="space-y-2 p-3 text-xs">
              <div className="flex items-center justify-between"><span className="text-slate-500">대상 앱</span><span className="text-slate-800">{appNm(runPlan.appId)}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">빌드</span><span className="text-slate-700">{rpApp.version || "-"}{rpApp.versionCode && rpApp.versionCode !== "-" ? " (" + rpApp.versionCode + ")" : ""}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">실행 규모</span><span className="text-slate-700">시나리오 {rpScns.length} × 단말 {rpOnDevs.length} = 서브잡 {rpScns.length * rpOnDevs.length}{rpOnDevs.length < rpDevs.length ? <span className="ml-1 text-amber-600">· 연결 끊김 {rpDevs.length - rpOnDevs.length}대 제외</span> : null}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">랩 호스트</span><span className="text-slate-700">{PERF_LAB.name} · <span className="font-mono">{PERF_LAB.host}</span> <Badge kind={PERF_LAB.status === "온라인" ? "pass" : "fail"}>{PERF_LAB.status}</Badge></span></div>
              {/* 러너는 단말이 USB로 붙은 호스트 PC에 상주한다 — 잡별로 띄우는 Pod가 아니다.
                  호스트 부하가 측정값을 오염시키므로 동시 실행 상한을 둔다. */}
              <div className="flex items-center justify-between"><span className="text-slate-500">러너</span><span className="text-slate-700"><span className="font-mono">{PERF_LAB.agent}</span> · adb {PERF_LAB.adb} · 단말 동시 {PERF_LAB.maxParallel}대</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">전력 계측</span><span className="text-slate-700">{rpNeedsPower ? (rpHasPowerDev ? "Pixel 리그로 측정" : "단말 없음 · 미측정") : "해당 없음"}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">지표 SLA</span><span className="text-emerald-700">{rpSlaN}개 게이트</span></div>
              {/* 실행 전에 알린다 — 미확정이 섞이면 그 시나리오는 이번 회차에 확정되고 판정에는 안 들어간다 */}
              {rpScns.some((x) => !(x.metrics || []).length) && <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-sky-600">미확정 시나리오 {rpScns.filter((x) => !(x.metrics || []).length).length}건 포함 — 이번 회차에 지표가 확정되며 임계가 없어 판정에서 제외됩니다.</div>}
              {!rpBuildOk && <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">대상 앱 빌드 미확보 — 대상 앱에서 빌드 연결·파싱 필요</div>}
            </Card>
          )}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="px-3 py-2.5 font-medium">실행</th><th className="font-medium">상태</th><th className="font-medium">진행</th><th></th></tr></thead>
              <tbody>
                {queue.length === 0 && (<tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">진행 중이거나 대기 중인 실행이 없습니다 — 계획을 골라 &quot;실행&quot;하세요.</td></tr>)}
                {queue.map((r) => { const pg = progOf(r); return (
                  <tr key={r.id} onClick={() => setSelId(r.id)} className={"cursor-pointer border-b border-slate-200 text-slate-700 hover:bg-slate-100 " + ((selRun && selRun.id === r.id) ? SEL_ROW : "")}>
                    <td className="px-3 py-2.5"><div className="font-mono text-xs text-sky-600">{r.id}</div><div className="text-slate-800">{r.plan}</div><div className="text-xs text-slate-500">{r.app} · 단말 {r.devices} · 시나리오 {r.scns}</div></td>
                    <td><Badge kind={sK[r.status] || "info"}>{r.status}</Badge></td>
                    <td style={{ minWidth: 96 }}>{r.status === "대기" ? <span className="text-xs text-slate-500">대기</span> : (<div><div className="mb-0.5 text-xs text-slate-500">{pg.d}/{pg.t}</div><div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: pg.pct + "%" }} /></div></div>)}</td>
                    <td className="pr-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{r.status === "실행중" ? <button onClick={() => stop(r)} className="text-xs text-slate-500 hover:text-red-600">중지</button> : <button onClick={() => cancel(r)} className="text-xs text-slate-500 hover:text-red-600">취소</button>}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="col-span-6 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {KPI.slice(2).map((k) => (<Card key={k[0]} className="p-3 text-center"><div className={"text-2xl font-bold " + k[2]}>{k[1]}</div><div className="mt-0.5 text-xs text-slate-500">{k[0]}</div></Card>))}
          </div>
          <Card className="overflow-hidden">
            {!selRun ? (
              <div className="flex items-center justify-center p-10 text-xs text-slate-500" style={{ minHeight: 200 }}>계획을 골라 &quot;실행&quot;하면 시나리오×단말 매트릭스가 여기에 표시됩니다.</div>
            ) : selRun.status === "대기" ? (
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-slate-800">{selRun.plan}</div><div className="font-mono text-xs text-sky-600">{selRun.id}</div></div><Badge kind="info">대기</Badge></div>
                <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-500">랩 배정 대기 · 앞선 {queue.filter((r) => r.status === "대기").findIndex((r) => r.id === selRun.id)}건 · 계획 단위로 직렬 실행하므로 앞 실행이 끝나면 자동 시작됩니다.</div>
              </div>
            ) : (() => {
              const pg = progOf(selRun); const running = selRun.status === "실행중"; const eDur = estSec(selRun); const elapsed = Math.round(eDur * pg.pct / 100); const remain = Math.max(0, eDur - elapsed);
              return (
                <>
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{selRun.plan}</div><div className="font-mono text-xs text-sky-600">{selRun.id} · {selRun.app}{selRun.ver && selRun.ver !== "-" ? " · v" + selRun.ver + (selRun.verCode && selRun.verCode !== "-" ? " (" + selRun.verCode + ")" : "") : ""}</div></div>
                    {running ? <span className="flex shrink-0 items-center gap-1 text-xs text-red-700"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />LIVE</span> : <Badge kind={vK[selRun.verdict] || "info"}>{selRun.verdict || "완료"}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2 text-xs text-slate-500"><span>서브잡 <span className="text-slate-800">{pg.d}/{pg.t}</span></span><div className="h-1.5 flex-1 rounded bg-slate-100"><div className="h-1.5 rounded bg-sky-500" style={{ width: pg.pct + "%" }} /></div><span>{running ? "경과 " + fmtDur(elapsed) + " / 예상 " + fmtDur(eDur) + (((selRun.subjobs || []).some((x) => x.estIters)) ? " (추정 — 미확정 시나리오 포함)" : "") : "완료"}</span></div>
                  <div className="overflow-x-auto p-3">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-slate-500"><th className="px-2 py-1.5 font-medium">단말 \ 시나리오</th>{mtxScns.map((c) => <th key={c.sid} className="px-2 py-1.5 font-medium">{c.scn}<div className="font-normal text-slate-500">{c.journey}</div></th>)}</tr></thead>
                      <tbody>
                        {mtxDevs.map((d) => (
                          <tr key={d.did} className="border-t border-slate-200">
                            <td className="px-2 py-2 text-slate-700">{d.model}<div className="font-mono text-slate-500">{d.slot}</div></td>
                            {mtxScns.map((c) => { const s = cellOf(d.did, c.sid); if (!s) return <td key={c.sid} className="px-2 py-2 text-slate-700">·</td>; /* 임계가 없어 판정하지 않은 셀을 초록으로 칠하면 합격처럼 읽힌다 — 색을 나눈다 */
                              const cls = s.status === "대기" ? "bg-slate-100 text-slate-500" : s.status === "실행중" ? "bg-amber-50 text-amber-700" : s.status === "실패" ? "bg-red-50 text-red-700" : (s.verdict === "—" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"); const txt = s.status === "대기" ? "대기" : s.status === "실행중" ? (s.iter + "/" + s.iters) : s.status === "실패" ? "✗ 불합격" : (s.verdict === "—" ? "측정됨" : "✓ 합격"); return <td key={c.sid} className="px-2 py-2"><span title={mstr(s)} className={"inline-block rounded px-2 py-1 " + cls}>{txt}</span></td>; })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">셀: 대기 → iter 진행 → ✓합격 / ✗불합격 · 셀에 마우스를 올리면 지표값 표시{running && <> · <button onClick={() => stop(selRun)} className="text-slate-500 hover:text-red-600">중지</button></>}</div>
                </>
              );
            })()}
          </Card>
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ 실행 이력 · 결과 상세 ═══════════ */
export function PqaHistoryScreen() {
  const { perfRuns, perfPlans } = useApp();
  const runs = (perfRuns || []).filter((r) => r.status === "완료");
  const [detail, setDetail] = useState(null);
  const [fPlan, setFPlan] = useState("all");
  const [fVerdict, setFVerdict] = useState("all");
  const planName = (id) => ((perfPlans || []).find((p) => p.id === id) || {}).name || "-";
  const tK = { "수동": "info", "스케줄": "pass", "이벤트": "warn" };
  const vK = { "합격": "pass", "불합격": "fail", "미판정": "info", "기준선": "active" };
  const shown = runs.filter((r) => (fPlan === "all" || String(r.planId) === fPlan) && (fVerdict === "all" || r.verdict === fVerdict)).slice().sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  if (detail) return <PqaResultView run={detail} back={() => setDetail(null)} />;
  return (
    <div className="space-y-4">
      <PageToolbar desc="측정 실행 이력 · 행 클릭 → 실행 결과 상세" />
      <div className="flex items-center gap-2">
        <div style={{ width: 120 }}><Select value={fVerdict} onChange={(e) => setFVerdict(e.target.value)}><option value="all">전체 판정</option><option value="합격">합격</option><option value="불합격">불합격</option><option value="미판정">미판정</option><option value="기준선">기준선</option></Select></div>
        <div style={{ width: 220 }}><Select value={fPlan} onChange={(e) => setFPlan(e.target.value)}><option value="all">전체 계획</option>{(perfPlans || []).map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</Select></div>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-3 py-2 font-medium">실행</th><th className="font-medium">계획</th><th className="font-medium">빌드</th><th className="font-medium">트리거</th><th className="font-medium">규모</th><th className="font-medium">시각</th><th className="font-medium">판정</th><th className="pr-3 font-medium">결과</th></tr></thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-500">{runs.length === 0 ? "실행 이력이 없습니다." : "조건에 맞는 실행이 없습니다."}</td></tr> : shown.map((r) => { const failN = (r.subjobs || []).filter((s) => s.verdict === "FAIL").length; const errN = (r.subjobs || []).filter((s) => s.verdict === "ERROR").length; return (
              <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer border-b border-slate-200 last:border-0 text-slate-700 hover:bg-slate-100/50">
                <td className="px-3 py-2 font-mono text-xs text-sky-600">{r.id}</td>
                <td className="text-slate-800">{planName(r.planId)} <span className="text-xs text-slate-500">#{r.no}</span></td>
                <td className="font-mono text-xs text-slate-500">{r.ver && r.ver !== "-" ? r.ver : "-"}{r.verCode && r.verCode !== "-" ? <span className="text-slate-500"> ({r.verCode})</span> : ""}</td>
                <td><Badge kind={tK[r.trig] || "info"}>{r.trig}</Badge></td>
                <td className="text-xs text-slate-500">단말 {r.devices} · 시나리오 {r.scns}{(r.skipped || []).length > 0 ? <span className="ml-1 text-amber-600">· {(r.skipped || []).length}대 제외</span> : null}</td>
                <td className="text-xs"><RunTime start={r.startedAt} end={r.endedAt} /></td>
                <td><Badge kind={vK[r.verdict] || "info"}>{r.verdict}</Badge></td>
                <td className="pr-3 text-xs text-slate-500">{failN > 0 ? <span className="text-red-700">{failN}건 불합격</span> : (r.verdict === "합격" ? (errN > 0 ? <span className="text-amber-700">합격 · {errN}건 미측정</span> : "전체 합격") : <span className="text-slate-500">판정 없음</span>)}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function PqaResultView({ run, back, backLabel = "실행 이력" }) {
  const { perfPlans, defects, openModal } = useApp();
  const [msg, flash] = useToast();
  const plan = (perfPlans || []).find((p) => p.id === run.planId) || {};
  const subs = run.subjobs || [];
  const devs = [...new Map(subs.map((s) => [s.did, { did: s.did, model: s.model, slot: s.slot }])).values()];
  const scns = [...new Map(subs.map((s) => [s.sid, { sid: s.sid, scn: s.scn, journey: s.journey }])).values()];
  const failN = subs.filter((s) => s.verdict === "FAIL").length;
  /* 🔑 FAIL이 아닌 것을 합격으로 세지 않는다 — 미판정·환경 오류가 합격으로 둔갑한다 (P6 합격률 분모와 같은 원칙) */
  const passN = subs.filter((s) => s.verdict === "PASS").length;
  const errN = subs.filter((s) => s.verdict === "ERROR").length;
  const dExists = (defects || []).some((d) => d.tc === run.id);
  const regDefect = () => {
    if (run.verdict !== "불합격") return;
    if (dExists) { flash("이미 결함이 등록된 실행입니다"); return; }
    const failSubs = subs.filter((s) => s.verdict === "FAIL");
    const lines = failSubs.map((s) => { const bud = (plan.budget || {})[String(s.sid)] || {}; const over = Object.entries(s.metrics || {}).filter(([mid, v]) => bud[mid] != null && v > bud[mid]).map(([mid, v]) => { const m = PERF_METRICS.find((x) => x.id === mid) || { label: mid, unit: "" }; return m.label + " " + v + (m.unit || "") + " > " + bud[mid]; }); return "· " + s.model + "/" + s.slot + " (" + s.scn + "): " + (over.join(", ") || "임계 초과"); });
    openModal("jira", {
      domain: "PQA", sev: "Major", tc: run.id, target: run.app || "", labels: "pqa, perf",
      title: "성능 SLA 불합격 · " + (run.plan || "측정 계획") + " (" + (run.ver || "-") + ")",
      desc: "측정 계획: " + (run.plan || "-") + "\n빌드: " + (run.ver || "-") + (run.verCode && run.verCode !== "-" ? " (" + run.verCode + ")" : "") + "\n불합격 " + failSubs.length + "/" + subs.length + " 셀:\n" + lines.join("\n"),
      steps: "1. 측정 계획 '" + (run.plan || "-") + "' 실행 (단말 " + run.devices + " × 시나리오 " + run.scns + ")\n2. 각 단말·시나리오 Macrobenchmark 측정 (iterations)\n3. 지표별 SLA 임계 대비 판정",
      expected: "모든 단말·시나리오가 지표별 SLA 충족",
      actual: "SLA 초과 — " + failSubs.map((s) => s.model + "(" + s.slot + ")/" + s.scn).join(" · "),
      env: "사내 랩 · " + [...new Set(failSubs.map((s) => s.model))].join(", "),
      artifacts: [{ k: "bench", label: "benchmarkData", file: "benchmarkData.json", size: "24 KB" }, { k: "summary", label: "판정 요약", file: "verdict_summary.csv", size: "4 KB" }],
    });
  };
  const vK = { "합격": "pass", "불합격": "fail", "미판정": "info", "기준선": "active" };
  const thr = (sid, mid) => { const b = (plan.budget || {})[String(sid)]; return b ? b[mid] : undefined; };
  const metricsOf = (sid) => PERF_METRICS.filter((m) => subs.some((s) => s.sid === sid && s.metrics && s.metrics[m.id] != null));
  const cell = (did, sid) => subs.find((s) => s.did === did && s.sid === sid);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500"><button onClick={back} className="hover:text-sky-600">{backLabel}</button><span className="text-slate-500">/</span><span className="font-mono text-sky-600">{run.id}</span></div>
        <div className="flex items-center gap-2"><Btn icon={Download} onClick={() => flash("Excel 리포트 생성됨")}>Excel</Btn><Btn icon={Download} onClick={() => flash("PDF 리포트 생성됨")}>PDF</Btn><Btn icon={ChevronLeft} onClick={back}>{backLabel}</Btn></div>
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div><div className="text-base font-semibold text-slate-900">{run.plan}</div><div className="mt-0.5 text-xs text-slate-500">{run.app}{run.ver && run.ver !== "-" ? " · v" + run.ver + (run.verCode && run.verCode !== "-" ? " (" + run.verCode + ")" : "") : ""} · {run.trig} · <RunTime start={run.startedAt} end={run.endedAt} /></div></div>
          <Badge kind={vK[run.verdict] || "info"}>{run.verdict}</Badge>
          {run.gateResult && run.gateResult !== "통과" && run.gateResult !== "실패" && <Badge kind="warn">게이트 판정 없음</Badge>}
          {(run.newScns || []).length > 0 && <span className="text-xs text-sky-600"><span className="font-semibold">{(run.newScns || []).join(", ")}</span> — 이 회차에서 산출 지표가 확정되었습니다. 측정 계획에서 SLA를 설정하면 다음 회차부터 판정합니다.</span>}
          {errN > 0 && <span className="text-xs text-amber-700">{[...new Set(subs.filter((x) => x.verdict === "ERROR").map((x) => x.errCode))].join(", ")} — 환경 검사에 걸려 <strong>측정하지 못한</strong> 셀 {errN}개. 불합격이 아니므로 판정에서 제외됩니다.</span>}
          {(run.skipped || []).length > 0 && <span className="text-xs text-amber-700">단말 {(run.skipped || []).map((d) => d.model + "(" + d.slot + ")").join(", ")} — 실행 시점에 랩 연결이 끊겨 측정에서 빠졌습니다.</span>}
          {run.verdict === "기준선" && <span className="text-xs text-amber-700">임계가 하나도 없어 합격/불합격을 판정하지 않았습니다 — CI 게이트에는 &quot;판정 없음&quot;으로 전달되며 통과로 처리되지 않습니다.</span>}
        </div>
        <div className={"mt-3 grid gap-3 text-center " + (errN > 0 ? "grid-cols-5" : "grid-cols-4")}>
          <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-lg font-semibold text-slate-900">{subs.length}</div><div className="text-xs text-slate-500">서브잡</div></div>
          <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-lg font-semibold text-emerald-700">{passN}</div><div className="text-xs text-slate-500">합격</div></div>
          <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-lg font-semibold text-red-700">{failN}</div><div className="text-xs text-slate-500">불합격</div></div>
          {errN > 0 && <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-lg font-semibold text-amber-700">{errN}</div><div className="text-xs text-slate-500">환경 오류</div></div>}
          <div className="rounded-lg bg-slate-100 p-2.5"><div className="text-lg font-semibold text-slate-900">{devs.length}×{scns.length}</div><div className="text-xs text-slate-500">단말×시나리오</div></div>
        </div>
        {run.envLock && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-100/60 px-2.5 py-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">측정 환경</span>
          <span>환경 검사 억제 <span className="text-emerald-700">없음</span></span>
          <span>백그라운드 억제 <span className="font-mono text-slate-700">{run.envLock.listener}</span></span>
          <span>클럭 고정 {run.envLock.clocks}</span>
        </div>}
        {/* 🔑 benchmarkData는 증적이 아니라 판정·지표 확정의 근거다(P2) — 선택 사항이 아니다.
            Perfetto 트레이스는 반복마다 8MB씩 쌓이는데, 성능 회귀는 재현되므로 플랫폼이 회수하지 않는다. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-100/60 px-2.5 py-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">측정 원본</span>
          <button onClick={() => flash("benchmarkData.json 내려받음")} className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700"><Download size={12} /><span className="font-mono">benchmarkData.json</span></button>
          <span className="text-slate-500">24 KB · 보존 30일</span>
          <span className="text-slate-500">Perfetto 트레이스는 랩 호스트에 남습니다 — 플랫폼은 회수하지 않습니다</span>
        </div>
        {run.verdict === "불합격"
          ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">지표 SLA 불합격: {failN}/{subs.length} 셀 · {[...new Set(subs.filter((s) => s.verdict === "FAIL").map((s) => s.model))].join(", ")}</div>
          : run.verdict === "합격"
          ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700">모든 지표 SLA 충족</div>
          : <div className="mt-3 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-2 text-xs text-slate-500">게이트 지표가 없어 판정하지 않았습니다</div>}
        {run.verdict === "불합격" && <div className="mt-2 flex items-center justify-end">{dExists ? <span className="text-xs text-slate-500">결함 등록됨</span> : <Btn icon={Bug} onClick={regDefect}>결함 등록</Btn>}</div>}
      </Card>
      {scns.map((sc) => { const ms = metricsOf(sc.sid); return (
        <Card key={sc.sid} className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">{sc.scn} <span className="text-xs font-normal text-slate-500">· {sc.journey}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="px-3 py-2 font-medium">단말</th>{ms.map((m) => <th key={m.id} className="px-3 py-2 font-medium">{m.label}<div className="font-normal text-slate-500">{m.agg} {m.dir === "up" ? "≥" : "≤"} {m.unit}</div></th>)}<th className="px-3 py-2 font-medium">판정</th></tr></thead>
              <tbody>
                {devs.map((d) => { const s = cell(d.did, sc.sid); if (!s) return null; return (
                  <tr key={d.did} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-700">{d.model}<div className="font-mono text-slate-500">{d.slot}</div>{s.batt != null && <div className={"text-slate-500 " + (s.batt < 25 ? "text-amber-600" : "")} style={{ fontSize: 10 }}>배터리 {s.batt}%{s.temp != null ? " · " + s.temp + "°C" : ""}</div>}</td>
                    {ms.map((m) => { const v = (s.metrics || {})[m.id]; const t = thr(sc.sid, m.id); const bad = t != null && v != null && v > t; return <td key={m.id} className={"px-3 py-2 " + (bad ? "font-semibold text-red-700" : "text-slate-700")}>{v != null ? v : "-"}{t != null ? <span className="text-slate-500"> / {t}</span> : ""}</td>; })}
                    <td className="px-3 py-2"><Badge kind={s.verdict === "FAIL" ? "fail" : s.verdict === "PASS" ? "pass" : s.verdict === "ERROR" ? "warn" : "info"}>{s.verdict === "ERROR" ? (s.errCode || "환경 오류") : s.verdict === "FAIL" ? "불합격" : s.verdict === "PASS" ? "합격" : "미판정"}</Badge></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </Card>
      ); })}
      <Toast msg={msg} />
    </div>
  );
}

/* ═══════════ 대시보드 (회귀 triage + KPI) ═══════════ */
export function PqaDashboardScreen() {
  const { perfPlans, perfRuns, defects } = useApp();
  const plans = perfPlans || [];
  const [fPlan, setFPlan] = useState("all");
  const [detail, setDetail] = useState(null);
  const REG_PCT = 10;
  const inScope = (pid) => fPlan === "all" || String(pid) === fPlan;
  const completed = (perfRuns || []).filter((r) => r.status === "완료" && inScope(r.planId));
  const desc = completed.slice().sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  const recent = desc.slice(0, 10);
  /* 🔑 합격률은 '판정한 회차' 안에서만 센다 — 기준선·미판정을 분모에 넣으면 판정하지 않은 것이 불합격처럼 비율을 깎는다.
     판정 없음 건수는 따로 밝혀 감춰지지 않게 한다. */
  const judged = recent.filter((r) => r.verdict === "합격" || r.verdict === "불합격");
  const passN = judged.filter((r) => r.verdict === "합격").length;
  const noJudgeN = recent.length - judged.length;
  const rate = judged.length ? Math.round(passN / judged.length * 100) : null;
  const openDef = (defects || []).filter((d) => d.domain === "PQA" && d.status !== "Resolved" && d.status !== "Closed").length;
  const running = (perfRuns || []).filter((r) => r.status === "실행중" && inScope(r.planId));
  const queuedN = (perfRuns || []).filter((r) => r.status === "대기" && inScope(r.planId)).length;
  // 회귀·초과 랭킹 — 최근 WIN_N빌드/계획에서, 마지막 합격 대비 ±10% 악화하거나 현재 SLA 초과한 (단말×시나리오×지표) 셀
  const WIN_N = 8;
  const dAway = (m, v, b) => (b == null || b === 0 || v == null) ? null : Math.round((m.dir === "up" ? (b - v) / b : (v - b) / b) * 1000) / 10; // 양수=악화
  const regItems = [];
  [...new Set(completed.map((r) => r.planId))].forEach((pid) => {
    const plan = plans.find((p) => p.id === pid) || {};
    const rs = completed.filter((r) => r.planId === pid).slice().sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
    const win = rs.slice(-WIN_N);
    const latest = rs[rs.length - 1]; if (!latest) return;
    const baseOf = (idx) => rs.slice(0, idx).reverse().find((r) => r.verdict === "합격");
    const latestBase = baseOf(rs.length - 1);
    (latest.subjobs || []).forEach((s) => {
      Object.entries(s.metrics || {}).forEach(([mid, cur]) => {
        const m = PERF_METRICS.find((x) => x.id === mid) || { dir: "down", label: mid, unit: "" };
        const thr = ((plan.budget || {})[String(s.sid)] || {})[mid];
        const base = latestBase ? ((latestBase.subjobs || []).find((x) => x.did === s.did && x.sid === s.sid) || { metrics: {} }).metrics[mid] : null;
        const reg = dAway(m, cur, base);
        const breachNow = thr != null && cur != null && (m.dir === "up" ? cur < thr : cur > thr);
        const regNow = reg != null && reg >= REG_PCT;
        let recentWorst = null, recentBreach = false;
        win.forEach((run) => {
          const cs = (run.subjobs || []).find((x) => x.did === s.did && x.sid === s.sid); if (!cs) return;
          const v = (cs.metrics || {})[mid]; if (v == null) return;
          const rb = baseOf(rs.indexOf(run));
          const bv = rb ? ((rb.subjobs || []).find((x) => x.did === s.did && x.sid === s.sid) || { metrics: {} }).metrics[mid] : null;
          const rr = dAway(m, v, bv);
          if (rr != null && (recentWorst == null || rr > recentWorst)) recentWorst = rr;
          if (thr != null && (m.dir === "up" ? v < thr : v > thr)) recentBreach = true;
        });
        if (!(breachNow || regNow || (recentWorst != null && recentWorst >= REG_PCT) || recentBreach)) return;
        const slaOver = thr != null && cur != null ? Math.round((m.dir === "up" ? (thr - cur) / thr : (cur - thr) / thr) * 1000) / 10 : null;
        const status = breachNow ? "현재 초과" : regNow ? "회귀" : "해소";
        regItems.push({ planId: pid, plan: latest.plan, ver: latest.ver, run: latest, model: s.model, scn: s.scn, metric: m.label, unit: m.unit || "", cur, base, thr, reg, slaOver, recentWorst, status });
      });
    });
  });
  const stRank = { "현재 초과": 0, "회귀": 1, "해소": 2 };
  regItems.sort((a, b) => { if (stRank[a.status] !== stRank[b.status]) return stRank[a.status] - stRank[b.status]; if (a.status === "현재 초과") return (b.slaOver || 0) - (a.slaOver || 0); if (a.status === "회귀") return (b.reg || 0) - (a.reg || 0); return (b.recentWorst || 0) - (a.recentWorst || 0); });
  const regNowCount = regItems.filter((x) => x.status !== "해소").length;
  const planName = (id) => (plans.find((p) => p.id === id) || {}).name || "-";
  const vK = { "합격": "pass", "불합격": "fail", "미판정": "info", "기준선": "active" };
  if (detail) return <PqaResultView run={detail} back={() => setDetail(null)} backLabel="대시보드" />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <PageToolbar desc="앱 성능 KPI · 회귀 랭킹 · 판정 추이 · 최근 실행" />
        <div className="w-56 shrink-0"><Select value={fPlan} onChange={(e) => setFPlan(e.target.value)}><option value="all">전체 계획</option>{plans.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</Select></div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14} className="text-sky-600" />SLA 합격률</div><div className="mt-1 text-2xl font-semibold text-slate-900">{rate == null ? "—" : rate}{rate != null && <span className="text-sm text-slate-500">%</span>}</div><div className="text-xs text-slate-500">판정 {judged.length}회 중 {passN} 합격{noJudgeN > 0 && <span className="text-amber-600"> · 판정 없음 {noJudgeN}회</span>}</div></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Bug size={14} className="text-red-600" />미해결 성능 결함</div><div className={"mt-1 text-2xl font-semibold " + (openDef > 0 ? "text-red-700" : "text-slate-900")}>{openDef}</div><div className="text-xs text-slate-500">앱 성능 결함 (Open)</div></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><TrendingUp size={14} className="text-amber-600" />회귀·초과</div><div className={"mt-1 text-2xl font-semibold " + (regNowCount > 0 ? "text-amber-700" : "text-slate-900")}>{regNowCount}</div><div className="text-xs text-slate-500">현재 SLA 초과·회귀 지표</div></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Activity size={14} className="text-sky-600" />진행 중 실행</div><div className={"mt-1 text-2xl font-semibold " + (running.length > 0 ? "text-sky-600" : "text-slate-900")}>{running.length}</div><div className="text-xs text-slate-500">대기 {queuedN}건</div></Card>
      </div>
      <Card className="space-y-2 p-4">
        <div className="text-sm font-semibold text-slate-800">회귀·초과 랭킹 <span className="text-xs font-normal text-slate-500">· 최근 {WIN_N}빌드 · SLA 초과폭 우선 · 행 클릭 → 실행 상세</span></div>
        {regItems.length === 0 ? <div className="rounded-lg bg-slate-100 p-4 text-center text-xs text-slate-500">최근 {WIN_N}빌드에 회귀·SLA 초과가 없습니다.</div> : (
          <div className="space-y-1.5">{regItems.slice(0, 8).map((it, i) => { const vc = it.status === "현재 초과" ? "text-red-700" : it.status === "회귀" ? "text-amber-700" : "text-slate-700"; return (
            <div key={i} onClick={() => setDetail(it.run)} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-100/50">
              <span className="w-[72px] shrink-0"><Badge kind={it.status === "현재 초과" ? "fail" : it.status === "회귀" ? "warn" : "draft"}>{it.status}</Badge></span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm text-slate-800">{it.model} · {it.metric}</div><div className="truncate text-xs text-slate-500">{it.plan} · {it.scn} · {it.ver}</div></div>
              <div className="shrink-0 text-right text-xs">
                <div><span className={vc}>{it.cur}{it.unit}</span>{it.thr != null && <span className="text-slate-500"> / {it.thr}{it.unit}</span>}</div>
                <div className="text-slate-500">{it.status === "현재 초과" && it.slaOver != null ? "SLA +" + it.slaOver + "%" : it.status === "회귀" ? "▲" + it.reg + "% vs 기준" : "최근 ▲" + (it.recentWorst != null ? it.recentWorst : 0) + "% · 해소"}</div>
              </div>
            </div>
          ); })}</div>
        )}
      </Card>
      <Card className="space-y-2 p-4">
          <div className="text-sm font-semibold text-slate-800">최근 실행 <span className="text-xs font-normal text-slate-500">· 최근 {Math.min(8, desc.length)}건 (행 클릭 → 실행 상세)</span></div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-2 text-left">계획</th><th className="px-3 py-2 text-left">빌드</th><th className="px-3 py-2 text-left">시각</th><th className="px-3 py-2 text-left">규모</th><th className="px-3 py-2 text-left">결과</th><th className="px-3 py-2 text-center">판정</th></tr></thead>
            <tbody>{desc.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-500">실행 이력이 없습니다.</td></tr> : desc.slice(0, 8).map((r) => { const failN = (r.subjobs || []).filter((s) => s.verdict === "FAIL").length; const errN = (r.subjobs || []).filter((s) => s.verdict === "ERROR").length; return (
              <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer border-b border-slate-200 last:border-0 hover:bg-slate-100/50">
                <td className="px-3 py-2 text-slate-700">{planName(r.planId)}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.ver && r.ver !== "-" ? r.ver : "-"}</td>
                <td className="px-3 py-2 text-xs"><RunTime start={r.startedAt} end={r.endedAt} /></td>
                <td className="px-3 py-2 text-xs text-slate-500">단말 {r.devices} · 시나리오 {r.scns}{(r.skipped || []).length > 0 ? <span className="ml-1 text-amber-600">· {(r.skipped || []).length}대 제외</span> : null}</td>
                <td className="px-3 py-2 text-xs">{failN > 0 ? <span className="text-red-700">{failN}건 불합격</span> : errN > 0 && r.verdict === "합격" ? <span className="text-amber-700">합격 · {errN}건 미측정</span> : <span className="text-slate-500">{r.verdict === "합격" ? "전체 합격" : "판정 없음"}</span>}</td>
                <td className="px-3 py-2 text-center"><Badge kind={vK[r.verdict] || "info"}>{r.verdict}</Badge></td>
              </tr>
            ); })}</tbody></table>
          </div>
      </Card>
    </div>
  );
}

/* ═══════════ 성능 추이 (빌드별 지표 회귀) ═══════════ */
/* 단말별 라인 색은 공통 SERIES(sky 명도 단계)를 쓴다.
   예전에는 [sky, amber, red, sky, violet, emerald] 였는데, 같은 화면에서
   빨강이 "Galaxy A15"·"불합격"·"SLA 기준선" 세 가지를 동시에 뜻했다. */
export function PqaTrendScreen() {
  const { perfPlans, perfRuns } = useApp();
  const plans = perfPlans || [];
  const [planId, setPlanId] = useState((plans[0] || {}).id || 0);
  const [detail, setDetail] = useState(null);
  const plan = plans.find((p) => p.id === planId) || plans[0] || {};
  const runs = (perfRuns || []).filter((r) => r.status === "완료" && r.planId === plan.id).slice().sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
  const scnList = [...new Map(runs.flatMap((r) => r.subjobs || []).map((s) => [s.sid, { sid: s.sid, scn: s.scn, journey: s.journey }])).values()];
  const [sid, setSid] = useState(scnList[0] ? scnList[0].sid : 0);
  const curScn = scnList.find((s) => s.sid === sid) || scnList[0] || {};
  const realSid = curScn.sid;
  const metricList = PERF_METRICS.filter((m) => runs.some((r) => (r.subjobs || []).some((s) => s.sid === realSid && s.metrics && s.metrics[m.id] != null)));
  const [mid, setMid] = useState(metricList[0] ? metricList[0].id : "e2e");
  const curM = PERF_METRICS.find((m) => m.id === mid) || metricList[0] || { id: mid, label: mid, unit: "", agg: "", dir: "down" };
  const realMid = metricList.some((m) => m.id === curM.id) ? curM.id : (metricList[0] || {}).id;
  const metricDef = PERF_METRICS.find((m) => m.id === realMid) || { label: realMid, unit: "", agg: "", dir: "down" };
  const devs = [...new Map(runs.flatMap((r) => (r.subjobs || []).filter((s) => s.sid === realSid)).map((s) => [s.did, { did: s.did, model: s.model, slot: s.slot }])).values()];
  const thr = ((plan.budget || {})[String(realSid)] || {})[realMid];
  const data = runs.map((r) => { const pt = { build: r.ver, date: (r.startedAt || "").slice(5, 10), verdict: r.verdict, runId: r.id, __sig: (r.metricSig || {})[realSid] || "" }; devs.forEach((d) => { const s = (r.subjobs || []).find((x) => x.did === d.did && x.sid === realSid); pt[d.did] = s && s.metrics && s.metrics[realMid] != null ? s.metrics[realMid] : null; }); return pt; });
  const REG_PCT = 10; // 마지막 합격 빌드 대비 ±10% 초과 시 회귀
  const baseIdx = data.map((pt, i) => { for (let j = i - 1; j >= 0; j--) { if (data[j].verdict === "합격") return j; } return -1; });
  const vals = data.flatMap((pt) => devs.map((d) => pt[d.did]).filter((v) => v != null));
  const lo = Math.min(...vals, thr != null ? thr : Infinity), hi = Math.max(...vals, thr != null ? thr : -Infinity);
  const pad = (hi - lo) * 0.15 || 1;
  const yDomain = vals.length ? [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)] : [0, 1];
  const dlt = (cur, prv) => (prv == null || cur == null || prv === 0) ? null : Math.round((cur - prv) / prv * 1000) / 10;
  const rows = [...data].reverse();
  const vK = { "합격": "pass", "불합격": "fail", "미판정": "info", "기준선": "active" };
  if (detail) return <PqaResultView run={detail} back={() => setDetail(null)} backLabel="성능 추이" />;
  return (
    <div className="space-y-4">
      <PageToolbar desc="빌드별 지표 회귀 추이 · 계획·시나리오·지표별 · SLA 임계 대비" />
      <div className="flex flex-wrap items-center gap-2">
        <div style={{ width: 220 }}><Select value={plan.id} onChange={(e) => setPlanId(Number(e.target.value))}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div style={{ width: 200 }}><Select value={realSid} onChange={(e) => setSid(Number(e.target.value))}>{scnList.length ? scnList.map((s) => <option key={s.sid} value={s.sid}>{s.scn}</option>) : <option value="">시나리오 없음</option>}</Select></div>
        <div style={{ width: 170 }}><Select value={realMid} onChange={(e) => setMid(e.target.value)}>{metricList.length ? metricList.map((m) => <option key={m.id} value={m.id}>{m.label}</option>) : <option value="">지표 없음</option>}</Select></div>
      </div>
      {runs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">이 계획의 완료된 실행 이력이 없습니다.</Card>
      ) : (<>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{metricDef.label} <span className="text-xs font-normal text-slate-500">· {metricDef.agg} {metricDef.unit} · {curScn.scn}</span></div>
            {thr != null && <span className="text-xs text-red-700">SLA {metricDef.dir === "up" ? "≥" : "≤"} {thr}{metricDef.unit}</span>}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="build" stroke={C.axis} fontSize={11} />
              <YAxis stroke={C.axis} fontSize={11} width={46} domain={yDomain} allowDecimals={false} />
              <Tooltip contentStyle={{ ...TOOLTIP, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {thr != null && <ReferenceLine y={thr} stroke={C.err} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: "SLA", fill: C.err, fontSize: 10, position: "insideTopRight" }} />}
              {devs.map((d, i) => <Line key={d.did} type="monotone" dataKey={d.did} name={d.model} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">빌드별 {metricDef.label} <span className="text-xs font-normal text-slate-500">· 값 / 마지막 합격 빌드 대비(±{REG_PCT}% 회귀) · 임계 초과 빨강 · 행 클릭 → 실행 상세</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="px-3 py-2 font-medium">빌드</th><th className="px-3 py-2 font-medium">계획 판정</th>{devs.map((d) => <th key={d.did} className="px-3 py-2 font-medium">{d.model}<div className="font-mono font-normal text-slate-500">{d.slot}</div></th>)}</tr></thead>
              <tbody>
                {rows.map((pt, ri) => { const ai = data.length - 1 - ri; const base = baseIdx[ai] >= 0 ? data[baseIdx[ai]] : null; const run = runs.find((r) => r.id === pt.runId); return (
                  <tr key={pt.build} onClick={() => run && setDetail(run)} className="cursor-pointer border-t border-slate-200 hover:bg-slate-100/50">
                    <td className="px-3 py-2 text-slate-700">{pt.build}<div className="text-slate-500">{pt.date}</div></td>
                    <td className="px-3 py-2"><Badge kind={vK[pt.verdict] || "info"}>{pt.verdict}</Badge>
                      {/* 지표 구성이 직전 회차와 다르면 비교 축이 달라진 것이다 — 판정을 뒤집지 않고 사실만 알린다(F7·F8 원칙) */}
                      {(() => { const prev = data[ai - 1]; return pt.__sig && prev && prev.__sig && pt.__sig !== prev.__sig ? <div className="mt-0.5 text-amber-600" style={{ fontSize: 10 }} title={"직전 회차와 수집 지표가 다릅니다 — 비교 축이 달라졌습니다"}>지표 구성 변경</div> : null; })()}
                    </td>
                    {devs.map((d) => { const v = pt[d.did]; const bad = thr != null && v != null && (metricDef.dir === "up" ? v < thr : v > thr); const dv = base ? dlt(v, base[d.did]) : null; const reg = dv != null && (metricDef.dir === "up" ? dv <= -REG_PCT : dv >= REG_PCT); const imp = dv != null && (metricDef.dir === "up" ? dv >= REG_PCT : dv <= -REG_PCT); return (
                      <td key={d.did} className="px-3 py-2">
                        <span className={bad ? "font-semibold text-red-700" : "text-slate-700"}>{v != null ? v : "-"}</span>
                        {dv != null && dv !== 0 && <span title="마지막 합격 빌드 대비" className={"ml-1.5 " + (reg ? "font-semibold text-red-600" : imp ? "text-emerald-600" : "text-slate-500")}>{dv > 0 ? "▲" : "▼"}{Math.abs(dv)}%</span>}
                      </td>
                    ); })}
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </Card>
      </>)}
    </div>
  );
}
