// File: src/js/App.js (Versione con Logica Device TEMPORANEAMENTE COMMENTATA)

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions'; // Lasciato import, commentata funzione
import { v4 as uuidv4 } from 'uuid'; // Lasciato import, commentata funzione
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePasswordScreen from './components/ChangePasswordScreen';

console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

// -----------------------------------------------------------------
// FUNZIONE HELPER: GENERAZIONE ID DISPOSITIVO (COMMENTATA)
// -----------------------------------------------------------------
/*
const getDeviceId = () => {
    let deviceId = localStorage.getItem('marcatempoDeviceId');
    if (!deviceId) {
        // Se non esiste, genera un nuovo ID e salvalo
        deviceId = uuidv4();
        localStorage.setItem('marcatempoDeviceId', deviceId);
    }
    return deviceId;
};
*/
// -----------------------------------------------------------------


const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);
    const [isAppActive, setIsAppActive] = useState(true);
    const [appStatusChecked, setAppStatusChecked] = useState(false);

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

    // Effect #2: Autenticazione e Caricamento Dati Utente (MODIFICATO: Rimosso blocco device)
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
            
            // ===============================================
            // INIZIO: LOGICA CONTROLLO DISPOSITIVO (COMMENTATA)
            // ===============================================
            /*
            const deviceId = getDeviceId();
            
            try {
                const functions = getFunctions(undefined, 'europe-west1'); // REGIONE DA CONFERMARE
                const registerDevice = httpsCallable(functions, 'registerDeviceAndCheckAccess');
                
                const result = await registerDevice({ deviceId: deviceId });
                
                if (result.data.status === 'blocked') {
                    // Se il backend risponde BLOCKED, forziamo il logout
                    alert(result.data.message || "Accesso bloccato: dispositivo non autorizzato. Contatta l'amministratore.");
                    await signOut(auth); 
                    return; // BLOCCA IL CARICAMENTO DEI DATI
                }
                
                console.log("Controllo dispositivo superato. Dispositivo ID:", deviceId);
            } catch (deviceError) {
                console.error("ERRORE CRITICO: Fallimento verifica dispositivo:", deviceError);
                // In caso di errore di rete/backend grave, blocca l'utente come misura di sicurezza
                alert("Errore durante la verifica del dispositivo. Esegui il logout e riprova.");
                await signOut(auth);
                return;
            }
            */
            // ===============================================
            // FINE: LOGICA CONTROLLO DISPOSITIVO
            // ===============================================


            console.log("1. Utente autenticato:", authenticatedUser.uid, authenticatedUser.email);

            // Forza refresh token per ottenere claim aggiornati (importante!)
            try {
                console.log("Forzo aggiornamento token ID...");
                await authenticatedUser.getIdToken(true); // true forza il refresh
                console.log("Token ID aggiornato.");
            } catch (tokenError) {
                console.error("Errore durante aggiornamento forzato del token:", tokenError);
            }

            // Carica dati utente da Firestore
            const userDocRef = doc(db, 'users', authenticatedUser.uid);
            try {
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const baseProfile = userDocSnap.data(); 
                    console.log("2. Profilo base 'users' trovato:", baseProfile);

                    // Gestione ruoli e unione con profilo 'employees'
                    if (baseProfile.role === 'admin') {
                        setUserData({ ...baseProfile, id: authenticatedUser.uid }); 
                    } else if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                        console.log(`Ruolo ${baseProfile.role}, cerco profilo 'employees'...`);
                        const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                        const employeeQuerySnapshot = await getDocs(q);
                        if (!employeeQuerySnapshot.empty) {
                            const employeeDoc = employeeQuerySnapshot.docs[0];
                            const employeeData = employeeDoc.data(); 
                            console.log("3. Profilo 'employees' trovato:", employeeData);

                            const fullProfile = {
                                ...employeeData,   
                                ...baseProfile,    
                                id: employeeDoc.id 
                            };

                            console.log("4. Profilo completo unito:", fullProfile);
                            setUserData(fullProfile);
                        } else {
                            console.error(`ERRORE: Utente '${baseProfile.role}' (UID: ${authenticatedUser.uid}) non ha profilo 'employees'.`);
                            setUserData({ ...baseProfile, id: authenticatedUser.uid, role: 'dati_corrotti' });
                        }
                    } else {
                        console.error(`ERRORE: Ruolo '${baseProfile.role}' non riconosciuto.`);
                        setUserData({ ...baseProfile, id: authenticatedUser.uid });
                    }
                } else {
                    console.error("ERRORE: Utente non trovato in 'users'. (UID: " + authenticatedUser.uid + ")");
                    setUserData({ role: 'sconosciuto', id: authenticatedUser.uid });
                }
            } catch (dbError) {
                console.error("Errore durante lettura dati utente da Firestore:", dbError);
                setUserData({ role: 'errore_db', id: authenticatedUser.uid });
            } finally {
                setAuthChecked(true); // Fine caricamento (anche in caso di errore)
            }
        });
        return () => unsubscribe(); 
   }, [appStatusChecked]);


    // Effect #3: Carica aree (per dipendente/preposto) - INVARIATO
    useEffect(() => {
        // Carica aree solo se l'utente è dipendente o preposto E i suoi dati sono caricati
        if (userData && (userData.role === 'dipendente' || userData.role === 'preposto')) {
            const loadWorkAreas = async () => {
                console.log("Caricamento aree di lavoro...");
                try {
                    const areasRef = collection(db, 'work_areas');
                    const unsubscribe = onSnapshot(areasRef, (snapshot) => {
                        const areas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setAllWorkAreas(areas);
                        console.log("Aree caricate:", areas.length);
                    }, (error) => {
                        console.error("Errore (snapshot) caricamento aree:", error);
                        setAllWorkAreas([]); 
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
                // Verifica che unsubscribeAreas sia una funzione prima di chiamarla
                if (unsubscribeAreas && typeof unsubscribeAreas === 'function') {
                    unsubscribeAreas();
                }
            };
        } else {
            setAllWorkAreas([]); 
        }
    }, [userData]); 


    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Errore durante il logout:", error);
        }
    };

    // Funzione chiamata da ChangePasswordScreen dopo il successo - INVARIATA
    const handlePasswordChanged = async () => {
        if (!user) return; 
        const userDocRef = doc(db, 'users', user.uid);
        try {
            await updateDoc(userDocRef, { mustChangePassword: false });
            setUserData(prevData => {
                if (!prevData) return null; 
                return { ...prevData, mustChangePassword: false };
            });
            console.log("Flag mustChangePassword aggiornato a false.");
        } catch (error) {
            console.error("Errore nell'aggiornare il flag mustChangePassword:", error);
            alert("Si è verificato un errore nell'aggiornamento del profilo. Riesegui il login.");
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
    if (!userData) {
         return (
             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                 Caricamento dati utente...
             </div>
         );
    }

    // 5. CONTROLLO CAMBIO PASSWORD OBBLIGATORIO
    if (userData && userData.mustChangePassword === true) {
        return <ChangePasswordScreen user={user} onPasswordChanged={handlePasswordChanged} />;
    }

    // 6. Routing basato sul ruolo 
    if (userData.role === 'admin' || userData.role === 'preposto') {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }
    if (userData.role === 'dipendente') {
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // 7. Schermata di Errore 
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