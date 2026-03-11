// File: src/App.js
import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ChangePasswordScreen from './components/ChangePasswordScreen';

console.log("PROGETTO ATTUALMENTE IN USO:", process.env.REACT_APP_PROJECT_ID);

const App = () => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [authChecked, setAuthChecked] = useState(false);
    const [isAppActive, setIsAppActive] = useState(true);
    const [appStatusChecked, setAppStatusChecked] = useState(false);

    // --- RICONOSCIMENTO AUTOMATICO SITO NETLIFY ---
    const hostname = window.location.hostname;
    const isSitoGestionale = hostname.includes('gestionale');
    const isSitoMarcatempo = hostname.includes('marcatempo');
    const isLocalhost = hostname.includes('localhost');

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
                            setUserData({ ...baseProfile, id: authenticatedUser.uid, role: 'dati_corrotti_nessun_dipendente' });
                        }
                    } else {
                        setUserData({ ...baseProfile, id: authenticatedUser.uid, role: safeRole || 'ruolo_vuoto' });
                    }
                } else {
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

    // --- COMPONENTE SCHERMATA D'ERRORE / BLOCCO ---
    const ErrorScreen = ({ titolo, messaggio, motivoTecnico }) => (
        <div style={{ padding: '40px', textAlign: 'center', color: '#b91c1c', fontFamily: 'sans-serif' }}>
            <h1 style={{fontSize: '2rem', marginBottom: '10px'}}>{titolo}</h1>
            <p style={{fontSize: '1.2rem', marginBottom: '20px'}}>{messaggio}</p>
            {motivoTecnico && (
                <div style={{background: '#fee2e2', padding: '15px', borderRadius: '12px', display: 'inline-block', marginBottom: '20px', color: '#991b1b', fontSize: '14px', maxWidth: '500px'}}>
                    Codice di sistema: <b>{motivoTecnico}</b>
                </div>
            )}
            <br/>
            <button onClick={handleLogout} style={{ padding: '12px 24px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>
                Torna alla pagina di Login
            </button>
        </div>
    );

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

    // Controlli per gli errori critici di database (no account, no dipendente ecc.)
    if (['utente_non_trovato_nel_db', 'dati_corrotti_nessun_dipendente', 'ruolo_vuoto'].includes(currentRole)) {
        return <ErrorScreen titolo="Errore di Configurazione" messaggio="Il tuo account non è stato configurato correttamente dall'amministratore. Manca l'anagrafica in tabella." motivoTecnico={currentRole} />;
    }
    if (!['admin', 'segreteria', 'preposto', 'dipendente'].includes(currentRole)) {
        return <ErrorScreen titolo="Ruolo non Valido" messaggio={`Il ruolo assegnato (${currentRole}) non esiste nel sistema.`} motivoTecnico="ruolo_sconosciuto" />;
    }

    // ==========================================
    // 1. LOGICA SITO GESTIONALE (Amm.ne)
    // ==========================================
    if (isSitoGestionale) {
        if (userData.bloccaGestionale) {
            return <ErrorScreen titolo="Accesso Sospeso 🚫" messaggio="I tuoi permessi per il Gestionale sono stati revocati." />;
        }
        if (currentRole === 'dipendente') {
            return <ErrorScreen titolo="Area Riservata 🛑" messaggio="Questa è l'area uffici. Per timbrare il cartellino devi usare il sito: marcatempotcsitalia.netlify.app" />;
        }
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // ==========================================
    // 2. LOGICA SITO MARCATEMPO (Dipendenti)
    // ==========================================
    if (isSitoMarcatempo) {
        if (userData.bloccaMarcatempo) {
            return <ErrorScreen titolo="Marcatempo Bloccato 🚫" messaggio="I tuoi permessi per l'app Marcatempo sono stati revocati." />;
        }
        
        // Risoluzione errore cellulari: tutti i dipendenti vedono EmployeeDashboard
        if (currentRole === 'dipendente') {
            return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
        }

        // Se Segreteria/Admin/Preposto aprono il marcatempo per timbrare col GPS
        return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
    }

    // ==========================================
    // 3. LOGICA LOCALHOST (Ambiente di Sviluppo su PC)
    // ==========================================
    if (isLocalhost) {
        if (currentRole === 'dipendente') {
            if (userData.bloccaMarcatempo) return <ErrorScreen titolo="Accesso Sospeso 🚫" messaggio="Test in locale: Marcatempo bloccato per te." />;
            return <EmployeeDashboard user={user} employeeData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
        } else {
            if (userData.bloccaGestionale) return <ErrorScreen titolo="Accesso Sospeso 🚫" messaggio="Test in locale: Gestionale bloccato per te." />;
            return <AdminDashboard user={user} userData={userData} handleLogout={handleLogout} allWorkAreas={allWorkAreas} />;
        }
    }

    return <ErrorScreen titolo="Errore Indirizzo" messaggio="Stai accedendo da un link non riconosciuto dal sistema." />;
};

export default App;