import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAggViY8ot0IYZPtJpFh4f2O_vyt-u0fYs",
  authDomain: "monthly-money-note.firebaseapp.com",
  projectId: "monthly-money-note",
  storageBucket: "monthly-money-note.firebasestorage.app",
  messagingSenderId: "229632491067",
  appId: "1:229632491067:web:baa2fcbe90a92a1f56e61e",
  measurementId: "G-S9MCQQQ84Y"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

const provider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  return await signInWithPopup(auth, provider);
};

export const loginAsGuest = async () => {
  return await signInAnonymously(auth);
};

export default app;