import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

function App() {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null); // Stato per i dati utente da Firestore (con il ruolo)
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            if (authenticatedUser) {
                // Utente loggato, ora carichiamo i suoi dati specifici (incluso il ruolo)
                const userDocRef = doc(db, 'users', authenticatedUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    setUserData(userDocSnap.data());
                } else {
                    // Se non troviamo i dati, potrebbe essere un errore o un utente incompleto
                    setUserData({ role: 'unknown' }); 
                }
                setUser(authenticatedUser);
            } else {
                setUser(null);
                setUserData(null);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            // Pulizia stati
            setUser(null);
            setUserData(null);
        } catch (error) {
            console.error("Errore durante il logout:", error);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <p>Caricamento applicazione...</p>
            </div>
        );
    }
    
    // Logica per decidere quale pannello mostrare
    if (user && userData) {
        if (userData.role === 'admin' || userData.role === 'preposto') {
            return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
        } else if (userData.role === 'employee') {
            return <EmployeeDashboard user={user} handleLogout={handleLogout} />;
        }
    }
    
    // Se non c'è utente, mostra la schermata di login
    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-sm mx-auto">
                <LoginScreen />
            </div>
        </div>
    );
}

export default App;