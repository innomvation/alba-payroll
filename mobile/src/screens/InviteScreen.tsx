import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function InviteScreen({ onLinked }: { onLinked: () => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    setLoading(true);
    setError(null);
    try {
      // 1) 익명 로그인으로 세션(uid) 확보
      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) throw anonErr;

      // 2) 초대코드 검증 + 워커 연결 (Edge Function)
      const { data, error: fnErr } = await supabase.functions.invoke('redeem-invite', {
        body: { code: code.trim() },
      });
      if (fnErr || data?.error) throw new Error(data?.error ?? '코드 확인에 실패했습니다.');

      onLinked();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>가포 알바</Text>
      <Text style={styles.sub}>사장님께 받은 초대코드를 입력하세요.</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="초대코드"
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.input}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[styles.button, (loading || !code) && styles.buttonDisabled]}
        onPress={redeem}
        disabled={loading || !code}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>시작하기</Text>}
      </TouchableOpacity>
      <Text style={styles.notice}>
        이 앱은 정확한 출퇴근 시간을 위해 고려가든 알바생이 만든 앱입니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 14, color: '#666', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, fontSize: 16 },
  error: { color: '#b00020', fontSize: 13 },
  button: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  notice: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
