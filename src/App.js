import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore'; // Aggiunto onSnapshot
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePassword from './components/ChangePassword';

// Aggiungi questa riga per "spiare" quale progetto sta usando l'app
console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);
    
    // --- NUOVI STATI PER IL BLOCCO APP ---
    const [isAppActive, setIsAppActive] = useState(true); // Default: l'app è attiva
    const [appStatusChecked, setAppStatusChecked] = useState(false); // Sappiamo quando abbiamo controllato lo stato

    // --- NUOVO EFFECT PER CONTROLLARE LO STATO DELL'APP (KILL SWITCH) ---
    useEffect(() => {
        console.log("--- CONTROLLO STATO APP (KILL SWITCH) ---");
        const configRef = doc(db, 'app_config', 'status');
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().isAttiva === false) {
                console.log("APP BLOCCATA DALL'AMMINISTRATORE");
                setIsAppActive(false);
            } else {
                console.log("App è ATTIVA.");
                setIsAppActive(true);
            }
            setAppStatusChecked(true); // Abbiamo controllato, possiamo procedere
        }, (error) => {
            console.error("Errore nel leggere la configurazione dell'app:", error);
            // In caso di errore (es. doc non esiste), lasciamo l'app attiva per sicurezza
            setIsAppActive(true);
            setAppStatusChecked(true);
        });

        return () => unsubscribe();
    }, []);

    // Effect per l'autenticazione utente
    useEffect(() => {
        // Non procedere se non sappiamo ancora se l'app è attiva
        if (!appStatusChecked) return;

        console.log("--- APP AVVIATA: Inizio controllo autenticazione ---");
        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            if (authenticatedUser) {
                console.log("1. Utente autenticato:", authenticatedUser.uid);
                
                let userProfile = null;
                // Prima cerca l'utente nella collezione 'users' (admin/preposto)
                const userDocRef = doc(db, 'users', authenticatedUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                
                if (userDocSnap.exists()) {
                    userProfile = userDocSnap.data();
                } else {
                    // Se non è admin/preposto, cerca nella collezione 'employees' usando una QUERY
                    console.log("Utente non trovato in 'users', cerco in 'employees' con una query...");
                    const employeesCollectionRef = collection(db, 'employees');
                    const q = query(employeesCollectionRef, where("userId", "==", authenticatedUser.uid));
                    const employeeQuerySnapshot = await getDocs(q);

                    if (!employeeQuerySnapshot.empty) {
                        // Trovato! Prendiamo il primo (e unico) risultato
                        const employeeDocSnap = employeeQuerySnapshot.docs[0];
                        // Aggiungiamo l'ID del documento e il ruolo al profilo
                        userProfile = { id: employeeDocSnap.id, ...employeeDocSnap.data(), role: 'employee' };
                    }
                }

                if (userProfile) {
                    console.log("2. Profilo utente trovato:", userProfile);
                    try {
                        const areasSnapshot = await getDocs(collection(db, "work_areas"));
                        const areas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        console.log("3. Aree di lavoro caricate:", areas);
                        setAllWorkAreas(areas);
                    } catch (error) {
                        console.error("ERRORE nel caricamento delle aree di lavoro:", error);
                        setAllWorkAreas([]);
                    }
                    
                    setUserData(userProfile);
                    setUser(authenticatedUser);
                } else {
                    console.error("ERRORE: Utente non trovato nel database, logout in corso.");
                    await signOut(auth);
                    setUser(null);
                    setUserData(null);
                }
            } else {
                console.log("Nessun utente autenticato.");
                setUser(null);
                setUserData(null);
            }
            
            console.log("--- FINE CONTROLLO ---");
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, [appStatusChecked]); // Riesegui questo check solo quando lo stato dell'app è stato verificato

    const handleLogout = async () => {
        await signOut(auth);
    };

    // --- NUOVA LOGICA DI VISUALIZZAZIONE ---

    // 1. Schermata di caricamento iniziale, finché non sappiamo se l'app è attiva
    if (!appStatusChecked) {
        return <div className="min-h-screen flex items-center justify-center">Verifica dello stato dell'app in corso...</div>;
    }

    // 2. Se l'app NON è attiva, mostra la schermata di blocco a tutti
    if (!isAppActive) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center p-4">
                 <h1 className="text-2xl font-bold text-red-600 mb-2">Applicazione non attiva</h1>
                 <p className="text-gray-700">L'applicazione è temporaneamente non disponibile. Contattare l'amministratore per maggiori informazioni.</p>
            </div>
        );
    }
    
    // 3. Se l'app è attiva, ma stiamo ancora controllando l'utente
    if (!authChecked) {
        return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;
    }

    // 4. Se non c'è utente, mostra il Login
    if (!user) {
        return <LoginScreen />;
    }

    // 5. Se l'utente deve cambiare password
    if (userData && userData.mustChangePassword) {
        return <ChangePassword user={user} />;
    }
    
    // 6. Se è admin o preposto
    if (userData && (userData.role === 'admin' || userData.role === 'preposto')) {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
    }

    // 7. Se è un dipendente
    if (userData && userData.role === 'employee') {
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // 8. Se l'utente è loggato ma non ha un ruolo riconosciuto
    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <p>Ruolo utente non riconosciuto o dati non disponibili.</p>
            <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-gray-500 text-white rounded">
                Logout
            </button>
        </div>
    );
};

export default App;
