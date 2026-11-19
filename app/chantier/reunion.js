// Réunion de chantier sur le terrain : présences, avancement des lots, points
// à suivre (suivi, solder, nouveaux points) et diffusion. Une réunion diffusée
// se consulte en lecture seule.
import Slider from '@react-native-community/slider';
import { useLocalSearchParams } from 'expo-router';
import { useAtomValue } from 'jotai';
import { Check, Plus, RotateCcw, Send } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Badge, Card, DetailHeader, LotIcon, PrimaryButton, SectionTitle, Segmented } from '../../components/chantier/ui';
import { C, F } from '../../constants/theme';
import {
  ETATS, POINT_TYPES, PRESENCES,
  createPoint, diffuseMeeting, fetchEntreprises, fetchLots, fetchMeeting, fetchPreviousProgress, fetchProjectPoints,
  fmtLongDate, fmtShortDate, pointsForMeeting, saveProgress, saveSuivi, todayISO, updateAttendee, updateMeeting, updatePoint,
} from '../../lib/chantier';
import { isOnline } from '../../lib/offline';
import { isReadOnlyRole } from '../../lib/projectLists';
import { loggedInUserAtom, selectedProjectAtom } from '../../store/atoms';

const PRESENCE_OPTIONS = Object.entries(PRESENCES).map(([value, label]) => ({ value, label }));
const TYPE_OPTIONS = Object.entries(POINT_TYPES).map(([value, label]) => ({ value, label }));
const ETAT_TONE = { nouveau: 'tirage', en_cours: 'neutre', solde: 'valide' };

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export default function ReunionScreen() {
  const { id } = useLocalSearchParams();
  const project = useAtomValue(selectedProjectAtom);
  const user = useAtomValue(loggedInUserAtom);
  const [meeting, setMeeting] = useState(null);
  const [lots, setLots] = useState([]);
  const [points, setPoints] = useState([]);
  const [entreprises, setEntreprises] = useState([]);
  const [prev, setPrev] = useState({});
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(null); // lot (ou { general: true }) pour lequel on ajoute un point
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!project?.id || !id) return;
    const [{ meeting: m }, lotsRes, pts, ents] = await Promise.all([
      fetchMeeting(id),
      fetchLots(project.id),
      fetchProjectPoints(project.id),
      fetchEntreprises(project.organization_id ?? user?.organization_id).catch(() => []),
    ]);
    setMeeting(m);
    setLots(lotsRes.lots);
    setPoints(pts);
    setEntreprises(ents);
    if (m) setPrev(await fetchPreviousProgress(project.id, m.numero).catch(() => ({})));
  }, [project?.id, project?.organization_id, user?.organization_id, id]);

  useEffect(() => { load(); }, [load]);

  const canEdit = Boolean(user) && !isReadOnlyRole(user.role);
  const editable = canEdit && meeting?.statut === 'brouillon';
  const agenda = useMemo(() => (meeting ? pointsForMeeting(points, meeting) : []), [points, meeting]);

  // Toute écriture : en ligne seulement, avec mise à jour locale d'abord.
  const write = async (fn) => {
    if (!isOnline()) {
      setError('Hors ligne : la modification n’a pas été enregistrée.');
      return false;
    }
    try {
      const out = await fn();
      setError(null);
      return out ?? true;
    } catch (err) {
      console.error('[reunion] enregistrement', err);
      setError('Une modification n’a pas pu être enregistrée.');
      load();
      return false;
    }
  };

  const patchMeeting = (fields) => {
    setMeeting((m) => ({ ...m, ...fields }));
    return write(() => updateMeeting(id, fields));
  };
  const setPresence = (a, presence) => {
    setMeeting((m) => ({ ...m, meeting_attendees: m.meeting_attendees.map((x) => (x.id === a.id ? { ...x, presence } : x)) }));
    return write(() => updateAttendee(a.id, { presence }));
  };
  const setProgress = (lot, fields) => {
    const row = meeting.meeting_lot_progress.find((p) => p.lot_id === lot.id);
    const next = { avancement: row?.avancement ?? lot.avancement ?? 0, commentaire: row?.commentaire ?? null, ...fields };
    setMeeting((m) => ({
      ...m,
      meeting_lot_progress: row
        ? m.meeting_lot_progress.map((p) => (p.lot_id === lot.id ? { ...p, ...next } : p))
        : [...m.meeting_lot_progress, { meeting_id: id, lot_id: lot.id, ...next }],
    }));
    return write(() => saveProgress(id, lot.id, next));
  };
  const replacePoint = (p) => setPoints((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]));
  const togglePoint = async (p) => {
    const fields = p.etat === 'solde' ? { statut: 'ouvert', clos_meeting_id: null } : { statut: 'clos', clos_meeting_id: id };
    setPoints((list) => list.map((x) => (x.id === p.id ? { ...x, ...fields, cloture: fields.clos_meeting_id ? { id, numero: meeting.numero, date: meeting.date } : null } : x)));
    const saved = await write(() => updatePoint(p.id, fields));
    if (saved && saved !== true) replacePoint(saved);
  };
  const setSuivi = (p, texte) => {
    setPoints((list) => list.map((x) => {
      if (x.id !== p.id) return x;
      const others = (x.meeting_point_suivis ?? []).filter((s) => s.meeting_id !== id);
      return { ...x, meeting_point_suivis: texte.trim() ? [...others, { meeting_id: id, texte: texte.trim() }] : others };
    }));
    return write(() => saveSuivi(p.id, id, texte));
  };
  const addPoint = async (fields) => {
    const saved = await write(() => createPoint({ ...fields, project_id: project.id, meeting_id: id }));
    if (saved && saved !== true) replacePoint(saved);
    return saved;
  };
  const diffuse = async () => {
    setBusy(true);
    const ok = await write(() => diffuseMeeting(id));
    setBusy(false);
    setConfirming(false);
    if (ok) load();
  };

  if (!meeting) {
    return (
      <View style={styles.screen}>
        <DetailHeader title="Réunion" />
        <ActivityIndicator style={{ marginTop: 40 }} color={C.mine} />
      </View>
    );
  }

  const groups = [
    { key: 'general', lot: null, title: 'Généralités', items: agenda.filter((p) => !lots.some((l) => l.id === p.lot_id)) },
    ...lots.map((l) => ({ key: l.id, lot: l, title: l.name, items: agenda.filter((p) => p.lot_id === l.id) })),
  ];
  const present = meeting.meeting_attendees.filter((a) => a.presence === 'present').length;
  const openCount = agenda.filter((p) => p.etat !== 'solde').length;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DetailHeader
        title={`Réunion n° ${meeting.numero}`}
        subtitle={fmtLongDate(meeting.date)}
        right={meeting.statut === 'brouillon' ? <Badge label="Brouillon" tone="tirage" /> : <Badge label="Diffusée" />}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!editable && meeting.statut === 'brouillon' && !canEdit ? (
          <Text style={styles.note}>Lecture seule : votre rôle ne permet pas de modifier la réunion.</Text>
        ) : null}

        {/* Présents */}
        <SectionTitle right={<Text style={styles.count}>{present}/{meeting.meeting_attendees.length}</Text>}>Présents</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {meeting.meeting_attendees.length === 0 ? (
            <Text style={[styles.note, { paddingVertical: 10 }]}>Aucun participant.</Text>
          ) : meeting.meeting_attendees.map((a, i) => (
            <View key={a.id} style={[styles.attendee, i > 0 && styles.divider]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.strong} numberOfLines={1}>{a.societe ?? a.nom}</Text>
                {a.societe && a.nom ? <Text style={styles.meta} numberOfLines={1}>{a.nom}</Text> : null}
              </View>
              {editable ? (
                <Segmented small fit value={a.presence} options={PRESENCE_OPTIONS} onChange={(v) => setPresence(a, v)} />
              ) : (
                <Text style={[styles.meta, a.presence !== 'present' && { color: C.alerte }]}>{PRESENCES[a.presence]}</Text>
              )}
            </View>
          ))}
        </Card>

        {/* Avancement */}
        <SectionTitle>Avancement des lots</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {lots.map((lot, i) => (
            <ProgressRow
              key={lot.id}
              lot={lot}
              row={meeting.meeting_lot_progress.find((p) => p.lot_id === lot.id)}
              prev={prev[lot.id]}
              editable={editable}
              first={i === 0}
              onChange={(fields) => setProgress(lot, fields)}
            />
          ))}
        </Card>

        {/* Observations */}
        <SectionTitle>Observations générales</SectionTitle>
        {editable ? (
          <BlurInput
            multiline
            value={meeting.observations ?? ''}
            placeholder="Météo, effectifs, sécurité, approvisionnements…"
            onCommit={(t) => patchMeeting({ observations: t.trim() || null })}
            style={[styles.input, { minHeight: 80 }]}
          />
        ) : (
          <Text style={styles.body}>{meeting.observations || '—'}</Text>
        )}

        {/* Points */}
        <SectionTitle right={<Text style={styles.count}>{openCount} à suivre</Text>}>Points à suivre</SectionTitle>
        {groups.map((g) => (g.items.length === 0 && !editable ? null : (
          <View key={g.key} style={{ marginBottom: 12 }}>
            <View style={styles.groupHead}>
              {g.lot ? <LotIcon icon={g.lot.icon} size={22} /> : <View style={styles.genIcon}><Text style={styles.genText}>G</Text></View>}
              <Text style={styles.groupTitle} numberOfLines={1}>{g.title}</Text>
              {editable && (
                <Pressable onPress={() => setAdding(g.lot ?? { general: true })} hitSlop={8} style={styles.addBtn} accessibilityRole="button" accessibilityLabel={`Ajouter un point : ${g.title}`}>
                  <Plus size={15} color={C.mine} />
                  <Text style={styles.addText}>Point</Text>
                </Pressable>
              )}
            </View>
            {g.items.sort((a, b) => a.numero - b.numero).map((p) => (
              <PointCard key={p.id} point={p} editable={editable} entreprises={entreprises} meeting={meeting}
                onToggle={() => togglePoint(p)} onSuivi={(t) => setSuivi(p, t)} />
            ))}
          </View>
        )))}

        {/* Prochaine réunion */}
        <SectionTitle>Prochaine réunion</SectionTitle>
        {editable ? (
          <View style={styles.chips}>
            {[7, 14].map((n) => {
              const d = addDays(meeting.date, n);
              return (
                <Chip key={n} label={`${n === 7 ? 'Dans 1 semaine' : 'Dans 2 semaines'} (${fmtShortDate(d)})`} active={meeting.prochaine_date === d}
                  onPress={() => patchMeeting({ prochaine_date: d, prochaine_heure: meeting.prochaine_heure ?? meeting.heure ?? null })} />
              );
            })}
            <Chip label="À fixer" active={!meeting.prochaine_date} onPress={() => patchMeeting({ prochaine_date: null })} />
          </View>
        ) : (
          <Text style={styles.body}>{meeting.prochaine_date ? fmtLongDate(meeting.prochaine_date) : 'Date à fixer'}</Text>
        )}

        {editable && (
          <PrimaryButton
            label="Diffuser le compte rendu"
            icon={<Send size={17} color={C.blanc} />}
            onPress={() => setConfirming(true)}
            style={{ marginTop: 28 }}
          />
        )}
        {meeting.statut === 'diffusee' && (
          <Text style={[styles.note, { marginTop: 20 }]}>
            Diffusée le {new Date(meeting.diffusee_at).toLocaleDateString('fr-FR')}. Le compte rendu PDF s&apos;imprime depuis l&apos;application web.
          </Text>
        )}
      </ScrollView>

      <AddPointSheet
        target={adding}
        entreprises={entreprises}
        meeting={meeting}
        onClose={() => setAdding(null)}
        onSave={async (fields) => {
          const ok = await addPoint({ ...fields, lot_id: adding?.general ? null : adding?.id });
          if (ok) setAdding(null);
        }}
      />
      <Sheet visible={confirming} onClose={() => setConfirming(false)}>
        <Text style={styles.sheetTitle}>Diffuser la réunion n° {meeting.numero} ?</Text>
        <Text style={[styles.body, { marginTop: 8 }]}>
          La réunion sera figée, l&apos;avancement des lots mis à jour, et {openCount} point{openCount > 1 ? 's' : ''} non soldé{openCount > 1 ? 's' : ''} {openCount > 1 ? 'seront repris' : 'sera repris'} à la prochaine réunion.
        </Text>
        <PrimaryButton label={busy ? 'Diffusion…' : 'Diffuser'} disabled={busy} onPress={diffuse} style={{ marginTop: 18 }} />
        <PrimaryButton label="Annuler" light onPress={() => setConfirming(false)} style={{ marginTop: 8 }} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function ProgressRow({ lot, row, prev, editable, first, onChange }) {
  const value = row?.avancement ?? lot.avancement ?? 0;
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const delta = prev == null ? null : local - prev;
  return (
    <View style={[styles.progress, !first && styles.divider]}>
      <View style={styles.rowCenter}>
        <LotIcon icon={lot.icon} size={24} />
        <Text style={styles.strong} numberOfLines={1}>{lot.name}</Text>
        <View style={{ flex: 1 }} />
        {delta ? <Text style={[styles.meta, { color: delta > 0 ? C.valide : C.alerte }]}>{delta > 0 ? '+' : ''}{delta}</Text> : null}
        <Text style={styles.pct}>{local} %</Text>
      </View>
      {editable ? (
        <>
          <Slider
            style={{ marginTop: 4, height: 36 }}
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={value}
            onValueChange={setLocal}
            onSlidingComplete={(v) => v !== value && onChange({ avancement: v })}
            minimumTrackTintColor={C.tirage}
            maximumTrackTintColor={C.filet}
            thumbTintColor={C.tirage}
            accessibilityLabel={`Avancement du lot ${lot.name}`}
          />
          <BlurInput
            value={row?.commentaire ?? ''}
            placeholder="Commentaire (ouvrages en cours, retard…)"
            onCommit={(t) => onChange({ commentaire: t.trim() || null })}
            style={[styles.input, { paddingVertical: 8, fontSize: 13.5 }]}
          />
        </>
      ) : row?.commentaire ? (
        <Text style={[styles.meta, { marginTop: 4 }]}>{row.commentaire}</Text>
      ) : null}
    </View>
  );
}

function PointCard({ point: p, editable, entreprises, meeting, onToggle, onSuivi }) {
  const late = p.etat !== 'solde' && p.echeance && p.echeance < meeting.date;
  const solde = p.etat === 'solde';
  return (
    <View style={[styles.point, solde && { backgroundColor: C.survol }]}>
      <View style={styles.rowCenter}>
        <Text style={styles.num}>{p.numero}</Text>
        <Badge label={ETATS[p.etat]} tone={ETAT_TONE[p.etat]} />
        <Text style={styles.meta}>{POINT_TYPES[p.type]}</Text>
        <View style={{ flex: 1 }} />
        {editable && (
          <Pressable onPress={onToggle} style={[styles.solder, solde && styles.rouvrir]} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${solde ? 'Rouvrir' : 'Solder'} le point ${p.numero}`}>
            {solde ? <RotateCcw size={14} color={C.mine} /> : <Check size={14} color={C.valide} />}
            <Text style={[styles.solderText, solde && { color: C.mine }]}>{solde ? 'Rouvrir' : 'Solder'}</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.body, { marginTop: 6 }, solde && { color: C.mine, textDecorationLine: 'line-through' }]}>{p.texte}</Text>
      <Text style={[styles.meta, { marginTop: 4 }]}>
        {entreprises.find((e) => e.id === p.entreprise_id)?.name ?? 'Sans responsable'}
        {p.echeance ? <Text style={late ? { color: C.alerte } : null}> · pour le {fmtShortDate(p.echeance)}</Text> : null}
      </Text>
      {p.etat !== 'nouveau' && (editable ? (
        <BlurInput
          value={p.suivi}
          placeholder="Suivi de ce jour (où en est-on ?)…"
          onCommit={onSuivi}
          style={[styles.input, { marginTop: 8, paddingVertical: 8, fontSize: 13.5 }]}
        />
      ) : p.suivi ? (
        <Text style={[styles.body, { marginTop: 6, fontSize: 13.5 }]}><Text style={styles.meta}>Suivi : </Text>{p.suivi}</Text>
      ) : null)}
    </View>
  );
}

function AddPointSheet({ target, entreprises, meeting, onClose, onSave }) {
  const [type, setType] = useState('action');
  const [texte, setTexte] = useState('');
  const [resp, setResp] = useState(null);
  const [echeance, setEcheance] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setType('action');
    setTexte('');
    setResp(target.entreprise_id ?? null);
    setEcheance(meeting?.prochaine_date ?? null);
  }, [target, meeting?.prochaine_date]);

  if (!target) return null;
  const options = [
    { label: 'Sans', value: null },
    { label: '+1 sem.', value: addDays(meeting.date, 7) },
    { label: '+2 sem.', value: addDays(meeting.date, 14) },
    { label: '+1 mois', value: addDays(meeting.date, 30) },
  ];
  const submit = async () => {
    if (!texte.trim()) return;
    setSaving(true);
    await onSave({ type, texte: texte.trim(), entreprise_id: resp, echeance });
    setSaving(false);
  };

  return (
    <Sheet visible onClose={onClose}>
      <Text style={styles.sheetTitle}>Nouveau point · {target.general ? 'Généralités' : target.name}</Text>
      <Segmented value={type} options={TYPE_OPTIONS} onChange={setType} style={{ marginTop: 14 }} />
      <TextInput
        autoFocus
        multiline
        value={texte}
        onChangeText={setTexte}
        placeholder="Ce qui a été dit, demandé ou décidé…"
        placeholderTextColor={C.trait}
        style={[styles.input, { minHeight: 84, marginTop: 12 }]}
      />
      <Text style={styles.sheetLabel}>Responsable</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Aucun" active={!resp} onPress={() => setResp(null)} />
        {entreprises.map((e) => <Chip key={e.id} label={e.name} active={resp === e.id} onPress={() => setResp(e.id)} />)}
      </ScrollView>
      <Text style={styles.sheetLabel}>Échéance{echeance ? ` · ${fmtShortDate(echeance)}` : ''}</Text>
      <View style={styles.chips}>
        {options.map((o) => <Chip key={o.label} label={o.label} active={echeance === o.value} onPress={() => setEcheance(o.value)} />)}
        {meeting.prochaine_date && !options.some((o) => o.value === meeting.prochaine_date) && (
          <Chip label="Prochaine réunion" active={echeance === meeting.prochaine_date} onPress={() => setEcheance(meeting.prochaine_date)} />
        )}
      </View>
      <PrimaryButton label={saving ? 'Enregistrement…' : 'Ajouter le point'} disabled={saving || !texte.trim()} onPress={submit} style={{ marginTop: 18 }} />
      <PrimaryButton label="Annuler" light onPress={onClose} style={{ marginTop: 8 }} />
    </Sheet>
  );
}

/** Champ enregistré à la sortie s'il a changé. */
function BlurInput({ value, onCommit, style, ...props }) {
  const [local, setLocal] = useState(value);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setLocal(value); }, [value]);
  return (
    <TextInput
      value={local}
      onFocus={() => { editing.current = true; }}
      onChangeText={setLocal}
      onBlur={() => {
        editing.current = false;
        if ((local ?? '') !== (value ?? '')) onCommit(local ?? '');
      }}
      placeholderTextColor={C.trait}
      style={style}
      {...props}
    />
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: C.blanc }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Sheet({ visible, onClose, children }) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>{children}</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.papier },
  content: { padding: 16, paddingBottom: 60 },
  error: { fontFamily: F.medium, fontSize: 13.5, color: C.alerte, backgroundColor: C.alertePale, padding: 10, borderRadius: 10, marginBottom: 4 },
  note: { fontFamily: F.regular, fontSize: 13, color: C.mineClair },
  count: { fontFamily: F.medium, fontSize: 13, color: C.mineClair },
  attendee: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: C.voile },
  strong: { fontFamily: F.semibold, fontSize: 14.5, color: C.encre },
  meta: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair },
  body: { fontFamily: F.regular, fontSize: 14.5, color: C.encre, lineHeight: 20 },
  progress: { paddingVertical: 12 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pct: { fontFamily: F.semibold, fontSize: 14, color: C.encre, minWidth: 44, textAlign: 'right' },
  input: { backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.regular, fontSize: 14.5, color: C.encre, textAlignVertical: 'top' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  groupTitle: { flex: 1, fontFamily: F.semibold, fontSize: 14.5, color: C.encre },
  genIcon: { width: 22, height: 22, borderRadius: 6, backgroundColor: C.voile, alignItems: 'center', justifyContent: 'center' },
  genText: { fontFamily: F.semibold, fontSize: 11, color: C.mine },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: C.filet, backgroundColor: C.blanc },
  addText: { fontFamily: F.medium, fontSize: 13, color: C.mine },
  point: { backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet, borderRadius: 12, padding: 12, marginBottom: 8 },
  num: { fontFamily: F.semibold, fontSize: 13, color: C.mine, minWidth: 18 },
  solder: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.valide },
  rouvrir: { borderColor: C.filet },
  solderText: { fontFamily: F.semibold, fontSize: 12.5, color: C.valide },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: C.filet, backgroundColor: C.blanc },
  chipActive: { backgroundColor: C.encre, borderColor: C.encre },
  chipText: { fontFamily: F.medium, fontSize: 13, color: C.encre },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { backgroundColor: C.papier, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontFamily: F.semibold, fontSize: 18, color: C.encre },
  sheetLabel: { fontFamily: F.medium, fontSize: 13, color: C.mine, marginTop: 16, marginBottom: 8 },
});
