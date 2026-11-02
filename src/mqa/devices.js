// ============================================================
// MQA 테스트 기기 — 러너 · 단말 상태 판단 (단일 출처)
//   러너 = 사용자 PC 에 상주하는 에이전트 (설치 패키지 하나: 에이전트 + Appium 서버 + adb + RF)
//   단말 = 러너 PC 에 USB 로 연결된 Android 기기
//   · 단말의 '사용 가능' 여부는 저장하지 않고 매번 계산한다 — 러너 연결 · 승인 · 점유 · 앱 호환을 한곳에서 본다
//   · 이 함수를 쓰는 곳: 테스트 기기 화면 · 앱 실행 확인 · AI 생성 · 디버그 실행 · 요소 집기
//     (같은 판단을 화면마다 따로 구현하면 반드시 어긋난다 — FQA F9 outerChecks 와 같은 원칙)
// ============================================================

export const SDK_OS = { 24: "7.0", 26: "8.0", 28: "9", 29: "10", 30: "11", 31: "12", 33: "13", 34: "14", 35: "15" };
export const osName = (sdk) => "Android " + (SDK_OS[sdk] || "API " + sdk);

/* 러너가 보고한 마지막 신호로 연결 상태를 본다 — 신호가 끊긴 러너의 단말은 쓸 수 없다 */
export const runnerState = (r) => (r.status === "설치 대기" ? "설치 대기" : r.status === "연결됨" ? "연결됨" : "오프라인");

/* 단말 상태 — 우선순위: 러너 오프라인 > 승인 필요 > 점검 실패 > 사용 중 > 사용 가능 */
export const devState = (r, d) => {
  if (runnerState(r) !== "연결됨") return "오프라인";
  if (!d.auth) return "승인 필요";
  if (d.helper === false) return "점검 실패";
  if (d.busy) return "사용 중";
  return "사용 가능";
};
export const DEV_K = { "사용 가능": "pass", "사용 중": "info", "승인 필요": "warn", "점검 실패": "fail", "오프라인": "draft" };

/* 모든 러너의 단말을 한 목록으로 — 선택 상자 · 차단 판단용 */
export const flatDevices = (runners) => (runners || []).flatMap((r) => (r.devices || []).map((d) => ({ ...d, runnerId: r.id, runnerName: r.name, state: devState(r, d) })));
export const devLabel = (d) => d.model + " (" + osName(d.sdk) + ") — " + d.runnerName;

/* 이 단말로 이 앱 버전을 돌릴 수 있나 — 안 되면 사유를 돌려준다 (빈 문자열 = 가능) */
export const deviceBlock = (d, build) => {
  if (!d) return "사용할 단말이 없습니다 — 테스트 기기에서 러너와 단말을 연결하세요";
  if (d.state === "오프라인") return d.model + " — 러너(" + d.runnerName + ")가 연결되어 있지 않습니다";
  if (d.state === "승인 필요") return d.model + " — 단말 화면에서 이 PC의 USB 디버깅을 허용해야 합니다";
  if (d.state === "점검 실패") return d.model + " — 보조 앱 설치에 실패했습니다 (USB 설치 허용 · MDM 확인)";
  if (d.state === "사용 중") return d.model + " — " + (d.busy || "다른 작업") + "이(가) 사용 중입니다";
  if (build && build.minSdk && d.sdk < build.minSdk) return d.model + " — 앱 최소 지원 OS(" + osName(build.minSdk) + ")보다 낮습니다";
  return "";
};
/* 기본 선택 — 쓸 수 있는 단말 중 첫 번째, 없으면 첫 번째 */
export const pickDefault = (devs, build) => (devs.find((d) => !deviceBlock(d, build)) || devs[0] || null);

/* 자동 점검 — 러너가 기동할 때와 '다시 점검' 때 수행. 실패하면 사용자가 할 일을 함께 보여준다 */
export const RUNNER_CHECKS = [
  { k: "server", label: "PROBA 서버 연결", fix: "PC의 외부 연결(방화벽 · 프록시)을 확인하세요" },
  { k: "appium", label: "Appium 서버 기동", fix: "러너를 다시 시작하세요" },
];
export const DEVICE_CHECKS = [
  { k: "adb", label: "단말 인식 (adb)", fix: "데이터 전송 케이블 · USB 드라이버 · USB 디버깅을 확인하세요" },
  { k: "auth", label: "USB 디버깅 허용", fix: "단말 화면의 '이 컴퓨터 허용'에서 항상 허용을 체크하고 승인하세요" },
  { k: "helper", label: "보조 앱 설치 (Appium)", fix: "개발자 옵션의 USB 설치 허용(제조사별) · Play 프로텍트 · MDM 예외를 확인하세요" },
];

/* 사전 준비 — 러너 설치 전에 사용자가 갖춰야 하는 것 (패키지로 해결 못 하는 것만) */
export const PREREQ = [
  { g: "단말", items: ["개발자 옵션 · USB 디버깅 켜기", "처음 연결 시 '이 컴퓨터 허용' → 항상 허용", "충전 중 화면 켜짐 유지 · 화면 잠금 없음", "제조사별 USB 설치 · 입력 제어 허용 (예: 샤오미)", "MDM 대상이면 예외 등록"] },
  { g: "PC", items: ["Windows: 제조사 USB 드라이버 (삼성 · Google 등)", "설치 시 관리자 권한", "PC 절전 · USB 선택적 절전 끄기", "백신 · 보안 프로그램에서 러너 예외"] },
  { g: "네트워크", items: ["PC → PROBA 서버 아웃바운드 연결 (프록시면 주소 필요)", "단말 → 테스트 대상 스테이징 접속 (사내망 전용이면 사내 Wi-Fi)", "사내 USB 매체 제어 정책 확인"] },
  { g: "하드웨어", items: ["데이터 전송 지원 USB 케이블 (충전 전용 불가)", "여러 대면 전원 공급형 USB 허브"] },
];
export const PKG_INCLUDES = "러너 에이전트 · Appium 서버와 UiAutomator2 드라이버 · Java 런타임 · adb · Robot Framework — 따로 설치하지 않습니다";

/* 러너 용도 — 스케줄(무인) 실행은 항상 켜 두는 PC 에서만 돈다.
   저작용 = 개인 업무 PC(퇴근하면 꺼짐) · 실행용 = 상시 켜 둔 PC · 공용 = 둘 다 */
export const RUNNER_ROLES = [
  { id: "저작용", desc: "AI 저작 · 요소 집기 · 디버그 실행 · 수동 실행" },
  { id: "실행용", desc: "상시 켜 둔 PC — 예약 실행 · 수동 실행" },
  { id: "공용", desc: "저작과 예약 실행 모두 (상시 켜 둘 때만)" },
];
export const runnerRole = (r) => (r && r.role) || "저작용";
export const runnerOfDev = (runners, devId) => (runners || []).find((r) => (r.devices || []).some((d) => d.id === devId)) || null;
