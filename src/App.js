import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePassword from './components/ChangePassword';

// NUOVO: Componente per la schermata di blocco
const AppBlockedScreen = () => (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 p-4 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Servizio momentaneamente non disponibile</h1>
        <p className="text-gray-700">L'applicazione è in fase di manutenzione. Si prega di riprovare più tardi.</p>
    </div>
);

function App() {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // NUOVO STATO: Per controllare se l'app è attiva
    const [isAppActive, setIsAppActive] = useState(false);

    useEffect(() => {
        // MODIFICA: La funzione ora è asincrona per controllare lo stato prima di tutto
        const checkAppStatusAndAuth = async () => {
            try {
                // 1. Controlla lo stato dell'applicazione dal flag su Firestore
                const configDocRef = doc(db, 'app_config', 'status');
                const configDocSnap = await getDoc(configDocRef);

                if (configDocSnap.exists() && configDocSnap.data().isAttiva === true) {
                    setIsAppActive(true); // App attiva, procedi con l'autenticazione
                } else {
                    setIsAppActive(false); // App bloccata
                    setIsLoading(false); // Fine del caricamento, mostra la schermata di blocco
                    return; // Interrompe l'esecuzione
                }
            } catch (error) {
                console.error("Errore nel controllo dello stato dell'app:", error);
                setIsAppActive(false); // Blocco di sicurezza in caso di errore
                setIsLoading(false);
                return;
            }

            // 2. Se l'app è attiva, imposta il listener di autenticazione (codice precedente)
            const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
                if (authenticatedUser) {
                    const userDocRef = doc(db, 'users', authenticatedUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) {
                        setUserData(userDocSnap.data());
                        setUser(authenticatedUser);
                    } else {
                        // Gestisce il caso in cui l'utente auth esiste ma non ha un documento in 'users'
                        await signOut(auth);
                    }
                } else {
                    setUser(null);
                    setUserData(null);
                }
                setIsLoading(false);
            });

            return () => unsubscribe();
        };

        checkAppStatusAndAuth();
    }, []);
    
    const handlePasswordChanged = () => {
        setUserData(prevUserData => ({ ...prevUserData, requiresPasswordChange: false }));
    };

    const handleLogout = async () => {
        try {
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
    
    // NUOVO CONTROLLO: Se l'app non è attiva, mostra la schermata di blocco
    if (!isAppActive) {
        return <AppBlockedScreen />;
    }

    if (user && userData) {
        if (userData.requiresPasswordChange) {
            return <ChangePassword onPasswordChanged={handlePasswordChanged} />;
        }
        if (userData.role === 'admin' || userData.role === 'preposto') {
            return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
        } else if (userData.role === 'employee') {
            return <EmployeeDashboard user={user} userData={userData} handleLogout={handleLogout} />;
        }
    }
    
    return <LoginScreen />;
}

export default App;