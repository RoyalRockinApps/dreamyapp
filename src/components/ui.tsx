import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { C, R, SP } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

export function Screen({ children, padded = true, style }: { children: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={[padded && { padding: SP.lg, gap: SP.lg, paddingBottom: 56, width: '100%', maxWidth: 880, alignSelf: 'center' }, style]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

type TxtVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'muted' | 'small' | 'label' | 'mono';

export function Txt({
  v = 'body',
  style,
  children,
  numberOfLines,
  color,
}: {
  v?: TxtVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  color?: string;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[txt[v], color ? { color } : null, style]}>
      {children}
    </Text>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const txt = StyleSheet.create({
  display: { color: C.text, fontSize: 30, fontWeight: '700', fontFamily: serif, letterSpacing: 0.3 },
  h1: { color: C.text, fontSize: 24, fontWeight: '700', fontFamily: serif },
  h2: { color: C.text, fontSize: 19, fontWeight: '700' },
  h3: { color: C.text, fontSize: 16, fontWeight: '600' },
  body: { color: C.text, fontSize: 15, lineHeight: 21 },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20 },
  small: { color: C.muted, fontSize: 12 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  mono: { color: C.text, fontSize: 15, fontFamily: mono, letterSpacing: 1 },
});

export function Card({
  children,
  style,
  onPress,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accent?: string;
}) {
  const body = (
    <View style={[styles.card, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style]}>{children}</View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Row({ children, style, gap = SP.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Spacer() {
  return <View style={{ flex: 1 }} />;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: C.gold, fg: '#1A1206', border: C.gold },
    secondary: { bg: C.surface2, fg: C.text, border: C.border },
    ghost: { bg: 'transparent', fg: C.gold, border: 'transparent' },
    danger: { bg: C.dangerSoft, fg: C.danger, border: 'transparent' },
    success: { bg: C.green, fg: '#06140C', border: C.green },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        small && { paddingVertical: 8, paddingHorizontal: 12 },
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 18} color={palette.fg} />}
          <Text style={{ color: palette.fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color = C.text, size = 22 }: { icon: IconName; onPress: () => void; color?: string; size?: number }) {
  return (
    <Pressable hitSlop={10} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Pill({ label, color = C.muted, bg, icon }: { label: string; color?: string; bg?: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg ?? 'rgba(255,255,255,0.06)' }]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Stat({ label, value, sub, color = C.text, icon }: { label: string; value: string; sub?: string; color?: string; icon?: IconName }) {
  return (
    <View style={[styles.card, { flex: 1, minWidth: 140, gap: 4 }]}>
      <Row gap={6}>
        {icon && <Ionicons name={icon} size={14} color={C.muted} />}
        <Txt v="label">{label}</Txt>
      </Row>
      <Text style={{ color, fontSize: 24, fontWeight: '800' }}>{value}</Text>
      {sub ? <Txt v="small">{sub}</Txt> : null}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ marginTop: SP.sm, marginBottom: -SP.xs }}>
      <Txt v="label">{title}</Txt>
      <Spacer />
      {action && onAction ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={{ color: C.gold, fontWeight: '700', fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function Field({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt v="label">{label}</Txt>
      <TextInput
        placeholderTextColor={C.faint}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, error ? { borderColor: C.danger } : null, style]}
      />
      {error ? <Txt v="small" color={C.danger}>{error}</Txt> : hint ? <Txt v="small">{hint}</Txt> : null}
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  multi,
  labels,
  colors,
}: {
  options: readonly T[];
  value: T | T[] | undefined;
  onChange: (v: T) => void;
  multi?: boolean;
  labels?: Partial<Record<T, string>>;
  colors?: Partial<Record<T, string>>;
}) {
  const selected = (o: T) => (multi ? (value as T[]).includes(o) : value === o);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = selected(o);
        const col = colors?.[o] ?? C.gold;
        return (
          <Pressable
            key={o}
            onPress={() => {
              tap();
              onChange(o);
            }}
            style={[styles.chip, on && { backgroundColor: col + '26', borderColor: col }]}>
            {multi && on ? <Ionicons name="checkmark" size={14} color={col} /> : null}
            <Text style={{ color: on ? col : C.text, fontWeight: '600', fontSize: 13 }}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => {
              tap();
              onChange(o);
            }}
            style={[styles.segmentItem, on && { backgroundColor: C.surface2 }]}>
            <Text style={{ color: on ? C.gold : C.muted, fontWeight: '700', fontSize: 13 }}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ name, color = C.gold, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color }}>
      <Text style={{ color, fontWeight: '800', fontSize: size * 0.38 }}>{initials || '?'}</Text>
    </View>
  );
}

export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: SP.xl, gap: SP.sm }}>
      <Ionicons name={icon} size={40} color={C.faint} />
      <Txt v="h3">{title}</Txt>
      {body ? <Txt v="muted" style={{ textAlign: 'center' }}>{body}</Txt> : null}
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: SP.xs }} />;
}

export function KeyValue({ k, v, strong, color }: { k: string; v: string; strong?: boolean; color?: string }) {
  return (
    <Row>
      <Txt v={strong ? 'h3' : 'muted'} style={{ flex: 1 }}>{k}</Txt>
      <Txt v={strong ? 'h3' : 'body'} color={color}>{v}</Txt>
    </Row>
  );
}

export function ListItem({
  icon,
  iconColor = C.gold,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.7 }]}>
      {icon && (
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: iconColor + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3" numberOfLines={2}>{title}</Txt>
        {subtitle ? <Txt v="small" numberOfLines={2}>{subtitle}</Txt> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={C.faint} /> : null}
    </Pressable>
  );
}

export function ProgressBar({ value, color = C.gold }: { value: number; color?: string }) {
  return (
    <View style={{ height: 8, backgroundColor: C.surface2, borderRadius: 4, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: SP.lg, borderWidth: 1, borderColor: C.border, gap: SP.sm },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 18, borderRadius: R.md, borderWidth: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  input: { backgroundColor: C.surface2, borderRadius: R.md, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.md, padding: 4, borderWidth: 1, borderColor: C.border },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: R.sm },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingVertical: 10 },
});

/** A titled section whose body is hidden until tapped. Keeps secondary detail out of the way. */
export function Collapsible({ title, subtitle, children, defaultOpen = false, icon }: { title: string; subtitle?: string; children: ReactNode; defaultOpen?: boolean; icon?: IconName }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          tap();
          setOpen(!open);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon && <Ionicons name={icon} size={18} color={C.muted} />}
        <View style={{ flex: 1 }}>
          <Txt v="h3">{title}</Txt>
          {subtitle && !open ? <Txt v="small" numberOfLines={1}>{subtitle}</Txt> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.faint} />
      </Pressable>
      {open ? <View style={{ gap: SP.sm, marginTop: SP.xs }}>{children}</View> : null}
    </View>
  );
}

/** One card holding a list of rows separated by hairlines. */
export function Group({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, { paddingVertical: 4, gap: 0 }]}>
      {items.map((c, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border } : undefined}>
          {c}
        </View>
      ))}
    </View>
  );
}

/** Compact two-line row: colored dot, title + one line of detail, short value on the right. */
export function Line({ title, detail, value, valueColor, dot, onPress }: { title: string; detail?: string; value?: string; valueColor?: string; dot?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3" numberOfLines={1}>{title}</Txt>
        {detail ? <Txt v="small" numberOfLines={1}>{detail}</Txt> : null}
      </View>
      {value ? <Txt v="small" color={valueColor ?? C.muted} style={{ fontWeight: '700' }}>{value}</Txt> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={C.faint} /> : null}
    </Pressable>
  );
}

/** Row of round icon shortcuts. */
export function Shortcuts({ items }: { items: { icon: IconName; label: string; onPress: () => void; color?: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          onPress={() => {
            tap();
            it.onPress();
          }}
          style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: (it.color ?? C.gold) + '1F', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={it.icon} size={22} color={it.color ?? C.gold} />
          </View>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
