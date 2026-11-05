import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminPage, Grid } from '@/components/admin';
import { alert } from '@/components/alert';
import { Avatar, Button, Card, Chips, Field, Pill, Row, SectionHeader, Segmented, Txt } from '@/components/ui';
import type { Role, User } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner / staff', renter: 'Renter', member: 'Cast & crew' };
const ROLE_HELP: Record<Role, string> = {
  owner: 'Full access, including this admin portal.',
  renter: 'Can request dates, pay deposits and see their own bookings.',
  member: 'Sees productions they’re cast in: schedule, RSVPs and chat.',
};

export default function AdminPeople() {
  const users = useStore((s) => s.users);
  const productions = useStore((s) => s.productions);
  const addUser = useStore((s) => s.addUser);
  const markSetup = useStore((s) => s.markSetup);
  const [filter, setFilter] = useState<Role>('owner');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '', role: 'member' as Role });

  const list = users.filter((u) => u.role === filter).sort((a, b) => a.name.localeCompare(b.name));
  const counts = Object.fromEntries((['owner', 'renter', 'member'] as Role[]).map((r) => [r, users.filter((u) => u.role === r).length])) as Record<Role, number>;

  const save = () => {
    if (!draft.name.trim() || !/^\S+@\S+\.\S+$/.test(draft.email)) return alert('Name and a valid email are required');
    if (users.some((u) => u.email.toLowerCase() === draft.email.trim().toLowerCase())) return alert('Someone already uses that email');
    addUser({ name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() || undefined, role: draft.role });
    markSetup('people');
    setFilter(draft.role);
    setDraft({ name: '', email: '', phone: '', role: 'member' });
    setAdding(false);
  };

  return (
    <AdminPage title="People & access" subtitle="Who can use the app and what they can see." actions={<Button small icon="person-add" title="Add person" onPress={() => setAdding(!adding)} />}>
      {adding && (
        <Card>
          <Grid>
            <Field label="Name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} />
            <Field label="Email" value={draft.email} onChangeText={(v) => setDraft({ ...draft, email: v })} keyboardType="email-address" autoCapitalize="none" />
            <Field label="Phone (optional)" value={draft.phone} onChangeText={(v) => setDraft({ ...draft, phone: v })} keyboardType="phone-pad" />
          </Grid>
          <Txt v="label">Access</Txt>
          <Chips options={['owner', 'renter', 'member'] as const} value={draft.role} onChange={(r) => setDraft({ ...draft, role: r })} labels={ROLE_LABEL} />
          <Txt v="small">{ROLE_HELP[draft.role]} Add cast to a production from its Company tab.</Txt>
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button small variant="secondary" title="Cancel" onPress={() => setAdding(false)} />
            <Button small title="Add person" onPress={save} />
          </Row>
        </Card>
      )}
      <Segmented options={['owner', 'renter', 'member'] as const} value={filter} onChange={setFilter} labels={{ owner: `Owners (${counts.owner})`, renter: `Renters (${counts.renter})`, member: `Cast & crew (${counts.member})` }} />
      <Txt v="small">{ROLE_HELP[filter]}</Txt>
      <Card style={{ paddingVertical: 6 }}>
        {list.map((u) => (
          <PersonRow key={u.id} u={u} shows={productions.filter((p) => p.members.some((m) => m.userId === u.id)).map((p) => p.title)} ownerCount={counts.owner} />
        ))}
        {list.length === 0 && <Txt v="muted">No one here yet.</Txt>}
      </Card>
      <SectionHeader title="About sign-in" />
      <Txt v="small">
        In this demo build everyone shares one device’s data and you switch personas in Settings. When the backend is connected (docs/BACKEND.md), each person here gets an email invite and their own login with exactly these permissions.
      </Txt>
    </AdminPage>
  );
}

function PersonRow({ u, shows, ownerCount }: { u: User; shows: string[]; ownerCount: number }) {
  const me = useCurrentUser();
  const updateUser = useStore((s) => s.updateUser);
  const removeUser = useStore((s) => s.removeUser);
  const bookings = useStore((s) => s.bookings);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(u);
  const lastOwner = u.role === 'owner' && ownerCount <= 1;
  const hasBookings = bookings.some((b) => b.renterId === u.id);

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
        <Avatar name={u.name} color={u.color} />
        <View style={{ flex: 1 }}>
          <Txt v="h3">{u.name + (u.id === me.id ? ' (you)' : '')}</Txt>
          <Txt v="small">{[u.email, u.phone].filter(Boolean).join(' · ')}</Txt>
        </View>
        {shows.slice(0, 2).map((s) => (
          <Pill key={s} label={s} />
        ))}
      </Pressable>
      {open && (
        <View style={{ gap: 10, paddingBottom: 12 }}>
          <Grid>
            <Field label="Name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} />
            <Field label="Email" value={draft.email} onChangeText={(v) => setDraft({ ...draft, email: v })} autoCapitalize="none" />
            <Field label="Phone" value={draft.phone ?? ''} onChangeText={(v) => setDraft({ ...draft, phone: v })} />
          </Grid>
          <Chips options={['owner', 'renter', 'member'] as const} value={draft.role} onChange={(r) => (lastOwner && r !== 'owner' ? alert('Keep at least one owner') : setDraft({ ...draft, role: r }))} labels={ROLE_LABEL} />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button
              small
              variant="danger"
              title="Remove"
              disabled={lastOwner || u.id === me.id}
              onPress={() =>
                alert(`Remove ${u.name}?`, hasBookings ? 'Their bookings stay on the calendar.' : 'They will lose access.', [
                  { text: 'Keep', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeUser(u.id) },
                ])
              }
            />
            <Button small title="Save" disabled={JSON.stringify(draft) === JSON.stringify(u)} onPress={() => { updateUser(u.id, draft); setOpen(false); }} />
          </Row>
        </View>
      )}
    </View>
  );
}
