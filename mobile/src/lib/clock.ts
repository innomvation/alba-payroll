import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'pending_clock_events';

export type ClockInsert = {
  worker_id: string;
  type: 'in' | 'out';
  source: 'geo' | 'wifi';
  ts: string;
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
};

// 출퇴근 이벤트 전송. 실패(오프라인 등)하면 로컬 큐에 보관.
export async function submitClockEvent(ev: ClockInsert) {
  const { error } = await supabase.from('clock_events').insert(ev);
  if (error) await enqueue(ev);
}

async function enqueue(ev: ClockInsert) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const list: ClockInsert[] = raw ? JSON.parse(raw) : [];
  list.push(ev);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list));
}

// 앱 켜질 때 호출 — 밀린 이벤트 재전송.
export async function flushQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return;
  const list: ClockInsert[] = JSON.parse(raw);
  const remaining: ClockInsert[] = [];
  for (const ev of list) {
    const { error } = await supabase.from('clock_events').insert(ev);
    if (error) remaining.push(ev);
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}
