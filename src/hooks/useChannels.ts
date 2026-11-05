import { useMemo } from 'react';

import type { Channel, Production, User } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';

export function canSeeChannel(c: Channel, prod: Production | undefined, user: User): boolean {
  if (!prod) return false;
  if (c.kind === 'direct') return !!c.memberIds?.includes(user.id);
  if (user.role === 'owner') return true;
  const m = prod.members.find((x) => x.userId === user.id);
  if (!m) return false;
  return !c.groupId || m.isDirector || m.groupIds.includes(c.groupId);
}

export function canPost(c: Channel, prod: Production | undefined, user: User): boolean {
  if (c.kind !== 'announcements') return true;
  return user.role === 'owner' || !!prod?.members.find((m) => m.userId === user.id)?.isDirector;
}

/** Channels for a production the current user can see, with unread counts and last message. */
export function useChannels(productionId?: string) {
  const user = useCurrentUser();
  const channels = useStore((s) => s.channels);
  const productions = useStore((s) => s.productions);
  const messages = useStore((s) => s.messages);
  const lastRead = useStore((s) => s.lastRead);
  const users = useStore((s) => s.users);

  return useMemo(() => {
    return channels
      .filter((c) => !productionId || c.productionId === productionId)
      .filter((c) => canSeeChannel(c, productions.find((p) => p.id === c.productionId), user))
      .map((c) => {
        const msgs = messages.filter((m) => m.channelId === c.id);
        const last = msgs[msgs.length - 1];
        const read = lastRead[`${user.id}:${c.id}`] ?? '';
        const unread = msgs.filter((m) => m.userId !== user.id && m.at > read).length;
        const other = c.kind === 'direct' ? users.find((u) => u.id === c.memberIds?.find((id) => id !== user.id)) : undefined;
        return { channel: c, last, unread, title: other ? other.name : c.name, other };
      })
      .sort((a, b) => {
        const order = { announcements: 0, group: 1, direct: 2 };
        if (order[a.channel.kind] !== order[b.channel.kind]) return order[a.channel.kind] - order[b.channel.kind];
        return (b.last?.at ?? '').localeCompare(a.last?.at ?? '');
      });
  }, [channels, productions, messages, lastRead, users, user, productionId]);
}
