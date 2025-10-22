// File: src/js/App.js

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
// Assicurati che 'updateDoc' e 'doc' siano importati da firestore
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
// Rimosso import non necessario: getFunctions, httpsCallable
// import { getFunctions, httpsCallable } from 'firebase/functions'; // Non servono qui
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
// Importa il componente per il cambio password
import ChangePasswordScreen from './components/ChangePasswordScreen';

console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);
    const [isAppActive, setIsAppActive] = useState(true);
    const [appStatusChecked, setAppStatusChecked] = useState(false);
    // patchAttempted non è più necessario per la logica patch, ma lo lasciamo se serve altrove
    // const [patchAttempted, setPatchAttempted] = useState(false);

    // Effect #1: Controlla stato app (kill switch)
    useEffect(() => {
        const configRef = doc(db, 'app_config', 'status');
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            setIsAppActive(!(docSnap.exists() && docSnap.data().isAttiva === false));
            setAppStatusChecked(true);
        }, (error) => {
            console.error("Errore lettura config app:", error);
            setIsAppActive(true); // Default a true in caso di errore
            setAppStatusChecked(true);
        });
        return () => unsubscribe();
    }, []);

    // Effect #2: Autenticazione e Caricamento Dati Utente
    useEffect(() => {
        if (!appStatusChecked) return; // Aspetta controllo kill switch

        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            setAuthChecked(false); // Inizia caricamento
            setUserData(null); // Resetta dati utente

            if (!authenticatedUser) {
                // Utente non loggato
                setUser(null);
                setAuthChecked(true); // Fine controllo
                return;
            }

            // Utente loggato
            setUser(authenticatedUser);
            console.log("1. Utente autenticato:", authenticatedUser.uid, authenticatedUser.email);

            // Forza refresh token per ottenere claim aggiornati (importante!)
            try {
                console.log("Forzo aggiornamento token ID...");
                await authenticatedUser.getIdToken(true); // true forza il refresh
                console.log("Token ID aggiornato.");
            } catch (tokenError) {
                console.error("Errore durante aggiornamento forzato del token:", tokenError);
                // Non bloccare, ma segnalare
            }

            // --- Blocco Patch Admin (Disattivato e Commentato) ---
            /*
            const superAdminEmail = "domenico.leoncino@tcsitalia.com";
            if (authenticatedUser.email === superAdminEmail && !patchAttempted) {
                // ... logica patch commentata ...
            }
            */
            // --- FINE BLOCCO PATCH ---

            // Carica dati utente da Firestore
            const userDocRef = doc(db, 'users', authenticatedUser.uid);
            try {
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const baseProfile = userDocSnap.data();
                    console.log("2. Profilo base trovato:", baseProfile);

                    // Gestione ruoli e unione con profilo 'employees'
                    if (baseProfile.role === 'admin') {
                        // Per l'admin, usiamo direttamente il profilo 'users'
                        // (che include il flag mustChangePassword)
                        setUserData(baseProfile);
                    } else if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                        const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                        const employeeQuerySnapshot = await getDocs(q);
                        if (!employeeQuerySnapshot.empty) {
                            const employeeDoc = employeeQuerySnapshot.docs[0];
                            // Uniamo baseProfile (che contiene mustChangePassword) con employeeData
                            const fullProfile = { ...baseProfile, ...employeeDoc.data(), id: employeeDoc.id };
                            setUserData(fullProfile);
                        } else {
                            console.error(`ERRORE: Utente '${baseProfile.role}' (UID: ${authenticatedUser.uid}) non ha profilo 'employees'.`);
                            // Imposta stato errore invece di fare logout per evitare loop
                            setUserData({ ...baseProfile, role: 'dati_corrotti' });
                        }
                    } else {
                        console.error(`ERRORE: Ruolo '${baseProfile.role}' non riconosciuto.`);
                        setUserData(baseProfile); // Mostra errore ruolo non riconosciuto
                    }
                } else {
                    console.error("ERRORE: Utente non trovato in 'users'. (UID: " + authenticatedUser.uid + ")");
                    setUserData({ role: 'sconosciuto' }); // Mostra errore utente sconosciuto
                }
            } catch (dbError) {
                console.error("Errore durante lettura dati utente da Firestore:", dbError);
                setUserData({ role: 'errore_db' }); // Stato di errore generico DB
            } finally {
                setAuthChecked(true); // Fine caricamento (anche in caso di errore)
            }
        });
        return () => unsubscribe(); // Pulisce listener
    // }, [appStatusChecked, patchAttempted]); // Rimosso patchAttempted se non più usato
     }, [appStatusChecked]); // Rimosso patchAttempted dalle dipendenze


    // Effect #3: Carica aree (per dipendente/preposto)
    useEffect(() => {
        // Carica aree solo se l'utente è dipendente o preposto E i suoi dati sono caricati
        if (userData && (userData.role === 'dipendente' || userData.role === 'preposto')) {
            const loadWorkAreas = async () => {
                console.log("Caricamento aree di lavoro...");
                try {
                    const areasRef = collection(db, 'work_areas');
                    // Usiamo onSnapshot per aggiornamenti in tempo reale (opzionale, getDocs va bene se le aree cambiano raramente)
                    const unsubscribe = onSnapshot(areasRef, (snapshot) => {
                         const areas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                         setAllWorkAreas(areas);
                         console.log("Aree caricate:", areas.length);
                    }, (error) => {
                         console.error("Errore (snapshot) caricamento aree:", error);
                         setAllWorkAreas([]); // Resetta in caso di errore
                    });
                    // Ritorna la funzione di unsubscribe per pulire il listener
                    return unsubscribe;

                } catch (error) { // Catch per errori immediati (es. permessi query)
                    console.error("Errore (try/catch) caricamento aree:", error);
                    setAllWorkAreas([]);
                }
            };
            // Chiama la funzione e salva l'eventuale unsubscribe
            const unsubscribeAreas = loadWorkAreas();
            // Pulisce il listener quando userData cambia o il componente si smonta
            return () => {
                if (unsubscribeAreas && typeof unsubscribeAreas === 'function') {
                    unsubscribeAreas();
                }
            };
        } else {
            setAllWorkAreas([]); // Resetta le aree se l'utente non è dipendente/preposto
        }
    }, [userData]); // Si attiva quando cambiano i dati utente


    const handleLogout = async () => {
        try {
            await signOut(auth);
            // Non serve resettare altro qui, onAuthStateChanged farà il resto
        } catch (error) {
            console.error("Errore durante il logout:", error);
        }
    };

    // Funzione chiamata da ChangePasswordScreen dopo il successo
    const handlePasswordChanged = async () => {
        if (!user) return; // Sicurezza
        const userDocRef = doc(db, 'users', user.uid);
        try {
            // Aggiorna il flag in Firestore a false
            await updateDoc(userDocRef, { mustChangePassword: false });
            // Aggiorna lo stato locale userData. Questo triggererà un re-render
            // e il controllo if(mustChangePassword) diventerà falso, mostrando la dashboard.
            setUserData(prevData => {
                if (!prevData) return null; // Sicurezza
                return { ...prevData, mustChangePassword: false };
            });
            console.log("Flag mustChangePassword aggiornato a false.");
        } catch (error) {
            console.error("Errore nell'aggiornare il flag mustChangePassword:", error);
            alert("Si è verificato un errore nell'aggiornamento del profilo. Riesegui il login.");
            // Forzare logout in caso di errore grave nell'aggiornamento del flag
            await handleLogout();
        }
    };


    // --- LOGICA DI VISUALIZZAZIONE ---

    // 1. Caricamenti iniziali
    if (!appStatusChecked || !authChecked) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                Caricamento...
            </div>
        );
    }

    // 2. App bloccata
    if (!isAppActive) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h1>App in Manutenzione</h1>
                <p>L'applicazione è temporaneamente sospesa per manutenzione. Riprova più tardi.</p>
            </div>
        );
    }

    // 3. Schermata di Login (se non autenticato)
    if (!user) {
        return <LoginScreen />;
    }

    // 4. Caricamento dati utente (se autenticato ma dati non ancora pronti)
    //    Questo stato non dovrebbe durare molto dopo che authChecked è true.
    if (!userData) {
         return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                Caricamento dati utente...
            </div>
        );
    }

    // --- 5. CONTROLLO CAMBIO PASSWORD OBBLIGATORIO ---
    //    Questo controllo viene PRIMA del routing normale.
    if (userData && userData.mustChangePassword === true) {
        // Se il flag è true, mostra la schermata di cambio password
        // Passiamo l'utente (anche se ChangePasswordScreen usa auth.currentUser) e la callback
        return <ChangePasswordScreen user={user} onPasswordChanged={handlePasswordChanged} />;
    }
    // --- FINE CONTROLLO CAMBIO PASSWORD ---


    // 6. Routing basato sul ruolo (se cambio password non necessario)
    if (userData.role === 'admin' || userData.role === 'preposto') {
        // Passiamo allWorkAreas anche qui se serve ad AdminDashboard (es. per modali)
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }
    if (userData.role === 'dipendente') {
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // 7. Schermata di Errore (ruolo non riconosciuto, dati corrotti, errore db)
    return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            <h1>Errore di Configurazione o Dati</h1>
            <p>
                Si è verificato un errore: il tuo ruolo utente ('{userData.role || 'N/D'}') non è riconosciuto,
                i tuoi dati non sono configurati correttamente, oppure c'è stato un problema nel caricarli.
            </p>
            <p>Contatta l'amministratore.</p>
            <button onClick={handleLogout} style={{ marginTop: '20px' }}>
                Esegui Logout
            </button>
        </div>
    );
};

export default App;