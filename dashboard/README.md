# 알바 시급 정산 대시보드 (Next.js)

`weekly_settlement` 뷰를 표로 보여주고, 시급이 안 맞는(미지급) 주차를 빨갛게 강조하는 관리자 대시보드.

## 실행

```bash
cd dashboard
npm install
cp .env.local.example .env.local   # Supabase URL/anon key 입력
npm run dev                         # http://localhost:3000
```

## 동작

- `/login` : 사장(관리자) 이메일/비밀번호 로그인 (Supabase Auth)
- `/dashboard` : 주간 정산 표
  - RLS 덕분에 **로그인한 사장은 자기 사업장 데이터만** 조회됨
  - `underpaid`(시급 안 맞음)는 빨간 뱃지 + 상단 경고로 강조

## 선행 조건

- Supabase 프로젝트에 `0001_initial_schema.sql`, `0002_settlement.sql` 적용 완료
- 관리자 계정이 Supabase Auth에 존재하고, 그 계정의 `auth.uid()`가
  `workplaces.owner_id`로 들어간 사업장이 있어야 데이터가 보임
