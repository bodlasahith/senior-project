import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/**
 * Shown whenever a classifier is running its dev-only mock model, so random
 * predictions are never mistaken for real analysis. Release builds never mock.
 */
export function MockModelBanner({ what }: { what: string }) {
  return (
    <View style={styles.banner}>
      <ThemedText type="defaultSemiBold" style={styles.text}>
        DEV MOCK: {what} model not loaded. Results are random.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: 10, borderRadius: 10, backgroundColor: '#F59E0B' },
  text: { color: '#111', fontSize: 13, textAlign: 'center' },
});
