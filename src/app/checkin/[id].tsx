import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, Empty, Field, ListItem, ProgressBar, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { fmtDate, fmtTime } from '@/lib/dates';
import { normalizeCode } from '@/lib/ids';
import { seatLabel } from '@/lib/seating';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

type Result = { ok: boolean; message: string; seat?: string; name?: string };

export default function CheckIn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const perf = useStore((s) => s.performances.find((p) => p.id === id));
  const tickets = useStore((s) => s.tickets);
  const orders = useStore((s) => s.orders);
  const checkIn = useStore((s) => s.checkIn);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  if (!perf) return <Empty icon="alert-circle-outline" title="Performance not found" />;
  const live = tickets.filter((t) => t.performanceId === perf.id && !t.void);
  const inside = live.filter((t) => t.checkedInAt);

  const submit = (raw: string) => {
    const c = normalizeCode(raw);
    const r = checkIn(c, perf.id);
    const order = orders.find((o) => o.id === r.ticket?.orderId);
    setResult({ ok: r.ok, message: r.message, seat: r.ticket ? seatLabel(r.ticket.seatId) : undefined, name: order?.buyerName });
    if (Platform.OS !== 'web') Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setCode('');
  };

  const onScan = ({ data }: { data: string }) => {
    const now = Date.now();
    if (data === lastScan.current.code && now - lastScan.current.at < 3000) return; // debounce repeated frames
    lastScan.current = { code: data, at: now };
    submit(data);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Door Check-in' }} />
      <Card>
        <Txt v="h2">{perf.title}</Txt>
        <Txt v="muted">{`${fmtDate(perf.start, { weekday: true })} · ${fmtTime(perf.start)}`}</Txt>
        <ProgressBar value={live.length ? inside.length / live.length : 0} color={C.green} />
        <Txt v="small">{`${inside.length} of ${live.length} ticket holders inside`}</Txt>
      </Card>

      {result && (
        <Card accent={result.ok ? C.green : C.danger} style={{ backgroundColor: result.ok ? C.greenSoft : C.dangerSoft }}>
          <Row>
            <Ionicons name={result.ok ? 'checkmark-circle' : 'close-circle'} size={36} color={result.ok ? C.green : C.danger} />
            <View style={{ flex: 1 }}>
              <Txt v="h2" color={result.ok ? C.green : C.danger}>{result.message}</Txt>
              {result.seat && <Txt>{result.seat}</Txt>}
              {result.name && <Txt v="small">{result.name}</Txt>}
            </View>
          </Row>
        </Card>
      )}

      {scanning && permission?.granted ? (
        <View style={{ height: 300, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: C.gold }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
        </View>
      ) : null}
      <Button
        icon={scanning ? 'stop' : 'scan'}
        title={scanning ? 'Stop scanning' : 'Scan tickets with camera'}
        onPress={async () => {
          if (scanning) return setScanning(false);
          const p = permission?.granted ? permission : await requestPermission();
          if (p.granted) setScanning(true);
        }}
      />
      {permission && !permission.granted && !permission.canAskAgain && <Txt v="small" color={C.warn}>Camera access is off. Enable it in Settings, or type codes below.</Txt>}

      <Field label="Or enter code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="DT-XXXX-XXXX" onSubmitEditing={() => code && submit(code)} returnKeyType="go" />
      <Button variant="secondary" title="Check in" disabled={!code} onPress={() => submit(code)} />

      <SectionHeader title="Recently admitted" />
      {inside.length === 0 && <Txt v="muted">No one checked in yet.</Txt>}
      {inside
        .slice()
        .sort((a, b) => (b.checkedInAt ?? '').localeCompare(a.checkedInAt ?? ''))
        .slice(0, 12)
        .map((t) => (
          <ListItem key={t.id} icon="checkmark-done" iconColor={C.green} title={seatLabel(t.seatId)} subtitle={`${orders.find((o) => o.id === t.orderId)?.buyerName ?? ''} · ${fmtTime(t.checkedInAt!)}`} />
        ))}
    </Screen>
  );
}
