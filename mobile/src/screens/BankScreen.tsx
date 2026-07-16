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

// 알바생 본인이 급여 받을 계좌를 직접 등록하는 화면.
// 저장은 save-bank Edge Function 으로(계좌 컬럼만 갱신, 이름·시급은 사장 설정 유지).
export default function BankScreen({
  workerName,
  onSaved,
}: {
  workerName: string;
  onSaved: () => void;
}) {
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState(workerName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = bankName.trim() && accountNumber.trim() && accountHolder.trim();

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('save-bank', {
        body: {
          bank_name: bankName.trim(),
          account_number: accountNumber.trim(),
          account_holder: accountHolder.trim(),
        },
      });
      if (fnErr || data?.error) throw new Error(data?.error ?? '계좌 저장에 실패했습니다.');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>급여 받을 계좌 등록</Text>
      <Text style={styles.sub}>여기 입력한 계좌로 사장님이 급여를 송금합니다.</Text>

      <Text style={styles.label}>은행</Text>
      <TextInput
        value={bankName}
        onChangeText={setBankName}
        placeholder="예) 카카오뱅크"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.label}>계좌번호</Text>
      <TextInput
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder="'-' 없이 숫자만 권장"
        keyboardType="number-pad"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.label}>예금주</Text>
      <TextInput
        value={accountHolder}
        onChangeText={setAccountHolder}
        placeholder="예금주 이름"
        autoCorrect={false}
        style={styles.input}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, (loading || !canSave) && styles.buttonDisabled]}
        onPress={save}
        disabled={loading || !canSave}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>저장하고 시작하기</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.notice}>계좌번호는 정확히 입력해 주세요. 잘못 입력하면 급여가 다른 곳으로 갈 수 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 8, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 14, color: '#666', marginBottom: 12 },
  label: { fontSize: 13, color: '#888', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, fontSize: 16 },
  error: { color: '#b00020', fontSize: 13, marginTop: 4 },
  button: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  notice: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
