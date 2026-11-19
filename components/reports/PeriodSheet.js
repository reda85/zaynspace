// Choix de la période d'un rapport : une feuille en bas d'écran qui liste les
// périodes avec leurs dates et le nombre d'éléments concernés, plus des dates
// précises (du / au) choisies au calendrier.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Calendar, Check, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../constants/theme';
import { PERIOD_PRESETS, fmtDay, isoDay, periodLabel, resolvePeriod } from '../../lib/reports';

const toDate = (iso) => (iso ? new Date(`${iso}T12:00:00`) : new Date());

/** Champ de date : calendrier natif (Android : fenêtre système, iOS : calendrier dans la feuille). */
function DateField({ label, value, min, max, open, onOpen, onChange }) {
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.dateLabel}>{label}</Text>
        <TextInput
          value={value ?? ''}
          onChangeText={(t) => onChange(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t : t || null)}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor={C.trait}
          style={styles.dateBox}
          accessibilityLabel={label}
        />
      </View>
    );
  }
  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'date',
        minimumDate: min ? toDate(min) : undefined,
        maximumDate: max ? toDate(max) : undefined,
        onChange: (event, d) => { if (event.type === 'set' && d) onChange(isoDay(d)); },
      });
    } else onOpen();
  };
  return (
    <TouchableOpacity style={{ flex: 1 }} onPress={press} accessibilityLabel={label}>
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={[styles.dateBox, open && { borderColor: C.encre }]}>
        <Calendar size={15} color={value ? C.encre : C.mineClair} />
        <Text style={[styles.dateText, !value && { color: C.mineClair }]}>{value ? fmtDay(value) : 'Choisir'}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PeriodSheet({ visible, onClose, title, preset, custom, lastReport, countFor, itemWord, onApply }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState({ start: null, end: null });
  const [picking, setPicking] = useState(null); // iOS : 'start' | 'end'

  useEffect(() => {
    if (!visible) return;
    setPicking(null);
    // Dates précises : on part de la période en cours, quelle qu'elle soit.
    const current = resolvePeriod(preset, { lastReport, custom });
    setDraft({ start: current?.start ?? null, end: current?.end ?? null });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = PERIOD_PRESETS.filter((p) => p.value !== 'custom' && (p.value !== 'since-last' || lastReport));
  const draftValid = (draft.start || draft.end) && !(draft.start && draft.end && draft.start > draft.end);
  const draftCount = draftValid ? countFor('custom', draft) : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
              <X size={20} color={C.mine} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {options.map((p) => {
              const period = resolvePeriod(p.value, { lastReport });
              const n = countFor(p.value);
              const on = preset === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.option, on && styles.optionOn]}
                  onPress={() => { onApply(p.value); onClose(); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{p.label}</Text>
                    <Text style={styles.optionSub}>{p.value === 'all' ? 'Sans limite de date' : periodLabel(period)}</Text>
                  </View>
                  <Text style={[styles.optionCount, !n && { color: C.mineClair }]}>{n} {itemWord(n)}</Text>
                  {on ? <Check size={18} color={C.encre} /> : <View style={{ width: 18 }} />}
                </TouchableOpacity>
              );
            })}

            {/* Dates précises */}
            <View style={[styles.custom, preset === 'custom' && styles.optionOn]}>
              <Text style={styles.optionLabel}>Dates précises</Text>
              <View style={styles.dates}>
                <DateField
                  label="Du" value={draft.start} max={draft.end} open={picking === 'start'}
                  onOpen={() => setPicking(picking === 'start' ? null : 'start')}
                  onChange={(v) => setDraft((d) => ({ ...d, start: v }))}
                />
                <ChevronRight size={16} color={C.mineClair} style={{ marginTop: 26 }} />
                <DateField
                  label="Au" value={draft.end} min={draft.start} open={picking === 'end'}
                  onOpen={() => setPicking(picking === 'end' ? null : 'end')}
                  onChange={(v) => setDraft((d) => ({ ...d, end: v }))}
                />
              </View>
              {Platform.OS === 'ios' && picking && (
                <DateTimePicker
                  value={toDate(draft[picking])}
                  mode="date"
                  display="inline"
                  locale="fr-FR"
                  themeVariant="light"
                  accentColor={C.tirage}
                  minimumDate={picking === 'end' && draft.start ? toDate(draft.start) : undefined}
                  maximumDate={picking === 'start' && draft.end ? toDate(draft.end) : undefined}
                  onChange={(event, d) => { if (d) setDraft((x) => ({ ...x, [picking]: isoDay(d) })); }}
                  style={{ alignSelf: 'stretch' }}
                />
              )}
              <View style={styles.customFoot}>
                <Text style={styles.optionSub}>
                  {draft.start && draft.end && draft.start > draft.end
                    ? 'La date de fin précède la date de début.'
                    : draftValid ? `${draftCount} ${itemWord(draftCount)}` : 'Choisissez au moins une date.'}
                </Text>
                <TouchableOpacity
                  style={[styles.apply, !draftValid && { opacity: 0.4 }]}
                  disabled={!draftValid}
                  onPress={() => { onApply('custom', draft); onClose(); }}
                >
                  <Text style={styles.applyText}>Appliquer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28,28,26,0.35)' },
  sheet: { backgroundColor: C.blanc, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 14, maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontFamily: F.semibold, fontSize: 16, color: C.encre },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  optionOn: { backgroundColor: C.survol, borderColor: C.filet },
  optionLabel: { fontFamily: F.medium, fontSize: 14.5, color: C.encre },
  optionSub: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair, marginTop: 2 },
  optionCount: { fontFamily: F.medium, fontSize: 13, color: C.mine },
  custom: { marginTop: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.filet },
  dates: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  dateLabel: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginBottom: 4 },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.filet, backgroundColor: C.papier, fontFamily: F.medium, fontSize: 14, color: C.encre },
  dateText: { fontFamily: F.medium, fontSize: 14, color: C.encre },
  customFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  apply: { backgroundColor: C.encre, borderRadius: 10, paddingHorizontal: 16, height: 38, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontFamily: F.semibold, fontSize: 14, color: C.blanc },
});
