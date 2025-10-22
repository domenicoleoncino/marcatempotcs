import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);

    const [isAppActive, setIsAppActive] = useState(true);
    const [appStatusChecked, setAppStatusChecked] = useState(false);
    const [patchAttempted, setPatchAttempted] = useState(false); // Manteniamo per la logica della patch one-shot

    // Effect #1: Controlla stato app (kill switch) - invariato
    useEffect(() => {
        const configRef = doc(db, 'app_config', 'status');
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            setIsAppActive(!(docSnap.exists() && docSnap.data().isAttiva === false));
            setAppStatusChecked(true);
        }, () => { setIsAppActive(true); setAppStatusChecked(true); });
        return () => unsubscribe();
    }, []);

    // Effect #2: Autenticazione, Patch, Refresh Token e Caricamento Dati
    useEffect(() => {
        if (!appStatusChecked) return;

        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            setAuthChecked(false);
            setUserData(null); // Resetta sempre i dati utente al cambio auth

            if (!authenticatedUser) {
                setUser(null);
                setPatchAttempted(false);
                setAuthChecked(true);
                return;
            }

            setUser(authenticatedUser); // Imposta utente auth
            console.log("1. Utente autenticato:", authenticatedUser.uid, authenticatedUser.email);

            let needsTokenRefresh = false; // Flag per refresh
            const superAdminEmail = "domenico.leoncino@tcsitalia.com";

            // --- Logica Patch Admin (solo la prima volta) ---
            if (authenticatedUser.email === superAdminEmail && !patchAttempted) {
                setPatchAttempted(true);
                console.log("Tentativo patch Super Admin...");
                try {
                    const functions = getFunctions(undefined, 'europe-west1');
                    const fixMyClaim = httpsCallable(functions, 'TEMP_fixMyClaim');
                    await fixMyClaim();
                    console.log("Patch eseguita.");
                    alert("PATCH APPLICATA! Per rendere effettive le modifiche, fai LOGOUT e poi di nuovo LOGIN.");
                    needsTokenRefresh = true; // Necessario refresh dopo patch
                } catch (err) {
                    console.error("Errore patch:", err);
                    alert("Errore patch: " + err.message);
                }
            }

            // --- FORZA REFRESH TOKEN (SE NECESSARIO O COMUNQUE AL LOGIN) ---
            try {
                console.log("Forzo aggiornamento token ID per ottenere i claim più recenti...");
                await authenticatedUser.getIdToken(true); // Il 'true' forza il refresh
                console.log("Token ID aggiornato.");
            } catch (tokenError) {
                 console.error("Errore durante l'aggiornamento forzato del token:", tokenError);
                 // Non bloccare l'app, ma segnala il problema
            }
            // --- FINE REFRESH TOKEN ---


            // Carica i dati utente da Firestore
            const userDocRef = doc(db, 'users', authenticatedUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const baseProfile = userDocSnap.data();
                console.log("2. Profilo base trovato:", baseProfile);

                if (baseProfile.role === 'admin') {
                    setUserData(baseProfile);
                } else if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                    const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                    const employeeQuerySnapshot = await getDocs(q);

                    if (!employeeQuerySnapshot.empty) {
                        const employeeDoc = employeeQuerySnapshot.docs[0];
                        const fullProfile = { ...baseProfile, ...employeeDoc.data(), id: employeeDoc.id };
                        setUserData(fullProfile);
                    } else {
                         console.error(`ERRORE: Utente '${baseProfile.role}' non ha profilo 'employees'.`);
                         await signOut(auth);
                    }
                } else {
                    console.error(`ERRORE: Ruolo '${baseProfile.role}' non riconosciuto.`);
                    setUserData(baseProfile);
                }
            } else {
                console.error("ERRORE: Utente non trovato in 'users'.");
                // Mostra errore ruolo non riconosciuto
                setUserData({ role: 'sconosciuto' });
            }

            setAuthChecked(true); // Abbiamo finito di caricare
        });
        return () => unsubscribe();
    }, [appStatusChecked, patchAttempted]); // Dipendenze corrette

    // Effect #3: Carica aree (invariato)
    useEffect(() => {
        if (userData && (userData.role === 'dipendente' || userData.role === 'preposto')) {
            const loadWorkAreas = async () => { /* ... */ };
            loadWorkAreas();
        }
    }, [userData]);

    const handleLogout = async () => {
        await signOut(auth);
        setPatchAttempted(false);
    };

    // --- LOGICA DI VISUALIZZAZIONE (invariata) ---
    if (!appStatusChecked || !authChecked) { /* ... caricamento ... */ }
    if (!isAppActive) { /* ... app bloccata ... */ }
    if (!user) { return <LoginScreen />; }
    if (!userData) { /* ... caricamento dati utente ... */}

    // Rimosso check mustChangePassword

    if (userData.role === 'admin' || userData.role === 'preposto') {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
    }
    if (userData.role === 'dipendente') {
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // Errore ruolo
    return ( /* ... schermata errore ... */ );
};

export default App;

