// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from 'firebase/functions';

// Questa è la versione CORRETTA.
// Legge i valori dal file .env senza assegnarli qui.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);

// Esporta i servizi che useremo
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'europe-west1');