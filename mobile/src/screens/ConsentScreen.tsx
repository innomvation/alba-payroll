import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { CONSENT_POLICY_VERSION } from '../lib/config';

export default function ConsentScreen({
  workerId,
  onConsented,
}: {
  workerId: string;
  onConsented: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setLoading(true);
    setError(null);
    const { error: e } = await supabase.from('worker_consents').insert({
      worker_id: workerId,
      policy_version: CONSENT_POLICY_VERSION,
    });
    setLoading(false);
    if (e) setError(e.message);
    else onConsented();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>위치추적 동의</Text>
      <ScrollView style={styles.terms}>
        <Text style={styles.body}>
          출퇴근 자동 기록을 위해 아래 범위에서 위치정보를 수집·이용합니다.{'\n\n'}
          • 수집 목적: 근무지 출입(출근/퇴근) 자동 기록 및 근무시간 산정{'\n'}
          • 수집 범위: 등록된 근무지 반경 진입/이탈 시점에 한함 (상시 추적 안 함){'\n'}
          • 수집 항목: 출입 시각, 출입 시점의 위치 좌표(최소 수집){'\n'}
          • 보유·이용: 급여 정산 목적에 한해 보관, 동의 철회 시 중단{'\n\n'}
          본인은 위 내용을 확인했으며 위치정보 수집·이용에 동의합니다.{'\n'}
          (동의는 언제든 철회할 수 있으며, 철회 시 자동 기록이 중단됩니다.)
        </Text>
      </ScrollView>
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={agree}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? '처리 중...' : '동의하고 시작'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginTop: 40 },
  terms: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 14, maxHeight: 360 },
  body: { fontSize: 14, lineHeight: 22, color: '#333' },
  error: { color: '#b00020', fontSize: 13 },
  button: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
