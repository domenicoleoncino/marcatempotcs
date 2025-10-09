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
    const [isAppActive, setIsAppActive] = useState(true); // Default a true per evitare blocco se config non esiste

    const handleLogout = useCallback(async () => {
        try {
            await signOut(auth);
            setUser(null);
            setUserData(null);
        } catch (error) {
            console.error("Errore durante il logout:", error);
        }
    }, []);
    
    // Logica del timer di inattività
    useEffect(() => {
        let logoutTimer;
        const resetTimer = () => {
            clearTimeout(logoutTimer);
            logoutTimer = setTimeout(() => {
                if (auth.currentUser) {
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

        if (user) {
            setupActivityListeners();
        }

        return cleanupActivityListeners;
    }, [user, handleLogout]);


    // Logica di autenticazione e caricamento dati utente
    useEffect(() => {
        const checkAppStatusAndAuth = async () => {
            try {
                const configDocRef = doc(db, 'app_config', 'status');
                const configDocSnap = await getDoc(configDocRef);
                if (configDocSnap.exists() && configDocSnap.data().isAttiva === false) {
                    setIsAppActive(false);
                    setIsLoading(false);
                    return;
                }
            } catch (error) {
                console.error("Errore nel controllo stato app, l'app continuerà:", error);
            }
            setIsAppActive(true);

            const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
                setIsLoading(true);
                if (authenticatedUser) {
                    let userProfile = null;
                    
                    // 1. Cerca prima tra gli utenti admin/preposti
                    const userDocRef = doc(db, 'users', authenticatedUser.uid);
                    const userDocSnap = await getDoc(userDocRef);

                    if (userDocSnap.exists()) {
                        userProfile = userDocSnap.data();
                    } else {
                        // 2. Se non trovato, cerca tra i dipendenti
                        const employeeDocRef = doc(db, 'employees', authenticatedUser.uid);
                        const employeeDocSnap = await getDoc(employeeDocRef);

                        if (employeeDocSnap.exists()) {
                            userProfile = employeeDocSnap.data();
                        }
                    }

                    if (userProfile) {
                        setUserData(userProfile);
                        setUser(authenticatedUser);
                    } else {
                        console.error("Utente autenticato ma non trovato in Firestore. Eseguo logout.");
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
        // Switch per gestire i ruoli in modo pulito
        switch (userData.role) {
            case 'admin':
            case 'preposto':
                return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} />;
            case 'employee':
                return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} />;
            default:
                // Se il ruolo non è riconosciuto, forza il logout per sicurezza
                handleLogout();
                return <LoginScreen />;
        }
    }
    
    return <LoginScreen />;
}

export default App;