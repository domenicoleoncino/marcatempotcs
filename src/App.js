import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePassword from './components/ChangePassword';

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false); // Nuovo stato per sapere quando il controllo iniziale è terminato

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            if (authenticatedUser) {
                // L'utente è loggato, carica tutti i dati necessari in sequenza
                
                // 1. Carica il profilo utente
                let userProfile = null;
                const userDocRef = doc(db, 'users', authenticatedUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    userProfile = userDocSnap.data();
                } else {
                    const employeeDocRef = doc(db, 'employees', authenticatedUser.uid);
                    const employeeDocSnap = await getDoc(employeeDocRef);
                    if (employeeDocSnap.exists()) {
                        userProfile = { ...employeeDocSnap.data(), role: 'employee' };
                    }
                }

                if (userProfile) {
                    // 2. Carica le aree di lavoro
                    try {
                        const areasSnapshot = await getDocs(collection(db, "work_areas"));
                        const areas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setAllWorkAreas(areas);
                    } catch (error) {
                        console.error("Errore nel caricamento delle aree di lavoro:", error);
                        setAllWorkAreas([]);
                    }
                    
                    // 3. Imposta lo stato solo quando tutto è pronto
                    setUserData(userProfile);
                    setUser(authenticatedUser);
                } else {
                    // L'utente esiste in Auth ma non nel DB, forza il logout
                    console.error("Utente non trovato nel database, logout in corso.");
                    await signOut(auth);
                    setUser(null);
                    setUserData(null);
                    setAllWorkAreas([]);
                }
            } else {
                // L'utente è sloggato, pulisci tutti i dati
                setUser(null);
                setUserData(null);
                setAllWorkAreas([]);
            }
            
            // Segna che il controllo di autenticazione iniziale è completato
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, []); // Questo effetto viene eseguito solo una volta all'avvio

    const handleLogout = async () => {
        await signOut(auth);
        // Il listener onAuthStateChanged si occuperà di pulire lo stato
    };
    
    // Funzione da passare all'AdminDashboard per ricaricare i dati
    const fetchAllWorkAreas = async () => {
        try {
            const areasSnapshot = await getDocs(collection(db, "work_areas"));
            const areas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllWorkAreas(areas);
        } catch (error) {
            console.error("Errore nel ricaricare le aree di lavoro:", error);
        }
    };

    // Mostra un indicatore di caricamento globale finché il primo controllo non è terminato
    if (!authChecked) {
        return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;
    }

    // Dopo il controllo, se non c'è utente, mostra il login
    if (!user) {
        return <LoginScreen />;
    }

    // Se l'utente è loggato, procedi con la visualizzazione basata sul ruolo
    if (userData && userData.mustChangePassword) {
        return <ChangePassword user={user} />;
    }
    
    if (userData && (userData.role === 'admin' || userData.role === 'preposto')) {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} fetchAllData={fetchAllWorkAreas} />;
    }

    if (userData && userData.role === 'employee') {
        return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // Messaggio di fallback se l'utente è loggato ma il ruolo è sconosciuto
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

