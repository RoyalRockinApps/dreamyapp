import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChannelRow } from '@/components/ChannelList';
import { Empty, Screen, Segmented, Txt } from '@/components/ui';
import { useChannels } from '@/hooks/useChannels';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

/** Every chat and announcement you can see, across all your productions, busiest first. */
export default function Inbox() {
  const channels = useChannels();
  const productions = useStore((s) => s.productions);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const unreadCount = channels.filter((c) => c.unread > 0).length;

  const sections = useMemo(() => {
    const shown = filter === 'unread' ? channels.filter((c) => c.unread > 0) : channels;
    const byProduction = new Map<string, typeof channels>();
    for (const c of shown) byProduction.set(c.channel.productionId, [...(byProduction.get(c.channel.productionId) ?? []), c]);
    const latest = (list: typeof channels) => list.reduce((at, c) => (c.last && c.last.at > at ? c.last.at : at), '');
    return [...byProduction.entries()]
      .map(([id, list]) => ({ production: productions.find((p) => p.id === id), list }))
      .filter((s) => !!s.production)
      .sort((a, b) => latest(b.list).localeCompare(latest(a.list)));
  }, [channels, filter, productions]);

  return (
    <Screen>
      <Segmented options={['all', 'unread'] as const} value={filter} onChange={setFilter} labels={{ all: 'All chats', unread: unreadCount ? `Unread (${unreadCount})` : 'Unread' }} />
      {sections.length === 0 && (
        <Empty
          icon={filter === 'unread' ? 'checkmark-done-outline' : 'chatbubbles-outline'}
          title={filter === 'unread' ? 'You’re all caught up' : 'No chats yet'}
          body={filter === 'unread' ? undefined : 'When a director adds you to a production, its announcements and group chats appear here.'}
        />
      )}
      {sections.map(({ production, list }) => (
        <View key={production!.id} style={{ gap: 8 }}>
          <Txt v="label" color={production!.color ?? C.accent}>{production!.title}</Txt>
          {list.map((info) => (
            <ChannelRow key={info.channel.id} info={info} production={production} />
          ))}
        </View>
      ))}
      {filter === 'all' && sections.length > 0 && <Txt v="small">To message someone directly, open their name in a production’s Company section.</Txt>}
    </Screen>
  );
}
