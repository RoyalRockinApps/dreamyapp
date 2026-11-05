import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { Avatar, Empty, Txt } from '@/components/ui';
import { canPost, canSeeChannel } from '@/hooks/useChannels';
import { fmtTime, relativeDay, sameDay } from '@/lib/dates';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, R } from '@/theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const channel = useStore((s) => s.channels.find((c) => c.id === id));
  const production = useStore((s) => s.productions.find((p) => p.id === channel?.productionId));
  const allMessages = useStore((s) => s.messages);
  const users = useStore((s) => s.users);
  const send = useStore((s) => s.sendMessage);
  const markRead = useStore((s) => s.markRead);
  const [text, setText] = useState('');

  const messages = useMemo(() => allMessages.filter((m) => m.channelId === id), [allMessages, id]);
  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  useEffect(() => {
    if (channel) markRead(channel.id);
  }, [channel, messages.length, markRead]);

  if (!channel || !canSeeChannel(channel, production, user)) return <Empty icon="lock-closed-outline" title="Conversation not available" />;

  const other = channel.kind === 'direct' ? users.find((u) => u.id === channel.memberIds?.find((x) => x !== user.id)) : undefined;
  const title = other?.name ?? channel.name;
  const group = production?.groups.find((g) => g.id === channel.groupId);
  const memberCount = channel.kind === 'direct' ? 2 : channel.groupId ? production?.members.filter((m) => m.groupIds.includes(channel.groupId!) || m.isDirector).length : production?.members.length;
  const postable = canPost(channel, production, user);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title }} />
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Txt v="small">{`${production?.title ?? ''} · ${channel.kind === 'announcements' ? 'Directors post, everyone reads' : `${memberCount} members`}`}</Txt>
      </View>
      <FlatList
        inverted
        data={reversed}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 6 }}
        ListEmptyComponent={<Empty icon="chatbubbles-outline" title="Say hello 👋" body="Messages are visible to everyone in this channel." />}
        renderItem={({ item, index }) => {
          const mine = item.userId === user.id;
          const u = users.find((x) => x.id === item.userId);
          const older = reversed[index + 1];
          const showName = !mine && (!older || older.userId !== item.userId);
          const showDay = !older || !sameDay(older.at, item.at);
          return (
            <View>
              {showDay && <Txt v="small" style={{ textAlign: 'center', marginVertical: 10 }}>{relativeDay(item.at)}</Txt>}
              <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                {!mine && (showName ? <Avatar name={u?.name ?? '?'} color={u?.color} size={28} /> : <View style={{ width: 28 }} />)}
                <View style={{ maxWidth: '78%', gap: 2 }}>
                  {showName && <Txt v="small" color={u?.color}>{u?.name}</Txt>}
                  <View
                    style={{
                      backgroundColor: mine ? C.gold : channel.kind === 'announcements' ? C.goldSoft : C.surface2,
                      borderRadius: R.lg,
                      borderBottomRightRadius: mine ? 4 : R.lg,
                      borderBottomLeftRadius: mine ? R.lg : 4,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}>
                    <Txt color={mine ? '#1A1206' : C.text}>{item.text}</Txt>
                    <Txt v="small" color={mine ? '#5A4515' : C.faint} style={{ alignSelf: 'flex-end', fontSize: 10, marginTop: 2 }}>{fmtTime(item.at)}</Txt>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
      />
      {postable ? (
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 24, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'flex-end' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={`Message ${group ? group.name : title}`}
            placeholderTextColor={C.faint}
            multiline
            style={{ flex: 1, backgroundColor: C.surface2, color: C.text, borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120, fontSize: 15 }}
          />
          <Pressable
            disabled={!text.trim()}
            onPress={() => {
              send(channel.id, text);
              setText('');
            }}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: text.trim() ? C.gold : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="send" size={18} color={text.trim() ? '#1A1206' : C.faint} />
          </Pressable>
        </View>
      ) : (
        <View style={{ padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.border }}>
          <Txt v="small" style={{ textAlign: 'center' }}>Only directors can post announcements.</Txt>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
