// Onglet Chantier › Lots : avancement, entreprise, période et réserves de chaque lot.
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '../../constants/theme';
import { daysBetween, fmtPeriod, isLotLate, todayISO } from '../../lib/chantier';
import { Badge, Card, Empty, LotIcon, ProgressBar, SectionTitle } from './ui';

export function globalProgress(lots) {
  let weight = 0;
  let sum = 0;
  for (const l of lots) {
    const w = l.date_debut_prevue && l.date_fin_prevue ? daysBetween(l.date_debut_prevue, l.date_fin_prevue) + 1 : 0;
    weight += w;
    sum += w * (l.avancement ?? 0);
  }
  if (weight) return Math.round(sum / weight);
  return lots.length ? Math.round(lots.reduce((n, l) => n + (l.avancement ?? 0), 0) / lots.length) : 0;
}

export default function LotsView({ lots, stats }) {
  const router = useRouter();
  const today = todayISO();
  const late = lots.filter((l) => isLotLate(l, today)).length;
  const openTotal = lots.reduce((n, l) => n + (stats?.[l.id]?.open ?? 0), 0);

  if (!lots.length) {
    return <Empty title="Aucun lot" text="Les lots se créent depuis l'application web (Lots et entreprises)." />;
  }

  return (
    <View>
      <View style={styles.kpis}>
        <Kpi label="Avancement" value={`${globalProgress(lots)} %`} />
        <Kpi label="En retard" value={late} alert={late > 0} />
        <Kpi label="Réserves" value={openTotal} />
      </View>

      <SectionTitle>{lots.length} lot{lots.length > 1 ? 's' : ''}</SectionTitle>
      <View style={{ gap: 10 }}>
        {lots.map((lot) => {
          const st = stats?.[lot.id];
          const isLate = isLotLate(lot, today);
          const period = fmtPeriod(lot.date_debut_prevue, lot.date_fin_prevue);
          return (
            <Card key={lot.id} onPress={() => router.push({ pathname: '/chantier/lot', params: { id: lot.id } })}>
              <View style={styles.row}>
                <LotIcon icon={lot.icon} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{lot.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{lot.entreprises?.name ?? 'Sans entreprise'}</Text>
                </View>
                {isLate ? <Badge label="En retard" tone="alerte" /> : lot.date_fin_reelle ? <Badge label="Terminé" tone="valide" /> : null}
                <ChevronRight size={18} color={C.mineClair} />
              </View>
              <View style={[styles.row, { marginTop: 12 }]}>
                <ProgressBar value={lot.avancement ?? 0} late={isLate} />
                <Text style={styles.pct}>{lot.avancement ?? 0} %</Text>
              </View>
              <View style={[styles.row, { marginTop: 8, justifyContent: 'space-between' }]}>
                <Text style={[styles.meta, isLate && { color: C.alerte }]}>{period ?? 'Non planifié'}</Text>
                <Text style={styles.meta}>
                  {st?.open ?? 0} réserve{(st?.open ?? 0) > 1 ? 's' : ''} ouverte{(st?.open ?? 0) > 1 ? 's' : ''}
                  {st?.overdue ? <Text style={{ color: C.alerte }}> · {st.overdue} échue{st.overdue > 1 ? 's' : ''}</Text> : null}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

export function Kpi({ label, value, alert }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.kpiValue, alert && { color: C.alerte }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: 8, marginTop: 4 },
  kpi: { flex: 1, backgroundColor: C.blanc, borderRadius: 12, borderWidth: 1, borderColor: C.filet, paddingVertical: 10, paddingHorizontal: 12 },
  kpiLabel: { fontFamily: F.regular, fontSize: 11.5, color: C.mineClair },
  kpiValue: { fontFamily: F.semibold, fontSize: 20, color: C.encre, marginTop: 2, letterSpacing: -0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontFamily: F.semibold, fontSize: 15, color: C.encre },
  sub: { fontFamily: F.regular, fontSize: 13, color: C.mineClair, marginTop: 1 },
  pct: { fontFamily: F.semibold, fontSize: 13, color: C.encre, width: 42, textAlign: 'right' },
  meta: { fontFamily: F.regular, fontSize: 12.5, color: C.mine },
});
