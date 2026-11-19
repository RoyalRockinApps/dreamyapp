import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Children, useId, useState, type ComponentProps, type ReactNode } from 'react';
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
import Svg, { Defs, LinearGradient, Line as SvgLine, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { C, F, GLOW, R, SP } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

export function Screen({ children, padded = true, style }: { children: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <QuiltBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[padded && { padding: SP.lg, gap: SP.lg, paddingBottom: 56, width: '100%', maxWidth: 880, alignSelf: 'center' }, style]}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

/** SVG ids must be unique on the web page, where several screens stay mounted at once. */
function useSvgId(name: string) {
  return `${name}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * The screening room's walls: charcoal quilted in a fine diamond pattern, under one warm spotlight
 * from above (the website's stage). Fills its parent; draw it first so content sits on top.
 */
export function QuiltBackground({ spotlight = true }: { spotlight?: boolean }) {
  const quilt = useSvgId('quilt');
  const spot = useSvgId('spot');
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={quilt} width={28} height={40} patternUnits="userSpaceOnUse">
          <Path d="M0 0 L28 40 M28 0 L0 40" stroke="rgba(255,244,225,0.045)" strokeWidth={1} />
        </Pattern>
        <RadialGradient id={spot} cx="50%" cy="0%" rx="75%" ry="55%" fx="50%" fy="0%">
          <Stop offset="0" stopColor="#FFE3B0" stopOpacity={0.09} />
          <Stop offset="1" stopColor="#FFE3B0" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${quilt})`} />
      {spotlight ? <Rect width="100%" height="100%" fill={`url(#${spot})`} /> : null}
    </Svg>
  );
}

/** A warm LED strip: a hairline that glows when lit, or rests as a faint line when dim. */
export function LightLine({ dim, vertical, style }: { dim?: boolean; vertical?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        vertical ? { width: 1, alignSelf: 'stretch' } : { height: 1, alignSelf: 'stretch' },
        dim ? { backgroundColor: C.line } : { backgroundColor: C.accent, boxShadow: GLOW },
        style,
      ]}
    />
  );
}

/**
 * The screen wall: walnut panelling with LED inlay lines, framing a dark screen that holds the
 * content. For a screen's headline: the greeting on Home, the sign-in brand.
 */
export function ScreenWall({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const wood = useSvgId('wood');
  return (
    <View style={[styles.wall, style]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={wood} x1="0" y1="0" x2="1" y2="0.35">
            <Stop offset="0" stopColor={C.walnut} />
            <Stop offset="0.35" stopColor={C.walnutLight} />
            <Stop offset="0.6" stopColor={C.walnut} />
            <Stop offset="0.85" stopColor={C.walnutLight} />
            <Stop offset="1" stopColor={C.walnut} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${wood})`} />
        {[22, 46, 70, 94, 118, 142, 166, 190].map((y) => (
          <SvgLine key={y} x1="0" x2="100%" y1={y} y2={y} stroke="rgba(0,0,0,0.28)" strokeWidth={1} />
        ))}
        {[6, 11, 16].map((x, i) => (
          <SvgLine key={x} x1={x} x2={x} y1={8 + i * 10} y2="100%" stroke={C.accent} strokeOpacity={0.75 - i * 0.18} strokeWidth={1.2} />
        ))}
      </Svg>
      <View style={styles.screen}>{children}</View>
    </View>
  );
}

/** Header background for every navigator: the room's black with an LED line along its foot. */
export function HeaderBackdrop() {
  return <View style={{ flex: 1, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line }} />;
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

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// Headings follow thedreamtheatre.com: Adamina in letter-spaced capitals. Everything else is Cabin.
const txt = StyleSheet.create({
  display: { color: C.text, fontSize: 28, fontFamily: F.display, letterSpacing: 2, textTransform: 'uppercase' },
  h1: { color: C.text, fontSize: 22, fontFamily: F.display, letterSpacing: 1.5, textTransform: 'uppercase' },
  h2: { color: C.text, fontSize: 18, fontFamily: F.display, letterSpacing: 1, textTransform: 'uppercase' },
  h3: { color: C.text, fontSize: 16, fontFamily: F.semibold },
  body: { color: C.text, fontSize: 15, lineHeight: 22, fontFamily: F.regular },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20, fontFamily: F.regular },
  small: { color: C.muted, fontSize: 12.5, fontFamily: F.regular },
  label: { color: C.muted, fontSize: 11.5, fontFamily: F.bold, letterSpacing: 1.6, textTransform: 'uppercase' },
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
  // an accent is drawn as a lit LED strip down the card's left edge
  const body = (
    <View style={[styles.card, style]}>
      {accent ? <View pointerEvents="none" style={[styles.cardStrip, { backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }]} /> : null}
      {children}
    </View>
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
    primary: { bg: C.accent, fg: C.onAccent, border: C.accent },
    secondary: { bg: C.surface2, fg: C.text, border: C.line },
    ghost: { bg: 'transparent', fg: C.accent, border: 'transparent' },
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
        variant === 'primary' && !disabled ? { boxShadow: `0 0 18px ${C.glow}` } : null,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 18} color={palette.fg} />}
          <Text style={{ color: palette.fg, fontFamily: F.semibold, letterSpacing: 0.8, fontSize: small ? 13 : 15 }}>{title}</Text>
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
    <View style={[styles.pill, { backgroundColor: bg ?? C.accentSoft }]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={{ color, fontSize: 12, fontFamily: F.bold, letterSpacing: 0.4 }}>{label}</Text>
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
      <Text style={{ color, fontSize: 24, fontFamily: F.display, letterSpacing: 0.5 }}>{value}</Text>
      {sub ? <Txt v="small">{sub}</Txt> : null}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row gap={SP.md} style={{ marginTop: SP.sm, marginBottom: -SP.xs }}>
      <Txt v="label">{title}</Txt>
      <LightLine dim style={{ flex: 1, alignSelf: 'center' }} />
      {action && onAction ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={{ color: C.accent, fontFamily: F.bold, fontSize: 13, letterSpacing: 0.5 }}>{action}</Text>
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
        const col = colors?.[o] ?? C.accent;
        return (
          <Pressable
            key={o}
            onPress={() => {
              tap();
              onChange(o);
            }}
            style={[styles.chip, on && { backgroundColor: col + '26', borderColor: col }]}>
            {multi && on ? <Ionicons name="checkmark" size={14} color={col} /> : null}
            <Text style={{ color: on ? col : C.text, fontFamily: F.semibold, fontSize: 13 }}>{labels?.[o] ?? o}</Text>
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
            style={[styles.segmentItem, on && { backgroundColor: C.accent, boxShadow: `0 0 12px ${C.glow}` }]}>
            <Text style={{ color: on ? C.onAccent : C.muted, fontFamily: F.bold, fontSize: 13, letterSpacing: 0.5 }}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ name, color = C.leather, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color }}>
      <Text style={{ color, fontFamily: F.bold, fontSize: size * 0.38 }}>{initials || '?'}</Text>
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
  iconColor = C.accent,
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
        <View style={{ width: 36, height: 36, borderRadius: R.md, backgroundColor: iconColor + '22', alignItems: 'center', justifyContent: 'center' }}>
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

export function ProgressBar({ value, color = C.accent }: { value: number; color?: string }) {
  return (
    <View style={{ height: 6, backgroundColor: C.surface2, borderRadius: R.sm, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, height: '100%', backgroundColor: color, borderRadius: R.sm, boxShadow: `0 0 8px ${color}` }} />
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.md, padding: SP.lg, borderWidth: 1, borderColor: C.border, gap: SP.sm },
  cardStrip: { position: 'absolute', left: -1, top: SP.md, bottom: SP.md, width: 2, borderRadius: 1 },
  wall: { borderRadius: R.md, borderWidth: 1, borderColor: 'rgba(242,221,184,0.55)', boxShadow: '0 0 18px rgba(255,224,170,0.22)', paddingTop: 12, paddingRight: 12, paddingBottom: 12, paddingLeft: 26, overflow: 'hidden' },
  screen: { backgroundColor: 'rgba(9,9,10,0.9)', borderRadius: R.sm, borderWidth: 1, borderColor: '#000', padding: SP.lg, gap: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 18, borderRadius: R.sm, borderWidth: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm, alignSelf: 'flex-start' },
  input: { backgroundColor: '#0E0E10', borderRadius: R.sm, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: F.regular },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
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
      {value ? <Txt v="small" color={valueColor ?? C.muted} style={{ fontFamily: F.bold }}>{value}</Txt> : null}
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
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2, borderWidth: 1, borderColor: (it.color ?? C.accent) + '66', boxShadow: `0 0 12px ${(it.color ?? C.accent)}33`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={it.icon} size={22} color={it.color ?? C.accent} />
          </View>
          <Text style={{ color: C.muted, fontSize: 12, fontFamily: F.semibold, textAlign: 'center' }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
