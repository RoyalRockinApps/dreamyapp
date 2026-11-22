import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AddToCalendar } from '@/components/AddToCalendar';
import { ATTENDANCE_LABELS, attendanceCounts, canTakeAttendance, countsLabel, rollIds, rollOpen, takesRoll } from '@/lib/attendance';
import { ChannelRow } from '@/components/ChannelList';
import { MonthCalendar } from '@/components/MonthCalendar';
import { ProductionAuditions } from '@/components/ProductionAuditions';
import { ProductionStageBadge } from '@/components/ProductionStage';
import { ProductionTimeline } from '@/components/ProductionTimeline';
import { TaskBoard } from '@/components/TaskBoard';
import { Avatar, Button, Card, Chips, Collapsible, Empty, Field, ListItem, Pill, ProgressBar, Row, Screen, Segmented, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { useChannels } from '@/hooks/useChannels';
import { atMinutes, dayKey, fmtDate, fmtTime, relativeDay } from '@/lib/dates';
import { canManageProduction, canReviewAudition, canViewProduction, productionStage } from '@/lib/production';
import { calledMemberIds, isCalled, memberConflictsFor } from '@/lib/scheduling';
import { salesSummary } from '@/lib/seating';
import type { MemberConflict, Production, Rsvp, ScheduleItem } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';
import { ATTENDANCE_COLOR, C } from '@/theme';
import { alert } from '@/components/alert';

type Tab = 'overview' | 'schedule' | 'board' | 'company' | 'chat';
const TABS = ['overview', 'schedule', 'board', 'company', 'chat'] as const;

export default function ProductionHub() {
  const params = useLocalSearchParams<{ id: string; tab?: Tab; item?: string }>();
  const user = useCurrentUser();
  const production = useStore((s) => s.productions.find((p) => p.id === params.id));
  const [tab, setTab] = useState<Tab>(params.tab && (TABS as readonly string[]).includes(params.tab) ? params.tab : params.item ? 'schedule' : 'overview');
  const [highlight, setHighlight] = useState(params.item);
  const channels = useChannels(params.id);
  const unread = channels.reduce((s, c) => s + c.unread, 0);

  if (!production || !canViewProduction(production, user)) return <Empty icon="lock-closed-outline" title="Production not available" />;

  return (
    <Screen>
      <Stack.Screen options={{ title: production.title }} />
      {tab !== 'overview' && <ProductionStageBadge stage={productionStage(production)} />}
      <Txt v="small">{production.openingDate && production.closingDate
        ? `Runs ${fmtDate(production.openingDate, { weekday: true })} – ${fmtDate(production.closingDate, { weekday: true })}`
        : 'Run dates to be announced'}</Txt>
      <Segmented
        options={TABS}
        value={tab}
        onChange={setTab}
        labels={{ overview: 'Overview', schedule: 'Schedule', board: 'Board', company: 'Company', chat: unread ? `Chat (${unread > 9 ? '9+' : unread})` : 'Chat' }}
      />
      {tab === 'overview' && (
        <>
          <ProductionTimeline production={production} onSchedule={(id) => {
            setHighlight(id);
            setTab('schedule');
          }} />
          <TicketsSummary p={production} />
        </>
      )}
      {tab === 'schedule' && <ScheduleTab p={production} highlight={highlight} />}
      {tab === 'board' && <TaskBoard productionId={production.id} />}
      {tab === 'company' && <CompanyTab p={production} />}
      {tab === 'chat' && <ChatTab p={production} />}
    </Screen>
  );
}

// ---------------- Schedule ----------------

function ScheduleTab({ p, highlight }: { p: Production; highlight?: string }) {
  const user = useCurrentUser();
  const isOwner = canManageProduction(p, user);
  const schedule = useStore((s) => s.schedule);
  const conflicts = useStore((s) => s.conflicts);
  const [view, setView] = useState<'mine' | 'all' | 'past'>(isOwner ? 'all' : 'mine');
  const showPast = view === 'past';
  const mineOnly = view === 'mine';
  const now = useNow(60000);

  const items = useMemo(
    () =>
      schedule
        .filter((s) => s.productionId === p.id)
        .filter((s) => (showPast ? new Date(s.end) < now : new Date(s.end) >= now))
        .filter((s) => !mineOnly || isCalled(s, p, user.id))
        .sort((a, b) => (showPast ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start))),
    [schedule, p, showPast, mineOnly, user.id, now],
  );

  const days: [string, ScheduleItem[]][] = [];
  for (const it of items) {
    const k = dayKey(it.start);
    const last = days[days.length - 1];
    if (last && last[0] === k) last[1].push(it);
    else days.push([k, [it]]);
  }

  return (
    <View style={{ gap: 12 }}>
      {isOwner ? (
        <Segmented options={['all', 'past'] as const} value={view === 'mine' ? 'all' : view} onChange={setView} labels={{ all: 'Upcoming', past: 'Past' }} />
      ) : (
        <Segmented options={['mine', 'all', 'past'] as const} value={view} onChange={setView} labels={{ mine: 'My calls', all: 'Everyone', past: 'Past' }} />
      )}
      {days.length === 0 && <Empty icon="calendar-outline" title={showPast ? 'No past calls' : 'Nothing scheduled'} />}
      {days.map(([k, list]) => (
        <View key={k} style={{ gap: 8 }}>
          <Txt v="label" color={C.accent}>{relativeDay(atMinutes(k, 0))}</Txt>
          {list.map((it) => (
            <ScheduleCard key={it.id} item={it} p={p} canEdit={isOwner} highlighted={it.id === highlight} />
          ))}
        </View>
      ))}
      {isOwner && <Button variant="secondary" icon="add" title="Schedule a call" onPress={() => router.push(`/rehearsal/edit?productionId=${p.id}` as Href)} />}
      <ConflictsSection p={p} isOwner={isOwner} conflicts={conflicts.filter((c) => c.productionId === p.id)} />
    </View>
  );
}

function ScheduleCard({ item, p, canEdit, highlighted }: { item: ScheduleItem; p: Production; canEdit: boolean; highlighted: boolean }) {
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const conflicts = useStore((s) => s.conflicts);
  const rsvp = useStore((s) => s.rsvp);
  const [open, setOpen] = useState(highlighted);
  const called = calledMemberIds(item, p);
  const amCalled = called.includes(user.id);
  const counts = { yes: 0, maybe: 0, no: 0, none: 0 };
  for (const id of called) {
    const r = item.rsvps[id];
    if (r) counts[r]++;
    else counts.none++;
  }
  const clashes = memberConflictsFor(item, p, conflicts);
  const attendance = useStore((s) => s.attendance);
  const myMark = attendance.find((a) => a.itemId === item.id && a.userId === user.id);
  const rollers = takesRoll(user, p);
  const myRoll = rollers ? rollIds(item, p).filter((id) => canTakeAttendance(user, p, id)) : [];
  const rollCount = myRoll.length;
  const rollMarked = myRoll.filter((id) => attendance.some((a) => a.itemId === item.id && a.userId === id)).length;
  const groups = item.groupIds.length ? item.groupIds.map((g) => p.groups.find((x) => x.id === g)).filter(Boolean) : null;
  const isPast = new Date(item.end) < new Date();
  const kindColor = ['Tech', 'Dress', 'Performance', 'Strike'].includes(item.kind) ? C.curtain : item.kind === 'Call Time' ? C.gold : C.purple;

  return (
    <Card accent={kindColor} style={highlighted ? { borderColor: C.accent } : undefined} onPress={() => setOpen(!open)}>
      <Row>
        <Txt v="h3" style={{ flex: 1 }}>{item.title}</Txt>
        {canEdit && <Ionicons name="create-outline" size={20} color={C.accent} onPress={() => router.push(`/rehearsal/edit?id=${item.id}` as Href)} />}
      </Row>
      <Txt v="small">{`${item.kind} · ${fmtTime(item.start)}–${fmtTime(item.end)} · ${item.space} · ${groups ? groups.map((g) => g!.name).join(', ') : 'Full company'}`}</Txt>
      {canEdit && (
        <Txt v="small" color={clashes.length ? C.warn : C.muted}>
          {`${counts.yes}/${called.length} going${counts.none ? ` · ${counts.none} no reply` : ''}${clashes.length ? ` · ${clashes.length} conflict${clashes.length > 1 ? 's' : ''}` : ''}`}
        </Txt>
      )}
      {open && item.notes ? <Txt v="small">{item.notes}</Txt> : null}

      {amCalled && !isPast && (
        <Row>
          {(['yes', 'maybe', 'no'] as Rsvp[]).map((r) => (
            <Button key={r} small style={{ flex: 1 }} title={r === 'yes' ? 'Going' : r === 'maybe' ? 'Maybe' : "Can't"} variant={item.rsvps[user.id] === r ? (r === 'no' ? 'danger' : 'success') : 'secondary'} onPress={() => rsvp(item.id, user.id, r)} />
          ))}
        </Row>
      )}
      {amCalled && !isPast && open && <AddToCalendar item={item} production={p} />}
      {myMark && <Txt v="small" color={ATTENDANCE_COLOR[myMark.status]}>{`You were marked ${ATTENDANCE_LABELS[myMark.status].toLowerCase()}${myMark.note ? ` · ${myMark.note}` : ''}`}</Txt>}
      {rollers && rollOpen(item) && (
        <Button
          small
          variant="secondary"
          icon="clipboard-outline"
          title={rollMarked ? `Attendance · ${rollMarked}/${rollCount} marked` : 'Take attendance'}
          onPress={() => router.push(`/attendance/${item.id}`)}
        />
      )}

      {open && canEdit && (
        <View style={{ gap: 4, marginTop: 4 }}>
          {clashes.map((c) => (
            <Txt key={c.id} v="small" color={C.warn}>{`⚠ ${users.find((u) => u.id === c.userId)?.name}: ${c.note}`}</Txt>
          ))}
          {called.map((id) => {
            const u = users.find((x) => x.id === id);
            const r = item.rsvps[id];
            return (
              <Row key={id}>
                <Ionicons name={r === 'yes' ? 'checkmark-circle' : r === 'no' ? 'close-circle' : r === 'maybe' ? 'help-circle' : 'ellipse-outline'} size={16} color={r === 'yes' ? C.green : r === 'no' ? C.danger : r === 'maybe' ? C.warn : C.faint} />
                <Txt v="small">{u?.name ?? id}</Txt>
              </Row>
            );
          })}
        </View>
      )}
    </Card>
  );
}

function ConflictsSection({ p, isOwner, conflicts }: { p: Production; isOwner: boolean; conflicts: MemberConflict[] }) {
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const addConflict = useStore((s) => s.addConflict);
  const removeConflict = useStore((s) => s.removeConflict);
  const [adding, setAdding] = useState(false);
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [day, setDay] = useState(dayKey(today));
  const [note, setNote] = useState('');
  const isMember = p.members.some((m) => m.userId === user.id);
  const mine = conflicts.filter((c) => c.userId === user.id);
  const shown = isOwner ? conflicts : mine;

  return (
    <Collapsible title={isOwner ? 'Company conflicts' : 'My conflicts'} subtitle={shown.length ? `${shown.length} submitted` : 'None submitted'} icon="calendar-clear-outline">
      {isMember && !adding && <Button small variant="secondary" icon="add" title="Add a date I can’t make" onPress={() => setAdding(true)} />}
      {adding && (
        <View style={{ gap: 10 }}>
          <MonthCalendar year={ym.y} month={ym.m} onChangeMonth={(y, m) => setYm({ y, m })} selected={day} onSelect={setDay} minDate={dayKey(today)} />
          <Field label="Reason" value={note} onChangeText={setNote} placeholder="Work, travel, school event…" />
          <Button
            title={`Add conflict on ${fmtDate(atMinutes(day, 0), { weekday: true })}`}
            onPress={() => {
              addConflict({ userId: user.id, productionId: p.id, start: atMinutes(day, 0).toISOString(), end: atMinutes(day, 23 * 60 + 59).toISOString(), note: note.trim() || 'Unavailable' });
              setNote('');
              setAdding(false);
            }}
          />
        </View>
      )}
      {shown
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((c) => (
          <ListItem
            key={c.id}
            icon="calendar-clear"
            iconColor={C.warn}
            title={`${isOwner ? users.find((u) => u.id === c.userId)?.name + ' · ' : ''}${fmtDate(c.start, { weekday: true })}`}
            subtitle={c.note}
            right={c.userId === user.id ? <Ionicons name="trash-outline" size={18} color={C.danger} onPress={() => removeConflict(c.id)} /> : undefined}
          />
        ))}
    </Collapsible>
  );
}

// ---------------- Company ----------------

function CompanyTab({ p }: { p: Production }) {
  const user = useCurrentUser();
  const isOwner = user.role === 'owner';
  const canManage = canManageProduction(p, user);
  const users = useStore((s) => s.users);
  const attendance = useStore((s) => s.attendance);
  const schedule = useStore((s) => s.schedule);
  const itemIds = useMemo(() => new Set(schedule.filter((x) => x.productionId === p.id).map((x) => x.id)), [schedule, p.id]);
  const addMember = useStore((s) => s.addMember);
  const addGroup = useStore((s) => s.addGroup);
  const updateCompanyMember = useStore((s) => s.updateCompanyMember);
  const openDirect = useStore((s) => s.openDirect);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [part, setPart] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [memberPart, setMemberPart] = useState('');
  const [memberGroups, setMemberGroups] = useState<string[]>([]);
  const [memberLeads, setMemberLeads] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const groupLabels = Object.fromEntries(p.groups.map((g) => [g.id, g.name]));
  const groupColors = Object.fromEntries(p.groups.map((g) => [g.id, g.color]));

  const message = (uid: string) => {
    const ch = openDirect(p.id, uid);
    router.push(`/chat/${ch}`);
  };

  const sections = [
    { id: '_dir', name: 'Directors', color: C.accent, members: p.members.filter((m) => m.isDirector) },
    ...p.groups.map((g) => ({ ...g, members: p.members.filter((m) => m.groupIds.includes(g.id) && !m.isDirector) })),
    { id: '_unassigned', name: 'Unassigned company members', color: C.muted, members: p.members.filter((m) => !m.isDirector && !m.groupIds.some((id) => groupLabels[id])) },
  ];

  const saveMember = async (write: () => Promise<void>) => {
    setSaving(true);
    try {
      await write();
      setEditing(null);
    } catch (error) {
      alert('Couldn’t update the company', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {canManage && <ProductionAuditions key={`${p.id}:${user.id}`} productionId={p.id} includeConceptDraft={productionStage(p) !== 'concept'} />}
      {canReviewAudition(p, user) && (
        <Button variant="secondary" icon="albums-outline" title="Review audition applicants" onPress={() => router.push({ pathname: '/production/audition-review', params: { productionId: p.id } })} />
      )}
      {canManage && (
        <Row>
          <Button style={{ flex: 1 }} icon="person-add" title="Add member" onPress={() => setAdding(!adding)} />
        </Row>
      )}
      {adding && (
        <Card>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="Share the app with them and ask them to sign in with this email." />
          <Field label="Role / part" value={part} onChangeText={setPart} placeholder="e.g. Santa, Spot Op" />
          <Txt v="label">Groups</Txt>
          <Chips multi options={p.groups.map((g) => g.id)} value={groupIds} onChange={(id) => setGroupIds(toggle(groupIds, id))} labels={groupLabels} colors={groupColors} />
          <Button
            title="Add to company"
            loading={saving}
            onPress={() => {
              if (!name.trim()) return alert('Name is required');
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return alert('Enter a valid email');
              void saveMember(async () => {
                await addMember(p.id, { name: name.trim(), email: email.trim().toLowerCase() }, groupIds, part.trim() || undefined);
                setName('');
                setEmail('');
                setPart('');
                setGroupIds([]);
                setAdding(false);
              });
            }}
          />
        </Card>
      )}
      {sections.map((sec) => (
        <View key={sec.id} style={{ gap: 6 }}>
          <Row>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sec.color }} />
            <Txt v="label">{`${sec.name} · ${sec.members.length}`}</Txt>
          </Row>
          <Card style={{ paddingVertical: 4 }}>
            {sec.members.length === 0 && <Txt v="small">No one yet</Txt>}
            {sec.members.map((m) => {
              const u = users.find((x) => x.id === m.userId);
              if (!u) return null;
              return (
                <View key={m.userId}>
                  <Pressable onPress={() => {
                    if (!canManage) return;
                    setMemberPart(m.part ?? '');
                    setMemberGroups(m.groupIds);
                    setMemberLeads(m.leadGroupIds ?? []);
                    setEditing(editing === `${sec.id}:${u.id}` ? null : `${sec.id}:${u.id}`);
                  }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                    <Avatar name={u.name} color={u.color} />
                    <View style={{ flex: 1 }}>
                      <Txt v="h3">{u.name + (u.id === user.id ? ' (you)' : '')}</Txt>
                      {m.part ? <Txt v="small">{m.part}</Txt> : null}
                      {!!m.leadGroupIds?.length && <Txt v="small">{`Team Lead · ${m.leadGroupIds.map((id) => groupLabels[id]).filter(Boolean).join(', ')}`}</Txt>}
                      {(u.id === user.id || canTakeAttendance(user, p, u.id)) && countsLabel(attendanceCounts(attendance, u.id, itemIds)) ? (
                        <Txt v="small" color={C.muted}>{`Attendance: ${countsLabel(attendanceCounts(attendance, u.id, itemIds))}`}</Txt>
                      ) : null}
                      {m.canReviewAuditions && !m.isDirector && <Txt v="small">Audition reviewer</Txt>}
                      {m.canPlanConcept && !m.isDirector && (canManage || u.id === user.id) && <Txt v="small">Concept planner</Txt>}
                    </View>
                    {u.id !== user.id && <Ionicons name="chatbubble-ellipses-outline" size={22} color={C.accent} onPress={() => message(u.id)} />}
                  </Pressable>
                  {canManage && editing === `${sec.id}:${u.id}` && (
                    <View style={{ paddingBottom: 10, gap: 8 }}>
                      <Field label="Role / part" value={memberPart} onChangeText={setMemberPart} editable={!saving} />
                      <Txt v="label">Groups</Txt>
                      <Chips multi options={p.groups.map((g) => g.id)} value={memberGroups} onChange={(id) => setMemberGroups(toggle(memberGroups, id))} labels={groupLabels} colors={groupColors} />
                      {memberGroups.length > 0 && (
                        <>
                          <Txt v="label">Team Lead of</Txt>
                          <Txt v="small">Team Leads manage their group’s cards on the Board and take roll for their group at calls.</Txt>
                          <Chips multi options={memberGroups} value={memberLeads.filter((id) => memberGroups.includes(id))} onChange={(id) => setMemberLeads(toggle(memberLeads, id))} labels={groupLabels} colors={groupColors} />
                        </>
                      )}
                      <Button small variant="secondary" title="Save role and groups" loading={saving} onPress={() => void saveMember(() => updateCompanyMember(p.id, u.id, {
                        part: memberPart.trim(), groupIds: memberGroups, leadGroupIds: memberLeads.filter((id) => memberGroups.includes(id)),
                      }))} />
                      {!m.isDirector && u.role !== 'owner' && (
                        <>
                          <Button small variant="ghost" title={m.canReviewAuditions ? 'Remove audition review access' : 'Give audition review access'} disabled={saving} onPress={() => void saveMember(() => updateCompanyMember(p.id, u.id, { canReviewAuditions: !m.canReviewAuditions }))} />
                          <Button small variant="ghost" title={m.canPlanConcept ? 'Remove Concept planning access' : 'Give Concept planning access'} disabled={saving} onPress={() => void saveMember(() => updateCompanyMember(p.id, u.id, { canPlanConcept: !m.canPlanConcept }))} />
                        </>
                      )}
                      {isOwner && u.id !== user.id && u.role !== 'owner' && (
                        <Button small variant="ghost" title={m.isDirector ? 'Remove director access' : 'Make director'} disabled={saving} onPress={() => void saveMember(() => updateCompanyMember(p.id, u.id, { isDirector: !m.isDirector }))} />
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </View>
      ))}
      {canManage && (
        <Card>
          <Txt v="label">New group</Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Field label="Name" value={newGroup} onChangeText={setNewGroup} placeholder="e.g. Costume Crew" />
            </View>
          </Row>
          <Button
            variant="secondary"
            title="Create group + group chat"
            loading={saving}
            disabled={!newGroup.trim()}
            onPress={() => {
              if (!newGroup.trim()) return;
              void saveMember(async () => {
                await addGroup(p.id, newGroup.trim());
                setNewGroup('');
              });
            }}
          />
        </Card>
      )}
    </View>
  );
}

// ---------------- Chat ----------------

function ChatTab({ p }: { p: Production }) {
  const channels = useChannels(p.id);
  return (
    <View style={{ gap: 8 }}>
      {channels.map((info) => (
        <ChannelRow key={info.channel.id} info={info} production={p} />
      ))}
      <Txt v="small">Tip: tap the chat bubble next to anyone in the Company section to message them directly. Every chat is also in your Inbox.</Txt>
    </View>
  );
}

// ---------------- Tickets ----------------

/** This production's performances at a glance. Selling and comps are handled in the box office. */
function TicketsSummary({ p }: { p: Production }) {
  const user = useCurrentUser();
  const all = useStore((s) => s.performances);
  const performances = useMemo(() => all.filter((x) => x.productionId === p.id).sort((a, b) => a.start.localeCompare(b.start)), [all, p.id]);
  const now = new Date();
  const isOwner = user.role === 'owner';
  const upcoming = performances.filter((x) => new Date(x.start) >= now);
  if (!performances.length && !isOwner) return null;
  const totals = upcoming.reduce((t, x) => {
    const s = salesSummary(x.seats, now);
    return { sold: t.sold + s.sold + s.comp, sellable: t.sellable + s.sellable };
  }, { sold: 0, sellable: 0 });

  return (
    <Card>
      <Row>
        <Txt v="h3" style={{ flex: 1 }}>Performances</Txt>
        {upcoming.length > 0 && <Pill label={`${upcoming.length} upcoming`} color={C.curtain} bg={C.curtain + '22'} />}
      </Row>
      {upcoming.length > 0 && (
        <>
          <ProgressBar value={totals.sellable ? totals.sold / totals.sellable : 0} color={C.curtain} />
          <Txt v="small">{`${totals.sold} of ${totals.sellable} seats sold or comped across the run`}</Txt>
        </>
      )}
      {upcoming.slice(0, 4).map((perf) => {
        const s = salesSummary(perf.seats, now);
        return (
          <ListItem
            key={perf.id}
            icon="ticket-outline"
            iconColor={C.curtain}
            title={`${fmtDate(perf.start, { weekday: true })} · ${fmtTime(perf.start)}`}
            subtitle={`${perf.subtitle ? `${perf.subtitle} · ` : ''}${s.available} available`}
            onPress={() => router.push(`/performance/${perf.id}`)}
          />
        );
      })}
      {performances.length === 0 && <Txt v="small">No performances yet.</Txt>}
      {isOwner ? (
        <Row>
          <Button small style={{ flex: 1.35 }} variant="secondary" icon="add" title="Add performance" onPress={() => router.push(`/performance/new?productionId=${p.id}` as Href)} />
          <Button small style={{ flex: 1 }} variant="secondary" icon="briefcase-outline" title="Box office" onPress={() => router.navigate('/business?view=boxOffice' as Href)} />
        </Row>
      ) : (
        <Button small variant="secondary" icon="ticket-outline" title="Get tickets" onPress={() => router.navigate('/tickets')} />
      )}
    </Card>
  );
}
