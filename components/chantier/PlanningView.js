// Onglet Chantier › Planning : frise compacte par lot (prévu, réel, avancement)
// et liste des échéances. Les tâches se mettent à jour d'un geste (avancement).
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../../constants/theme';
import { daysBetween, fmtDate, fmtPeriod, isLotLate, isTaskLate, todayISO } from '../../lib/chantier';
import { Card, Empty, LotIcon, PrimaryButton, SectionTitle } from './ui';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export default function PlanningView({ lots, tasks, unavailable, canEdit, onTaskProgress }) {
  const today = todayISO();
  const [open, setOpen] = useState(() => new Set());
  const [editing, setEditing] = useState(null);

  // Étendue commune à toutes les frises : du plus tôt au plus tard, aujourd'hui inclus.
  const span = useMemo(() => {
    const dates = [today];
    for (const l of lots) for (const k of ['date_debut_prevue', 'date_fin_prevue', 'date_debut_reelle', 'date_fin_reelle']) l[k] && dates.push(l[k]);
    for (const t of tasks) dates.push(t.date_debut, t.date_fin);
    dates.sort();
    const start = dates[0];
    const end = dates[dates.length - 1];
    return { start, days: Math.max(daysBetween(start, end) + 1, 30) };
  }, [lots, tasks, today]);

  const pos = (iso) => `${Math.max(0, Math.min(100, (daysBetween(span.start, iso) / span.days) * 100))}%`;
  const len = (a, b) => `${Math.max(1.2, ((daysBetween(a, b) + 1) / span.days) * 100)}%`;

  // Repères de mois sur la règle.
  const months = useMemo(() => {
    const out = [];
    const [y0, m0] = span.start.split('-').map(Number);
    for (let y = y0, m = m0; ; m++) {
      if (m > 12) { m = 1; y++; }
      const iso = `${y}-${String(m).padStart(2, '0')}-01`;
      const d = daysBetween(span.start, iso);
      if (d >= span.days) break;
      if (d >= 0) out.push({ iso, left: (d / span.days) * 100, label: MONTHS[m - 1], year: m === 1 ? y : null });
    }
    // Mois de départ entamé : son initiale au bord gauche s'il reste de la place.
    if (!out.length || out[0].left > 5) out.unshift({ iso: span.start, left: 0, label: MONTHS[m0 - 1], year: null });
    return out;
  }, [span]);

  const upcoming = tasks
    .filter((t) => t.avancement < 100 && t.date_fin >= today && t.date_debut <= addDaysISO(today, 28))
    .sort((a, b) => a.date_debut.localeCompare(b.date_debut));
  const late = tasks.filter((t) => isTaskLate(t, today));
  const lotName = (id) => lots.find((l) => l.id === id)?.name ?? 'Généralités';

  if (unavailable) {
    return <Empty title="Planning indisponible" text="Le planning n'est pas encore activé pour cet espace." />;
  }
  if (!lots.length && !tasks.length) {
    return <Empty title="Aucun planning" text="Le planning se construit depuis l'application web (onglet Planning)." />;
  }

  const toggle = (id) => setOpen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <View>
      <Card style={{ paddingHorizontal: 12 }}>
        {/* Règle des mois */}
        <View style={styles.ruler}>
          {months.map((m) => (
            <Text key={m.iso} style={[styles.month, { left: `${m.left}%` }]}>{m.year ? `${m.label} ${String(m.year).slice(2)}` : m.label}</Text>
          ))}
        </View>
        {lots.map((lot) => {
          const isLate = isLotLate(lot, today);
          const realEnd = lot.date_fin_reelle ?? (lot.date_debut_reelle && lot.date_debut_reelle <= today ? today : null);
          const lotTasks = tasks.filter((t) => t.lot_id === lot.id);
          const expanded = open.has(lot.id);
          return (
            <View key={lot.id} style={styles.lotBlock}>
              <Pressable onPress={() => lotTasks.length && toggle(lot.id)} style={styles.lotHead}>
                <LotIcon icon={lot.icon} size={24} />
                <Text style={styles.lotName} numberOfLines={1}>{lot.name}</Text>
                <Text style={[styles.pct, isLate && { color: C.alerte }]}>{lot.avancement ?? 0} %</Text>
                {lotTasks.length > 0 && (expanded ? <ChevronDown size={16} color={C.mineClair} /> : <ChevronRight size={16} color={C.mineClair} />)}
              </Pressable>
              <View style={styles.lane}>
                {months.map((m) => <View key={m.iso} style={[styles.gridLine, { left: `${m.left}%` }]} />)}
                {lot.date_debut_prevue && lot.date_fin_prevue ? (
                  <View style={[styles.planned, isLate && { borderColor: C.alerte }, { left: pos(lot.date_debut_prevue), width: len(lot.date_debut_prevue, lot.date_fin_prevue) }]}>
                    <View style={{ width: `${lot.avancement ?? 0}%`, height: '100%', backgroundColor: isLate ? C.alerte : C.encre }} />
                  </View>
                ) : (
                  <Text style={styles.unplanned}>Non planifié</Text>
                )}
                {lot.date_debut_reelle && realEnd && (
                  <View style={[styles.real, { left: pos(lot.date_debut_reelle), width: len(lot.date_debut_reelle, realEnd), backgroundColor: lot.date_fin_prevue && realEnd > lot.date_fin_prevue ? C.alerte : C.valide }]} />
                )}
                <View style={[styles.today, { left: pos(today) }]} />
              </View>
              {expanded && lotTasks.map((t) => (
                <TaskLine key={t.id} task={t} pos={pos} len={len} today={today} months={months} onPress={() => setEditing(t)} />
              ))}
            </View>
          );
        })}
        <View style={styles.legend}>
          <Legend swatch={[styles.swatch, { borderWidth: 1.5, borderColor: C.encre }]} label="Prévu" />
          <Legend swatch={[styles.swatch, { backgroundColor: C.encre }]} label="Avancement" />
          <Legend swatch={[styles.swatch, { height: 3, backgroundColor: C.valide }]} label="Réel" />
          <Legend swatch={[styles.swatch, { width: 2, height: 10, backgroundColor: C.alerte }]} label="Aujourd'hui" />
        </View>
      </Card>

      {late.length > 0 && (
        <>
          <SectionTitle>En retard</SectionTitle>
          <TaskList tasks={late} lotName={lotName} today={today} onPress={setEditing} />
        </>
      )}
      <SectionTitle>Dans les 4 semaines</SectionTitle>
      {upcoming.length ? (
        <TaskList tasks={upcoming} lotName={lotName} today={today} onPress={setEditing} />
      ) : (
        <Text style={styles.none}>Rien de prévu dans les 4 prochaines semaines.</Text>
      )}

      <ProgressSheet
        task={editing}
        canEdit={canEdit}
        lotName={editing ? lotName(editing.lot_id) : ''}
        onClose={() => setEditing(null)}
        onSave={async (value) => {
          const ok = await onTaskProgress(editing, value);
          if (ok !== false) setEditing(null);
        }}
      />
    </View>
  );
}

function addDaysISO(iso, n) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

function TaskLine({ task: t, pos, len, today, months, onPress }) {
  const late = isTaskLate(t, today);
  return (
    <Pressable onPress={onPress} style={styles.taskLine}>
      <Text style={[styles.taskName, late && { color: C.alerte }]} numberOfLines={1}>{t.type === 'jalon' ? '◆ ' : ''}{t.libelle}</Text>
      <View style={[styles.lane, { height: 12 }]}>
        {months.map((m) => <View key={m.iso} style={[styles.gridLine, { left: `${m.left}%` }]} />)}
        {t.type === 'jalon' ? (
          <View style={[styles.diamond, { left: pos(t.date_debut), backgroundColor: t.avancement >= 100 ? C.valide : late ? C.alerte : C.encre }]} />
        ) : (
          <View style={[styles.taskBar, late && { borderColor: C.alerte }, { left: pos(t.date_debut), width: len(t.date_debut, t.date_fin) }]}>
            <View style={{ width: `${t.avancement}%`, height: '100%', backgroundColor: late ? C.alerte : C.tirage }} />
          </View>
        )}
        <View style={[styles.today, { left: pos(today) }]} />
      </View>
    </Pressable>
  );
}

function TaskList({ tasks, lotName, today, onPress }) {
  return (
    <Card style={{ paddingVertical: 4 }}>
      {tasks.map((t, i) => (
        <Pressable key={t.id} onPress={() => onPress(t)} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: C.voile }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.itemTitle} numberOfLines={1}>{t.type === 'jalon' ? '◆ ' : `${t.pin_number ?? ''} · `}{t.libelle}</Text>
            <Text style={[styles.itemMeta, isTaskLate(t, today) && { color: C.alerte }]} numberOfLines={1}>
              {lotName(t.lot_id)} · {t.type === 'jalon' ? fmtDate(t.date_debut) : fmtPeriod(t.date_debut, t.date_fin)}
            </Text>
          </View>
          <Text style={styles.itemPct}>{t.type === 'jalon' ? (t.avancement >= 100 ? 'Atteint' : '') : `${t.avancement} %`}</Text>
        </Pressable>
      ))}
    </Card>
  );
}

function ProgressSheet({ task, canEdit, lotName, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  if (!task) return null;
  const jalon = task.type === 'jalon';
  const steps = jalon ? [0, 100] : [0, 25, 50, 75, 100];
  const save = async (v) => {
    setSaving(true);
    await onSave(v);
    setSaving(false);
  };
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{task.libelle}</Text>
        <Text style={styles.sheetMeta}>{lotName} · {jalon ? fmtDate(task.date_debut) : fmtPeriod(task.date_debut, task.date_fin)}</Text>
        {!jalon && <Text style={styles.sheetMeta}>Tâche n° {task.pin_number} · aussi dans l’onglet Tâches{task.done ? ' (levée)' : ''}</Text>}
        {canEdit ? (
          <>
            <Text style={styles.sheetLabel}>{jalon ? 'Jalon' : 'Avancement'}</Text>
            <View style={styles.steps}>
              {steps.map((v) => (
                <Pressable key={v} disabled={saving} onPress={() => save(v)} style={[styles.step, task.avancement === v && styles.stepActive]}>
                  <Text style={[styles.stepText, task.avancement === v && { color: C.blanc }]}>{jalon ? (v ? 'Atteint' : 'À venir') : `${v} %`}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={[styles.sheetLabel, { marginBottom: 8 }]}>{jalon ? (task.avancement >= 100 ? 'Atteint' : 'À venir') : `Avancement : ${task.avancement} %`}</Text>
        )}
        <PrimaryButton label="Fermer" light onPress={onClose} style={{ marginTop: 16 }} />
      </View>
    </Modal>
  );
}

function Legend({ swatch, label }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={swatch} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ruler: { height: 18, position: 'relative', marginLeft: 0, marginBottom: 4 },
  month: { position: 'absolute', fontFamily: F.medium, fontSize: 10, color: C.mineClair, transform: [{ translateX: 2 }] },
  lotBlock: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.voile },
  lotHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  lotName: { flex: 1, fontFamily: F.semibold, fontSize: 14, color: C.encre },
  pct: { fontFamily: F.semibold, fontSize: 13, color: C.encre },
  lane: { height: 18, position: 'relative', justifyContent: 'center' },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: C.voile },
  planned: { position: 'absolute', top: 2, height: 9, borderRadius: 3, borderWidth: 1.5, borderColor: C.encre, backgroundColor: C.blanc, overflow: 'hidden' },
  real: { position: 'absolute', top: 13, height: 3, borderRadius: 2 },
  today: { position: 'absolute', top: -2, bottom: -2, width: 2, backgroundColor: C.alerte, opacity: 0.7 },
  unplanned: { fontFamily: F.regular, fontSize: 11.5, color: C.mineClair },
  taskLine: { paddingLeft: 32, paddingTop: 6 },
  taskName: { fontFamily: F.regular, fontSize: 12.5, color: C.mine, marginBottom: 3 },
  taskBar: { position: 'absolute', top: 2, height: 8, borderRadius: 3, borderWidth: 1, borderColor: C.tirage, backgroundColor: C.tiragePale, overflow: 'hidden' },
  diamond: { position: 'absolute', top: 1, width: 9, height: 9, transform: [{ rotate: '45deg' }], marginLeft: -4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.voile },
  swatch: { width: 16, height: 8, borderRadius: 2 },
  legendText: { fontFamily: F.regular, fontSize: 11.5, color: C.mine },
  none: { fontFamily: F.regular, fontSize: 14, color: C.mineClair },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  itemTitle: { fontFamily: F.medium, fontSize: 14, color: C.encre },
  itemMeta: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair, marginTop: 2 },
  itemPct: { fontFamily: F.semibold, fontSize: 13, color: C.encre },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { backgroundColor: C.papier, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetTitle: { fontFamily: F.semibold, fontSize: 18, color: C.encre },
  sheetMeta: { fontFamily: F.regular, fontSize: 13, color: C.mineClair, marginTop: 4 },
  sheetLabel: { fontFamily: F.medium, fontSize: 13, color: C.mine, marginTop: 18, marginBottom: 8 },
  steps: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  step: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.filet, backgroundColor: C.blanc },
  stepActive: { backgroundColor: C.encre, borderColor: C.encre },
  stepText: { fontFamily: F.semibold, fontSize: 14, color: C.encre },
});
