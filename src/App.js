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
    const [authChecked, setAuthChecked] = useState(false); // Stato per sapere quando il check iniziale è finito
    
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
            if (authenticatedUser) {
                const userDocRef = doc(db, 'users', authenticatedUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const baseProfile = userDocSnap.data();
                    if (baseProfile.role === 'admin') {
                        setUserData(baseProfile);
                        setUser(authenticatedUser);
                    } else if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                        const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                        const employeeQuerySnapshot = await getDocs(q);
                        
                        if (!employeeQuerySnapshot.empty) {
                            const employeeDoc = employeeQuerySnapshot.docs[0];
                            const employeeProfile = employeeDoc.data();
                            const fullProfile = { 
                                ...baseProfile,
                                ...employeeProfile,
                                id: employeeDoc.id
                            };
                            setUserData(fullProfile);
                            setUser(authenticatedUser);
                        } else {
                             console.error(`ERRORE CRITICO: Utente con ruolo '${baseProfile.role}' non ha un profilo 'employees'.`);
                             await signOut(auth);
                        }
                    } else {
                        console.error(`ERRORE: Ruolo '${baseProfile.role}' non riconosciuto.`);
                        setUserData(baseProfile); // Imposta per mostrare errore
                        setUser(authenticatedUser);
                    }
                } else {
                    console.error("ERRORE: Utente non trovato in 'users'. Logout in corso.");
                    await signOut(auth);
                }
            } else {
                setUser(null);
                setUserData(null);
            }
            // Segna che il controllo di autenticazione è terminato
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, [appStatusChecked]);

    const handleLogout = async () => {
        await signOut(auth);
    };

    // --- LOGICA DI VISUALIZZAZIONE CORRETTA ---

    // 1. Mostra una schermata di caricamento finché non siamo sicuri dello stato dell'app E dell'utente
    if (!appStatusChecked || !authChecked) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100">Caricamento in corso...</div>;
    }

    // 2. Se l'app è bloccata, mostra il messaggio di blocco
    if (!isAppActive) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center p-4">
                <h1 className="text-2xl font-bold text-red-600 mb-2">Applicazione non attiva</h1>
                <p className="text-gray-700">Contattare l'amministratore per maggiori informazioni.</p>
            </div>
        );
    }
    
    // A questo punto, sappiamo se l'utente è loggato o no.

    // 3. Se c'è un utente loggato, controlla se deve cambiare password
    if (user) {
        if (userData && userData.mustChangePassword === true) {
            return <ChangePassword 
                        user={user} 
                        onPasswordChanged={() => setUserData(prev => ({ ...prev, mustChangePassword: false }))} 
                    />;
        }

        // Se non deve cambiare password, mostra la dashboard corretta
        if (userData && (userData.role === 'admin' || userData.role === 'preposto')) {
            return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
        }

        if (userData && userData.role === 'dipendente') {
            const loadWorkAreas = async () => {
                try {
                    const areasSnapshot = await getDocs(collection(db, "work_areas"));
                    const areas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setAllWorkAreas(areas);
                } catch (error) {
                    console.error("ERRORE nel caricamento delle aree di lavoro:", error);
                }
            };
            if (allWorkAreas.length === 0) loadWorkAreas();
            return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
        }

        // Se il ruolo non è riconosciuto, mostra l'errore
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <p className="font-bold text-red-600">Ruolo utente non riconosciuto o dati non disponibili.</p>
                <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-gray-500 text-white rounded">Logout</button>
            </div>
        );
    }

    // 4. Se non c'è nessun utente loggato, mostra la schermata di login
    return <LoginScreen />;
};

export default App;

