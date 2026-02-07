/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage"; 

// Chiave API (Deve essere sempre la stessa che hai in .env.local e Netlify)
const FALLBACK_API_KEY = "AIzaSyC59l73xl56aOdHnQ8I3K1VqYbkDVzASjg"; 

// Configurazione centralizzata che legge le variabili d'ambiente (Netlify/React)
const firebaseConfig = {
    apiKey: process.env.REACT_APP_API_KEY || FALLBACK_API_KEY, 
    authDomain: process.env.REACT_APP_AUTH_DOMAIN || "marcatempotcsitalia.firebaseapp.com",
    projectId: process.env.REACT_APP_PROJECT_ID || "marcatempotcsitalia",
    storageBucket: "marcatempotcsitalia.firebasestorage.app", // <--- IMPORTANTE: Questo è il bucket corretto che abbiamo configurato
    messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID || "755809435347",
    appId: process.env.REACT_APP_APP_ID || "1:755809435347:web:c5c9edf8f8427e66c71e26"
};

let appInstance = null;
let dbInstance = null;
let authInstance = null;
let functionsInstance = null;
let storageInstance = null;
let initializationError = null;

try {
    // Inizializza l'app se non è già stata inizializzata
    appInstance = initializeApp(firebaseConfig);
    
    // Setup servizi
    dbInstance = getFirestore(appInstance);
    authInstance = getAuth(appInstance);
    functionsInstance = getFunctions(appInstance, 'europe-west1');
    storageInstance = getStorage(appInstance);

} catch (e) {
    console.error("Errore durante initializeApp:", e);
    initializationError = new Error(`Inizializzazione fallita: ${e.message}`);
}

// --- Hook Personalizzato per la Dashboard ---
const useFirebase = () => {
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        
        const setupAuth = async () => {
            if (initializationError) {
                setError(initializationError);
                return;
            }

            try {
                if (!authInstance.currentUser) {
                    await signInAnonymously(authInstance); 
                }
                
                if (isMounted) {
                    setIsReady(true);
                }
            } catch (authErr) {
                console.error("Errore di autenticazione in useFirebase:", authErr);
                if (isMounted) {
                    setError(new Error(`Autenticazione fallita: ${authErr.code}`));
                }
            }
        };

        setupAuth();
        
        return () => { isMounted = false; };
    }, []);

    return {
        db: dbInstance,
        auth: authInstance,
        functions: functionsInstance,
        storage: storageInstance,
        isReady,
        error: error || initializationError
    };
};

export { useFirebase, initializationError as INITIALIZATION_ERROR };

// Esportazioni statiche
export { dbInstance as db, authInstance as auth, functionsInstance as functions, storageInstance as storage };