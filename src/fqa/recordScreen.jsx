// 원래 fqa/screens.jsx 의 일부를 옮긴 파일 — 내용 · 동작 변경 없음
import { useState } from "react";
import { Code2, Copy, RefreshCw, Terminal, Video } from "lucide-react";
import { Badge, Btn, Card, Field, Input, Select, Toast, useToast } from "../common/ui.jsx";
import { useApp } from "../common/context.js";
import { envOpts, nextTcId, refKey } from "./logic.js";
import { Hdr } from "./parts.jsx";

/* ═══════════ 1. 레코딩 (CLI + Playwright codegen) ═══════════

   구현 전제 — 공식 CLI만 사용한다(내부 API 없음):
     1) 웹에서 세션 생성 → 명령어 발급
     2) 사용자가 터미널에서  npx proba-cli record --session <id>
     3) CLI가 세션 정보를 받아  npx playwright codegen [플래그] <base+시작경로> -o out.spec.ts  실행
        · --load-storage  : 이전 녹화에서 저장한 로그인 상태 재사용
        · --save-storage  : 이번 로그인 상태를 로컬(~/.proba)에만 저장 — 플랫폼에 올리지 않는다
        · --viewport-size / --ignore-https-errors : 환경 설정에서 주입
     4) 브라우저에서 조작 · 툴바로 검증 추가 → 창을 닫으면 codegen 종료
     5) CLI가 out.spec.ts를 AST로 파싱 → 스텝으로 변환 → 플랫폼에 업로드
        · 로케이터 생성·고유성 보장은 Playwright가 한다 (우리가 만들지 않는다)
        · 파싱하지 못한 줄은 '코드 스텝'으로 보존 → 손실 0
     6) 웹에서 검토 후 등록

   v1 한계(정직하게 화면에 표시):
     · 실시간 스트리밍 아님 — 녹화 종료 후 일괄 수신
     · Basic Auth 미지원 (codegen에 해당 플래그가 없음)
     · Node.js 18+ 필요 · 첫 실행 시 브라우저 바이너리 다운로드                */

/* codegen 출력 파싱 결과(데모) — 실제로는 CLI가 AST 파싱해 올려준다.
   · 계정 값은 CLI가 세션의 계정 풀과 대조해 ${계정 ID}로 치환한다.
   · 비밀번호 필드(로케이터에 password 힌트)는 ${계정 비밀번호}로 치환하고 원본 값은 버린다
     → 평문 시크릿이 케이스에 남지 않는다.
   · 변환하지 못한 문장은 코드 스텝으로 원본 보존. */
const REC_CAPTURED = [
  { act: "이동", loc: "/login", val: "-" },
  { act: "입력", loc: "[data-testid=username]", val: "${계정 ID}" },
  { act: "입력", loc: "[data-testid=password]", val: "${계정 비밀번호}" },
  { act: "체크", loc: "role=checkbox[자동 로그인]", val: "체크" },
  { act: "클릭", loc: "role=button[로그인]", val: "-" },
  { act: "화면 검증", loc: "text=환영합니다", val: "visible = true" },
  { act: "코드 스텝", loc: "", val: "", code: "const page1Promise = page.waitForEvent('popup');\nawait page.getByRole('link', { name: '이용약관' }).click();\nconst page1 = await page1Promise;" },
];
const REC_VIEWPORTS = ["1920×1080", "1440×900", "1280×720", "375×812 (모바일)"];

export function FqaRecordScreen({ onDone, onEdit }) {
  const { fqaSuites, fqaSystems, fqaCases } = useApp();
  const [msg, flash] = useToast();
  const opts = envOpts(fqaSystems).filter((o) => o.webUrl);
  const [ref, setRef] = useState(opts[0] ? { systemId: opts[0].systemId, env: opts[0].env } : null);
  const cur = opts.find((o) => refKey(o) === refKey(ref)) || opts[0] || {};
  const base = cur.webUrl || "";
  const [path, setPath] = useState("/");
  /* 녹화 해상도 — 반응형 사이트는 화면 크기에 따라 DOM이 달라지므로 녹화 시점에 정해야 한다.
     케이스에는 저장하지 않는다(실행 해상도는 실행 계획이 정함). */
  const [vp, setVp] = useState(REC_VIEWPORTS[0]);
  // 스위트·TC명은 캡처 결과를 보고 등록 시점에 정한다
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("setup"); // setup | waiting | recording | done
  const [sid, setSid] = useState("");
  const [steps, setSteps] = useState([]);

  /* 명령어는 서버가 조립해 발급한다 —
       · CLI 버전: 플랫폼 API 스키마에 묶이므로 @latest가 아니라 호환 버전을 박는다
       · 세션 토큰: 대상 환경 정보를 받아가고 스텝을 올리는 '사실상 인증'이므로
                    단명(10분) · 1회용 · 128bit 이상. 짧은 ID는 대입 가능해 위험하다.        */
  /* npm 패키지는 스코프 없는 proba-cli — npx 한 줄로 끝나야 하므로 짧은 쪽을 골랐다.
     스코프(@org/cli)는 조직을 바꾸면 패키지 이름까지 바뀌지만, 스코프 없는 이름은 조직 소유로 옮겨도 그대로다.
     전역 설치 시 명령어는 package.json 의 bin 이 정한다 → proba (vercel/eslint 와 같은 관례) */
  /* 실제 배포 버전과 반드시 일치해야 한다 — 화면의 명령어를 복사해 실행하는 구조라
     없는 버전을 적으면 사용자 터미널에서 "No matching version" 이 난다.
     0.1 은 0.1.x 범위 — 패치는 자동으로 따라오고 마이너는 고정된다. */
  const CLI_VER = "0.1";
  const cmd = "npx proba-cli@" + CLI_VER + " record --session " + sid;

  // 목업용 토큰 — 실제로는 서버가 발급한다(128bit·10분·1회용). 클라 Math.random은 데모 표시용일 뿐.
  const newToken = () => {
    const A = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = ""; for (let i = 0; i < 22; i++) s += A[Math.floor(Math.random() * A.length)];
    return "s_" + s;
  };
  const startSession = () => {
    if (!base) { flash("웹 URL이 설정된 대상·환경이 없습니다"); return; }
    setSid(newToken()); setSteps([]); setPhase("waiting");
    // 목업 시뮬: 잠시 후 CLI가 붙어 브라우저가 열린 것으로 본다
    setTimeout(() => setPhase((p) => (p === "waiting" ? "recording" : p)), 2500);
  };
  const cancel = () => { setPhase("setup"); setSid(""); setSteps([]); };
  // 목업 시뮬 — 실제로는 CLI가 세션 토큰으로 스텝을 업로드하면 이 화면이 받는다
  const simulate = () => { setSteps(REC_CAPTURED); setPhase("done"); flash("스텝 " + REC_CAPTURED.length + "개 수신 (데모 시뮬)"); };
  const stK2 = { setup: ["info", "세션 없음"], waiting: ["warn", "● CLI 연결 대기"], recording: ["live", "● 녹화 중"], done: ["pass", "수신 완료"] };
  /* 캡처 결과는 곧바로 저장하지 않는다 — 에디터로 넘겨 스텝 다듬기·검증·태그를 거친 뒤 저장한다.
     여기서는 케이스를 만들지 않는다(에디터가 첫 저장 때 생성). origin으로 '레코딩 생성'을 남긴다. */
  const openInEditor = () => {
    const c = { id: nextTcId(fqaCases), origin: "레코딩", name: name || "레코딩 TC", tags: "", status: "초안", level: "Low-Code", dataset: "-", steps };
    onEdit ? onEdit(c) : onDone && onDone("레코딩 완료");
  };
  return (
    <div className="space-y-4">
      <Hdr icon={Video} title="레코딩" badge="Web · Playwright" desc="로컬 CLI + Playwright codegen · 조작 캡처 → 스텝" />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 space-y-4">
          <Card className="p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">녹화 세션</span>
              <Badge kind={stK2[phase][0]}>{stK2[phase][1]}</Badge>
            </div>

            <Field label="대상 · 환경">
              <Select value={refKey(ref)} disabled={phase !== "setup"} onChange={(e) => { const o = opts.find((x) => refKey(x) === e.target.value); if (o) setRef({ systemId: o.systemId, env: o.env }); }}>
                {opts.length === 0 && <option>웹 URL이 설정된 대상 없음</option>}
                {opts.map((o) => <option key={refKey(o)} value={refKey(o)}>{o.label}</option>)}
              </Select>
            </Field>
            {/* base URL을 접두사로 붙여 전체 주소가 한눈에 읽히게 — 실제 저장은 상대경로만 */}
            <Field label="시작 경로">
              <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-slate-100 focus-within:border-sky-500">
                <span className="flex max-w-[55%] shrink-0 items-center truncate border-r border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-500" title={base}>{base || "대상 없음"}</span>
                <input value={path} onChange={(e) => setPath(e.target.value)} disabled={phase !== "setup"} placeholder="/login" className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-mono text-xs text-slate-800 outline-none disabled:text-slate-500" />
              </div>
            </Field>
            {/* 반응형 사이트는 해상도에 따라 DOM이 달라진다 — 녹화 해상도를 실행 해상도와 맞추는 게 안전하다 */}
            <Field label="녹화 해상도" hint="실행 해상도와 다르면 반응형 화면에서 로케이터가 달라질 수 있습니다">
              <Select value={vp} disabled={phase !== "setup"} onChange={(e) => setVp(e.target.value)}>
                {REC_VIEWPORTS.map((v) => <option key={v}>{v}</option>)}
              </Select>
            </Field>
            {phase === "setup" ? (
              <Btn kind="primary" icon={Video} className="w-full" onClick={startSession}>녹화 세션 시작</Btn>
            ) : (
              <>
                <div className="rounded-lg border border-sky-200 bg-slate-50 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Terminal size={13} className="text-sky-600" />터미널에서 실행</span>
                    <span className="text-xs text-slate-500">10분 후 만료 · 1회용</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 truncate rounded border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-sky-700">{cmd}</div>
                    <Btn icon={Copy} onClick={() => { try { navigator.clipboard.writeText(cmd); } catch (e) {} flash("명령어를 복사했습니다"); }}>복사</Btn>
                  </div>
                </div>
                {/* 로컬 파일(로그인 상태 저장 여부)은 웹이 알 수 없다 — 상태로 표시하지 않고 동작만 설명한다 */}
                <div className="space-y-1 text-xs text-slate-500">
                  <div>· <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-600">Node.js</a> 18 이상이 설치되어 있어야 합니다</div>
                  <div>· 첫 실행 시 <span className="text-slate-500">Chromium</span>을 자동으로 내려받습니다 (최초 1회 · 2~3분)</div>
                  <div>· 이전 녹화에서 로그인했다면 그 상태로 열립니다. 처음이면 브라우저에서 직접 로그인하세요.</div>
                  <div>· 브라우저 툴바에서 <span className="text-slate-500">요소를 클릭</span>하면 검증 스텝을 추가할 수 있습니다.</div>
                </div>
                <Btn className="w-full" onClick={cancel}>세션 취소</Btn>
              </>
            )}
          </Card>
        </div>

        <div className="col-span-7">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-800">캡처 결과 {steps.length > 0 && <span className="text-xs font-normal text-slate-500">스텝 {steps.length}개</span>}</span>
              <Badge kind="draft">초안</Badge>
            </div>
            {steps.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-slate-500">
                {phase === "waiting" ? (
                  <>
                    <div className="mb-1 flex items-center justify-center gap-2 text-slate-500"><RefreshCw size={14} className="animate-spin text-sky-600" />CLI 연결을 기다리는 중…</div>
                    <div className="text-xs text-slate-500">터미널에서 위 명령어를 실행하세요.</div>
                  </>
                ) : phase === "recording" ? (
                  <>
                    <div className="mb-1 flex items-center justify-center gap-2 text-red-700"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />브라우저에서 녹화 중…</div>
                    <div className="text-xs text-slate-500">조작을 마치고 <span className="text-slate-500">브라우저 창을 닫으면</span> 스텝이 여기에 도착합니다.</div>
                    <button onClick={simulate} className="mt-4 text-xs text-slate-500 underline decoration-dotted hover:text-slate-500">＊ 데모 — 캡처 결과 수신 시뮬레이션</button>
                  </>
                ) : "녹화 세션을 시작하세요."}
              </div>
            ) : (
              <div className="space-y-1 p-3">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">{i + 1}</span>
                    {s.act === "코드 스텝" ? (
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-1.5"><span className="font-medium text-sky-600">코드 스텝</span><Badge kind="warn">파싱 불가 · 원본 보존</Badge></div>
                        <pre className="overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-sky-700">{s.code}</pre>
                      </div>
                    ) : (
                      <>
                        <span className={"w-20 shrink-0 font-medium " + (s.act.includes("검증") ? "text-amber-700" : "text-slate-800")}>{s.act}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-slate-500">{s.loc}</span>
                        <span className="shrink-0 text-slate-700">{s.val !== "-" ? s.val : ""}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* TC명은 녹화 결과를 보고 정한다. 이후 스텝 다듬기·태그·검증은 에디터에서. 스위트에 넣는 것은 스위트 · 목록 화면에서 */}
            {steps.length > 0 && (
              <div className="flex items-end gap-3 border-t border-slate-200 px-4 py-3">
                <div className="min-w-0 flex-1"><Field label="TC 이름"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 로그인 정상 동작" /></Field></div>
                <Btn icon={Video} onClick={startSession}>다시 녹화</Btn>
                <Btn kind="primary" icon={Code2} onClick={openInEditor}>에디터에서 다듬기</Btn>
              </div>
            )}
          </Card>
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  );
}