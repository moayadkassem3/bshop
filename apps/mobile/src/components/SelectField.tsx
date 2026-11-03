import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '@/lib/theme';
import { Icon } from './Icon';
import { Text } from './ui';

/**
 * A choice from a list (the website's <select>): a field that opens a sheet
 * from the bottom, with search for long lists such as il and ilçe.
 */
export function SelectField(props: {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6, flex: props.compact ? undefined : 1 }}>
      {props.label ? (
        <Text size={14} weight="semibold" color={colors.ink2}>
          {props.label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.title ?? props.label}
        disabled={props.disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, props.compact && styles.compact, props.disabled && { opacity: 0.5 }]}
      >
        <Text weight={props.compact ? 'bold' : 'regular'} color={props.value ? colors.ink : colors.muted} style={{ flex: 1 }} numberOfLines={1}>
          {props.value || props.placeholder || 'Seçin'}
        </Text>
        {props.compact ? null : (
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Icon name="chevron" size={16} color={colors.muted} />
          </View>
        )}
      </Pressable>
      {open ? (
        <Sheet
          title={props.title ?? props.label ?? ''}
          options={props.options}
          value={props.value}
          searchable={props.searchable}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            setOpen(false);
            props.onChange(v);
          }}
        />
      ) : null}
    </View>
  );
}

function Sheet(props: { title: string; options: string[]; value: string; searchable?: boolean; onClose: () => void; onPick: (v: string) => void }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return q ? props.options.filter((o) => o.toLocaleLowerCase('tr-TR').includes(q)) : props.options;
  }, [props.options, query]);
  const initial = Math.max(0, props.options.indexOf(props.value));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={props.onClose} accessibilityLabel="Kapat" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.grab} />
        <Text size={18} weight="heavy" style={{ paddingHorizontal: 16 }}>
          {props.title}
        </Text>
        {props.searchable ? (
          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Ara" placeholderTextColor={colors.muted} style={styles.searchInput} autoCorrect={false} />
          </View>
        ) : null}
        <FlatList
          data={shown}
          keyExtractor={(o) => o}
          initialScrollIndex={query || initial < 4 ? undefined : initial - 3}
          getItemLayout={(_, i) => ({ length: 52, offset: 52 * i, index: i })}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const on = item === props.value;
            return (
              <Pressable onPress={() => props.onPick(item)} style={({ pressed }) => [styles.row, on && { backgroundColor: colors.primarySoft }, pressed && { backgroundColor: colors.surface2 }]}>
                <Text weight={on ? 'bold' : 'regular'} color={on ? colors.primary : colors.ink} style={{ flex: 1 }}>
                  {item}
                </Text>
                {on ? <Text color={colors.primary}>✓</Text> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text color={colors.muted} style={{ padding: 16 }}>
              Sonuç yok.
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  compact: { minHeight: 42, paddingHorizontal: 12, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(14,16,19,0.45)' },
  sheet: { maxHeight: '75%', gap: 10, paddingTop: 8, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 8 },
  row: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
});
