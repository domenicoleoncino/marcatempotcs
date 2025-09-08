import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

function App() {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            if (authenticatedUser) {
                const userDocRef = doc(db, 'users', authenticatedUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const fetchedUserData = userDocSnap.data();

                    // *** NUOVA LOGICA DI CONTROLLO DISPOSITIVO BASATA SUL RUOLO ***
                    if (fetchedUserData.role === 'employee') {
                        const deviceLock = localStorage.getItem('deviceLock');
                        if (deviceLock) {
                            const lockData = JSON.parse(deviceLock);
                            if (lockData.email !== authenticatedUser.email) {
                                // Dispositivo bloccato da un altro dipendente, logout forzato
                                sessionStorage.setItem('loginError', 'Accesso bloccato. Questo dispositivo è registrato per un altro utente.');
                                await signOut(auth);
                                setIsLoading(false);
                                return; // Interrompe l'esecuzione per evitare di impostare l'utente
                            }
                        } else {
                            // Primo login di un dipendente su questo dispositivo, imposta il blocco
                            localStorage.setItem('deviceLock', JSON.stringify({ email: authenticatedUser.email }));
                        }
                    } else if (fetchedUserData.role === 'admin' || fetchedUserData.role === 'preposto') {
                        // Gli admin e i preposti non bloccano il dispositivo, anzi, lo sbloccano
                        localStorage.removeItem('deviceLock');
                    }

                    setUserData(fetchedUserData);
                    setUser(authenticatedUser);
                } else {
                    setUserData({ role: 'unknown' });
                    setUser(authenticatedUser);
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
        try {
            // Rimuove il blocco del dispositivo solo se l'utente che fa logout è un dipendente
            if (userData && userData.role === 'employee') {
                localStorage.removeItem('deviceLock');
            }
            await signOut(auth);
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
    
    if (user && userData) {
        if (userData.role === 'admin' || userData.role === 'preposto') {
            return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
        } else if (userData.role === 'employee') {
            return <EmployeeDashboard user={user} handleLogout={handleLogout} />;
        }
    }
    
    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-sm mx-auto">
                <LoginScreen />
            </div>
        </div>
    );
}

export default App;