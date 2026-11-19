// Fiche d'un lot : entreprise (appel, email), dates prévues et réelles,
// avancement, réserves, tâches du planning et points de réunion ouverts.
import { useLocalSearchParams } from 'expo-router';
import { useAtomValue } from 'jotai';
import { Mail, Phone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, DetailHeader, LotIcon, ProgressBar, SectionTitle } from '../../components/chantier/ui';
import { C, F } from '../../constants/theme';
import {
  fetchLotStats,
  fetchLots,
  fetchPlanning,
  fetchProjectPoints,
  fmtDate,
  fmtPeriod,
  fmtShortDate,
  isLotLate,
  isTaskLate,
  todayISO,
} from '../../lib/chantier';
import { selectedProjectAtom } from '../../store/atoms';

export default function LotScreen() {
  const { id } = useLocalSearchParams();
  const project = useAtomValue(selectedProjectAtom);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!project?.id) return;
    (async () => {
      const [lotsRes, stats, planning, points] = await Promise.all([
        fetchLots(project.id),
        fetchLotStats(project.id).catch(() => ({})),
        fetchPlanning(project.id),
        fetchProjectPoints(project.id).catch(() => []),
      ]);
      setData({
        lot: lotsRes.lots.find((l) => l.id === id) ?? null,
        stats: stats[id] ?? { total: 0, open: 0, closed: 0, overdue: 0 },
        tasks: planning.tasks.filter((t) => t.lot_id === id),
        points: points.filter((p) => p.lot_id === id && p.statut === 'ouvert'),
      });
    })();
  }, [project?.id, id]);

  if (!data) {
    return (
      <View style={styles.screen}>
        <DetailHeader title="Lot" />
        <ActivityIndicator style={{ marginTop: 40 }} color={C.mine} />
      </View>
    );
  }
  const { lot, stats, tasks, points } = data;
  if (!lot) {
    return (
      <View style={styles.screen}>
        <DetailHeader title="Lot" />
        <Text style={styles.hint}>Ce lot n&apos;existe plus.</Text>
      </View>
    );
  }

  const today = todayISO();
  const late = isLotLate(lot, today);
  const e = lot.entreprises;

  return (
    <View style={styles.screen}>
      <DetailHeader title={lot.name} subtitle={project?.name} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <LotIcon icon={lot.icon} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{lot.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              {late && <Badge label="En retard" tone="alerte" />}
              {lot.date_fin_reelle && <Badge label={`Terminé le ${fmtDate(lot.date_fin_reelle)}`} tone="valide" />}
            </View>
          </View>
        </View>

        <Card style={{ marginTop: 16 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Avancement</Text>
            <Text style={[styles.big, late && { color: C.alerte }]}>{lot.avancement ?? 0} %</Text>
          </View>
          <ProgressBar value={lot.avancement ?? 0} late={late} height={8} grow={false} style={{ marginTop: 8 }} />
          <View style={styles.dates}>
            <DateCell label="Prévu" value={fmtPeriod(lot.date_debut_prevue, lot.date_fin_prevue) ?? 'Non planifié'} alert={late} />
            <DateCell label="Réel" value={fmtPeriod(lot.date_debut_reelle, lot.date_fin_reelle) ?? 'Pas commencé'} />
          </View>
          <Text style={styles.note}>Mis à jour à la diffusion de chaque réunion de chantier.</Text>
        </Card>

        <SectionTitle>Entreprise</SectionTitle>
        <Card>
          {e ? (
            <>
              <Text style={styles.ent}>{e.name}</Text>
              {e.corps_etat ? <Text style={styles.sub}>{e.corps_etat}</Text> : null}
              {e.contact_name ? <Text style={[styles.sub, { color: C.encre, marginTop: 6 }]}>{e.contact_name}</Text> : null}
              <View style={styles.contactRow}>
                {e.phone ? (
                  <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${e.phone.replace(/\s/g, '')}`)}>
                    <Phone size={16} color={C.encre} />
                    <Text style={styles.contactText}>{e.phone}</Text>
                  </Pressable>
                ) : null}
                {e.email ? (
                  <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`mailto:${e.email}`)}>
                    <Mail size={16} color={C.encre} />
                    <Text style={styles.contactText} numberOfLines={1}>Email</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={styles.sub}>Aucune entreprise attribuée (à faire depuis l&apos;application web).</Text>
          )}
        </Card>

        <SectionTitle>Réserves</SectionTitle>
        <Card style={styles.statsRow}>
          <Stat label="Ouvertes" value={stats.open} />
          <Stat label="Échues" value={stats.overdue} alert={stats.overdue > 0} />
          <Stat label="Levées" value={stats.closed} />
        </Card>

        {points.length > 0 && (
          <>
            <SectionTitle>Points de réunion ouverts</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {points.map((p, i) => (
                <View key={p.id} style={[styles.item, i > 0 && styles.divider]}>
                  <Text style={styles.itemText}><Text style={{ color: C.mineClair }}>{p.numero}. </Text>{p.texte}</Text>
                  {p.echeance ? (
                    <Text style={[styles.itemMeta, p.echeance < today && { color: C.alerte }]}>Pour le {fmtShortDate(p.echeance)}</Text>
                  ) : null}
                </View>
              ))}
            </Card>
          </>
        )}

        {tasks.length > 0 && (
          <>
            <SectionTitle>Planning</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {tasks.map((t, i) => (
                <View key={t.id} style={[styles.item, styles.rowBetween, i > 0 && styles.divider]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemText} numberOfLines={1}>{t.type === 'jalon' ? '◆ ' : ''}{t.libelle}</Text>
                    <Text style={[styles.itemMeta, isTaskLate(t, today) && { color: C.alerte }]}>
                      {t.type === 'jalon' ? fmtDate(t.date_debut) : fmtPeriod(t.date_debut, t.date_fin)}
                    </Text>
                  </View>
                  <Text style={styles.pct}>{t.type === 'jalon' ? (t.avancement >= 100 ? 'Atteint' : '') : `${t.avancement} %`}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DateCell({ label, value, alert }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.dateVal, alert && { color: C.alerte }]}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, alert }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.big, alert && { color: C.alerte }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.papier },
  content: { padding: 16, paddingBottom: 48 },
  hint: { fontFamily: F.regular, fontSize: 14, color: C.mineClair, textAlign: 'center', marginTop: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: F.semibold, fontSize: 22, color: C.encre, letterSpacing: -0.4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair },
  big: { fontFamily: F.semibold, fontSize: 22, color: C.encre, letterSpacing: -0.4 },
  dates: { flexDirection: 'row', gap: 12, marginTop: 14 },
  dateVal: { fontFamily: F.medium, fontSize: 14, color: C.encre, marginTop: 2 },
  note: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginTop: 12 },
  ent: { fontFamily: F.semibold, fontSize: 16, color: C.encre },
  sub: { fontFamily: F.regular, fontSize: 13.5, color: C.mine, marginTop: 2 },
  contactRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.filet, backgroundColor: C.papier },
  contactText: { fontFamily: F.medium, fontSize: 14, color: C.encre },
  statsRow: { flexDirection: 'row' },
  item: { paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: C.voile },
  itemText: { fontFamily: F.regular, fontSize: 14, color: C.encre, lineHeight: 19 },
  itemMeta: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair, marginTop: 2 },
  pct: { fontFamily: F.semibold, fontSize: 13, color: C.encre },
});
