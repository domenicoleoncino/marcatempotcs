import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'; // Assicurati che getDocs e collection siano importati
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePassword from './components/ChangePassword';

const AppShell = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [allWorkAreas, setAllWorkAreas] = useState([]); // Stato per memorizzare le aree

    // Funzione per caricare TUTTE le aree di lavoro
    const fetchAllData = useCallback(async () => {
        try {
            const areasSnapshot = await getDocs(collection(db, "work_areas"));
            const areas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllWorkAreas(areas);
        } catch (error) {
            console.error("Errore nel caricamento delle aree di lavoro:", error);
        }
    }, []);

    // Esegui il caricamento dei dati quando il componente si avvia
    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // Gestione dello stato di autenticazione dell'utente
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            setIsLoading(true);
            if (authenticatedUser) {
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
                    setUserData(userProfile);
                    setUser(authenticatedUser);
                } else {
                    console.error("Utente non trovato nel database, logout in corso.");
                    await signOut(auth);
                    setUser(null);
                    setUserData(null);
                }
            } else {
                setUser(null);
                setUserData(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        setUser(null);
        setUserData(null);
    };

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center">Caricamento in corso...</div>;
    }

    if (!user) {
        return <LoginScreen />;
    }

    if (userData && userData.mustChangePassword) {
        return <ChangePassword user={user} />;
    }
    
    // Passiamo 'allWorkAreas' ai componenti figli
    if (userData && (userData.role === 'admin' || userData.role === 'preposto')) {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} fetchAllData={fetchAllData} />;
    }

    if (userData && userData.role === 'employee') {
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