import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import { AdminPage, Grid, MoneyField, SaveBar } from '@/components/admin';
import { alert } from '@/components/alert';
import { Button, Card, Chips, Field, Row, SectionHeader, Txt } from '@/components/ui';
import { uid } from '@/lib/ids';
import type { AddOn, RentalPackage } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function AdminPackages() {
  const settings = useStore((s) => s.settings);
  const bookings = useStore((s) => s.bookings);
  const updateSettings = useStore((s) => s.updateSettings);
  const markSetup = useStore((s) => s.markSetup);
  const [packages, setPackages] = useState<RentalPackage[]>(settings.packages);
  const [addOns, setAddOns] = useState<AddOn[]>(settings.addOns);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(packages) !== JSON.stringify(settings.packages) || JSON.stringify(addOns) !== JSON.stringify(settings.addOns);

  const patchPkg = (id: string, p: Partial<RentalPackage>) => setPackages((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const patchAdd = (id: string, p: Partial<AddOn>) => setAddOns((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const inUse = (field: 'packageId' | 'addOnIds', id: string) =>
    bookings.some((b) => ['inquiry', 'awaiting_deposit', 'confirmed'].includes(b.status) && (field === 'packageId' ? b.packageId === id : b.addOnIds.includes(id)));

  const remove = (kind: 'pkg' | 'add', id: string, name: string) => {
    const used = kind === 'pkg' ? inUse('packageId', id) : inUse('addOnIds', id);
    alert(`Remove "${name}"?`, used ? 'Existing bookings keep their quoted price; new renters won’t see this option.' : 'Renters will no longer see this option.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => (kind === 'pkg' ? setPackages((l) => l.filter((x) => x.id !== id)) : setAddOns((l) => l.filter((x) => x.id !== id))) },
    ]);
  };

  const save = () => {
    const bad = [...packages, ...addOns].find((x) => !x.name.trim());
    if (bad) return alert('Every item needs a name');
    updateSettings({ packages, addOns });
    markSetup('packages');
    setSaved(true);
  };

  return (
    <AdminPage title="Packages & add-ons" subtitle="Packages bundle hours at a set price; extra time bills at your hourly rate.">
      <SectionHeader title="Packages" action="+ Add package" onAction={() => setPackages((l) => [...l, { id: uid('pkg_'), name: 'New package', hours: 4, price: 500, description: '' }])} />
      {packages.map((p) => (
        <Card key={p.id}>
          <Row>
            <Txt v="h3" style={{ flex: 1 }}>{p.name || 'Untitled'}</Txt>
            <Ionicons name="trash-outline" size={20} color={C.danger} onPress={() => remove('pkg', p.id, p.name)} />
          </Row>
          <Grid min={160}>
            <Field label="Name" value={p.name} onChangeText={(v) => patchPkg(p.id, { name: v })} />
            <MoneyField label="Hours included" value={p.hours} onChange={(n) => patchPkg(p.id, { hours: n })} />
            <MoneyField label="Price" prefix="$" value={p.price} onChange={(n) => patchPkg(p.id, { price: n })} />
          </Grid>
          <Field label="Description" value={p.description} onChangeText={(v) => patchPkg(p.id, { description: v })} />
        </Card>
      ))}

      <SectionHeader title="Add-ons" action="+ Add add-on" onAction={() => setAddOns((l) => [...l, { id: uid('add_'), name: 'New add-on', price: 50, per: 'flat', description: '' }])} />
      {addOns.map((a) => (
        <Card key={a.id}>
          <Row>
            <Txt v="h3" style={{ flex: 1 }}>{a.name || 'Untitled'}</Txt>
            {a.id === 'add_tickets' && <Txt v="small" color={C.curtain}>Turns on assigned-seat ticketing</Txt>}
            <Ionicons name="trash-outline" size={20} color={C.danger} onPress={() => remove('add', a.id, a.name)} />
          </Row>
          <Grid min={160}>
            <Field label="Name" value={a.name} onChangeText={(v) => patchAdd(a.id, { name: v })} />
            <MoneyField label="Price" prefix="$" value={a.price} onChange={(n) => patchAdd(a.id, { price: n })} />
            <View style={{ gap: 6 }}>
              <Txt v="label">Billed</Txt>
              <Chips options={['flat', 'hour'] as const} value={a.per} onChange={(v) => patchAdd(a.id, { per: v })} labels={{ flat: 'Flat fee', hour: 'Per hour' }} />
            </View>
          </Grid>
          <Field label="Description" value={a.description} onChangeText={(v) => patchAdd(a.id, { description: v })} />
        </Card>
      ))}
      <Card>
        <SaveBar dirty={dirty} saved={saved} onSave={save} onReset={() => { setPackages(settings.packages); setAddOns(settings.addOns); }} />
      </Card>
      <Button variant="ghost" title="Preview what renters see" icon="eye" onPress={() => alert('Tip', 'Switch to the Renter persona in Settings, then open Book → Check dates & get a quote.')} />
    </AdminPage>
  );
}
