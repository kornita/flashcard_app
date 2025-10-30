// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";

// Paste your Firebase config here (from Firebase console → Project settings → General → SDK setup & config)
const firebaseConfig = {
  apiKey: "AIzaSyAoos3ygagKUXWJDspnLJ4tk7Rn4QnQNzc",
  authDomain: "flashcard-d4fae.firebaseapp.com",
  projectId: "flashcard-d4fae",
  storageBucket: "flashcard-d4fae.firebasestorage.app",
  messagingSenderId: "933828354831",
  appId: "1:933828354831:web:8b58d908d0a1f32d59147a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore instance 
export const db = getFirestore(app);
export const auth = getAuth(app);