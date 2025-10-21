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
                console.log("APP BLOCCATA DALL'AMMINISTRATORE");
                setIsAppActive(false);
            } else {
                console.log("App è ATTIVA.");
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
                console.log("1. Utente autenticato con UID:", authenticatedUser.uid);
                
                const userDocRef = doc(db, 'users', authenticatedUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const baseProfile = userDocSnap.data();
                    console.log("2. Profilo base trovato in 'users':", baseProfile);

                    if (baseProfile.role === 'admin') {
                        // Un ADMIN ha solo il profilo 'users'. Siamo a posto.
                        setUserData(baseProfile);
                        setUser(authenticatedUser);

                    } else if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                        // Sia DIPENDENTE che PREPOSTO hanno bisogno anche del profilo 'employees'.
                        console.log(`3. Ruolo '${baseProfile.role}', cerco dati aggiuntivi in 'employees'...`);
                        const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                        const employeeQuerySnapshot = await getDocs(q);
                        
                        if (!employeeQuerySnapshot.empty) {
                            const employeeDoc = employeeQuerySnapshot.docs[0];
                            const employeeProfile = employeeDoc.data();
                            console.log("4. Dati aggiuntivi trovati:", employeeProfile);

                            // Uniamo i dati da 'users' e 'employees' per creare un profilo completo
                            const fullProfile = { 
                                ...baseProfile,       // Contiene il RUOLO e dati anagrafici
                                ...employeeProfile,   // Contiene workAreaIds, deviceIds...
                                id: employeeDoc.id    // ID del documento 'employees' (utile per le timbrature)
                            };
                            
                            setUserData(fullProfile);
                            setUser(authenticatedUser);
                        } else {
                             console.error(`ERRORE CRITICO: Utente con ruolo '${baseProfile.role}' non ha un profilo corrispondente in 'employees'.`);
                             await signOut(auth);
                        }
                    } else {
                        console.error(`ERRORE: Ruolo '${baseProfile.role}' non riconosciuto.`);
                        setUserData(baseProfile);
                        setUser(authenticatedUser);
                    }
                } else {
                    console.error("ERRORE: Utente autenticato ma non trovato nel database 'users'. Logout in corso.");
                    await signOut(auth);
                }
            } else {
                console.log("Nessun utente autenticato.");
                setUser(null);
                setUserData(null);
            }
            
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, [appStatusChecked]);

    const handleLogout = async () => {
        await signOut(auth);
    };

    if (!appStatusChecked || !authChecked) {
        return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;
    }

    if (!isAppActive) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center p-4">
                <h1 className="text-2xl font-bold text-red-600 mb-2">Applicazione non attiva</h1>
                <p className="text-gray-700">L'applicazione è temporaneamente non disponibile. Contattare l'amministratore per maggiori informazioni.</p>
            </div>
        );
    }
    
    if (!user) {
        return <LoginScreen />;
    }

    if (userData && userData.mustChangePassword) {
        return <ChangePassword user={user} />;
    }
    
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

    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <p className="font-bold text-red-600">Ruolo utente non riconosciuto o dati non disponibili.</p>
            <p className="text-sm text-gray-500 mt-2">Contattare l'amministratore se il problema persiste.</p>
            <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-gray-500 text-white rounded">
                Logout
            </button>
        </div>
    );
};

export default App;

