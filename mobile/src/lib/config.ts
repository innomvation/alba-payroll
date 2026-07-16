export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

// 위치추적 동의 약관 버전 (약관 내용 바뀌면 버전 올림 → 재동의 유도)
export const CONSENT_POLICY_VERSION = '2026-06-위치추적-v1';
