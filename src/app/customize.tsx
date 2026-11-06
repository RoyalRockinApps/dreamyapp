import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';

import { SHORTCUT_META } from '@/components/HomeWidgets';
import { Button, Group, Screen, SectionHeader, Txt, tap } from '@/components/ui';
import { DEFAULT_LAYOUT, MAX_SHORTCUTS, moveItem, SHORTCUTS, WIDGET_INFO, WIDGETS, type HomeLayout, type ShortcutId, type WidgetId } from '@/lib/home';
import { useCurrentUser, useHomeLayout, useStore } from '@/store/useStore';
import { C, R } from '@/theme';

export default function CustomizeHome() {
  const user = useCurrentUser();
  const layout = useHomeLayout();
  const setHomeLayout = useStore((s) => s.setHomeLayout);
  const save = (next: HomeLayout) => setHomeLayout(user.id, next);

  const catalog = WIDGETS[user.role] as readonly WidgetId[];
  const hidden = catalog.filter((w) => !layout.widgets.includes(w));

  const toggle = (id: WidgetId, on: boolean) => save({ ...layout, widgets: on ? [...layout.widgets, id] : layout.widgets.filter((w) => w !== id) });
  const move = (i: number, d: number) => save({ ...layout, widgets: moveItem(layout.widgets, i, d) });
  const toggleShortcut = (id: ShortcutId) => {
    const on = layout.shortcuts.includes(id);
    if (!on && layout.shortcuts.length >= MAX_SHORTCUTS) return;
    save({ ...layout, shortcuts: on ? layout.shortcuts.filter((s) => s !== id) : [...layout.shortcuts, id] });
  };
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT[user.role]);

  return (
    <Screen>
      <Txt v="muted">Choose what shows on your home screen and in what order. Changes save as you go.</Txt>

      <SectionHeader title="On your home screen" />
      {layout.widgets.length === 0 ? (
        <Txt v="small">Nothing yet — switch on a section below.</Txt>
      ) : (
        <Group>
          {layout.widgets.map((id, i) => (
            <WidgetRow key={id} id={id} on onToggle={(v) => toggle(id, v)} onUp={i > 0 ? () => move(i, -1) : undefined} onDown={i < layout.widgets.length - 1 ? () => move(i, 1) : undefined} />
          ))}
        </Group>
      )}

      {hidden.length > 0 && (
        <>
          <SectionHeader title="More sections" />
          <Group>
            {hidden.map((id) => (
              <WidgetRow key={id} id={id} on={false} onToggle={(v) => toggle(id, v)} />
            ))}
          </Group>
        </>
      )}

      {catalog.includes('shortcuts') && layout.widgets.includes('shortcuts') && (
        <>
          <SectionHeader title={`Shortcuts · ${layout.shortcuts.length}/${MAX_SHORTCUTS}`} />
          <Txt v="small">Tap to add or remove. They appear in the order you pick them.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {SHORTCUTS.map((id) => {
              const m = SHORTCUT_META[id];
              const on = layout.shortcuts.includes(id);
              const full = !on && layout.shortcuts.length >= MAX_SHORTCUTS;
              return (
                <Pressable
                  key={id}
                  disabled={full}
                  onPress={() => {
                    tap();
                    toggleShortcut(id);
                  }}
                  style={{
                    width: 84,
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: R.md,
                    borderWidth: 1,
                    borderColor: on ? m.color : C.border,
                    backgroundColor: on ? m.color + '1F' : C.surface,
                    opacity: full ? 0.35 : 1,
                  }}>
                  <Ionicons name={m.icon} size={20} color={on ? m.color : C.muted} />
                  <Txt v="small" color={on ? C.text : C.muted}>{m.label}</Txt>
                  {on ? <Txt v="small" color={m.color} style={{ fontSize: 10, fontWeight: '800' }}>{String(layout.shortcuts.indexOf(id) + 1)}</Txt> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <View style={{ gap: 8, marginTop: 8 }}>
        <Button title="Done" icon="checkmark" onPress={() => router.back()} />
        {!isDefault && <Button variant="ghost" title="Reset to default" onPress={() => setHomeLayout(user.id, null)} />}
      </View>
    </Screen>
  );
}

function WidgetRow({ id, on, onToggle, onUp, onDown }: { id: WidgetId; on: boolean; onToggle: (v: boolean) => void; onUp?: () => void; onDown?: () => void }) {
  const info = WIDGET_INFO[id];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
      {on && (
        <View style={{ gap: 2 }}>
          <Arrow icon="chevron-up" onPress={onUp} label={`Move ${info.title} up`} />
          <Arrow icon="chevron-down" onPress={onDown} label={`Move ${info.title} down`} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt v="h3">{info.title}</Txt>
        <Txt v="small">{info.blurb}</Txt>
      </View>
      <Switch accessibilityLabel={`Show ${info.title}`} value={on} onValueChange={onToggle} trackColor={{ true: C.gold, false: C.surface2 }} />
    </View>
  );
}

function Arrow({ icon, onPress, label }: { icon: 'chevron-up' | 'chevron-down'; onPress?: () => void; label: string }) {
  return (
    <Pressable accessibilityLabel={label} disabled={!onPress} hitSlop={6} onPress={() => { tap(); onPress?.(); }} style={{ opacity: onPress ? 1 : 0.2 }}>
      <Ionicons name={icon} size={18} color={C.gold} />
    </Pressable>
  );
}
