import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { formatProductionDay, ProductionDatePicker } from '@/components/ProductionDates';
import { Button, Card, Chips, Empty, Field, Pill, ProgressBar, Row, Screen, Txt } from '@/components/ui';
import { useConceptWorkspace } from '@/hooks/useConceptWorkspace';
import { FEASIBILITY_LABELS, FEASIBILITY_STATUS_LABELS, unresolvedFeasibility } from '@/lib/concept';
import { canManageProduction, canPlanProduction } from '@/lib/production';
import { FEASIBILITY_ITEMS, type AuditionDraft, type FeasibilityCheck, type FeasibilityItem, type FeasibilityStatus, type Production, type ProductionBrief, type User } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

type TextField<Key> = { key: Key; label: string; limit: number; multiline?: boolean };

const BRIEF_FIELDS: TextField<keyof ProductionBrief>[] = [
  { key: 'premise', label: 'Premise', limit: 1200, multiline: true },
  { key: 'audience', label: 'Intended audience', limit: 200 },
  { key: 'performanceWindow', label: 'Target performance window', limit: 200 },
  { key: 'castSize', label: 'Expected cast size', limit: 120 },
  { key: 'roughBudget', label: 'Rough budget', limit: 120 },
];

const DRAFT_FIELDS: TextField<keyof AuditionDraft>[] = [
  { key: 'roles', label: 'Roles', limit: 450, multiline: true },
  { key: 'timing', label: 'Dates and location', limit: 450, multiline: true },
  { key: 'preparation', label: 'What to prepare', limit: 450, multiline: true },
];

const STATUSES = ['open', 'working', 'blocked', 'ready'] as const;
const STATUS_COLORS: Record<FeasibilityStatus, string> = { open: C.muted, working: C.gold, blocked: C.danger, ready: C.green };

export default function ProductionConcept() {
  const { productionId } = useLocalSearchParams<{ productionId: string }>();
  const production = useStore((s) => s.productions.find((p) => p.id === productionId));
  const user = useCurrentUser();
  if (!production || !canPlanProduction(production, user)) {
    return <Empty icon="lock-closed-outline" title="Concept workspace unavailable" />;
  }
  return <ConceptWorkspace key={`${production.id}:${user.id}`} production={production} user={user} />;
}

function ConceptWorkspace({ production, user }: { production: Production; user: User }) {
  const { concept, loadError, refresh } = useConceptWorkspace(production.id);
  const users = useStore((s) => s.users);
  const saveBrief = useStore((s) => s.saveConceptBrief);
  const saveDraft = useStore((s) => s.saveConceptAuditionDraft);
  const saveCheck = useStore((s) => s.saveFeasibilityCheck);
  const [editing, setEditing] = useState<'brief' | 'draft' | FeasibilityItem>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const edit = (item?: typeof editing) => {
    setSaveError('');
    setEditing(item);
  };

  const save = async (write: () => Promise<void>) => {
    setSaving(true);
    setSaveError('');
    try {
      await write();
      await refresh();
      setEditing(undefined);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!concept) {
    return (
      <Screen>
        {loadError ? (
          <>
            <Txt color={C.danger}>{loadError}</Txt>
            <Button variant="secondary" title="Try again" onPress={() => void refresh()} />
          </>
        ) : <ActivityIndicator color={C.gold} accessibilityLabel="Loading Concept workspace" />}
      </Screen>
    );
  }

  const ready = FEASIBILITY_ITEMS.length - unresolvedFeasibility(concept).length;
  const checks = FEASIBILITY_ITEMS.map((item): FeasibilityCheck => concept.checks.find((row) => row.item === item) ?? { item, status: 'open', notes: '' });
  const blocked = checks.filter((check) => check.status === 'blocked');
  const ordered = [...blocked, ...checks.filter((check) => check.status !== 'blocked')];
  const team = users.filter((member) => production.members.some((m) => m.userId === member.id) && canPlanProduction(production, member));
  const editorActions = { saving, error: saveError, onCancel: () => edit() };

  return (
    <Screen>
      <Card accent={blocked.length ? C.danger : C.gold}>
        <Txt v="label" color={C.gold}>Private planning workspace</Txt>
        <Txt v="h2">{production.title}</Txt>
        <Txt v="small">{`${ready} of ${FEASIBILITY_ITEMS.length} feasibility checks ready`}</Txt>
        <ProgressBar value={ready / FEASIBILITY_ITEMS.length} color={C.gold} />
        {blocked.length > 0 && <Txt color={C.danger}>{`Blocked · ${blocked.map(({ item }) => FEASIBILITY_LABELS[item]).join(', ')}`}</Txt>}
      </Card>

      <Card>
        <Txt v="h3">Production brief</Txt>
        {editing === 'brief' ? (
          <TextEditor fields={BRIEF_FIELDS} initial={concept.brief} {...editorActions} saveTitle="Save brief"
            onSave={(brief) => void save(() => saveBrief(production.id, brief))} />
        ) : (
          <>
            <TextSummary fields={BRIEF_FIELDS} values={concept.brief} empty="Add the premise, audience, performance window, cast size, and rough budget." />
            <Button small variant="secondary" title="Edit production brief" disabled={saving} onPress={() => edit('brief')} />
          </>
        )}
      </Card>

      <Card>
        <Txt v="h3">Feasibility checklist</Txt>
        {ordered.map((check) => {
          const assignee = users.find((member) => member.id === check.assigneeId);
          return (
            <View key={check.item} style={{ borderTopWidth: 1, borderTopColor: C.border, gap: 8, paddingTop: 12, paddingBottom: 4 }}>
              <Row style={{ flexWrap: 'wrap' }}>
                <Txt v="h3" style={{ flexGrow: 1 }}>{FEASIBILITY_LABELS[check.item]}</Txt>
                <Pill label={FEASIBILITY_STATUS_LABELS[check.status]} color={STATUS_COLORS[check.status]} />
              </Row>
              {editing === check.item ? (
                <CheckEditor check={check} team={assignee && !team.some((member) => member.id === assignee.id) ? [...team, assignee] : team}
                  {...editorActions} onSave={(next) => void save(() => saveCheck(production.id, next))} />
              ) : (
                <>
                  <Txt v="small">{[assignee?.name ?? 'Unassigned', check.dueDate && `Due ${formatProductionDay(check.dueDate)}`].filter(Boolean).join(' · ')}</Txt>
                  {!!check.notes && <Txt>{check.notes}</Txt>}
                  <Button small variant="ghost" title={`Edit ${FEASIBILITY_LABELS[check.item].toLowerCase()}`} disabled={saving} onPress={() => edit(check.item)} />
                </>
              )}
            </View>
          );
        })}
      </Card>

      <Card>
        <Txt v="h3">Audition draft</Txt>
        <Txt v="small">The director can carry this into audition registration in Casting.</Txt>
        {editing === 'draft' ? (
          <TextEditor fields={DRAFT_FIELDS} initial={concept.auditionDraft} {...editorActions} saveTitle="Save audition draft"
            onSave={(draft) => void save(() => saveDraft(production.id, draft))} />
        ) : (
          <>
            <TextSummary fields={DRAFT_FIELDS} values={concept.auditionDraft} empty="Add roles, dates and location, and what performers should prepare." />
            <Button small variant="secondary" title="Edit audition draft" disabled={saving} onPress={() => edit('draft')} />
          </>
        )}
      </Card>

      <Card>
        <Txt v="h3">Planning team</Txt>
        <Txt v="small">{team.map((member) => member.name).join(', ')}</Txt>
        {canManageProduction(production, user) && (
          <>
            <Txt v="small">Add staff in Company and give them Concept planning access.</Txt>
            <Button small variant="secondary" title="Manage planning team" onPress={() => router.push({ pathname: '/production/[id]', params: { id: production.id, tab: 'company' } })} />
          </>
        )}
      </Card>
    </Screen>
  );
}

type EditorActions = { saving: boolean; error: string; onCancel: () => void };

function TextSummary<Key extends string>({ fields, values, empty }: { fields: TextField<Key>[]; values: Record<Key, string>; empty: string }) {
  const filled = fields.filter(({ key }) => values[key]);
  return filled.length ? filled.map(({ key, label }) => (
    <View key={key} style={{ gap: 3 }}>
      <Txt v="label">{label}</Txt>
      <Txt>{values[key]}</Txt>
    </View>
  )) : <Txt v="small">{empty}</Txt>;
}

function TextEditor<Key extends string>({ fields, initial, onSave, saveTitle, ...actions }: EditorActions & {
  fields: TextField<Key>[]; initial: Record<Key, string>; onSave: (values: Record<Key, string>) => void; saveTitle: string;
}) {
  const [values, setValues] = useState(initial);
  const save = () => {
    const trimmed = { ...values };
    for (const { key } of fields) trimmed[key] = values[key].trim();
    onSave(trimmed);
  };

  return (
    <>
      {fields.map(({ key, label, limit, multiline }) => (
        <Field key={key} label={label} accessibilityLabel={label} value={values[key]} multiline={multiline} maxLength={limit} editable={!actions.saving}
          onChangeText={(value) => setValues((current) => ({ ...current, [key]: value }))} />
      ))}
      <SaveActions title={saveTitle} onSave={save} {...actions} />
    </>
  );
}

function CheckEditor({ check, team, onSave, ...actions }: EditorActions & {
  check: FeasibilityCheck; team: User[]; onSave: (check: FeasibilityCheck) => void;
}) {
  const [entry, setEntry] = useState(check);
  return (
    <>
      <Txt v="label">Status</Txt>
      <Chips options={STATUSES} value={entry.status} labels={FEASIBILITY_STATUS_LABELS} colors={STATUS_COLORS}
        onChange={(status) => !actions.saving && setEntry((current) => ({ ...current, status }))} />
      <Txt v="label">Assigned to</Txt>
      <Chips options={['', ...team.map(({ id }) => id)]} value={entry.assigneeId ?? ''}
        labels={{ '': 'Unassigned', ...Object.fromEntries(team.map(({ id, name }) => [id, name])) }}
        onChange={(id) => !actions.saving && setEntry((current) => ({ ...current, assigneeId: id || undefined }))} />
      <ProductionDatePicker label="Due date" value={entry.dueDate} clearable
        onChange={(date) => !actions.saving && setEntry((current) => ({ ...current, dueDate: date || undefined }))} />
      <Field label="Notes" accessibilityLabel="Feasibility notes" value={entry.notes} maxLength={1200} multiline editable={!actions.saving}
        onChangeText={(notes) => setEntry((current) => ({ ...current, notes }))} />
      <SaveActions title="Save check" onSave={() => onSave({ ...entry, notes: entry.notes.trim() })} {...actions} />
    </>
  );
}

function SaveActions({ title, saving, error, onSave, onCancel }: EditorActions & { title: string; onSave: () => void }) {
  return (
    <>
      {!!error && <View accessibilityRole="alert"><Txt color={C.danger}>{error}</Txt></View>}
      <Row style={{ flexWrap: 'wrap' }}>
        <Button small title={title} loading={saving} onPress={onSave} />
        <Button small variant="ghost" title="Cancel" disabled={saving} onPress={onCancel} />
      </Row>
    </>
  );
}
