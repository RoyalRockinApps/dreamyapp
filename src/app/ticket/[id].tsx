import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Card, Empty, KeyValue, Pill, Row, Screen, Txt } from '@/components/ui';
import { fmtDate, fmtTime, money } from '@/lib/dates';
import { seatById, seatLabel, TIER_LABEL } from '@/lib/seating';
import { useStore } from '@/store/useStore';
import { C, R } from '@/theme';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticket = useStore((s) => s.tickets.find((t) => t.id === id));
  const perf = useStore((s) => s.performances.find((p) => p.id === ticket?.performanceId));
  const order = useStore((s) => s.orders.find((o) => o.id === ticket?.orderId));
  const venue = useStore((s) => s.venue);

  if (!ticket || !perf) return <Empty icon="ticket-outline" title="Ticket not found" />;
  const seat = seatById(ticket.seatId);
  const doors = new Date(new Date(perf.start).getTime() - perf.doorsMins * 60000);

  return (
    <Screen>
      <View style={{ backgroundColor: C.surface, borderRadius: R.xl, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
        <View style={{ backgroundColor: C.curtain, padding: 20, gap: 4 }}>
          <Txt v="label" color="#FFD9DE">{venue.name}</Txt>
          <Txt v="h1" color="#fff">{perf.title}</Txt>
          {perf.subtitle ? <Txt color="#FFE7EA">{perf.subtitle}</Txt> : null}
        </View>
        <View style={{ padding: 20, gap: 14 }}>
          <Row gap={16}>
            <Info label="Date" value={fmtDate(perf.start, { weekday: true })} />
            <Info label="Curtain" value={fmtTime(perf.start)} />
            <Info label="Doors" value={fmtTime(doors)} />
          </Row>
          <Row gap={16}>
            <Info label="Row" value={seat?.row ?? '-'} big />
            <Info label="Seat" value={seat ? `${seat.section}${seat.number}` : '-'} big />
            <Info label="Section" value={seat?.section === 'C' ? 'Center' : seat?.section === 'L' ? 'House L' : 'House R'} />
          </Row>
          {seat && <Pill label={TIER_LABEL[seat.tier]} color={C.accent} bg={C.accentSoft} />}
          <View style={{ height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: C.border, marginVertical: 4 }} />
          <View style={{ alignItems: 'center', gap: 10 }}>
            {ticket.void ? (
              <Txt v="h2" color={C.danger}>VOID — refunded</Txt>
            ) : (
              <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: R.md, opacity: ticket.checkedInAt ? 0.35 : 1 }}>
                <QRCode value={ticket.code} size={190} />
              </View>
            )}
            <Txt v="mono">{ticket.code}</Txt>
            {ticket.checkedInAt ? (
              <Row>
                <Ionicons name="checkmark-circle" size={18} color={C.green} />
                <Txt color={C.green}>{`Checked in at ${fmtTime(ticket.checkedInAt)}`}</Txt>
              </Row>
            ) : (
              <Txt v="small">Show this code at the door. Brightness up!</Txt>
            )}
          </View>
        </View>
      </View>
      <Card>
        <KeyValue k="Seat" v={seatLabel(ticket.seatId)} />
        <KeyValue k="Price" v={money(ticket.price, true)} />
        {order && <KeyValue k="Purchased by" v={order.buyerName} />}
        <KeyValue k="Venue" v={venue.address} />
      </Card>
      <Button
        variant="secondary"
        icon="share-outline"
        title="Share ticket"
        onPress={() => Share.share({ message: `🎭 ${perf.title} — ${fmtDate(perf.start, { weekday: true, year: true })} ${fmtTime(perf.start)}\n${seatLabel(ticket.seatId)}\nTicket ${ticket.code}\n${venue.name}, ${venue.address}` })}
      />
    </Screen>
  );
}

function Info({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt v="label">{label}</Txt>
      <Txt v={big ? 'h1' : 'h3'}>{value}</Txt>
    </View>
  );
}
