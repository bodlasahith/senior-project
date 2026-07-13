import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { sessionAPI } from '@/services/api';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [analyticsResponse, sessionsResponse] = await Promise.all([
        sessionAPI.getAnalytics(30),
        sessionAPI.getSessions(10, 0),
      ]);

      setAnalytics(analyticsResponse.data.analytics);
      setSessions(sessionsResponse.data.sessions || []);
    } catch (err) {
      console.error('History load error:', err);
      setError('Unable to load history. Check backend connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">History</ThemedText>
        <ThemedText type="default">Last 30 days</ThemedText>
      </ThemedView>

      <Pressable style={styles.refreshButton} onPress={loadHistory}>
        <ThemedText type="default" style={styles.refreshText}>
          Refresh
        </ThemedText>
      </Pressable>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator />
          <ThemedText type="default">Loading sessions...</ThemedText>
        </View>
      ) : error ? (
        <ThemedText type="default">{error}</ThemedText>
      ) : (
        <>
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Summary</ThemedText>
            <ThemedText type="default">Total Sessions: {analytics?.totalSessions || 0}</ThemedText>
            <ThemedText type="default">Total Strokes: {analytics?.totalStrokes || 0}</ThemedText>
            <ThemedText type="default">
              Avg Efficiency: {(analytics?.avgEfficiency || 0).toFixed(2)}
            </ThemedText>
            <ThemedText type="default">
              Best Efficiency: {(analytics?.bestEfficiency || 0).toFixed(2)}
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Recent Sessions</ThemedText>
            {sessions.length === 0 ? (
              <ThemedText type="default">No sessions recorded yet.</ThemedText>
            ) : (
              sessions.map((session) => (
                <View key={session._id} style={styles.sessionRow}>
                  <View>
                    <ThemedText type="default">
                      {new Date(session.startTime).toLocaleDateString()}
                    </ThemedText>
                    <ThemedText type="default">
                      {session.summary?.totalStrokes || 0} strokes
                    </ThemedText>
                  </View>
                  <ThemedText type="default">
                    {session.efficiency?.score ? `${session.efficiency.score.toFixed(1)}%` : '--'}
                  </ThemedText>
                </View>
              ))
            )}
          </ThemedView>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  header: {
    gap: 8,
  },
  refreshButton: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(25, 118, 210, 0.12)',
  },
  refreshText: {
    color: '#1976D2',
    fontWeight: '600',
  },
  loadingState: {
    gap: 8,
    alignItems: 'center',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 8,
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
});
