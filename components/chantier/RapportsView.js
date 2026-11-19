// Onglet Chantier › Rapports : rapports de réserves, de visite et
// d'avancement sur une période, et historique des rapports du projet.
import { BarChart3, Calendar, Camera, ChevronDown, ClipboardCheck, Download, FileText, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../../constants/theme';
import { requestReport } from '../../lib/api';
import { isOnline } from '../../lib/offline';
import { REPORT_KINDS, templateKind } from '../../lib/reportKinds';
import {
  PERIOD_PRESETS, defaultPreset, deleteReport, downloadAndShare, fetchReportCandidates, fetchReports,
  fmtDateTime, fmtSize, itemsForReport, lastReportByKind, periodLabel, reportDownload, resolvePeriod,
} from '../../lib/reports';
import { supabase } from '../../lib/supabase';
import PeriodSheet from '../reports/PeriodSheet';
import ReportOptionsModal from '../reports/ReportOptionsModal';
import { Badge, Card, Empty, PrimaryButton, SectionTitle, Segmented } from './ui';

const CARDS = [
  { kind: 'reserves', Icon: ClipboardCheck },
  { kind: 'visite', Icon: Camera },
  { kind: 'avancement', Icon: BarChart3 },
];
const KIND_TONE = { reserves: 'alerte', visite: 'neutre', avancement: 'tirage', libre: 'neutre' };

const WORDS = { reserve: 'réserve', tache: 'tâche', observation: 'observation' };
const itemWord = (kind, n) => `${WORDS[REPORT_KINDS[kind]?.pinType] ?? 'élément'}${n > 1 ? 's' : ''}`;

export default function RapportsView({ project, canEdit, active, refreshKey }) {
  const projectId = project?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    if (!isOnline()) {
      setError('Une connexion est nécessaire pour les rapports.');
      return;
    }
    try {
      const [reports, candidates, templatesRes, membersRes] = await Promise.all([
        fetchReports(projectId),
        fetchReportCandidates(projectId),
        supabase.from('report_templates').select('*').eq('organization_id', project.organization_id).order('created_at', { ascending: false }),
        supabase.from('members_projects').select('id, role, members(id, name, email)').eq('project_id', projectId),
      ]);
      setData({
        projectId,
        reports,
        candidates,
        templates: templatesRes.data ?? [],
        members: (membersRes.data ?? []).map((m) => ({ ...m.members, role: m.role, memberId: m.id })),
      });
      setError(null);
    } catch (err) {
      console.error('[rapports] chargement', err);
      setError(/reports/.test(err?.message ?? '') ? "L'historique des rapports n'est pas encore disponible." : 'Impossible de charger les rapports.');
    }
  }, [projectId, project?.organization_id]);

  useEffect(() => {
    if (active) load();
  }, [active, load, refreshKey]);

  const reports = useMemo(() => data?.reports ?? [], [data]);
  const lastByKind = useMemo(() => lastReportByKind(reports), [reports]);

  // ── Période et modèle de chaque carte ─────────────────────────────────────
  const [presets, setPresets] = useState({});
  const [customs, setCustoms] = useState({});
  const [periodKind, setPeriodKind] = useState(null); // carte dont on choisit la période
  // Par défaut, la visite part du dernier rapport ; s'il ne reste rien depuis
  // (rapport du jour), on prend les 7 derniers jours.
  const presetOf = (kind) => {
    if (presets[kind]) return presets[kind];
    const d = defaultPreset(kind, lastByKind[kind]);
    if (d !== 'since-last') return d;
    const since = itemsForReport(data?.candidates ?? [], kind, resolvePeriod(d, { lastReport: lastByKind[kind] }));
    return since.length ? d : '7d';
  };
  const periodOf = (kind) => resolvePeriod(presetOf(kind), { lastReport: lastByKind[kind], custom: customs[kind] });
  const idsOf = (kind) => itemsForReport(data?.candidates ?? [], kind, periodOf(kind));
  const countFor = (kind, preset, custom) =>
    itemsForReport(data?.candidates ?? [], kind, resolvePeriod(preset, { lastReport: lastByKind[kind], custom })).length;
  const presetLabel = (kind) => {
    const preset = presetOf(kind);
    if (preset === 'all') return kind === 'avancement' ? 'Situation à ce jour' : 'Tout le projet';
    return PERIOD_PRESETS.find((p) => p.value === preset)?.label ?? 'Période';
  };
  const templatesOf = (kind) => (data?.templates ?? []).filter((t) => templateKind(t) === kind || templateKind(t) === 'libre');

  // ── Composition ───────────────────────────────────────────────────────────
  const [composing, setComposing] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [generating, setGenerating] = useState(null);

  const openComposer = (kind) => {
    const own = (data?.templates ?? []).filter((t) => templateKind(t) === kind);
    setSelectedTemplate(own.find((t) => t.is_default) || own[0] || null);
    setComposing(kind);
  };

  const generate = async ({ progress, progressContent, lotIds = [], reportTitle, displayMode, fields, participants, customSections, planningImages, planningObservations }) => {
    const kind = composing;
    const period = periodOf(kind);
    const selectedIds = idsOf(kind);
    setComposing(null);
    if (!isOnline()) return Alert.alert('Hors ligne', 'La génération du rapport nécessite une connexion.');
    setGenerating(kind);
    try {
      const { downloadUrl, fileName } = await requestReport('/api/report', {
        projectId,
        selectedIds,
        reportKind: kind,
        templateKind: templateKind(selectedTemplate),
        templateId: selectedTemplate?.id ?? null,
        templateConfig: selectedTemplate?.config || null,
        period,
        ...(progress ? { progress } : {}),
        ...(progressContent ? { progressContent } : {}),
        ...(lotIds.length ? { lotIds } : {}),
        fields,
        displayMode,
        reportTitle,
        participants,
        customSections,
        planningImages,
        planningObservations,
      });
      load();
      await downloadAndShare(downloadUrl, fileName);
    } catch (err) {
      console.error('[rapports] génération', err);
      Alert.alert('Rapport', `Le rapport n'a pas pu être généré.\n${err.message}`);
    } finally {
      setGenerating(null);
    }
  };

  // ── Historique ────────────────────────────────────────────────────────────
  const [historyKind, setHistoryKind] = useState('all');
  const [busyRow, setBusyRow] = useState(null);
  const shown = historyKind === 'all' ? reports : reports.filter((r) => r.kind === historyKind);

  const open = async (row) => {
    if (!isOnline()) return Alert.alert('Hors ligne', 'Une connexion est nécessaire pour télécharger le rapport.');
    setBusyRow(row.id);
    try {
      const { downloadUrl, fileName } = await reportDownload(row.id);
      await downloadAndShare(downloadUrl, fileName);
    } catch (err) {
      Alert.alert('Rapport', err.message || 'Téléchargement impossible.');
    } finally {
      setBusyRow(null);
    }
  };

  const remove = (row) => {
    Alert.alert('Supprimer le rapport', `« ${row.title} » du ${fmtDateTime(row.created_at)} sera effacé.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setBusyRow(row.id);
          try {
            await deleteReport(row.id);
            await load();
          } catch (err) {
            Alert.alert('Rapport', err.message || 'Suppression impossible.');
          } finally {
            setBusyRow(null);
          }
        },
      },
    ]);
  };

  if (error && !data) return <Empty title="Rapports indisponibles" text={error} />;
  if (!data || data.projectId !== projectId) return <ActivityIndicator style={{ marginTop: 40 }} color={C.mine} />;

  return (
    <View>
      {CARDS.map(({ kind, Icon }) => {
        const k = REPORT_KINDS[kind];
        const last = lastByKind[kind];
        const period = periodOf(kind);
        const count = idsOf(kind).length;
        const busy = generating === kind;
        return (
          <Card key={kind} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.icon}><Icon size={17} color={C.encre} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{k.label}</Text>
                <Text style={styles.hint} numberOfLines={2}>{k.hint}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setPeriodKind(kind)}
              style={({ pressed }) => [styles.periodRow, pressed && { backgroundColor: C.voile }]}
              accessibilityRole="button"
              accessibilityLabel={`Période : ${presetLabel(kind)}. Changer`}
            >
              <Calendar size={16} color={C.mine} />
              <View style={{ flex: 1 }}>
                <Text style={styles.periodLabel}>{presetLabel(kind)}</Text>
                <Text style={styles.period} numberOfLines={1}>
                  {period ? periodLabel(period) : kind === 'avancement' ? 'Toutes les tâches' : `Toutes les ${WORDS[k.pinType]}s`}
                  {period ? (kind === 'avancement' ? ' · tâches actives' : ' · constatées sur la période') : ''}
                </Text>
              </View>
              <Text style={styles.periodChange}>Changer</Text>
              <ChevronDown size={16} color={C.mine} />
            </Pressable>
            {!count && period && (
              <Text style={styles.emptyHint}>
                Aucune {WORDS[k.pinType]} sur cette période : choisissez une période plus large.
              </Text>
            )}
            <View style={styles.cardFoot}>
              <View style={{ flex: 1 }}>
                <Text style={styles.count}>{count} {itemWord(kind, count)}</Text>
                <Text style={styles.meta} numberOfLines={1}>{last ? `Dernier : ${fmtDateTime(last.created_at)}` : 'Aucun rapport pour l’instant'}</Text>
              </View>
              <PrimaryButton
                label={busy ? 'Génération…' : 'Composer'}
                icon={busy ? <ActivityIndicator size="small" color={C.blanc} /> : <FileText size={16} color={C.blanc} />}
                disabled={!count || Boolean(generating)}
                onPress={() => openComposer(kind)}
                style={styles.compose}
              />
            </View>
          </Card>
        );
      })}

      <SectionTitle>Historique</SectionTitle>
      <Segmented
        small
        value={historyKind}
        options={[{ value: 'all', label: 'Tous' }, ...['reserves', 'visite', 'avancement', 'libre'].map((k) => ({ value: k, label: REPORT_KINDS[k].short }))]}
        onChange={setHistoryKind}
        style={{ marginBottom: 10 }}
      />
      {shown.length === 0 ? (
        <Empty
          title={reports.length ? 'Aucun rapport de ce type' : 'Aucun rapport'}
          text={reports.length ? null : 'Les rapports générés ici, depuis la liste des tâches ou sur le web apparaîtront ici.'}
        />
      ) : (
        <Card style={{ paddingVertical: 2 }}>
          {shown.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => open(r)}
              onLongPress={canEdit ? () => remove(r) : undefined}
              disabled={busyRow === r.id}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`Télécharger ${r.title}`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowHead}>
                  <Badge label={REPORT_KINDS[r.kind]?.short ?? 'Libre'} tone={KIND_TONE[r.kind] ?? 'neutre'} />
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {fmtDateTime(r.created_at)} · {r.item_count} {itemWord(r.kind, r.item_count)}{r.members?.name ? ` · ${r.members.name}` : ''}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {periodLabel({ start: r.period_start, end: r.period_end })} · {fmtSize(r.file_size)}
                </Text>
              </View>
              {busyRow === r.id ? (
                <ActivityIndicator size="small" color={C.mine} />
              ) : (
                <View style={styles.actions}>
                  {canEdit && (
                    <Pressable onPress={() => remove(r)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Supprimer ${r.title}`}>
                      <Trash2 size={17} color={C.mineClair} />
                    </Pressable>
                  )}
                  <Download size={18} color={C.encre} />
                </View>
              )}
            </Pressable>
          ))}
        </Card>
      )}
      {shown.length > 0 && <Text style={styles.footnote}>Touchez un rapport pour le télécharger et le partager.</Text>}

      <PeriodSheet
        visible={Boolean(periodKind)}
        onClose={() => setPeriodKind(null)}
        title={periodKind ? `Période · ${REPORT_KINDS[periodKind].label}` : ''}
        preset={periodKind ? presetOf(periodKind) : 'all'}
        custom={periodKind ? customs[periodKind] : null}
        lastReport={periodKind ? lastByKind[periodKind] : null}
        countFor={(preset, custom) => countFor(periodKind, preset, custom)}
        itemWord={(n) => (periodKind ? itemWord(periodKind, n) : '')}
        onApply={(preset, custom) => {
          setPresets((p) => ({ ...p, [periodKind]: preset }));
          if (preset === 'custom') setCustoms((c) => ({ ...c, [periodKind]: custom }));
        }}
      />

      {composing && (
        <ReportOptionsModal
          visible
          onClose={() => setComposing(null)}
          onConfirm={generate}
          availableTemplates={templatesOf(composing)}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          projectMembers={data.members}
          projectId={projectId}
          reportKind={composing}
          itemCount={idsOf(composing).length}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, padding: 14 },
  cardHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  icon: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: C.filet, backgroundColor: C.papier, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: F.medium, fontSize: 15, color: C.encre },
  hint: { fontFamily: F.regular, fontSize: 12.5, color: C.mineClair, marginTop: 2 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.filet, backgroundColor: C.papier },
  periodLabel: { fontFamily: F.medium, fontSize: 14, color: C.encre },
  period: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginTop: 1 },
  periodChange: { fontFamily: F.medium, fontSize: 13, color: C.mine },
  emptyHint: { fontFamily: F.regular, fontSize: 12, color: C.alerte, marginTop: 6 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.voile },
  count: { fontFamily: F.medium, fontSize: 14, color: C.encre },
  meta: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, marginTop: 2 },
  compose: { paddingHorizontal: 14, height: 40, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12 },
  divider: { borderTopWidth: 1, borderTopColor: C.voile },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontFamily: F.medium, fontSize: 14, color: C.encre },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  footnote: { fontFamily: F.regular, fontSize: 12, color: C.mineClair, textAlign: 'center', marginTop: 8 },
});
