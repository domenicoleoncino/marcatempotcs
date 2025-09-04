import React from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// Importa gli stili globali
import './App.css';

// Importa i componenti
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

export default function App() {
    const [user, setUser] = React.useState(null);
    const [userRole, setUserRole] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
        script.async = true;
        document.head.appendChild(script);

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const lockData = { email: firebaseUser.email };
                localStorage.setItem('deviceLock', JSON.stringify(lockData));
            }
            try {
                if (firebaseUser) {
                    const userDocRef = doc(db, "users", firebaseUser.uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        setUser(firebaseUser);
                        setUserRole(userDoc.data().role);
                    } else {
                        const detailedError = `ERRORE: L'utente ${firebaseUser.email} non ha un ruolo nel DB.`;
                        sessionStorage.setItem('loginError', detailedError);
                        await signOut(auth);
                    }
                } else {
                    setUser(null);
                    setUserRole(null);
                }
            } catch (error) {
                let errorMessage = 'Errore di rete o di configurazione. Riprova.';
                if (error.code === 'permission-denied') {
                    errorMessage = "ERRORE DI PERMESSI: Controlla le Regole di Sicurezza in Firebase.";
                }
                sessionStorage.setItem('loginError', errorMessage);
            } finally {
                setIsLoading(false);
            }
        });

        return () => {
            document.head.removeChild(script);
            unsubscribe();
        };
    }, []);

    const handleLogout = async () => {
        localStorage.removeItem('deviceLock');
        await signOut(auth);
    };

    if (isLoading) {
        return (
            <div className="layout-main-centered">
                <p className="text-xl font-semibold">Caricamento in corso...</p>
            </div>
        );
    }

    // Renderizza il contenuto dentro un contenitore di layout
    return (
        <div className="layout-container">
            {!user ? (
                <main className="layout-main-centered">
                    <LoginScreen />
                </main>
            ) : userRole === 'admin' ? (
                <AdminDashboard user={user} handleLogout={handleLogout} />
            ) : userRole === 'employee' ? (
                <EmployeeDashboard user={user} handleLogout={handleLogout} />
            ) : (
                <main className="layout-main-centered">
                    <p className="text-xl font-semibold">Ruolo utente non definito.</p>
                    <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
                </main>
            )}
        </div>
    );
}