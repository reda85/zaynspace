// Onglet Chantier › Réunions : liste des réunions et points à suivre.
import { useRouter } from 'expo-router';
import { ChevronRight, FilePlus2, FileText } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '../../constants/theme';
import { fmtLongDate, fmtShortDate, todayISO } from '../../lib/chantier';
import { Kpi } from './LotsView';
import { Badge, Card, Empty, PrimaryButton, SectionTitle } from './ui';

export default function ReunionsView({ meetings, points, lots, entreprises, canEdit, creating, onCreate }) {
  const router = useRouter();
  const today = todayISO();
  const draft = meetings.find((m) => m.statut === 'brouillon');
  const open = points.filter((p) => p.statut === 'ouvert');
  const overdue = open.filter((p) => p.echeance && p.echeance < today).sort((a, b) => a.echeance.localeCompare(b.echeance));
  const lotName = (id) => lots.find((l) => l.id === id)?.name ?? 'Généralités';
  const entrepriseName = (id) => entreprises.find((e) => e.id === id)?.name;

  const perMeeting = {};
  for (const p of points) {
    if (p.ouverture) (perMeeting[p.ouverture.id] ??= { nouveaux: 0, soldes: 0 }).nouveaux++;
    if (p.cloture) (perMeeting[p.cloture.id] ??= { nouveaux: 0, soldes: 0 }).soldes++;
  }

  const openMeeting = (id) => router.push({ pathname: '/chantier/reunion', params: { id } });

  return (
    <View>
      {canEdit && (
        <PrimaryButton
          label={draft ? `Reprendre la réunion n° ${draft.numero}` : creating ? 'Préparation…' : 'Nouvelle réunion'}
          icon={draft ? <FileText size={18} color={C.blanc} /> : <FilePlus2 size={18} color={C.blanc} />}
          disabled={creating}
          onPress={() => (draft ? openMeeting(draft.id) : onCreate())}
          style={{ marginTop: 4 }}
        />
      )}

      {meetings.length === 0 ? (
        <Empty
          title="Aucune réunion"
          text="Préparez la réunion de chantier : les entreprises des lots sont convoquées et les points non soldés passent d'une réunion à la suivante."
        />
      ) : (
        <>
          <View style={[styles.kpis, { marginTop: 14 }]}>
            <Kpi label="Points ouverts" value={open.length} />
            <Kpi label="En retard" value={overdue.length} alert={overdue.length > 0} />
          </View>

          {overdue.length > 0 && (
            <>
              <SectionTitle>En retard</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {overdue.slice(0, 5).map((p, i) => (
                  <View key={p.id} style={[styles.overdue, i > 0 && styles.divider]}>
                    <Text style={styles.pointText} numberOfLines={2}><Text style={styles.numInline}>{p.numero}. </Text>{p.texte}</Text>
                    <Text style={styles.meta}>
                      {lotName(p.lot_id)} · {entrepriseName(p.entreprise_id) ?? 'Sans responsable'} · <Text style={{ color: C.alerte }}>{fmtShortDate(p.echeance)}</Text>
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          <SectionTitle>Réunions</SectionTitle>
          <View style={{ gap: 10 }}>
            {meetings.map((m) => {
              const st = perMeeting[m.id] ?? { nouveaux: 0, soldes: 0 };
              return (
                <Card key={m.id} onPress={() => openMeeting(m.id)}>
                  <View style={styles.row}>
                    <View style={styles.num}>
                      <Text style={styles.numLabel}>N°</Text>
                      <Text style={styles.numValue}>{m.numero}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.date} numberOfLines={1}>{fmtLongDate(m.date)}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {st.nouveaux} nouveau{st.nouveaux > 1 ? 'x' : ''} · {st.soldes} soldé{st.soldes > 1 ? 's' : ''}{m.lieu ? ` · ${m.lieu}` : ''}
                      </Text>
                    </View>
                    {m.statut === 'brouillon' ? <Badge label="Brouillon" tone="tirage" /> : <Badge label="Diffusée" />}
                    <ChevronRight size={18} color={C.mineClair} />
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  num: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.filet, backgroundColor: C.papier, alignItems: 'center', justifyContent: 'center' },
  numLabel: { fontFamily: F.regular, fontSize: 9.5, color: C.mineClair, lineHeight: 11 },
  numValue: { fontFamily: F.semibold, fontSize: 17, color: C.encre, lineHeight: 20 },
  date: { fontFamily: F.semibold, fontSize: 15, color: C.encre },
  meta: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair, marginTop: 2 },
  overdue: { paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: C.voile },
  numInline: { fontFamily: F.semibold, color: C.mine },
  pointText: { fontFamily: F.regular, fontSize: 14, color: C.encre, lineHeight: 19 },
});
