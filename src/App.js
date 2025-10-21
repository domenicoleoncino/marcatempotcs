import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
// Rimosso l'import di ChangePassword

console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);
    
    const [isAppActive, setIsAppActive] = useState(true);
    const [appStatusChecked, setAppStatusChecked] = useState(false);

    // Effect #1: Controlla lo stato globale dell'app (kill switch)
    useEffect(() => {
        const configRef = doc(db, 'app_config', 'status');
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().isAttiva === false) {
                setIsAppActive(false);
            } else {
                setIsAppActive(true);
            }
            setAppStatusChecked(true);
        }, () => {
            setIsAppActive(true);
            setAppStatusChecked(true);
        });
        return () => unsubscribe();
    }, []);

    // Effect #2: Gestisce l'autenticazione e carica i dati dell'utente
    useEffect(() => {
        if (!appStatusChecked) return;

        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            if (!authenticatedUser) {
                setUser(null);
                setUserData(null);
                setAuthChecked(true);
                return;
            }

            setUser(authenticatedUser);
            const userDocRef = doc(db, 'users', authenticatedUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const baseProfile = userDocSnap.data();
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
                         console.error(`ERRORE: Utente '${baseProfile.role}' non ha un profilo 'employees'.`);
                         await signOut(auth);
                    }
                } else {
                    console.error(`ERRORE: Ruolo '${baseProfile.role}' non riconosciuto.`);
                    setUserData(baseProfile);
                }
            } else {
                console.error("ERRORE: Utente non trovato in 'users'.");
                await signOut(auth);
            }
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, [appStatusChecked]);

    // Effect #3: Carica le aree di lavoro se necessario
    useEffect(() => {
        if (userData && (userData.role === 'dipendente' || userData.role === 'preposto')) {
            const loadWorkAreas = async () => {
                try {
                    const areasSnapshot = await getDocs(collection(db, "work_areas"));
                    setAllWorkAreas(areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                } catch (error) {
                    console.error("ERRORE nel caricamento delle aree di lavoro:", error);
                }
            };
            loadWorkAreas();
        }
    }, [userData]);

    const handleLogout = async () => {
        await signOut(auth);
    };

    // --- LOGICA DI VISUALIZZAZIONE ---

    if (!appStatusChecked || !authChecked) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100">Caricamento...</div>;
    }

    if (!isAppActive) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center p-4">
                <h1 className="text-2xl font-bold text-red-600 mb-2">Applicazione non attiva</h1>
                <p className="text-gray-700">Contattare l'amministratore per maggiori informazioni.</p>
            </div>
        );
    }
    
    if (!user) {
        return <LoginScreen />;
    }
    
    if (!userData) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100">Caricamento dati utente...</div>;
    }

    // RIMOSSO il controllo per mustChangePassword

    if (userData.role === 'admin' || userData.role === 'preposto') {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
    }

    if (userData.role === 'dipendente') {
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <p className="font-bold text-red-600">Ruolo utente non riconosciuto o dati non disponibili.</p>
            <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-gray-500 text-white rounded">Logout</button>
        </div>
    );
};

export default App;

