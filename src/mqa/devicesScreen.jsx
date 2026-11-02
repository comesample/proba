// ============================================================
// MQA 테스트 기기 — 러너 · 연결된 단말 · 자동 점검 · 사전 준비
//   대상·환경과 같은 배치: 좌 러너 목록 / 우 헤더 + 카드
//   대상·환경 = "무엇을 테스트하나"(앱 · 환경) / 테스트 기기 = "어디서 돌리나"(러너 · 단말)
//   실행 경로는 러너 하나 — 서버 에뮬레이터 · 클라우드 기기팜은 MVP 범위 밖
// ============================================================
import { useState, useEffect, useRef } from "react";
import { Plus, X, RefreshCw, Smartphone, Monitor, CheckCircle2, XCircle, AlertTriangle, Copy, Download, KeyRound, Trash2, ChevronDown, Circle } from "lucide-react";
import { Card, Badge, Btn, Field, Input, Modal, Toast, useToast, PageToolbar, SEL_CARD, SEL_IDLE } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { runnerState, devState, DEV_K, osName, RUNNER_CHECKS, DEVICE_CHECKS, PREREQ, PKG_INCLUDES, RUNNER_ROLES, runnerRole } from "./devices.js";
import { Select } from "../common/ui.jsx";

const RS_K = { "연결됨": "pass", "오프라인": "draft", "설치 대기": "warn" };
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); };
const newToken = () => "prt_" + Array.from({ length: 28 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
const CheckIcon = ({ v }) => (v === true ? <CheckCircle2 size={14} className="text-emerald-600" /> : v === false ? <XCircle size={14} className="text-red-600" /> : <Circle size={14} className="text-slate-300" />);

function Prereq({ open: initOpen }) {
  const [open, setOpen] = useState(!!initOpen);
  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="text-sm font-semibold text-slate-800">사전 준비</span><span className="text-xs text-slate-500">러너 설치 전에 갖춰야 하는 것 — 설치 패키지로 해결되지 않는 항목만</span>
        <ChevronDown size={14} className={"ml-auto text-slate-500 " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3">
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">설치 패키지 포함: {PKG_INCLUDES}</div>
          <div className="grid grid-cols-4 gap-3">
            {PREREQ.map((g) => (
              <div key={g.g}>
                <div className="mb-1.5 text-xs font-semibold text-slate-600">{g.g}</div>
                <ul className="space-y-1">{g.items.map((it) => <li key={it} className="flex gap-1.5 text-xs text-slate-600"><span className="text-slate-400">·</span>{it}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function MqaDevicesScreen() {
  const { mqaRunners: runners = [], addMqaRunner, updateMqaRunner, removeMqaRunner, updateMqaDevice, currentUser, mqaPlans = [] } = useApp();
  const [msg, flash] = useToast();
  const [sel, setSel] = useState(0);
  const [modal, setModal] = useState(null);       // { step: "name"|"token", name, token, reissue }
  const [checking, setChecking] = useState(false);
  const [devBusy, setDevBusy] = useState({});     // 단말별 '다시 확인' 진행 중
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const r = runners[sel] || runners[0] || null;
  const rs = r ? runnerState(r) : null;
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const openAdd = () => setModal({ step: "name", name: "", token: "" });
  const issue = () => {
    const name = (modal.name || "").trim();
    if (!name) { flash("러너 이름을 입력하세요"); return; }
    if (runners.some((x) => x.name === name)) { flash("같은 이름의 러너가 이미 있습니다"); return; }
    const token = newToken();
    addMqaRunner({ id: "R-" + Date.now(), name, host: "", os: "", status: "설치 대기", lastSeen: "—", pkg: "", registeredAt: stamp(), registeredBy: currentUser || "—", checks: {}, devices: [] });
    setSel(runners.length);
    setModal({ step: "token", name, token });
  };
  const reissue = () => {
    if ((r.devices || []).some((d) => d.busy)) { flash("단말이 작업 중입니다 — 작업이 끝난 뒤 재발급하세요"); return; }
    if (!window.confirm(r.name + " 의 등록 토큰을 재발급할까요?\n\n지금 연결은 끊기고, PC에서 새 토큰으로 다시 등록해야 합니다. PC를 바꾸거나 러너를 다시 설치할 때 씁니다.")) return;
    updateMqaRunner(r.id, { status: "설치 대기", lastSeen: "—", checks: {}, devices: [] });
    setModal({ step: "token", name: r.name, token: newToken(), reissue: true });
  };
  const del = () => {
    if ((r.devices || []).some((d) => d.busy)) { flash("단말이 작업 중이라 삭제할 수 없습니다"); return; }
    if (!window.confirm(r.name + " 러너를 삭제할까요?\n\n이 PC의 단말을 더 이상 쓸 수 없고, PC에 설치된 러너는 연결이 거부됩니다.")) return;
    removeMqaRunner(r.id); setSel(0); flash(r.name + " 삭제됨");
  };
  /* 다시 점검 — 러너에게 점검을 요청하고 결과를 받는다 (목업: 러너 항목은 통과) */
  const recheck = () => {
    if (rs !== "연결됨") { flash("러너가 연결되어 있지 않아 점검할 수 없습니다"); return; }
    setChecking(true);
    later(() => { updateMqaRunner(r.id, { checks: { server: true, appium: true }, lastSeen: "방금 전" }); setChecking(false); flash("점검 완료"); }, 1000);
  };
  /* 단말 '다시 확인' — 승인 필요 · 점검 실패에서 사용자가 조치한 뒤 누른다 (목업: 승인 → 보조 앱 설치 순서로 통과) */
  const recheckDevice = (d) => {
    setDevBusy((x) => ({ ...x, [d.id]: true }));
    later(() => {
      if (!d.auth) updateMqaDevice(d.id, { auth: true, helper: null });
      later(() => { updateMqaDevice(d.id, { helper: true }); setDevBusy((x) => ({ ...x, [d.id]: false })); flash(d.model + " 사용 가능"); }, 900);
    }, 800);
  };
  /* (목업) 설치 대기 → 연결 — 실제로는 PC에서 러너를 설치하고 토큰을 입력하면 러너가 먼저 연결해 온다 */
  const simulateConnect = () => {
    updateMqaRunner(r.id, { status: "연결됨", lastSeen: "방금 전", host: "QA-PC-" + String(Date.now()).slice(-3), os: "Windows 11", pkg: "0.1.0", checks: { server: true, appium: true },
      devices: [{ id: "D-" + Date.now(), model: "Galaxy A54", maker: "Samsung", sdk: 34, serial: "R5CW" + String(Date.now()).slice(-6), adb: true, auth: false, helper: null, busy: null, connectedAt: stamp() }] });
    flash(r.name + " 연결됨 — 단말 화면에서 USB 디버깅을 허용하세요");
  };

  const tokenModal = modal && (
    <Modal title={modal.step === "name" ? "러너 추가" : modal.reissue ? "등록 토큰 재발급" : "러너 설치"} onClose={() => setModal(null)}>
      {modal.step === "name" ? (
        <div className="space-y-3">
          <Field label="러너 이름" hint="어느 PC인지 알아볼 수 있게 — 예: 11층 QA PC"><Input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="예: 11층 QA PC" /></Field>
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">단말을 USB로 연결할 PC에 러너를 설치합니다. 러너가 PROBA로 먼저 연결하므로 PC 쪽에 포트를 열 필요가 없습니다.</div>
          <div className="flex justify-end gap-2"><Btn onClick={() => setModal(null)}>취소</Btn><Btn kind="primary" icon={KeyRound} onClick={issue}>등록 토큰 발급</Btn></div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">등록 토큰 · {modal.name}</div>
            <div className="flex items-center gap-2"><div className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">{modal.token}</div><Btn icon={Copy} onClick={() => { try { navigator.clipboard.writeText(modal.token); } catch (e) { /* 미지원 */ } flash("토큰을 복사했습니다"); }}>복사</Btn></div>
            <div className="mt-1 text-xs text-amber-700">이 토큰은 지금 한 번만 보입니다. 24시간 안에 등록하지 않으면 만료됩니다.</div>
          </div>
          <ol className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
            <li className="flex items-start gap-2"><span className="font-semibold text-sky-700">1</span><span className="flex-1">PC에 설치 패키지를 받아 설치합니다 (관리자 권한). <button onClick={() => flash("목업 — 설치 파일 내려받기")} className="ml-1 inline-flex items-center gap-1 text-sky-600"><Download size={12} />설치 파일 받기 (Windows)</button></span></li>
            <li className="flex items-start gap-2"><span className="font-semibold text-sky-700">2</span><span className="flex-1">설치 중 위 등록 토큰을 붙여 넣습니다. 프록시를 쓰는 망이면 프록시 주소도 함께 입력합니다.</span></li>
            <li className="flex items-start gap-2"><span className="font-semibold text-sky-700">3</span><span className="flex-1">단말을 USB로 연결하고, 단말 화면의 <b className="font-medium">이 컴퓨터 허용</b>에서 항상 허용을 체크해 승인합니다.</span></li>
          </ol>
          <div className="text-xs text-slate-500">러너가 연결되면 이 화면에 상태와 단말이 나타납니다. 설치 전 준비 항목은 아래 <span className="text-slate-700">사전 준비</span>를 보세요.</div>
          <div className="flex justify-end"><Btn kind="primary" onClick={() => setModal(null)}>확인</Btn></div>
        </div>
      )}
    </Modal>
  );

  if (!r) return (
    <div className="space-y-4">
      <PageToolbar desc="러너(단말을 연결할 PC) · 연결된 단말 · 자동 점검" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3"><Btn kind="primary" icon={Plus} className="w-full" onClick={openAdd}>러너 추가</Btn><div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">등록된 러너가 없습니다.</div></div>
        <div className="col-span-9 space-y-3">
          <Card className="flex flex-col items-center justify-center py-14 text-center">
            <Monitor size={26} className="text-slate-400" />
            <div className="mt-3 text-sm font-medium text-slate-700">단말을 연결할 PC에 러너를 설치하세요</div>
            <div className="mt-1.5 max-w-md text-xs text-slate-500">앱 실행 확인 · AI로 스텝 만들기 · 디버그 실행 · 정식 실행은 모두 러너에 연결된 단말에서 돌아갑니다.</div>
            <div className="mt-4"><Btn kind="primary" icon={Plus} onClick={openAdd}>러너 추가</Btn></div>
          </Card>
          <Prereq open />
        </div>
      </div>
      {tokenModal}
      <Toast msg={msg} />
    </div>
  );

  const devs = r.devices || [];
  /* 이 러너의 단말을 쓰는 예약 계획 — 끄면 안 되는 PC 인지 바로 알 수 있게 */
  const schedOn = (x) => mqaPlans.filter((p) => p.status === "활성" && p.schedule && p.schedule.mode !== "없음" && (x.devices || []).some((dv) => dv.id === p.devId));
  const usable = devs.filter((d) => devState(r, d) === "사용 가능").length;
  return (
    <div className="space-y-4">
      <PageToolbar desc="러너(단말을 연결할 PC) · 연결된 단말 · 자동 점검" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <Btn kind="primary" icon={Plus} className="w-full" onClick={openAdd}>러너 추가</Btn>
          {runners.map((x, i) => {
            const st = runnerState(x); const n = (x.devices || []).length; const ok = (x.devices || []).filter((d) => devState(x, d) === "사용 가능").length;
            return (
              <Card key={x.id} className={"cursor-pointer p-3 " + (sel === i ? SEL_CARD : SEL_IDLE)}>
                <div onClick={() => setSel(i)}>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Monitor size={13} className="text-slate-500" />{x.name}</span><Badge kind={RS_K[st]}>{st}</Badge></div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500"><Badge kind={runnerRole(x) === "저작용" ? "info" : "active"}>{runnerRole(x)}</Badge>단말 {n}대{n ? " · 사용 가능 " + ok : ""}</div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="col-span-9 space-y-3">
          {/* 헤더 — 대상·환경과 같은 배치 */}
          <Card className="space-y-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold text-slate-900">{r.name}</span><Badge kind={RS_K[rs]}>{rs}</Badge>{rs === "연결됨" && <span className="text-xs text-slate-500">마지막 신호 {r.lastSeen}</span>}</div>
              <div className="flex items-center gap-2">
                {rs === "설치 대기" && <Btn onClick={simulateConnect} title="목업 — 실제로는 PC에서 설치하면 자동으로 연결됩니다">(목업) 연결 시뮬레이션</Btn>}
                <Btn icon={RefreshCw} onClick={recheck} disabled={checking}>{checking ? "점검 중…" : "다시 점검"}</Btn>
                <Btn icon={KeyRound} onClick={reissue}>토큰 재발급</Btn>
                <button onClick={del} className="text-slate-400 hover:text-red-600" title="러너 삭제"><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">용도 <span className="w-28"><Select value={runnerRole(r)} onChange={(e) => { const v = e.target.value; const used = schedOn(r); if (v === "저작용" && used.length && !window.confirm("이 PC의 단말을 쓰는 예약 계획이 " + used.length + "건 있습니다 (" + used.map((p) => p.name).join(", ") + ").\n저작용으로 바꾸면 그 예약은 실행 불가가 됩니다.\n\n바꿀까요?")) return; updateMqaRunner(r.id, { role: v }); flash("용도 → " + v); }}>{RUNNER_ROLES.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}</Select></span></span>
              <span>PC <span className="text-slate-700">{r.host || "—"}</span></span><span>OS <span className="text-slate-700">{r.os || "—"}</span></span><span>러너 패키지 <span className="font-mono text-slate-700">{r.pkg || "—"}</span></span><span>등록 {r.registeredBy} · {r.registeredAt}</span>
            </div>
          </Card>

          <div className="text-xs text-slate-500">{(RUNNER_ROLES.find((x) => x.id === runnerRole(r)) || {}).desc}{schedOn(r).length > 0 && <span className="ml-2 text-amber-700">· 예약 실행 {schedOn(r).length}건이 이 PC를 씁니다 ({schedOn(r).map((p) => p.name + " " + p.schedule.mode + " " + p.schedule.time).join(", ")}) — PC와 단말을 켜 두세요</span>}</div>
          {rs === "설치 대기" && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />아직 러너가 연결되지 않았습니다. PC에 설치 패키지를 설치하고 등록 토큰을 입력하세요. 토큰을 잃어버렸으면 토큰 재발급을 누르세요.</div>}
          {rs === "오프라인" && <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-500" />러너 신호가 끊겼습니다 — PC 전원 · 네트워크 · 러너 실행 여부를 확인하세요. 이 PC의 단말은 쓸 수 없습니다.</div>}

          <div className="grid grid-cols-12 items-start gap-3">
            {/* 연결된 단말 */}
            <Card className="col-span-8 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2"><Smartphone size={15} className="text-sky-600" /><span className="text-sm font-semibold text-slate-800">연결된 단말</span><span className="text-xs text-slate-500">{devs.length}대 · 사용 가능 {usable}</span><span className="ml-auto text-xs text-slate-500">1단말 1작업 — 작업 중인 단말은 다른 작업에 배정되지 않습니다</span></div>
              {devs.length === 0 ? <div className="px-4 py-8 text-center text-xs text-slate-500">{rs === "연결됨" ? "연결된 단말이 없습니다 — USB 케이블 · USB 디버깅을 확인하세요" : "러너가 연결되면 단말이 나타납니다"}</div> : devs.map((d) => {
                const st = devState(r, d);
                const fails = DEVICE_CHECKS.filter((c) => d[c.k] === false || (c.k === "auth" && !d.auth));
                return (
                  <div key={d.id} className="border-b border-slate-200 px-4 py-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-50"><Smartphone size={13} className="text-slate-500" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className="text-sm font-medium text-slate-800">{d.model}</span><span className="text-xs text-slate-500">{d.maker} · {osName(d.sdk)}</span></div>
                        <div className="font-mono text-xs text-slate-400">{d.serial}</div>
                      </div>
                      <div className="flex items-center gap-1.5" title="인식 · USB 디버깅 허용 · 보조 앱">{DEVICE_CHECKS.map((c) => <span key={c.k} title={c.label}><CheckIcon v={c.k === "auth" ? !!d.auth : d[c.k]} /></span>)}</div>
                      <Badge kind={DEV_K[st]}>{st}</Badge>
                    </div>
                    {st === "사용 중" && <div className="mt-1.5 pl-10 text-xs text-sky-700">{d.busy}</div>}
                    {(st === "승인 필요" || st === "점검 실패") && (
                      <div className="mt-2 flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 pl-3 text-xs text-amber-800">
                        <span>{(fails[0] || DEVICE_CHECKS[1]).fix}</span>
                        <Btn icon={RefreshCw} onClick={() => recheckDevice(d)} disabled={!!devBusy[d.id]}>{devBusy[d.id] ? "확인 중…" : "다시 확인"}</Btn>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>

            {/* 자동 점검 */}
            <Card className="col-span-4 space-y-2 p-4">
              <div className="text-sm font-semibold text-slate-800">자동 점검</div>
              <div className="text-xs text-slate-500">러너가 시작할 때와 다시 점검할 때 수행합니다.</div>
              {RUNNER_CHECKS.map((c) => { const v = rs === "연결됨" ? r.checks[c.k] : null; return (
                <div key={c.k} className="flex items-start gap-2 text-xs"><span className="mt-0.5"><CheckIcon v={v} /></span><span className="flex-1"><span className="text-slate-700">{c.label}</span>{v === false && <span className="block text-red-600">{c.fix}</span>}</span></div>
              ); })}
              <div className="border-t border-slate-200 pt-2 text-xs text-slate-500">단말별 점검</div>
              {DEVICE_CHECKS.map((c) => { const ok = devs.filter((d) => (c.k === "auth" ? d.auth : d[c.k]) === true).length; return (
                <div key={c.k} className="flex items-center gap-2 text-xs"><span><CheckIcon v={devs.length ? (ok === devs.length ? true : devs.some((d) => (c.k === "auth" ? !d.auth : d[c.k] === false)) ? false : null) : null} /></span><span className="flex-1 text-slate-700">{c.label}</span><span className="text-slate-500">{ok}/{devs.length}</span></div>
              ); })}
            </Card>
          </div>

          <Prereq />
        </div>
      </div>
      {tokenModal}
      <Toast msg={msg} />
    </div>
  );
}
