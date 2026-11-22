import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { alert } from '@/components/alert';
import { formatProductionDay, ProductionDatePicker, ProductionRunFields } from '@/components/ProductionDates';
import { PRODUCTION_STAGE_STYLE, ProductionStageTrack } from '@/components/ProductionStage';
import { Button, Card, Chips, Collapsible, Field, ListItem, Pill, ProgressBar, Row, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { useConceptWorkspace } from '@/hooks/useConceptWorkspace';
import { auditionDraftDetails, FEASIBILITY_LABELS, unresolvedFeasibility } from '@/lib/concept';
import { dayKey, fmtRange } from '@/lib/dates';
import {
  canManageProduction, canPlanProduction, canReviewAudition, PRODUCTION_STATUSES, productionRunDates, productionStage, productionStageLabel,
  STAGE_GUIDE, STAGE_LABELS, stageHas, suggestedMilestones,
} from '@/lib/production';
import { isCalled } from '@/lib/scheduling';
import { FEASIBILITY_ITEMS, type MilestoneStage, type Production, type ProductionAudition, type ProductionMilestone, type ProductionStage } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

export function ProductionTimeline({ production: p, onSchedule }: {
  production: Production;
  onSchedule: (callId: string) => void;
}) {
  const user = useCurrentUser();
  const schedule = useStore((s) => s.schedule);
  const announcements = useStore((s) => s.channels.find((c) => c.productionId === p.id && c.kind === 'announcements'));
  const updatePitch = useStore((s) => s.updateProductionPitch);
  const changeStage = useStore((s) => s.changeProductionStage);
  const updateRun = useStore((s) => s.updateProductionRun);
  const addMilestone = useStore((s) => s.addMilestone);
  const updateMilestone = useStore((s) => s.updateMilestone);
  const removeMilestone = useStore((s) => s.removeMilestone);
  const loadAudition = useStore((s) => s.loadProductionAudition);
  const saveAudition = useStore((s) => s.saveProductionAudition);
  const [saving, setSaving] = useState(false);
  const [stageChoice, setStageChoice] = useState<{ from: ProductionStage; to: ProductionStage }>();
  // Casting opens audition registration and leaving it closes it, unless the director unticks it.
  const [audition, setAudition] = useState<ProductionAudition | null>();
  const [syncAuditions, setSyncAuditions] = useState(true);
  const [editingPitch, setEditingPitch] = useState(false);
  const [pitch, setPitch] = useState(p.pitch ?? '');
  const [editingRun, setEditingRun] = useState(false);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [editor, setEditor] = useState<{ stage: MilestoneStage; milestone?: ProductionMilestone }>();
  const now = useNow(60_000);
  const today = dayKey(now);
  const canEdit = canManageProduction(p, user);
  const stage = productionStage(p);
  const canPlan = canPlanProduction(p, user);
  const reviewConcept = stageChoice?.from === 'concept';
  const { concept, loadError, loading, refresh: refreshConcept } = useConceptWorkspace(p.id, canPlan && (stage === 'concept' || reviewConcept));
  const unresolved = concept ? unresolvedFeasibility(concept) : [];
  const blockers = concept?.checks.filter((check) => check.status === 'blocked') ?? [];
  const draftDetails = reviewConcept && concept ? auditionDraftDetails(concept.auditionDraft) : '';
  const stageStyle = PRODUCTION_STAGE_STYLE[stage];
  const nextStage = stage === 'completed' ? undefined : PRODUCTION_STATUSES[PRODUCTION_STATUSES.indexOf(stage) + 1];
  // only this stage's milestones: earlier stages are history and later ones come up in their turn
  const phase = stage === 'completed' ? undefined : stage;
  const allMilestones = p.milestones ?? [];
  const milestones = phase ? allMilestones.filter((m) => m.stage === phase) : [];
  const done = milestones.filter((m) => m.completed).length;
  const sorted = milestones.slice().sort((a, b) =>
    Number(a.completed) - Number(b.completed) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title),
  );
  const nextMilestone = sorted.find((m) => !m.completed && m.dueDate);
  const next = schedule
    .filter((s) => s.productionId === p.id && new Date(s.end) >= now && (canEdit || isCalled(s, p, user.id)))
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  const save = async (write: () => Promise<void>, finish?: () => void) => {
    setSaving(true);
    try {
      await write();
      finish?.();
    } catch (error) {
      alert('Couldn’t save the production plan', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const chooseStage = (value: ProductionStage) => {
    if (value === stage || saving) return;
    if (stage === 'concept') void refreshConcept();
    setAudition(undefined);
    setSyncAuditions(true);
    if (value === 'casting' || stage === 'casting') {
      loadAudition(p.id).then(setAudition, () => setAudition(null));
    }
    setStageChoice({ from: stage, to: value });
  };

  // What changing stage does to audition registration: open it on the way into Casting (with the
  // saved details, or the Concept draft), close it on the way out.
  const auditionDetails = audition?.details || draftDetails;
  const auditionStep = !stageChoice || audition === undefined ? undefined
    : stageChoice.to === 'casting'
      ? audition?.isOpen ? 'alreadyOpen' : auditionDetails ? 'open' : 'noDetails'
      : stageChoice.from === 'casting' && audition?.isOpen ? 'close' : undefined;

  const confirmStage = (choice: { from: ProductionStage; to: ProductionStage }) => void save(async () => {
    await changeStage(p.id, choice.from, choice.to);
    if (syncAuditions && auditionStep === 'open') await saveAudition(p.id, { isOpen: true, details: auditionDetails });
    if (syncAuditions && auditionStep === 'close' && audition) await saveAudition(p.id, { ...audition, isOpen: false });
  }, () => setStageChoice(undefined));

  const addSuggested = (phase: MilestoneStage) => void save(async () => {
    for (const milestone of suggestedMilestones(phase, p, today)) await addMilestone(p.id, milestone);
  });

  return (
    <View style={{ gap: 12 }}>
      <Card accent={stageStyle.color}>
        <View style={{ backgroundColor: stageStyle.bg, borderRadius: 12, padding: 12, gap: 6 }}>
          <Txt v="label" color={stageStyle.color}>Current stage</Txt>
          <Txt v="h2">{productionStageLabel(stage)}</Txt>
          {stage !== 'completed' && <Txt v="small">{STAGE_GUIDE[stage]}</Txt>}
        </View>
        <ProductionStageTrack stage={stage} />
        {milestones.length > 0 && (
          <>
            <Txt v="small">{`${done} of ${milestones.length} milestones for this stage done`}</Txt>
            <ProgressBar value={done / milestones.length} color={stageStyle.color} />
          </>
        )}
        {nextMilestone?.dueDate && (
          <Txt v="small" color={nextMilestone.dueDate < today ? C.warn : C.muted}>
            {`${nextMilestone.dueDate < today ? 'Overdue' : 'Next deadline'} · ${nextMilestone.title} · ${formatProductionDay(nextMilestone.dueDate)}`}
          </Txt>
        )}
        {next && <ListItem icon="time-outline" title={next.title} subtitle={fmtRange(next.start, next.end)} onPress={() => onSchedule(next.id)} />}
        {canPlan && stage === 'concept' && !stageChoice && (
          <>
            {concept && <Txt v="small">{`${FEASIBILITY_ITEMS.length - unresolved.length} of ${FEASIBILITY_ITEMS.length} feasibility checks ready`}</Txt>}
            {blockers.length > 0 && <Txt v="small" color={C.warn}>{`Blocked · ${blockers.map(({ item }) => FEASIBILITY_LABELS[item]).join(', ')}`}</Txt>}
          </>
        )}
        {canPlan && stageHas(stage, 'conceptWorkspace') && <Button small variant="secondary" icon="clipboard-outline" title="Open Concept workspace" onPress={() => router.push({ pathname: '/production/concept', params: { productionId: p.id } })} />}
        {stageHas(stage, 'auditions') && canReviewAudition(p, user) && (
          <Button small variant="secondary" icon="albums-outline" title="Review audition applicants" onPress={() => router.push({ pathname: '/production/audition-review', params: { productionId: p.id } })} />
        )}
        {canEdit && nextStage && !stageChoice && (
          <Button
            icon="arrow-forward-outline"
            title={nextStage === 'completed' ? 'Mark production complete' : `Advance to ${STAGE_LABELS[nextStage]}`}
            disabled={saving}
            onPress={() => chooseStage(nextStage)}
          />
        )}
        {canEdit && stageChoice && (
          <View style={{ gap: 8 }}>
            <Txt v="h3">{`Move from ${STAGE_LABELS[stageChoice.from]} to ${STAGE_LABELS[stageChoice.to]}?`}</Txt>
            <Txt v="small">This posts a stage update for the whole company.</Txt>
            {reviewConcept && (loading ? <Txt v="small">Checking Concept readiness…</Txt> : loadError ? (
              <>
                <Txt v="small" color={C.warn}>Couldn’t load Concept readiness.</Txt>
                <Button small title="Retry readiness check" variant="ghost" onPress={() => void refreshConcept()} />
              </>
            ) : concept && (
              <>
                <Txt v="small" color={unresolved.length ? C.warn : C.green}>
                  {unresolved.length ? `Still open · ${unresolved.map((item) => FEASIBILITY_LABELS[item]).join(', ')}` : 'All feasibility checks are ready.'}
                </Txt>
                <Txt v="label">Audition draft</Txt>
                <Txt v="small">{draftDetails || 'No audition draft yet.'}</Txt>
              </>
            ))}
            {stageChoice.to === 'completed' && done < milestones.length && <Txt v="small" color={C.warn}>{`${milestones.length - done} of this stage’s milestones are still open.`}</Txt>}
            {(stageChoice.to === 'casting' || stageChoice.from === 'casting') && audition === undefined && <Txt v="small">Checking audition registration…</Txt>}
            {auditionStep === 'open' && <CheckRow on={syncAuditions} onToggle={() => setSyncAuditions(!syncAuditions)} label="Also open audition registration, so performers can apply" />}
            {auditionStep === 'close' && <CheckRow on={syncAuditions} onToggle={() => setSyncAuditions(!syncAuditions)} label="Also close audition registration" />}
            {auditionStep === 'alreadyOpen' && <Txt v="small" color={C.green}>Audition registration is already open.</Txt>}
            {auditionStep === 'noDetails' && <Txt v="small">To open auditions, add audition details under Company → Audition registration.</Txt>}
            <Row style={{ flexWrap: 'wrap' }}>
              <Button small title="Notify company and change stage" loading={saving} disabled={(reviewConcept && loading) || ((stageChoice.to === 'casting' || stageChoice.from === 'casting') && audition === undefined)} onPress={() => confirmStage(stageChoice)} />
              <Button small variant="ghost" title="Cancel" disabled={saving} onPress={() => setStageChoice(undefined)} />
            </Row>
          </View>
        )}
        {announcements && <Button small variant="secondary" icon="megaphone-outline" title="Announcements" onPress={() => router.push(`/chat/${announcements.id}`)} />}
      </Card>

      {canEdit && (
        <Collapsible title="Adjust stage" icon="flag-outline">
          <Chips options={PRODUCTION_STATUSES} value={stage} onChange={chooseStage} labels={STAGE_LABELS} />
        </Collapsible>
      )}

      {stageHas(stage, 'pitch') && (!!p.pitch || canEdit) && (
        <Collapsible title="Production pitch" icon="document-text-outline" defaultOpen={stage === 'concept'}>
          {editingPitch && canEdit ? (
            <>
              <Field label="Pitch" value={pitch} onChangeText={setPitch} multiline editable={!saving} hint="Visible to the company." />
              <Row>
                <Button small title="Save pitch" loading={saving} onPress={() => void save(() => updatePitch(p.id, pitch.trim()), () => setEditingPitch(false))} />
                <Button small variant="ghost" title="Cancel" disabled={saving} onPress={() => setEditingPitch(false)} />
              </Row>
            </>
          ) : (
            <>
              {p.pitch ? <Txt>{p.pitch}</Txt> : <Txt v="small">No pitch yet.</Txt>}
              {canEdit && <Button small variant="secondary" title="Edit pitch" onPress={() => {
                setPitch(p.pitch ?? '');
                setEditingPitch(true);
              }} />}
            </>
          )}
        </Collapsible>
      )}

      {canEdit && stageHas(stage, 'runDates') && (
        <Collapsible title="Run dates" subtitle={p.openingDate ? 'Opening and final performance' : 'No dates set'} icon="calendar-outline">
          {editingRun ? (
            <>
              <ProductionRunFields opening={opening} closing={closing} setOpening={setOpening} setClosing={setClosing} />
              <Row>
                <Button small title="Save dates" loading={saving} onPress={() => void save(() => updateRun(p.id, productionRunDates(opening, closing, p)), () => setEditingRun(false))} />
                <Button small variant="ghost" title="Cancel" disabled={saving} onPress={() => setEditingRun(false)} />
              </Row>
            </>
          ) : <Button small variant="secondary" title="Edit run dates" onPress={() => {
            setOpening(p.openingDate ? dayKey(p.openingDate) : '');
            setClosing(p.closingDate ? dayKey(p.closingDate) : '');
            setEditingRun(true);
          }} />}
        </Collapsible>
      )}

      {phase && stageHas(stage, 'milestones') && (milestones.length > 0 || canEdit) && (
        <Card>
          <Row>
            <Txt v="h3" style={{ flex: 1 }}>{`${STAGE_LABELS[phase]} milestones`}</Txt>
            {milestones.length > 0 && <Txt v="small">{`${done} of ${milestones.length} done`}</Txt>}
          </Row>
          {sorted.map((m) => {
            const overdue = !m.completed && !!m.dueDate && m.dueDate < today;
            return (
              <View key={m.id} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border }}>
                <Row style={{ flexWrap: 'wrap' }}>
                  <Txt v="h3" style={{ flexGrow: 1, flexShrink: 1 }}>{m.title}</Txt>
                  {m.completed ? <Pill label="Done" color={C.green} bg={C.greenSoft} /> : overdue ? <Pill label="Overdue" color={C.warn} bg={C.surface2} /> : null}
                </Row>
                {m.dueDate && <Txt v="small">{formatProductionDay(m.dueDate)}</Txt>}
                {canEdit && (
                  <Row style={{ flexWrap: 'wrap' }}>
                    <Button small variant="secondary" title={m.completed ? 'Reopen' : 'Mark done'} disabled={saving} onPress={() => void save(() => updateMilestone(p.id, m.id, { completed: !m.completed }))} />
                    <Button small variant="ghost" title="Edit" disabled={saving} onPress={() => setEditor({ stage: phase, milestone: m })} />
                  </Row>
                )}
              </View>
            );
          })}
          {canEdit && (editor?.stage === phase ? (
            <MilestoneEditor
              key={editor.milestone?.id ?? phase}
              stage={phase}
              milestone={editor.milestone}
              saving={saving}
              onCancel={() => setEditor(undefined)}
              onSave={(fields) => {
                const id = editor.milestone?.id;
                return save(() => id ? updateMilestone(p.id, id, fields) : addMilestone(p.id, fields), () => setEditor(undefined));
              }}
              onRemove={(id) => alert('Remove this milestone?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => void save(() => removeMilestone(p.id, id), () => setEditor(undefined)) },
              ])}
            />
          ) : (
            <>
              {milestones.length === 0 && (
                <>
                  <Txt v="small">{`Suggested: ${suggestedMilestones(phase, p, today).map((m) => m.title).join(', ')}.`}</Txt>
                  <Button small icon="sparkles-outline" title="Add suggested milestones" disabled={saving} onPress={() => addSuggested(phase)} />
                </>
              )}
              <Button small variant="secondary" icon="add" title="Add milestone" disabled={saving} onPress={() => setEditor({ stage: phase })} />
            </>
          ))}
        </Card>
      )}
    </View>
  );
}

function MilestoneEditor({ stage, milestone, saving, onCancel, onSave, onRemove }: {
  stage: MilestoneStage;
  milestone?: ProductionMilestone;
  saving: boolean;
  onCancel: () => void;
  onSave: (fields: Pick<ProductionMilestone, 'stage' | 'title' | 'dueDate'>) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? '');
  return (
    <View style={{ gap: 8 }}>
      <Field label="Milestone" value={title} onChangeText={setTitle} maxLength={120} editable={!saving} placeholder="e.g. Confirm performance rights" />
      <ProductionDatePicker label="Due date" value={dueDate} onChange={setDueDate} clearable />
      <Row style={{ flexWrap: 'wrap' }}>
        <Button small title="Save milestone" loading={saving} disabled={!title.trim()} onPress={() => void onSave({ stage, title: title.trim(), dueDate: dueDate || undefined })} />
        <Button small variant="ghost" title="Cancel" disabled={saving} onPress={onCancel} />
        {milestone && <Button small variant="danger" title="Remove" disabled={saving} onPress={() => onRemove(milestone.id)} />}
      </Row>
    </View>
  );
}

function CheckRow({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? C.accent : C.muted} />
      <Txt v="small" color={C.text} style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
}
