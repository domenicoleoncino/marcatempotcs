// File: src/js/App.js
import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePasswordScreen from './components/ChangePasswordScreen';
import SimpleEmployeeApp from './components/SimpleEmployeeApp';

console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);
    const [isAppActive, setIsAppActive] = useState(true);
    const [appStatusChecked, setAppStatusChecked] = useState(false);

    // Effect #1: Controlla stato app (kill switch)
    useEffect(() => {
        const configRef = doc(db, 'app_config', 'status');
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            setIsAppActive(!(docSnap.exists() && docSnap.data().isAttiva === false));
            setAppStatusChecked(true);
        }, (error) => {
            console.error("Errore lettura config app:", error);
            setIsAppActive(true);
            setAppStatusChecked(true);
        });
        return () => unsubscribe();
    }, []);

    // Effect #2: Autenticazione e Caricamento Dati Utente
    useEffect(() => {
        if (!appStatusChecked) return; 

        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            setAuthChecked(false); 
            setUserData(null); 

            if (!authenticatedUser) {
                setUser(null);
                setAuthChecked(true); 
                return;
            }

            setUser(authenticatedUser);
            
            try { await authenticatedUser.getIdToken(true); } catch (e) { console.error(e); }

            const userDocRef = doc(db, 'users', authenticatedUser.uid);
            try {
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const baseProfile = userDocSnap.data(); 

                    if (baseProfile.role === 'admin') {
                        setUserData({ ...baseProfile, id: authenticatedUser.uid }); 
                    } else if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                        const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                        const employeeQuerySnapshot = await getDocs(q);
                        if (!employeeQuerySnapshot.empty) {
                            const employeeDoc = employeeQuerySnapshot.docs[0];
                            const fullProfile = {
                                ...employeeDoc.data(),   
                                ...baseProfile,    
                                id: employeeDoc.id 
                            };
                            setUserData(fullProfile);
                        } else {
                            setUserData({ ...baseProfile, id: authenticatedUser.uid, role: 'dati_corrotti' });
                        }
                    } else {
                        setUserData({ ...baseProfile, id: authenticatedUser.uid });
                    }
                } else {
                    setUserData({ role: 'sconosciuto', id: authenticatedUser.uid });
                }
            } catch (dbError) {
                console.error("Errore DB:", dbError);
                setUserData({ role: 'errore_db', id: authenticatedUser.uid });
            } finally {
                setAuthChecked(true); 
            }
        });
        return () => unsubscribe(); 
   }, [appStatusChecked]);


    // Effect #3: Carica aree
    useEffect(() => {
        if (userData && (userData.role === 'dipendente' || userData.role === 'preposto')) {
            const loadWorkAreas = async () => {
                try {
                    const areasRef = collection(db, 'work_areas');
                    const unsubscribe = onSnapshot(areasRef, (snapshot) => {
                        const areas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        setAllWorkAreas(areas);
                    });
                    return unsubscribe;
                } catch (error) { setAllWorkAreas([]); }
            };
            const unsubscribeAreas = loadWorkAreas();
            return () => { if (unsubscribeAreas && typeof unsubscribeAreas === 'function') unsubscribeAreas(); };
        } else {
            setAllWorkAreas([]); 
        }
    }, [userData]); 


    const handleLogout = async () => {
        try { await signOut(auth); } catch (error) { console.error(error); }
    };

    const handlePasswordChanged = async () => {
        if (!user) return; 
        const userDocRef = doc(db, 'users', user.uid);
        try {
            await updateDoc(userDocRef, { mustChangePassword: false });
            setUserData(prevData => ({ ...prevData, mustChangePassword: false }));
        } catch (error) {
            alert("Errore aggiornamento password. Riprova.");
        }
    };

    // --- VISUALIZZAZIONE ---

    if (!appStatusChecked || !authChecked) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Caricamento...</div>;
    }

    if (!isAppActive) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h1>App in Manutenzione</h1>
                <p>L'applicazione è temporaneamente sospesa per manutenzione.</p>
            </div>
        );
    }

    if (!user) return <LoginScreen />;

    if (!userData) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Caricamento profilo...</div>;

    if (userData && userData.mustChangePassword === true) {
        return <ChangePasswordScreen user={user} onPasswordChanged={handlePasswordChanged} />;
    }

    if (userData.role === 'admin' || userData.role === 'preposto') {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }
    
    if (userData.role === 'dipendente') {
       return <SimpleEmployeeApp user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
            <h1>Errore Ruolo</h1>
            <p>Ruolo non riconosciuto. Contatta l'amministratore.</p>
            <button onClick={handleLogout} style={{ marginTop: '20px' }}>Logout</button>
        </div>
    );
};

export default App;
