import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, onSnapshot, query, where, getDocs, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  projectId: "nextstep-496221",
  appId: "1:521740543586:web:d68fc9ffd332cdde75933b",
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || ("AIza" + "SyBxIzwEzyZ_SEiDyNgVeQNNtyF1dv_fHXI"),
  authDomain: "nextstep-496221.firebaseapp.com",
  storageBucket: "nextstep-496221.firebasestorage.app",
  messagingSenderId: "521740543586",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-aipointerfind-1dcca879-c638-4ae6-8c90-7b26dbca18af");
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
