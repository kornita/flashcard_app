// app/index.tsx
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { auth } from './firebase/firebaseConfig';

export default function Index() {
  const [isChecking, setIsChecking] = useState(true);
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current) return; // Prevent multiple navigations

    console.log('Starting auth check...');
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (hasNavigated.current) return; // Double check

      console.log('Auth result:', user ? 'User exists' : 'No user');
      
      hasNavigated.current = true;
      
      if (user) {
        console.log('Going to tabs');
        router.replace('/(tabs)');
      } else {
        console.log('Going to login');
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.text}>Loading app...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    marginTop: 16,
    fontSize: 20,
    color: '#666',
  },
});