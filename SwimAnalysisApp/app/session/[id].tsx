import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { sessionAPI } from '@/services/api';

const STROKE_TYPES = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Front Crawl'];
const STROKE_COLORS: Record<string, string> = {
  Freestyle: '#1976D2',
  Backstroke: '#10B981',
  Breaststroke: '#F59E0B',
  Butterfly: '#EF4444',
  'Front Crawl': '#6366F1',
};

export default function SessionDetailScreen() {
  const { id, data } = useLocalSearchParams<{ id: string; data?: string }>();

  // Seed from the session passed via navigation params (works without a backend
  // round-trip); fall back to fetching by id for deep links / cold loads.
  const [session, setSession] = useState<any>(() => {
    if (typeof data === 'string' && data.length > 0) {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(!session);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session || !id) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const response = await sessionAPI.getSession(id);
        if (!cancelled) setSession(response.data.session);
      } catch {
        if (!cancelled) setError('Unable to load this session. Check your backend connection.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, session]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
        <ThemedText type="default">Loading session…</ThemedText>
      </ThemedView>
    );
  }

  if (error || !session) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="default">{error || 'Session not found.'}</ThemedText>
      </ThemedView>
    );
  }

  const summary = session.summary || {};
  const efficiency = session.efficiency || {};
  const strokeCounts: Record<string, number> = summary.strokeCounts || {};
  const totalStrokes = summary.totalStrokes ?? session.strokes?.length ?? 0;

  const breakdown = STROKE_TYPES
    .map((type) => ({ type, count: strokeCounts[type] || 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxCount = breakdown.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  const startDate = session.startTime ? new Date(session.startTime) : null;
  const durationSec = session.duration || 0;
  const durationLabel = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`;
  const hasEfficiency = typeof efficiency.score === 'number' && efficiency.level !== 'no_data';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Header */}
      <ThemedView style={styles.headerBlock}>
        <ThemedText type="title">
          {startDate ? startDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Session'}
        </ThemedText>
        {startDate && (
          <ThemedText type="default" style={styles.subtle}>
            {startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </ThemedText>
        )}
      </ThemedView>

      {/* Top stats */}
      <ThemedView style={styles.card}>
        <View style={styles.statsRow}>
          <Stat label="Duration" value={durationLabel} />
          <Stat label="Strokes" value={`${totalStrokes}`} />
          <Stat
            label="Avg Conf."
            value={summary.averageConfidence != null ? `${Math.round(summary.averageConfidence * 100)}%` : '—'}
          />
        </View>
        {summary.dominantStroke ? (
          <ThemedText type="default" style={styles.subtle}>
            Dominant stroke: <ThemedText type="defaultSemiBold">{summary.dominantStroke}</ThemedText>
          </ThemedText>
        ) : null}
      </ThemedView>

      {/* Stroke breakdown */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Stroke Breakdown</ThemedText>
        {breakdown.length === 0 ? (
          <ThemedText type="default" style={styles.subtle}>No strokes recorded for this session.</ThemedText>
        ) : (
          breakdown.map((s) => (
            <View key={s.type} style={styles.breakdownRow}>
              <View style={styles.breakdownLabelRow}>
                <ThemedText type="default">{s.type}</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {s.count} · {Math.round((s.count / totalStrokes) * 100)}%
                </ThemedText>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(s.count / maxCount) * 100}%`, backgroundColor: STROKE_COLORS[s.type] || '#1976D2' },
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </ThemedView>

      {/* Efficiency */}
      <ThemedView style={styles.efficiencyCard}>
        <ThemedText type="subtitle">Efficiency</ThemedText>
        {hasEfficiency ? (
          <>
            <View style={styles.effRow}>
              <ThemedText type="title" style={styles.effScore}>
                {Number(efficiency.score).toFixed(2)}%
              </ThemedText>
              {efficiency.level ? (
                <ThemedText type="defaultSemiBold" style={styles.effLevel}>{String(efficiency.level)}</ThemedText>
              ) : null}
            </View>
            {efficiency.feedback ? (
              <ThemedText type="default" style={styles.feedback}>💡 {efficiency.feedback}</ThemedText>
            ) : null}
            {(efficiency.workOutput != null || efficiency.workInput != null) && (
              <ThemedText type="default" style={styles.subtle}>
                {efficiency.workOutput != null ? `⚡ ${Math.round(efficiency.workOutput).toLocaleString()} J out` : ''}
                {efficiency.workOutput != null && efficiency.workInput != null ? '   ' : ''}
                {efficiency.workInput != null ? `🔥 ${Math.round(efficiency.workInput).toLocaleString()} J in` : ''}
              </ThemedText>
            )}
          </>
        ) : (
          <ThemedText type="default" style={styles.subtle}>
            No efficiency data — a heart rate monitor was not connected for this session.
          </ThemedText>
        )}
      </ThemedView>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="title" style={styles.statValue}>{value}</ThemedText>
      <ThemedText type="default" style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  headerBlock: { gap: 4 },
  subtle: { opacity: 0.7 },

  card: { padding: 16, borderRadius: 16, gap: 12, backgroundColor: 'rgba(25, 118, 210, 0.08)' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, opacity: 0.7 },

  breakdownRow: { gap: 6 },
  breakdownLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(120, 120, 120, 0.15)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },

  efficiencyCard: {
    padding: 16, borderRadius: 16, gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  effRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  effScore: { fontSize: 34, color: '#10B981', fontWeight: '800' },
  effLevel: { textTransform: 'capitalize', fontSize: 14 },
  feedback: { lineHeight: 20 },
});
