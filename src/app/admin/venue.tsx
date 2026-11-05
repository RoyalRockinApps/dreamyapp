import { useState } from 'react';

import { AdminPage, Grid, SaveBar } from '@/components/admin';
import { Card, Field, Txt } from '@/components/ui';
import { useStore } from '@/store/useStore';

export default function AdminVenue() {
  const venue = useStore((s) => s.venue);
  const updateVenue = useStore((s) => s.updateVenue);
  const updateUser = useStore((s) => s.updateUser);
  const users = useStore((s) => s.users);
  const markSetup = useStore((s) => s.markSetup);
  const [draft, setDraft] = useState(venue);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(venue);
  const set = (k: keyof typeof draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    updateVenue(draft);
    // keep the owner account in sync with the venue's owner name & contact
    const owner = users.find((u) => u.role === 'owner');
    if (owner) updateUser(owner.id, { name: draft.ownerName, email: draft.email, phone: draft.phone });
    markSetup('venue');
    setSaved(true);
  };

  return (
    <AdminPage title="Venue profile" subtitle="Shown to renters, on tickets, receipts and payment requests.">
      <Card>
        <Grid>
          <Field label="Venue name" value={draft.name} onChangeText={set('name')} />
          <Field label="Owner name" value={draft.ownerName} onChangeText={set('ownerName')} />
        </Grid>
        <Grid>
          <Field label="Phone" value={draft.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Field label="Email" value={draft.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        </Grid>
        <Field label="Address" value={draft.address} onChangeText={set('address')} />
        <Field label="Tagline" value={draft.tagline} onChangeText={set('tagline')} />
        <Txt v="small">Tip: the tagline appears on everyone’s home screen.</Txt>
        <SaveBar dirty={dirty} saved={saved} onSave={save} onReset={() => setDraft(venue)} />
      </Card>
    </AdminPage>
  );
}
