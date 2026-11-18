import { router } from 'expo-router';
import { useMemo } from 'react';

import { PRODUCTION_STAGE_STYLE } from '@/components/ProductionStage';
import { Card, ListItem, Txt } from '@/components/ui';
import { canSeeChannel } from '@/hooks/useChannels';
import { productionStageLabel } from '@/lib/production';
import type { Message } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';

export function ProductionUpdates() {
  const user = useCurrentUser();
  const channels = useStore((s) => s.channels);
  const productions = useStore((s) => s.productions);
  const messages = useStore((s) => s.messages);
  const lastRead = useStore((s) => s.lastRead);

  const updates = useMemo(() => {
    const byChannel = new Map(channels.filter((c) => c.kind === 'announcements').map((c) => [c.id, c]));
    const byProduction = new Map(productions.map((p) => [p.id, p]));
    const latest = new Map<string, { message: Message & { productionStage: NonNullable<Message['productionStage']> }; title: string }>();
    for (const message of messages) {
      const stage = message.productionStage;
      if (!stage || message.userId === user.id || message.at <= (lastRead[`${user.id}:${message.channelId}`] ?? '')) continue;
      const channel = byChannel.get(message.channelId);
      const production = channel && byProduction.get(channel.productionId);
      if (!channel || !production || !canSeeChannel(channel, production, user)) continue;
      const previous = latest.get(production.id);
      if (!previous || message.at > previous.message.at) latest.set(production.id, { message: { ...message, productionStage: stage }, title: production.title });
    }
    return [...latest.values()].sort((a, b) => b.message.at.localeCompare(a.message.at));
  }, [channels, lastRead, messages, productions, user]);

  if (!updates.length) return null;
  return (
    <Card>
      <Txt v="h3">New production updates</Txt>
      {updates.map(({ message, title }) => {
        const { icon, color } = PRODUCTION_STAGE_STYLE[message.productionStage];
        return <ListItem key={message.id} title={title} subtitle={productionStageLabel(message.productionStage)} icon={icon} iconColor={color} onPress={() => router.push(`/chat/${message.channelId}`)} />;
      })}
    </Card>
  );
}
