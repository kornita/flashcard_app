import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { auth } from '.././firebase/firebaseConfig';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // AUTO-REDIRECT: Listen for auth state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('✅ User detected, redirecting to tabs...', user.email);
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 100);
      }
    });
    return () => unsubscribe();
  }, []);

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    console.log('🚀 Starting Google Sign-In...');
    console.log('Platform:', Platform.OS);
    setIsLoading(true);

    try {
      if (Platform.OS === 'web') {
        console.log('Using signInWithPopup for web');
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        await signInWithPopup(auth, provider);
        console.log('✅ Web sign-in successful');
        // onAuthStateChanged handles navigation
      } else {
        Alert.alert(
          'Google Sign-In',
          'Google Sign-In on mobile requires additional setup. Please use email login for now.',
          [{ text: 'OK' }]
        );
        setIsLoading(false);
      }
    } catch (error: any) {
      console.error('❌ Google Sign-In error:', error);
      let errorMessage = 'Failed to sign in with Google';
      if (error.code === 'auth/popup-closed-by-user') errorMessage = 'Sign-in cancelled';
      else if (error.code === 'auth/popup-blocked') errorMessage = 'Pop-up blocked. Please allow pop-ups for this site.';
      else if (error.code === 'auth/cancelled-popup-request') errorMessage = 'Only one sign-in at a time';
      else if (error.message) errorMessage = error.message;

      Alert.alert('Sign-In Error', errorMessage);
      setIsLoading(false);
    }
  };

  // Email/Password Sign-In
  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged handles navigation
    } catch (error: any) {
      console.error('Email login error:', error);
      let message = 'Login failed. Please try again.';
      if (error.code === 'auth/user-not-found') message = 'No account found with this email.';
      if (error.code === 'auth/wrong-password') message = 'Incorrect password.';
      if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
      if (error.code === 'auth/invalid-credential') message = 'Invalid email or password.';

      Alert.alert('Login Failed', message);
      setIsLoading(false);
    }
  };

  // Forgot Password
  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Enter Email', 'Please enter your email address first.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Password Reset', 'Password reset link has been sent to your email.');
    } catch (error: any) {
      console.error('Password reset error:', error);
      Alert.alert('Error', error.message || 'Failed to send reset email.');
    }
  };

  // Navigate to Register
  const handleRegister = () => {
    router.push('/register');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.loginContainer}>
          <Text style={styles.title}>Welcome back!</Text>
          <Text style={styles.subtitle}>Glad to see you again!</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!isLoading}
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!isLoading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <Text>{showPassword ? 
              <MaterialCommunityIcons name="eye" size={20} color="#333"/> : <MaterialCommunityIcons name="eye-closed" size={20} color="#333"/>}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleForgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.disabledButton]}
            onPress={handleEmailLogin}
            disabled={isLoading}
          >
            <LinearGradient
              colors={['#FFC107', '#4CAF50']}
              style={styles.loginGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.loginButtonText}>
                {isLoading ? 'Signing In...' : 'Login'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.orText}>Or</Text>

          <TouchableOpacity
            style={[styles.googleButton, isLoading && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
          >
            <Image
              source={{ uri: 'https://cdn-icons-png.flaticon.com/128/281/281764.png' }}
              style={styles.image}
            />
            <Text style={styles.googleButtonText}>
              {isLoading ? 'Signing In...' : 'Sign in with Google'}
            </Text>
          </TouchableOpacity>

          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={handleRegister}>
              <Text style={styles.registerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 100 },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 20 },
  loginContainer: { gap: 10 },
  title: { fontSize: 28, fontWeight: '700', color: '#333' },
  subtitle: { fontSize: 18, color: '#666', marginBottom: 20 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 15, fontSize: 16 },
  passwordContainer: { position: 'relative', marginBottom: 10 },
  passwordInput: { backgroundColor: '#fff', borderRadius: 12, padding: 15, paddingRight: 50, fontSize: 16 },
  eyeButton: { position: 'absolute', right: 15, top: 15 },
  forgotPasswordText: { color: '#666', textAlign: 'right', marginBottom: 10 },
  loginButton: {     
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loginGradient: { paddingVertical: 15, alignItems: 'center' },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  orText: { textAlign: 'center', marginVertical: 10 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#ccc' },
  googleButtonText: { color: '#000', fontSize: 14, fontWeight: '600' },
  image: { width: 20, height: 20, marginRight: 10 },
  disabledButton: { opacity: 0.6 },
  registerContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: '#666' },
  registerLink: { fontSize: 14, color: '#4285F4', fontWeight: '600' },
});
