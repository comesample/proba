// ============================================================
// 전역 · 관리자 콘솔 시드 데이터 (단일 출처)
// 도메인(LQA/FQA/NQA) 목록 · 공통 네비 · 테넌트/사용자/모델 시드
// lqa/data.js에서 분리(2026-07-01). App·콘솔이 import.
// ============================================================
import { Bug, Megaphone, UserCog, Braces, Database } from "lucide-react";

export const DOMAINS = [{ id: "LQA", label: "AI 품질", ready: true }, { id: "FQA", label: "기능 QA", ready: true }, { id: "MQA", label: "기능 QA (앱)", ready: true }, { id: "NQA", label: "성능 QA", ready: true }];
export const COMMON_SECTIONS = [
  { group: "공통", items: [
    { id: "variables", label: "변수", icon: Braces },
    { id: "datasets", label: "데이터셋", icon: Database },
    { id: "defects", label: "결함", icon: Bug },
    { id: "report", label: "리포트 · 알림", icon: Megaphone },
  ] },
];

/* 변수 작업 공간 — 평면 K/V. secret=true는 마스킹. 대상/시나리오에서 ${key} 참조. 환경별 값은 접두어(dev_/stg_/prd_) 관례로 구분. */
export const INIT_VARIABLES = [
  { id: "v1", key: "base_domain", value: "onmarket.io", secret: false, desc: "공통 서비스 도메인", createdAt: "2026-01-10 09:12", updatedAt: "2026-01-10 09:12" },
  { id: "v2", key: "stg_onmarket_token", value: "eyJhbGciOiJIUzI1Ni-stg", secret: true, desc: "온마켓 스테이징 API 토큰", createdAt: "2026-02-03 14:20", updatedAt: "2026-06-28 11:05" },
  { id: "v3", key: "dev_onmarket_token", value: "eyJhbGciOiJIUzI1Ni-dev", secret: true, desc: "온마켓 개발 API 토큰", createdAt: "2026-02-03 14:22", updatedAt: "2026-02-03 14:22" },
  { id: "v4", key: "stg_test_pw", value: "P@ssw0rd!23", secret: true, desc: "스테이징 테스트 계정 비밀번호", createdAt: "2026-03-15 10:00", updatedAt: "2026-05-02 16:40" },
  { id: "v6", key: "stg_booking_token", value: "eyJhbGciOiJIUzI1Ni-bkg", secret: true, desc: "예약 스테이징 API 토큰", createdAt: "2026-02-03 14:25", updatedAt: "2026-06-28 11:05" },
  { id: "v5", key: "vip_account_id", value: "1000482", secret: false, desc: "VIP 시나리오 대표 계정", createdAt: "2026-01-10 09:15", updatedAt: "2026-04-11 13:30" },
];

/* 테스트 데이터셋 — 명명된 표 데이터. NQA 피드/FQA 데이터 드리븐이 이름으로 참조. */
export const INIT_DATASETS = [
  { id: "ds1", name: "accounts_10k", desc: "부하용 대량 로그인 계정", columns: ["phone", "pw"], rows: [{ phone: "01012340001", pw: "P@ss0001" }, { phone: "01012340002", pw: "P@ss0002" }, { phone: "01012340003", pw: "P@ss0003" }], rowCount: 10000, source: "업로드", createdAt: "2026-05-02 16:40", updatedAt: "2026-06-28 11:05" },
  { id: "ds2", name: "signup_emails", desc: "회원가입 이메일 형식 케이스", columns: ["email", "expected"], rows: [{ email: "valid@example.com", expected: "pass" }, { email: "invalid-email", expected: "fail" }, { email: "no@dot", expected: "fail" }], rowCount: 6, source: "인라인", createdAt: "2026-04-11 13:30", updatedAt: "2026-04-11 13:30" },
  { id: "ds3", name: "order_change_utterances", desc: "주문/배송 변경 발화 세트", columns: ["utterance", "golden"], rows: [{ utterance: "배송지 바꿔줘", golden: "마이페이지 → 주문내역에서 배송 전 변경" }, { utterance: "주문 취소 가능해?", golden: "배송 시작 전 취소 안내" }], rowCount: 24, source: "인라인", createdAt: "2026-03-15 10:00", updatedAt: "2026-05-20 09:12" },
];
export const MEMBERS_ITEM = { id: "members", label: "조직 관리", icon: UserCog };
export const INIT_TENANTS = [
  { id: "t1", name: "온마켓", plan: "Enterprise", users: 12, status: "활성", admin: "김지훈 (jihoon.kim@onmarket.io)", created: "2026-01-12" },
  { id: "t2", name: "베리샵", plan: "Team", users: 5, status: "활성", admin: "박지영 (jiyoung.park@berryshop.io)", created: "2026-03-04" },
  { id: "t3", name: "데모 조직", plan: "Trial", users: 2, status: "정지", admin: "미지정", created: "2026-05-20" },
];
export const INIT_USERS = [
  { id: "u1", name: "김지훈", email: "jihoon.kim@onmarket.io", tenant: "t1", role: "Owner", status: "활성", last: "방금 전" },
  { id: "u2", name: "이민준", email: "minjun.lee@onmarket.io", tenant: "t1", role: "Member", status: "활성", last: "오늘 09:12" },
  { id: "u3", name: "최서연", email: "seoyeon.choi@onmarket.io", tenant: "t1", role: "Member", status: "활성", last: "어제 17:44" },
  { id: "u4", name: "박지영", email: "jiyoung.park@berryshop.io", tenant: "t2", role: "Owner", status: "활성", last: "2시간 전" },
  { id: "u5", name: "윤수빈", email: "subin.yoon@partner.com", tenant: "t1", role: "Viewer", status: "대기", last: "미로그인" },
  { id: "u6", name: "오현태", email: "hyuntae.oh@demo.com", tenant: "t3", role: "Member", status: "차단", last: "2026-05-12" },
  // Super Admin = 조직에 속하지 않는 운영사(PROBA) 계정 — tenant "platform" 로 구분
  { id: "op1", name: "한도윤", email: "admin@proba.co.kr", tenant: "platform", role: "Super Admin", status: "활성", last: "방금 전" },
  { id: "op2", name: "서지안", email: "ops@proba.co.kr", tenant: "platform", role: "Super Admin", status: "활성", last: "오늘 09:40" },
  { id: "op3", name: "노경원", email: "kw.noh@proba.co.kr", tenant: "platform", role: "Super Admin", status: "대기", last: "미로그인" },
];
export const INIT_MODELS = [
  { id: "m1", name: "Claude (sonnet-4-6)", provider: "Anthropic", model: "claude-sonnet-4-6", price: "$3 / 1M", status: "활성", created: "2026-01-10" },
  { id: "m2", name: "GPT-4o", provider: "OpenAI", model: "gpt-4o-2024-11", price: "$5 / 1M", status: "활성", created: "2026-01-10" },
  { id: "m3", name: "Gemini 2.0 Flash", provider: "Google", model: "gemini-2.0-flash", price: "$0.3 / 1M", status: "비활성", created: "2026-02-15" },
  { id: "m4", name: "사내 LLM (온프렘)", provider: "Internal", model: "onprem-v2", price: "사내", status: "활성", created: "2026-04-01" },
];
