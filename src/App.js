import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePassword from './components/ChangePassword';

console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);
    
    const [isAppActive, setIsAppActive] = useState(true);
    const [appStatusChecked, setAppStatusChecked] = useState(false);

    useEffect(() => {
        const configRef = doc(db, 'app_config', 'status');
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().isAttiva === false) {
                setIsAppActive(false);
            } else {
                setIsAppActive(true);
            }
            setAppStatusChecked(true);
        }, (error) => {
            console.error("Errore nel leggere la configurazione dell'app:", error);
            setIsAppActive(true);
            setAppStatusChecked(true);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!appStatusChecked) return;

        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            // Se l'utente fa logout, resetta tutto e segna il check come completato
            if (!authenticatedUser) {
                setUser(null);
                setUserData(null);
                setAuthChecked(true); // Abbiamo finito, l'utente non è loggato
                return;
            }

            // Se c'è un utente, iniziamo a caricare i suoi dati
            console.log("1. Utente autenticato con UID:", authenticatedUser.uid);
            setUser(authenticatedUser); // Imposta subito l'utente Auth

            const userDocRef = doc(db, 'users', authenticatedUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const baseProfile = userDocSnap.data();
                console.log("2. Profilo base trovato in 'users':", baseProfile);

                if (baseProfile.role === 'admin') {
                    setUserData(baseProfile);
                } else if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                    const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                    const employeeQuerySnapshot = await getDocs(q);
                    
                    if (!employeeQuerySnapshot.empty) {
                        const employeeDoc = employeeQuerySnapshot.docs[0];
                        const fullProfile = { 
                            ...baseProfile,
                            ...employeeDoc.data(),
                            id: employeeDoc.id
                        };
                        setUserData(fullProfile);
                    } else {
                         console.error(`ERRORE: Utente '${baseProfile.role}' non ha un profilo 'employees'.`);
                         await signOut(auth); // Forza il logout se i dati sono incoerenti
                    }
                } else {
                    console.error(`ERRORE: Ruolo '${baseProfile.role}' non riconosciuto.`);
                    setUserData(baseProfile);
                }
            } else {
                console.error("ERRORE: Utente non trovato in 'users'.");
                await signOut(auth);
            }
            // Alla fine di tutto, segna il check come completato
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, [appStatusChecked]);

    const handleLogout = async () => {
        await signOut(auth);
    };

    // --- NUOVA LOGICA DI VISUALIZZAZIONE PIÙ ROBUSTA ---

    // 1. Mostra caricamento finché non abbiamo controllato lo stato dell'app
    if (!appStatusChecked) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100">Verifica stato app...</div>;
    }

    // 2. Se l'app è bloccata, mostra il messaggio
    if (!isAppActive) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center p-4">
                <h1 className="text-2xl font-bold text-red-600 mb-2">Applicazione non attiva</h1>
                <p className="text-gray-700">Contattare l'amministratore per maggiori informazioni.</p>
            </div>
        );
    }
    
    // 3. Mostra caricamento se stiamo ancora verificando l'utente O se abbiamo l'utente ma non ancora i suoi dati
    if (!authChecked || (user && !userData)) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100">Caricamento utente...</div>;
    }

    // 4. Se non c'è utente (check completato), mostra Login
    if (!user) {
        return <LoginScreen />;
    }

    // A questo punto, abbiamo SIA 'user' CHE 'userData'

    // 5. Se l'utente deve cambiare password
    if (userData.mustChangePassword === true) {
        return <ChangePassword 
                    user={user} 
                    onPasswordChanged={() => setUserData(prev => ({ ...prev, mustChangePassword: false }))} 
                />;
    }

    // 6. Mostra le dashboard in base al ruolo
    if (userData.role === 'admin' || userData.role === 'preposto') {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
    }

    if (userData.role === 'dipendente') {
        const loadWorkAreas = async () => {
            try {
                const areasSnapshot = await getDocs(collection(db, "work_areas"));
                setAllWorkAreas(areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            } catch (error) {
                console.error("ERRORE nel caricamento delle aree di lavoro:", error);
            }
        };
        if (allWorkAreas.length === 0) loadWorkAreas();
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // 7. Se il ruolo non è valido, mostra errore
    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <p className="font-bold text-red-600">Ruolo utente non riconosciuto o dati non disponibili.</p>
            <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-gray-500 text-white rounded">Logout</button>
        </div>
    );
};

export default App;



