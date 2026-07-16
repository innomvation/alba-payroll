import { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from './src/lib/supabase';
import InviteScreen from './src/screens/InviteScreen';
import ConsentScreen from './src/screens/ConsentScreen';
import BankScreen from './src/screens/BankScreen';
import HomeScreen from './src/screens/HomeScreen';

type Worker = { id: string; name: string; workplace_id: string; account_number: string | null };
type Stage = 'loading' | 'invite' | 'consent' | 'bank' | 'home';

export default function App() {
  const [stage, setStage] = useState<Stage>('loading');
  const [worker, setWorker] = useState<Worker | null>(null);

  const bootstrap = useCallback(async () => {
    setStage('loading');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return setStage('invite');

    // 이 사용자에 연결된 워커 찾기
    const { data: w } = await supabase
      .from('workers')
      .select('id, name, workplace_id, account_number')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (!w) return setStage('invite');
    setWorker(w as Worker);

    // 유효한 위치추적 동의가 있는지
    const { data: consent } = await supabase
      .from('worker_consents')
      .select('id')
      .eq('worker_id', w.id)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle();
    if (!consent) return setStage('consent');

    // 계좌 미등록이면 본인이 직접 등록
    if (!w.account_number) return setStage('bank');

    setStage('home');
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (stage === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (stage === 'invite') return <InviteScreen onLinked={bootstrap} />;
  if (stage === 'consent' && worker) {
    return <ConsentScreen workerId={worker.id} onConsented={bootstrap} />;
  }
  if (stage === 'bank' && worker) {
    return <BankScreen workerName={worker.name} onSaved={bootstrap} />;
  }
  if (stage === 'home' && worker) return <HomeScreen worker={worker} onLogout={bootstrap} />;
  return null;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});
