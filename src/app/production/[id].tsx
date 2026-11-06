import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { Avatar, Button, Card, Chips, Collapsible, Empty, Field, ListItem, Pill, ProgressBar, Row, Screen, Segmented, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { useChannels } from '@/hooks/useChannels';
import { atMinutes, dayKey, fmtDate, fmtTime, relativeDay, timeAgo } from '@/lib/dates';
import { calledMemberIds, isCalled, memberConflictsFor } from '@/lib/scheduling';
import { salesSummary } from '@/lib/seating';
import type { MemberConflict, Production, Rsvp, ScheduleItem } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, F } from '@/theme';
import { alert } from '@/components/alert';

type Tab = 'schedule' | 'company' | 'chat' | 'tickets';

export default function ProductionHub() {
  const params = useLocalSearchParams<{ id: string; tab?: Tab; item?: string }>();
  const production = useStore((s) => s.productions.find((p) => p.id === params.id));
  const [tab, setTab] = useState<Tab>(params.tab ?? 'schedule');
  const channels = useChannels(params.id);
  const unread = channels.reduce((s, c) => s + c.unread, 0);

  if (!production) return <Empty icon="alert-circle-outline" title="Production not found" />;

  return (
    <Screen>
      <Stack.Screen options={{ title: production.title }} />
      <Txt v="small">{`Runs ${fmtDate(production.openingDate, { weekday: true })} – ${fmtDate(production.closingDate, { weekday: true })}`}</Txt>
      <Segmented
        options={['schedule', 'company', 'chat', 'tickets'] as const}
        value={tab}
        onChange={setTab}
        labels={{ schedule: 'Schedule', company: 'Company', chat: unread ? `Chat (${unread})` : 'Chat', tickets: 'Tickets' }}
      />
      {tab === 'schedule' && <ScheduleTab p={production} highlight={params.item} />}
      {tab === 'company' && <CompanyTab p={production} />}
      {tab === 'chat' && <ChatTab p={production} />}
      {tab === 'tickets' && <TicketsTab p={production} />}
    </Screen>
  );
}

// ---------------- Schedule ----------------

function ScheduleTab({ p, highlight }: { p: Production; highlight?: string }) {
  const user = useCurrentUser();
  const isOwner = user.role === 'owner' || !!p.members.find((m) => m.userId === user.id)?.isDirector;
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
  const groups = item.groupIds.length ? item.groupIds.map((g) => p.groups.find((x) => x.id === g)).filter(Boolean) : null;
  const isPast = new Date(item.end) < new Date();
  const kindColor = item.kind === 'Tech' || item.kind === 'Dress' ? C.curtain : item.kind === 'Call Time' ? C.gold : C.purple;

  return (
    <Card accent={kindColor} style={highlighted ? { borderColor: C.accent } : undefined} onPress={() => setOpen(!open)}>
      <Row>
        <Txt v="h3" style={{ flex: 1 }}>{item.title}</Txt>
        {canEdit && <Ionicons name="create-outline" size={20} color={C.accent} onPress={() => router.push(`/rehearsal/edit?id=${item.id}` as Href)} />}
      </Row>
      <Txt v="small">{`${fmtTime(item.start)}–${fmtTime(item.end)} · ${item.space} · ${groups ? groups.map((g) => g!.name).join(', ') : 'Full company'}`}</Txt>
      {canEdit && (
        <Txt v="small" color={clashes.length ? C.warn : C.muted}>
          {`${counts.yes}/${called.length} going${counts.none ? ` · ${counts.none} no reply` : ''}${clashes.length ? ` · ${clashes.length} conflict${clashes.length > 1 ? 's' : ''}` : ''}`}
        </Txt>
      )}
      {open && item.notes ? <Txt v="small">{item.notes}</Txt> : null}

      {amCalled && !canEdit && !isPast && (
        <Row>
          {(['yes', 'maybe', 'no'] as Rsvp[]).map((r) => (
            <Button key={r} small style={{ flex: 1 }} title={r === 'yes' ? 'Going' : r === 'maybe' ? 'Maybe' : "Can't"} variant={item.rsvps[user.id] === r ? (r === 'no' ? 'danger' : 'success') : 'secondary'} onPress={() => rsvp(item.id, user.id, r)} />
          ))}
        </Row>
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
  const users = useStore((s) => s.users);
  const addMember = useStore((s) => s.addMember);
  const addGroup = useStore((s) => s.addGroup);
  const setMemberGroups = useStore((s) => s.setMemberGroups);
  const openDirect = useStore((s) => s.openDirect);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [part, setPart] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const groupLabels = Object.fromEntries(p.groups.map((g) => [g.id, g.name]));
  const groupColors = Object.fromEntries(p.groups.map((g) => [g.id, g.color]));

  const message = (uid: string) => {
    const ch = openDirect(p.id, uid);
    router.push(`/chat/${ch}`);
  };

  const sections = [
    { id: '_dir', name: 'Directors & Staff', color: C.accent, members: p.members.filter((m) => m.isDirector) },
    ...p.groups.map((g) => ({ ...g, members: p.members.filter((m) => m.groupIds.includes(g.id) && !m.isDirector) })),
  ];

  return (
    <View style={{ gap: 12 }}>
      {isOwner && (
        <Row>
          <Button style={{ flex: 1 }} icon="person-add" title="Add member" onPress={() => setAdding(!adding)} />
        </Row>
      )}
      {adding && (
        <Card>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="They'll get an invite to join this production in the app." />
          <Field label="Role / part" value={part} onChangeText={setPart} placeholder="e.g. Santa, Spot Op" />
          <Txt v="label">Groups</Txt>
          <Chips multi options={p.groups.map((g) => g.id)} value={groupIds} onChange={(id) => setGroupIds(toggle(groupIds, id))} labels={groupLabels} colors={groupColors} />
          <Button
            title="Add to company"
            onPress={() => {
              if (!name.trim()) return alert('Name is required');
              addMember(p.id, { name: name.trim(), email: email.trim() }, groupIds, part.trim() || undefined);
              setName('');
              setEmail('');
              setPart('');
              setGroupIds([]);
              setAdding(false);
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
                  <Pressable onPress={() => isOwner && setEditing(editing === `${sec.id}:${u.id}` ? null : `${sec.id}:${u.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                    <Avatar name={u.name} color={u.color} />
                    <View style={{ flex: 1 }}>
                      <Txt v="h3">{u.name + (u.id === user.id ? ' (you)' : '')}</Txt>
                      {m.part ? <Txt v="small">{m.part}</Txt> : null}
                    </View>
                    {u.id !== user.id && <Ionicons name="chatbubble-ellipses-outline" size={22} color={C.accent} onPress={() => message(u.id)} />}
                  </Pressable>
                  {editing === `${sec.id}:${u.id}` && (
                    <View style={{ paddingBottom: 10 }}>
                      <Chips multi options={p.groups.map((g) => g.id)} value={m.groupIds} onChange={(id) => setMemberGroups(p.id, u.id, toggle(m.groupIds, id))} labels={groupLabels} colors={groupColors} />
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </View>
      ))}
      {isOwner && (
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
            onPress={() => {
              if (!newGroup.trim()) return;
              addGroup(p.id, newGroup.trim());
              setNewGroup('');
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
  const users = useStore((s) => s.users);
  return (
    <View style={{ gap: 8 }}>
      {channels.map(({ channel, last, unread, title, other }) => {
        const sender = last ? users.find((u) => u.id === last.userId) : undefined;
        const icon = channel.kind === 'announcements' ? 'megaphone' : channel.kind === 'direct' ? 'person' : 'chatbubbles';
        const group = p.groups.find((g) => g.id === channel.groupId);
        return (
          <Card key={channel.id} onPress={() => router.push(`/chat/${channel.id}`)} style={{ paddingVertical: 10 }}>
            <Row gap={12}>
              {other ? (
                <Avatar name={other.name} color={other.color} />
              ) : (
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: (group?.color ?? C.accent) + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={icon} size={18} color={group?.color ?? C.accent} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Row>
                  <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>{title}</Txt>
                  {last && <Txt v="small">{timeAgo(last.at)}</Txt>}
                </Row>
                <Txt v="small" numberOfLines={1}>{last ? `${sender?.name.split(' ')[0]}: ${last.text}` : 'No messages yet'}</Txt>
              </View>
              {unread > 0 && (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Txt v="small" color={C.onAccent} style={{ fontFamily: F.bold }}>{String(unread)}</Txt>
                </View>
              )}
            </Row>
          </Card>
        );
      })}
      <Txt v="small">Tip: tap the chat bubble next to anyone in the Company tab to message them directly.</Txt>
    </View>
  );
}

// ---------------- Tickets ----------------

function TicketsTab({ p }: { p: Production }) {
  const user = useCurrentUser();
  const performances = useStore((s) => s.performances).filter((x) => x.productionId === p.id).sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date();
  return (
    <View style={{ gap: 10 }}>
      {user.role === 'owner' && <Button icon="add" title="Add performance" onPress={() => router.push(`/performance/new?productionId=${p.id}` as Href)} />}
      {performances.length === 0 && <Empty icon="ticket-outline" title="No performances yet" />}
      {performances.map((perf) => {
        const s = salesSummary(perf.seats, now);
        return (
          <Card key={perf.id} onPress={() => router.push(`/performance/${perf.id}`)}>
            <Row>
              <Txt v="h3" style={{ flex: 1 }}>{`${fmtDate(perf.start, { weekday: true })} · ${fmtTime(perf.start)}`}</Txt>
              {perf.subtitle ? <Pill label={perf.subtitle} color={C.curtain} bg={C.curtain + '22'} /> : null}
            </Row>
            <ProgressBar value={(s.sold + s.comp) / s.sellable} color={C.curtain} />
            <Txt v="small">{`${s.sold} sold · ${s.comp} comps · ${s.available} available`}</Txt>
          </Card>
        );
      })}
    </View>
  );
}
