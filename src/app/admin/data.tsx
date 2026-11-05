import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share } from 'react-native';

import { AdminPage } from '@/components/admin';
import { alert } from '@/components/alert';
import { Button, Card, Field, Row, Txt } from '@/components/ui';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function AdminData() {
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const resetDemo = useStore((s) => s.resetDemo);
  const adminPin = useStore((s) => s.adminPin);
  const setAdminPin = useStore((s) => s.setAdminPin);
  const markSetup = useStore((s) => s.markSetup);
  const [paste, setPaste] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');

  const doExport = async () => {
    const json = exportData();
    const name = `dream-theatre-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      await Share.share({ title: name, message: json });
    }
  };

  const doImport = (json: string) => {
    alert('Replace all data with this backup?', 'Everything on this device is replaced by the file’s contents.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace',
        style: 'destructive',
        onPress: () => {
          try {
            importData(json);
            setPaste('');
            alert('Backup restored');
          } catch (e) {
            alert('Import failed', (e as Error).message);
          }
        },
      },
    ]);
  };

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) doImport(await f.text());
    };
    input.click();
  };

  return (
    <AdminPage title="Data & security" subtitle="Back up your setup, move it between the website and the app, or start over.">
      <Card>
        <Txt v="h3">Back up / move your setup</Txt>
        <Txt v="small">
          Until the shared backend is connected, the website and each phone keep their own copy of the data. Export here and import on another device to copy your rates, seating, shows, bookings and people over.
        </Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button small icon="download" title={Platform.OS === 'web' ? 'Download backup (.json)' : 'Share backup'} onPress={doExport} />
          {Platform.OS === 'web' && <Button small variant="secondary" icon="cloud-upload" title="Restore from file" onPress={pickFile} />}
        </Row>
        <Field label="Or paste a backup" value={paste} onChangeText={setPaste} multiline placeholder='{"app":"dream-theatre", …}' />
        <Button small variant="secondary" title="Restore pasted backup" disabled={!paste.trim()} onPress={() => doImport(paste)} />
      </Card>

      <Card>
        <Txt v="h3">Admin PIN</Txt>
        <Txt v="small">{adminPin === '2020' ? 'You are still using the demo PIN (2020). Change it before sharing the app.' : 'Required to open the admin portal from a non-owner account.'}</Txt>
        <Row style={{ alignItems: 'flex-start' }}>
          <Field label="New PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={8} style={{ minWidth: 140 }} />
          <Field label="Confirm" value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={8} style={{ minWidth: 140 }} />
        </Row>
        <Button
          small
          title="Update PIN"
          disabled={pin.length < 4 || pin !== pin2}
          onPress={() => {
            setAdminPin(pin);
            markSetup('pin');
            setPin('');
            setPin2('');
            alert('PIN updated');
          }}
        />
        {pin.length > 0 && pin.length < 4 && <Txt v="small" color={C.warn}>At least 4 digits.</Txt>}
      </Card>

      <Card>
        <Txt v="h3">Reset demo</Txt>
        <Txt v="small">Restores the sample bookings, Elf: The Musical company and ticket sales. Your changes on this device are erased.</Txt>
        <Button
          small
          variant="danger"
          title="Reset to demo data"
          onPress={() =>
            alert('Reset everything?', 'This erases all changes on this device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => { resetDemo(); router.navigate('/admin'); } },
            ])
          }
        />
      </Card>
    </AdminPage>
  );
}
