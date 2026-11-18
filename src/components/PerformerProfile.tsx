import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, Field, Pill, Row, Txt } from '@/components/ui';
import {
  PERFORMER_CREDIT_LENGTH,
  PERFORMER_CREDIT_LIMIT,
  PERFORMER_HEADSHOT_LIMIT,
  PERFORMER_SKILL_LENGTH,
  PERFORMER_SKILL_LIMIT,
  performerProfileError,
} from '@/lib/auditions';
import { uid } from '@/lib/ids';
import type { PerformerCredit, PerformerProfile } from '@/lib/types';
import { C, R, SP } from '@/theme';

type DraftCredit = PerformerCredit & { id: string };

const PHOTO_ERROR = 'Couldn’t prepare this photo. Try choosing a JPEG or PNG.';

async function prepareHeadshot(asset: ImagePicker.ImagePickerAsset) {
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: 480, maxHeight: 480 });
  try {
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
      if (Platform.OS === 'web' && result.uri.startsWith('blob:')) URL.revokeObjectURL(result.uri);
      const headshot = result.base64 && `data:image/jpeg;base64,${result.base64}`;
      if (!headshot || headshot.length > PERFORMER_HEADSHOT_LIMIT) throw new Error(PHOTO_ERROR);
      return headshot;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

function Headshot({ source }: { source: string }) {
  return (
    <View style={{ width: '100%', maxWidth: 280, aspectRatio: 4 / 5, alignSelf: 'center', borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surface2 }}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={{ flex: 1 }}
          contentFit="contain"
          cachePolicy="none"
          accessible
          accessibilityLabel="Performer headshot"
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP.sm }}>
          <Ionicons name="person-circle-outline" size={58} color={C.faint} />
          <Txt v="small">No headshot yet</Txt>
        </View>
      )}
    </View>
  );
}

export function PerformerProfileView({ profile }: { profile: PerformerProfile }) {
  return (
    <View style={{ gap: SP.md }}>
      <Headshot source={profile.headshot} />
      <Txt v="label">Skills</Txt>
      {profile.skills.length ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {profile.skills.map((skill, index) => <Pill key={`${index}:${skill}`} label={skill} />)}
        </Row>
      ) : <Txt v="small">No skills listed.</Txt>}
      <Txt v="label">Past productions and roles</Txt>
      {profile.credits.length ? profile.credits.map((credit, index) => (
        <View key={`${index}:${credit.production}`}>
          <Txt v="h3">{credit.production}</Txt>
          <Txt v="small">{[credit.role, credit.year].filter(Boolean).join(' · ')}</Txt>
        </View>
      )) : <Txt v="small">No previous roles listed.</Txt>}
    </View>
  );
}

export function PerformerProfileEditor({ profile, name, onSave }: {
  profile: PerformerProfile | null;
  name: string;
  onSave: (profile: PerformerProfile) => Promise<void>;
}) {
  const [headshot, setHeadshot] = useState(profile?.headshot ?? '');
  const [skills, setSkills] = useState(profile?.skills.join(', ') ?? '');
  const [credits, setCredits] = useState<DraftCredit[]>(() => (
    profile?.credits.map((credit, index) => ({ ...credit, id: String(index) })) ?? []
  ));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const selection = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    const before = selection.current;
    const current = () => active && selection.current === before;
    void ImagePicker.getPendingResultAsync().then(async (result) => {
      if (!result || !current()) return;
      if ('code' in result) throw new Error(PHOTO_ERROR);
      const asset = result.assets?.[0];
      if (!asset) return;
      setPhotoBusy(true);
      const photo = await prepareHeadshot(asset);
      if (current()) {
        setHeadshot(photo);
        setSaved(false);
      }
    }).catch(() => {
      if (current()) setPhotoError(PHOTO_ERROR);
    }).finally(() => {
      if (current()) setPhotoBusy(false);
    });
    return () => { active = false; };
  }, []);

  async function chooseHeadshot() {
    const request = ++selection.current;
    setPhotoError('');
    // A few browsers leave the promise pending when the file dialog is canceled.
    if (Platform.OS !== 'web') setPhotoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = result.assets?.[0];
      if (!asset || request !== selection.current) return;
      setPhotoBusy(true);
      const photo = await prepareHeadshot(asset);
      if (request === selection.current) {
        setHeadshot(photo);
        setError('');
        setSaved(false);
      }
    } catch {
      if (request === selection.current) setPhotoError(PHOTO_ERROR);
    } finally {
      if (request === selection.current) setPhotoBusy(false);
    }
  }

  function editCredit(id: string, values: Partial<PerformerCredit>) {
    setCredits((current) => current.map((credit) => credit.id === id ? { ...credit, ...values } : credit));
    setSaved(false);
  }

  async function save() {
    const skillList = new Map<string, string>();
    for (const entry of skills.split(/[,\n]/)) {
      const skill = entry.trim();
      if (skill && !skillList.has(skill.toLowerCase())) skillList.set(skill.toLowerCase(), skill);
    }
    const next: PerformerProfile = {
      headshot,
      skills: Array.from(skillList.values()),
      credits: credits.map(({ production, role, year }) => ({
        production: production.trim(),
        role: role.trim(),
        ...(year?.trim() ? { year: year.trim() } : {}),
      })),
    };
    const validationError = performerProfileError(next);
    setError(validationError ?? '');
    setSaved(false);
    if (validationError) return;
    setSaving(true);
    try {
      await onSave(next);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Couldn’t save the profile. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card accent={C.purple}>
        <Txt v="h2">{name}</Txt>
        <Txt v="muted">Add a headshot before applying to audition. The theatre owner, production directors, and authorized audition staff can see your profile when you apply.</Txt>
        <Headshot source={headshot} />
        <Button
          title={headshot ? 'Replace headshot' : 'Choose headshot'}
          icon="image-outline"
          variant="secondary"
          disabled={saving}
          loading={photoBusy}
          onPress={() => void chooseHeadshot()}
        />
        {photoError ? <Txt v="small" color={C.danger}>{photoError}</Txt> : null}
      </Card>
      <Card>
        <Field
          label="Skills (optional)"
          accessibilityLabel="Skills"
          hint={`Separate skills with commas or new lines. Add up to ${PERFORMER_SKILL_LIMIT}.`}
          placeholder="Singing, tap dance, stage combat"
          value={skills}
          maxLength={(PERFORMER_SKILL_LENGTH + 2) * PERFORMER_SKILL_LIMIT}
          multiline
          editable={!saving}
          onChangeText={(value) => { setSkills(value); setSaved(false); }}
        />
      </Card>
      <Card>
        <Txt v="h2">Past productions and roles</Txt>
        {!credits.length ? <Txt v="muted">First audition? Leave this section empty.</Txt> : null}
        {credits.map((credit, index) => (
          <View key={credit.id} style={{ gap: SP.sm, borderTopWidth: 1, borderTopColor: C.border, paddingTop: SP.md }}>
            <Field label="Production" accessibilityLabel={`Production for credit ${index + 1}`} value={credit.production} maxLength={PERFORMER_CREDIT_LENGTH} editable={!saving} onChangeText={(production) => editCredit(credit.id, { production })} />
            <Field label="Part played" accessibilityLabel={`Part played for credit ${index + 1}`} value={credit.role} maxLength={PERFORMER_CREDIT_LENGTH} editable={!saving} onChangeText={(role) => editCredit(credit.id, { role })} />
            <Field label="Year (optional)" accessibilityLabel={`Year for credit ${index + 1}`} value={credit.year ?? ''} maxLength={4} keyboardType="number-pad" editable={!saving} onChangeText={(year) => editCredit(credit.id, { year })} />
            <Button
              title="Remove credit"
              variant="ghost"
              icon="trash-outline"
              small
              disabled={saving}
              onPress={() => {
                setCredits((current) => current.filter((item) => item.id !== credit.id));
                setSaved(false);
              }}
            />
          </View>
        ))}
        {credits.length >= PERFORMER_CREDIT_LIMIT ? <Txt v="small">{`Profile has the maximum of ${PERFORMER_CREDIT_LIMIT} credits.`}</Txt> : null}
        <Button
          title="Add production credit"
          icon="add"
          variant="secondary"
          disabled={saving || credits.length >= PERFORMER_CREDIT_LIMIT}
          onPress={() => {
            setCredits((current) => [...current, { id: uid('credit_'), production: '', role: '' }]);
            setSaved(false);
          }}
        />
      </Card>
      {error ? <Txt color={C.danger}>{error}</Txt> : null}
      {saved ? <Txt color={C.green}>Profile saved.</Txt> : null}
      <Button title="Save performer profile" icon="checkmark" disabled={!headshot || photoBusy} loading={saving} onPress={() => void save()} />
    </>
  );
}
