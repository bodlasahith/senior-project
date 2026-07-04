import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../../services/api';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');

  const handleAuth = async () => {
    try {
      if (isLogin) {
        const response = await authAPI.login(email, password);
        await AsyncStorage.setItem('authToken', response.data.token);
        Alert.alert('Success', 'Logged in!');
      } else {
        const response = await authAPI.register(username, email, password);
        await AsyncStorage.setItem('authToken', response.data.token);
        Alert.alert('Success', 'Account created!');
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Auth failed');
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
        🏊 Swim Tracker
      </Text>

      {!isLogin && (
        <TextInput
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            padding: 12,
            marginBottom: 12,
            borderRadius: 8,
          }}
        />
      )}

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 12,
          marginBottom: 12,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 12,
          marginBottom: 20,
          borderRadius: 8,
        }}
      />

      <TouchableOpacity
        onPress={handleAuth}
        style={{
          backgroundColor: '#1976D2',
          padding: 14,
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 16 }}>
          {isLogin ? 'Login' : 'Register'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
        <Text style={{ color: '#1976D2', textAlign: 'center' }}>
          {isLogin ? "Don't have account? Register" : 'Already have account? Login'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}