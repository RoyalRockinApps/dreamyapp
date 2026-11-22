import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Card, Row, Txt } from '@/components/ui';
import type { useChannels } from '@/hooks/useChannels';
import { timeAgo } from '@/lib/dates';
import type { Production } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C, F } from '@/theme';

type ChannelInfo = ReturnType<typeof useChannels>[number];

/** One chat in a list: who or what it is, the last message, and how many are unread. */
export function ChannelRow({ info, production }: { info: ChannelInfo; production?: Production }) {
  const users = useStore((s) => s.users);
  const { channel, last, unread, title, other } = info;
  const sender = last ? users.find((u) => u.id === last.userId) : undefined;
  const icon = channel.kind === 'announcements' ? 'megaphone' : channel.kind === 'direct' ? 'person' : 'chatbubbles';
  const group = production?.groups.find((g) => g.id === channel.groupId);
  return (
    <Card onPress={() => router.push(`/chat/${channel.id}`)} style={{ paddingVertical: 10 }}>
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
          <Txt v="small" numberOfLines={1}>{last ? `${sender?.name.split(' ')[0] ?? 'Someone'}: ${last.text}` : 'No messages yet'}</Txt>
        </View>
        {unread > 0 && (
          <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Txt v="small" color={C.onAccent} style={{ fontFamily: F.bold }}>{String(unread)}</Txt>
          </View>
        )}
      </Row>
    </Card>
  );
}
