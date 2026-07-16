-- =====================================================================
-- 알바생 계좌 정보 (급여 송금용) — 운영자만 RLS로 접근 가능
-- =====================================================================
alter table workers
  add column bank_name      text,   -- 은행
  add column account_number text,   -- 계좌번호
  add column account_holder text;   -- 예금주
