// File: src/App.js
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

    // --- NUOVO STATO: Rilevamento Mobile ---
    const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 900);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
                    
                    // ANTI-ERRORE: Normalizziamo il ruolo (tutto minuscolo, senza spazi)
                    const safeRole = (baseProfile.role || '').trim().toLowerCase();

                    if (safeRole === 'admin' || safeRole === 'segreteria') {
                        setUserData({ ...baseProfile, role: safeRole, id: authenticatedUser.uid }); 
                    } else if (safeRole === 'dipendente' || safeRole === 'preposto') {
                        const q = query(collection(db, 'employees'), where("userId", "==", authenticatedUser.uid));
                        const employeeQuerySnapshot = await getDocs(q);
                        if (!employeeQuerySnapshot.empty) {
                            const employeeDoc = employeeQuerySnapshot.docs[0];
                            const fullProfile = {
                                ...employeeDoc.data(),   
                                ...baseProfile,
                                role: safeRole,    
                                id: employeeDoc.id 
                            };
                            setUserData(fullProfile);
                        } else {
                            // Se è dipendente/preposto ma NON ha la scheda anagrafica:
                            setUserData({ ...baseProfile, id: authenticatedUser.uid, role: 'dati_corrotti_nessun_dipendente' });
                        }
                    } else {
                        // Se il ruolo è una parola strana che non conosciamo
                        setUserData({ ...baseProfile, id: authenticatedUser.uid, role: safeRole || 'ruolo_vuoto' });
                    }
                } else {
                    // L'account esiste in Auth ma manca totalmente la riga nella tabella "users"
                    setUserData({ role: 'utente_non_trovato_nel_db', id: authenticatedUser.uid });
                }
            } catch (dbError) {
                console.error("Errore DB:", dbError);
                setUserData({ role: 'errore_connessione_db', id: authenticatedUser.uid });
            } finally {
                setAuthChecked(true); 
            }
        });
        return () => unsubscribe(); 
   }, [appStatusChecked]);

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

    const currentRole = userData.role;

    // Controllo smistamento Dashboard
    if (currentRole === 'admin' || currentRole === 'preposto' || currentRole === 'segreteria') {
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }
    
    if (currentRole === 'dipendente') {
       if (isMobile) {
           return <SimpleEmployeeApp user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
       } else {
           return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
       }
    }

    // --- SCHERMATA DI ERRORE DETTAGLIATA ---
    return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#b91c1c', fontFamily: 'sans-serif' }}>
            <h1 style={{fontSize: '2rem', marginBottom: '10px'}}>Errore di Accesso</h1>
            <p style={{fontSize: '1.2rem', marginBottom: '20px'}}>
                Il sistema non riconosce il tuo account.<br/>
                Motivo tecnico: <b style={{background: '#fef2f2', padding: '4px 8px', borderRadius: '4px'}}>{currentRole}</b>
            </p>
            
            <div style={{background: '#fee2e2', padding: '20px', borderRadius: '12px', display: 'inline-block', marginBottom: '20px', textAlign: 'left', color: '#991b1b', fontSize: '15px', maxWidth: '500px'}}>
                <b>Cosa significa questo errore?</b>
                <ul style={{margin: '10px 0 0 0', paddingLeft: '20px'}}>
                    {currentRole === 'utente_non_trovato_nel_db' && <li>La tua email è su Firebase Auth, ma manca il tuo profilo nella tabella "Utenti". (Accedi come admin e crea il profilo utente per questa email).</li>}
                    {currentRole === 'dati_corrotti_nessun_dipendente' && <li>Hai un ruolo da Dipendente/Preposto, ma manca la tua anagrafica nella scheda Personale. (Accedi come admin, vai su Personale e ricrea la scheda).</li>}
                    {currentRole === 'ruolo_vuoto' && <li>Sei registrato, ma non ti è stato assegnato nessun ruolo (Admin, Dipendente, Segreteria).</li>}
                    {!['utente_non_trovato_nel_db', 'dati_corrotti_nessun_dipendente', 'ruolo_vuoto'].includes(currentRole) && <li>Il ruolo <b>"{currentRole}"</b> inserito nel database non è valido o scritto male.</li>}
                </ul>
            </div>
            <br/>
            <button onClick={handleLogout} style={{ padding: '12px 24px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>
                Torna al Login
            </button>
        </div>
    );
};

export default App;