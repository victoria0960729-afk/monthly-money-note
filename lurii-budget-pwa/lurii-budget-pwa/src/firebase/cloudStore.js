// 這是 Firestore 雲端同步的預留層。
// 接好 Firebase 之後，可以把 localStorage 改成這裡。

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function loadUserBudgetData(userId) {
  if (!db || !userId) return null;
  const ref = doc(db, "users", userId, "app", "budget");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveUserBudgetData(userId, data) {
  if (!db || !userId) return;
  const ref = doc(db, "users", userId, "app", "budget");
  await setDoc(ref, data, { merge: true });
}
