// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

/**
 * Recupera la prima variabile d'ambiente definita tra le possibili.
 * Accetta sia REACT_APP_FIREBASE_* che REACT_APP_* (compatibilità).
 */
const pickEnv = (keys = []) => {
  for (const k of keys) {
    if (process.env[k]) return process.env[k];
  }
  return undefined;
};

// Supporta configurazione iniettata in window (public/index.html) oppure dalle env
const configFromWindow = (typeof window !== "undefined" && window.__firebase_config) ? window.__firebase_config : null;

const configFromEnv = {
  apiKey: pickEnv(["REACT_APP_FIREBASE_API_KEY", "REACT_APP_API_KEY"]),
  authDomain: pickEnv(["REACT_APP_FIREBASE_AUTH_DOMAIN", "REACT_APP_AUTH_DOMAIN"]),
  projectId: pickEnv(["REACT_APP_FIREBASE_PROJECT_ID", "REACT_APP_PROJECT_ID"]),
  storageBucket: pickEnv(["REACT_APP_FIREBASE_STORAGE_BUCKET", "REACT_APP_STORAGE_BUCKET"]),
  messagingSenderId: pickEnv(["REACT_APP_FIREBASE_MESSAGING_SENDER_ID", "REACT_APP_MESSAGING_SENDER_ID"]),
  appId: pickEnv(["REACT_APP_FIREBASE_APP_ID", "REACT_APP_APP_ID"]),
};

const firebaseConfig = configFromWindow || configFromEnv;

// Controllo minimo e messaggio chiaro in console
if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("Firebase config missing or invalid. configFromWindow:", configFromWindow, "configFromEnv:", configFromEnv);
  throw new Error("Invalid Firebase configuration. Set window.__firebase_config in public/index.html or REACT_APP_* variables in .env and rebuild.");
}

// (opzionale) mostra config in dev per debug se vuoi: impostare REACT_APP_DEBUG_FIREBASE=true
if (process.env.REACT_APP_DEBUG_FIREBASE === "true") {
  // non loggare chiavi in produzione!
  // eslint-disable-next-line no-console
  console.log("Using firebaseConfig:", { apiKey: firebaseConfig.apiKey ? "****" : undefined, projectId: firebaseConfig.projectId });
}

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (err) {
  console.error("Firebase initialization failed:", err);
  throw err;
}

export const db = getFirestore(app);
export const auth = getAuth(app);

// Inizializzazione sicura di Cloud Functions senza usare `export` dentro try/catch
export const functions = (() => {
  try {
    if (typeof getFunctions === "function") {
      // specifica la regione se serve
      return getFunctions(app, "europe-west1");
    }
    return undefined;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Could not initialize Cloud Functions:", err);
    return undefined;
  }
})();

export default app;