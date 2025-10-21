import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'; // Aggiunti query e where
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

    useEffect(() => {
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
                    // *** INIZIO CORREZIONE ***
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
                    // *** FINE CORREZIONE ***
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
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
    };
    
    // NOTA: Questa funzione non è più necessaria qui perché i dati vengono già caricati all'avvio
    // È stata mantenuta per non rompere le props passate ad AdminDashboard, ma potrebbe essere rimossa in futuro.
    const fetchAllWorkAreas = async () => {
        try {
            const areasSnapshot = await getDocs(collection(db, "work_areas"));
            const areas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllWorkAreas(areas);
        } catch (error) {
            console.error("Errore nel ricaricare le aree di lavoro:", error);
        }
    };

    if (!authChecked) {
        return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;
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

    if (userData && userData.role === 'employee') {
        // Passiamo allWorkAreas che abbiamo già caricato all'avvio
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

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
