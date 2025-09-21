import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePassword from './components/ChangePassword';

// Componente per la schermata di blocco
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
    const [isAppActive, setIsAppActive] = useState(false);

    const handleLogout = useCallback(async () => {
        try {
            await signOut(auth);
            setUser(null);
            setUserData(null);
        } catch (error) {
            console.error("Errore durante il logout:", error);
        }
    }, []);
    
    // MODIFICA: Logica del timer di inattività migliorata
    useEffect(() => {
        let logoutTimer;

        const resetTimer = () => {
            clearTimeout(logoutTimer);
            logoutTimer = setTimeout(() => {
                if (auth.currentUser) { // Controlla se l'utente è ancora loggato prima di agire
                    console.log("Logout per inattività.");
                    handleLogout();
                }
            }, 600000); // 10 minuti
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'touchstart', 'scroll'];

        const setupActivityListeners = () => {
            events.forEach(event => window.addEventListener(event, resetTimer));
            resetTimer();
        };

        const cleanupActivityListeners = () => {
            clearTimeout(logoutTimer);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };

        // Il monitoraggio si attiva solo quando c'è un utente
        if (user) {
            setupActivityListeners();
        }

        // Funzione di pulizia
        return cleanupActivityListeners;
    }, [user, handleLogout]);


    useEffect(() => {
        const checkAppStatusAndAuth = async () => {
            try {
                const configDocRef = doc(db, 'app_config', 'status');
                const configDocSnap = await getDoc(configDocRef);

                if (configDocSnap.exists() && configDocSnap.data().isAttiva === true) {
                    setIsAppActive(true);
                } else {
                    setIsAppActive(false);
                    setIsLoading(false);
                    return;
                }
            } catch (error) {
                console.error("Errore nel controllo dello stato dell'app:", error);
                setIsAppActive(false);
                setIsLoading(false);
                return;
            }

            const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
                if (authenticatedUser) {
                    const userDocRef = doc(db, 'users', authenticatedUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) {
                        setUserData(userDocSnap.data());
                        setUser(authenticatedUser);
                    } else {
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

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <p>Caricamento applicazione...</p>
            </div>
        );
    }
    
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