import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import { cardBrand, DemoPaymentProvider, formatCardNumber, formatExpiry, validateCard, type CardInput } from '@/lib/payments';
import { money } from '@/lib/dates';
import { C } from '@/theme';
import { Button, Card, Field, Row, Txt } from './ui';

/** Card entry + charge. Swap DemoPaymentProvider for Stripe in production (docs/BACKEND.md). */
export function CardForm({
  amount,
  description,
  defaultName = '',
  onPaid,
  cta,
}: {
  amount: number;
  description: string;
  defaultName?: string;
  onPaid: (reference: string) => void;
  cta?: string;
}) {
  const [card, setCard] = useState<CardInput>({ name: defaultName, number: '', expiry: '', cvc: '', zip: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof CardInput, string>>>({});
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState('');
  const set = (k: keyof CardInput) => (v: string) => setCard((c) => ({ ...c, [k]: v }));

  const pay = async () => {
    const e = validateCard(card);
    setErrors(e);
    setDeclined('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await DemoPaymentProvider.charge(amount, card, description);
    setBusy(false);
    if (res.ok) onPaid(res.reference ?? 'Card');
    else setDeclined(res.error ?? 'Payment failed');
  };

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Row>
          <Ionicons name="lock-closed" size={16} color={C.green} />
          <Txt v="small" color={C.green}>Encrypted checkout</Txt>
          <View style={{ flex: 1 }} />
          <Txt v="small">{cardBrand(card.number)}</Txt>
        </Row>
        <Field label="Name on card" value={card.name} onChangeText={set('name')} error={errors.name} autoComplete="name" />
        <Field label="Card number" value={card.number} onChangeText={(t) => set('number')(formatCardNumber(t))} keyboardType="number-pad" placeholder="4242 4242 4242 4242" error={errors.number} autoComplete="cc-number" />
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field label="Expiry" value={card.expiry} onChangeText={(t) => set('expiry')(formatExpiry(t))} keyboardType="number-pad" placeholder="MM/YY" error={errors.expiry} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="CVC" value={card.cvc} onChangeText={(t) => set('cvc')(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="123" error={errors.cvc} secureTextEntry />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="ZIP" value={card.zip} onChangeText={(t) => set('zip')(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" placeholder="35816" error={errors.zip} />
          </View>
        </Row>
        {declined ? <Txt v="small" color={C.danger}>{declined}</Txt> : null}
      </Card>
      <Button title={cta ?? `Pay ${money(amount, true)}`} icon="lock-closed" loading={busy} onPress={pay} />
      <Txt v="small" style={{ textAlign: 'center' }}>Demo mode: use 4242 4242 4242 4242, any future date. 4000 0000 0000 0002 simulates a decline.</Txt>
    </View>
  );
}
