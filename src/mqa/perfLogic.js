// ============================================================
// 앱 테스트 — 성능 측정 (실행 계획의 목적 중 하나 · adb + Perfetto 기준)
//   · 앱 · 환경 · 버전 · 스위트 · 기기는 기능 검증과 같은 것을 쓴다 — 앱 소스 수정 · 벤치마크 코드가 필요 없다
//   · 측정 항목: 앱 시작(콜드/웜/핫) · 유휴(N분) · 스위트 케이스별 (케이스 하나가 측정 구간 하나)
//   · 기능 실행과 섞지 않는다 — 반복 측정 · 깨끗한 조건이 필요해 실행은 따로 한다
//   · 측정 동안 Appium 은 화면을 조회하지 않는다 (조작 → 측정 → 다음 조작). 절대값보다 같은 기기에서의 추이를 본다
// ============================================================

/* 지표 — 수집 방법이 일반 release 빌드에서 되는 것만 (앱 코드 · profileable 불필요)
   for: 이 지표를 잴 수 있는 측정 항목 · needs: 기기 능력(frame = Android 12+, power = 전력 측정 칩) */
export const PERF_METRICS = [
  { id: "start", label: "시작 시간", unit: "ms", agg: "중앙값", src: "am start -W · logcat Displayed", for: ["start"] },
  { id: "jank", label: "버벅인 프레임", unit: "%", agg: "중앙값", src: "dumpsys gfxinfo (Android 12 이상은 FrameTimeline 으로 원인까지)", for: ["case"] },
  { id: "slow", label: "느린 프레임 P90", unit: "ms", agg: "중앙값", src: "dumpsys gfxinfo 백분위", for: ["case"] },
  /* 메모리는 구간이 끝난 뒤 한 번 — meminfo 는 무거워서 자주 찍으면 CPU 값을 오염시키고 찍는 간격에 따라 최대값이 달라진다 */
  { id: "mem", label: "메모리 (구간 끝 PSS)", unit: "MB", agg: "중앙값", src: "dumpsys meminfo", for: ["start", "idle", "case"] },
  /* % 는 코어 수 기준이 기기마다 달라 헷갈린다 — 같은 동작에 CPU 를 몇 ms 썼는지로 본다 */
  { id: "cpu", label: "CPU 사용 시간", unit: "ms", agg: "중앙값", src: "Perfetto 스케줄링 · /proc/<pid>/stat", for: ["start", "idle", "case"] },
  { id: "net", label: "네트워크", unit: "MB", agg: "중앙값", src: "dumpsys netstats (앱 uid)", for: ["idle", "case"], opt: true },
  /* 수치라기보다 사건 — 기준값을 비워 두어도 0 으로 본다 (생기면 불합격) */
  { id: "crash", label: "크래시 · ANR", unit: "건", agg: "합계", src: "logcat · dropbox", for: ["start", "idle", "case"], zero: true },
  /* 전력 측정 칩은 앱이 아니라 기기 전체를 잰다 — 짧은 구간은 잡음이 커서 5분 이상 유휴에서만 */
  { id: "power", label: "전력", unit: "mW", agg: "평균", src: "전력 측정 칩 (ODPM)", for: ["idle"], needs: "power" },
  /* 앱 크기 — 회차 · 단말과 무관하게 빌드마다 한 번 */
  { id: "size", label: "앱 크기 (설치 후)", unit: "MB", agg: "값", src: "APK 파일 · 설치 후 dumpsys diskstats", for: ["app"] },
];
export const metricOf = (id) => PERF_METRICS.find((m) => m.id === id) || null;
export const START_MODES = ["콜드", "웜", "핫"];

/* 측정 조건 — Macrobenchmark 가 해 주던 일을 플랫폼이 직접 한다 */
/* cvWarn · cvBad — 흔들림(변동계수) 표시 기준. 넘으면 '참고' · '흔들림 큼(다시 측정 권장)'. 실제 기기 데이터를 모은 뒤 조정한다 */
export const PERF_COND0 = { iters: 10, warmup: 1, clearData: true, compile: "설치 상태 그대로", maxTemp: 40, minBatt: 30, cvWarn: 10, cvBad: 20 };
export const COMPILE_OPTS = ["설치 상태 그대로", "전체 컴파일 (speed)", "컴파일 초기화 (verify)"];
export const PERF0 = { items: { start: ["콜드"], idle: 0, cases: false }, metrics: ["start", "mem", "cpu", "crash", "size"], criteria: {}, cond: PERF_COND0 };

/* 측정 항목 키 — 합격 기준 표의 행 · 결과의 행. 앱 크기는 빌드에 붙는 값이라 따로 한 행 */
export const itemKeys = (perf, cases) => [
  ...((perf.metrics || []).includes("size") ? [{ key: "app", label: "앱 (빌드)", kind: "app" }] : []),
  ...((perf.items || {}).start || []).map((m) => ({ key: "start:" + m, label: "앱 시작 · " + m, kind: "start" })),
  ...((perf.items || {}).idle ? [{ key: "idle", label: "유휴 " + perf.items.idle + "분", kind: "idle" }] : []),
  ...((perf.items || {}).cases ? (cases || []).map((c) => ({ key: c.id, label: c.id + " " + c.name, kind: "case" })) : []),
];
/* 이 항목에서 잴 지표 — 계획이 고른 지표 중 그 항목에 해당하는 것만 */
export const metricsFor = (perf, kind) => PERF_METRICS.filter((m) => (perf.metrics || []).includes(m.id) && m.for.includes(kind));

/* 실행 전에 알 수 있는 문제 — 계획 화면 · 실행 화면 공통 (빈 문자열 = 없음) */
export const perfBlock = (perf, cases) => {
  const it = (perf && perf.items) || {};
  if (!((it.start || []).length || it.idle || it.cases)) return "측정 항목을 1개 이상 고르세요";
  if (it.cases && !(cases || []).length) return "스위트 케이스별 측정을 골랐지만 대상 케이스가 없습니다";
  if (!(perf.metrics || []).length) return "지표를 1개 이상 고르세요";
  return "";
};
/* 합격 기준 입력 도움 — 이 계획의 최근 완료 회차(최대 3회)에서 잰 값의 범위. 고른 단말 전체에서 최소~최대.
   측정 실패 · 측정 불가 값은 뺀다. 없으면 null */
export const recentRange = (runs, planId, devIds, key, mid, n = 3) => {
  const rs = (runs || []).filter((r) => r.planId === planId && r.purpose === "성능" && r.status === "완료").sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, n);
  const vs = [];
  rs.forEach((r) => key === "app" ? (r.app && r.app.size != null && vs.push(r.app.size)) : (r.subs || []).filter((s) => s.st === "완료" && (devIds || []).includes(s.devId)).forEach((s) => { const it = (s.items || []).find((x) => x.key === key); if (it && !it.fail && it.vals && it.vals[mid] != null) vs.push(it.vals[mid]); }));
  return vs.length ? { lo: Math.min(...vs), hi: Math.max(...vs), n: rs.length } : null;
};
/* 기기 능력이 모자라 못 재는 지표 — 막지 않고 알린다 (그 단말에서는 그 지표가 '측정 불가') */
/* 합격 기준값 — 비어 있으면 판정하지 않는다. 크래시 · ANR 만 비어 있어도 0 */
export const criterionOf = (perf, key, mid) => { const v = (((perf || {}).criteria || {})[key] || {})[mid]; if (v != null && v !== "") return +v; const m = metricOf(mid); return m && m.zero ? 0 : null; };
/* devs = 계획이 고른 단말 */
export const capGaps = (perf, devs, perfCaps) => {
  const out = [];
  (devs || []).forEach((d) => { const c = perfCaps(d);
    (perf.metrics || []).forEach((mid) => { const m = metricOf(mid); if (m && m.needs && !c[m.needs]) out.push(d.model + " — " + m.label + " 측정 불가 (전력 측정 칩 없음)"); }); });
  return out;
};
