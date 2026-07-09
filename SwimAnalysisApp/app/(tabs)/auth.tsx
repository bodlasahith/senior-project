import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { authAPI } from '@/services/api';

export default function AuthScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        const response = await authAPI.getMe();
        setUser(response.data.user || response.data);
        setIsLoggedIn(true);
      }
    } catch {
      // Token expired or invalid
      await AsyncStorage.removeItem('authToken');
      setIsLoggedIn(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    try {
      setIsLoading(true);
      const response = await authAPI.login(email, password);
      const token = response.data.token;
      await AsyncStorage.setItem('authToken', token);
      setUser(response.data.user);
      setIsLoggedIn(true);
      setEmail('');
      setPassword('');
      Alert.alert('Success', 'Logged in!');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed. Check your credentials.';
      Alert.alert('Login Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    try {
      setIsLoading(true);
      const response = await authAPI.register(username, email, password);
      const token = response.data.token;
      await AsyncStorage.setItem('authToken', token);
      setUser(response.data.user);
      setIsLoggedIn(true);
      setUsername('');
      setEmail('');
      setPassword('');
      Alert.alert('Success', 'Account created!');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Registration failed.';
      Alert.alert('Registration Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('authToken');
    setUser(null);
    setIsLoggedIn(false);
    setIsLogin(true);
  };

  // ─── Logged In: Profile View ───────────────────────────────────────────────

  if (isLoggedIn && user) {
    return (
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.contentContainer}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Profile</ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">👤 {user.username || 'Swimmer'}</ThemedText>
          <ThemedText type="default">{user.email}</ThemedText>
          {user.profile?.experienceLevel && (
            <ThemedText type="default">Level: {user.profile.experienceLevel}</ThemedText>
          )}
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Statistics</ThemedText>
          <ThemedText type="default">
            Total Sessions: {user.statistics?.totalSessions || 0}
          </ThemedText>
          <ThemedText type="default">
            Total Strokes: {user.statistics?.totalStrokes || 0}
          </ThemedText>
          <ThemedText type="default">
            Avg Efficiency: {user.statistics?.averageEfficiency?.toFixed(2) || '—'}%
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Settings</ThemedText>
          <ThemedText type="default">
            Body Mass: {user.profile?.weight || '70'} kg (used for efficiency calculation)
          </ThemedText>
          <ThemedText type="default">
            Preferred Stroke: {user.goals?.preferredStroke || 'Not set'}
          </ThemedText>
        </ThemedView>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <ThemedText type="default" style={styles.logoutText}>Log Out</ThemedText>
        </Pressable>
      </ScrollView>
    );
  }

  // ─── Logged Out: Login/Register Form ───────────────────────────────────────

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.formContainer}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">🏊 Swim Tracker</ThemedText>
        <ThemedText type="default">
          {isLogin ? 'Log in to sync your sessions' : 'Create an account'}
        </ThemedText>
      </ThemedView>

      {!isLogin && (
        <TextInput
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          style={styles.input}
          placeholderTextColor="#999"
        />
      )}

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
        placeholderTextColor="#999"
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        placeholderTextColor="#999"
      />

      <Pressable
        style={styles.primaryButton}
        onPress={isLogin ? handleLogin : handleRegister}
      >
        <ThemedText type="default" style={styles.primaryButtonText}>
          {isLogin ? 'Login' : 'Create Account'}
        </ThemedText>
      </Pressable>

      <Pressable style={styles.switchButton} onPress={() => setIsLogin(!isLogin)}>
        <ThemedText type="default" style={styles.switchText}>
          {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
        </ThemedText>
      </Pressable>

      <ThemedView style={styles.offlineNote}>
        <ThemedText type="default" style={styles.offlineText}>
          💡 You can use the app without an account. Sessions will be stored locally.
        </ThemedText>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  formContainer: {
    padding: 20,
    justifyContent: 'center',
    flexGrow: 1,
    gap: 12,
  },
  header: {
    gap: 8,
    marginBottom: 8,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 8,
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchText: {
    color: '#1976D2',
  },
  logoutButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  offlineNote: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  offlineText: {
    textAlign: 'center',
    opacity: 0.8,
    fontSize: 13,
  },
});
