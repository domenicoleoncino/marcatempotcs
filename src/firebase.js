/* src/firebase.js - Configurazione Centralizzata */

import { initializeApp, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
// RIMOSSO: import React, { useState, useEffect } from 'react'; // Rimosso React dal modulo di inizializzazione

// --- Configurazione Iniziale ---
const FALLBACK_PROJECT_ID = "marcatempotcsitalia";
const FIREBASE_CONFIG = {
    apiKey: process.env.REACT_APP_API_KEY || "AIzaSyC59l73xl56aOdHnQ8I3K1VqYbkDVzASjg",
    authDomain: process.env.REACT_APP_AUTH_DOMAIN || `${FALLBACK_PROJECT_ID}.firebaseapp.com`,
    projectId: process.env.REACT_APP_PROJECT_ID || FALLBACK_PROJECT_ID,
    storageBucket: process.env.REACT_APP_STORAGE_BUCKET || `${FALLBACK_PROJECT_ID}.appspot.com`,
    messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID || "755809435347",
    appId: process.env.REACT_APP_APP_ID || "1:755809435347:web:c5c9edf8f8427e66c71e26"
};

let app;
let db;
let auth;
let functions;
let initializationError = null;

try {
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId || FIREBASE_CONFIG.apiKey === 'undefined') {
        throw new Error("Credenziali Firebase mancanti o non valide.");
    }
    
    // 1. Inizializzazione SINCRONA (Tenta di usare l'istanza esistente)
    try {
        app = getApp();
    } catch (e) {
        app = initializeApp(FIREBASE_CONFIG);
    }
    
    // 2. Assegnazione SINCRONA delle istanze
    db = getFirestore(app);
    auth = getAuth(app);
    functions = getFunctions(app, 'europe-west1');
    
} catch(e) {
    console.error("ERRORE CRITICO DI INIZIALIZZAZIONE:", e);
    initializationError = new Error(`Inizializzazione fallita: ${e.message}`);
}

// --- Esportazioni Statiche per Componenti ---

export { db, auth, functions };

// Esporta anche l'eventuale errore di inizializzazione
export const INITIALIZATION_ERROR = initializationError; 
