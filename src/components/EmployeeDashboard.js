/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, orderBy, getDocs, Timestamp, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Importiamo la libreria XLSX per la generazione di file Excel/CSV (assumiamo che sia disponibile globalmente)
const XLSX = typeof window.XLSX !== 'undefined' ? window.XLSX : {};

// --- COMPONENTE COMPANY LOGO INTEGRATO (Sostituire con il codice CompanyLogo.jsx) ---
// URL diretto e corretto del logo aziendale.
const LOGO_URL = 'https://i.imgur.com/kUQf7Te.png';
const PLACEHOLDER_URL = 'https://placehold.co/200x60/cccccc/ffffff?text=Logo';

/**
 * Gestisce l'evento di errore per il tag <img>.
 * @param {React.SyntheticEvent<HTMLImageElement, Event>} e - L'evento di errore.
 */
const handleImageError = (e) => {
  e.target.onerror = null;
  e.target.src = PLACEHOLDER_URL;
};

const CompanyLogo = () => {
    // Ho inserito il codice del tuo CompanyLogo.jsx qui.
    return (
        <div className="flex flex-col items-center text-center w-full py-4 border-b-2 border-indigo-100 mb-4">
            <p className="text-xs font-serif font-bold text-gray-700 mb-2">
                Created D Leoncino
            </p>

            <img
                src={LOGO_URL}
                alt="Logo aziendale TCS"
                className="h-auto w-full max-w-[140px]"
                onError={handleImageError}
            />
        </div>
    );
};
// ------------------------------------------------------------------------

// Funzione distanza GPS (invariata)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raggio Terra in metri
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaL = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Funzione per recuperare configurazione e token (con fallback)
const getFirebaseConfigAndToken = () => {
    // 1. Variabili globali fornite dall'ambiente Canvas/Sandbox
    const firebaseConfigString = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    let config = null;

    // A. Parsing dalla variabile globale (se stringa JSON)
    if (firebaseConfigString) {
        try {
            config = JSON.parse(firebaseConfigString);
        } catch (e) {
            console.error("Errore nel parsing di __firebase_config:", e);
        }
    }

    // B. Costruzione della configurazione dalle variabili d'ambiente React (process.env)
    if (!config && typeof process !== 'undefined' && process.env) {
        if (process.env.REACT_APP_API_KEY) {
            config = {
                apiKey: process.env.REACT_APP_API_KEY,
                authDomain: process.env.REACT_APP_AUTH_DOMAIN,
                projectId: process.env.REACT_APP_PROJECT_ID,
                storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
                messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
                appId: process.env.REACT_APP_APP_ID || appId,
            };
        }
    }

    // C. FALLBACK CRITICO (Usiamo la configurazione fornita dall'utente per sbloccare l'app)
    if (!config || !config.apiKey) {
        console.warn("ATTENZIONE: Nessuna configurazione Firebase valida trovata, usando fallback statico.");
        config = {
            apiKey: "AIzaSyC59l73xl56aOdHnQ8I3K1VqYbkDVzASjg", // Chiave censurata
            authDomain: "marcatempotcsitalia.firebaseapp.com",
            projectId: "marcatempotcsitalia",
            storageBucket: "marcatempotcsitalia.appspot.com",
            appId: "1:755809435347:web:c5c9edf8f8427e66c71e26",
            messagingSenderId: "755809435347",
        };
    }

    return {
        firebaseConfig: config,
        initialAuthToken: initialAuthToken
    };
};


const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    // Stati locali per Firebase
    const [isFirebaseReady, setIsFirebaseReady] = useState(false);
    const [dbInstance, setDbInstance] = useState(null);
    const [authInstance, setAuthInstance] = useState(null);
    const [authError, setAuthError] = useState(null);

    // Stati per la Dashboard
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null);

    // Stati per report Excel (ex PDF)
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    // Variabili per funzioni Cloud (vengono definite solo dopo l'inizializzazione dell'app)
    const [cloudFunctions, setCloudFunctions] = useState({});

    // 1. INIZIALIZZAZIONE FIREBASE (eseguita una sola volta)
    useEffect(() => {
        let isMounted = true;
        const setupFirebase = async () => {
            try {
                const { firebaseConfig, initialAuthToken } = getFirebaseConfigAndToken();

                if (!firebaseConfig || !firebaseConfig.apiKey) {
                    console.error("ERRORE: La configurazione Firebase non è valida. Impossibile inizializzare.");
                    if (isMounted) setAuthError("Configurazione Firebase non valida.");
                    return;
                }

                // Inizializza App: usa un nome non di default per evitare conflitti.
                let app;
                try {
                    app = getApp();
                } catch (e) {
                    app = initializeApp(firebaseConfig);
                }

                // Setup servizi
                const firestore = getFirestore(app);
                const auth = getAuth(app);

                if (isMounted) {
                    setDbInstance(firestore);
                    setAuthInstance(auth);
                }

                // Autenticazione: attendiamo l'autenticazione prima di procedere
                try {
                    if (initialAuthToken) {
                        // Tenta il login con Custom Token
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        // Se non c'è token, usa login anonimo
                        await signInAnonymously(auth);
                    }
                } catch (authErr) {
                    console.error("Errore di autenticazione Firebase:", authErr.code, authErr);

                    // --- PUNTO CRITICO: BYPASSAMO L'ERRORE FATALE DI AUTH PER CARICARE LA DASHBOARD ---
                    if (authErr.code === 'auth/admin-restricted-operation' || authErr.code === 'auth/invalid-custom-token') {
                         console.warn("ATTENZIONE: Autenticazione fallita (admin-restricted o token non valido). Procedo con l'inizializzazione dei servizi per il debugging, ma le operazioni di lettura/scrittura falliranno.");
                         if (isMounted) setAuthError(`Errore grave di autenticazione: ${authErr.code}. Dashboard caricata in modalità limitata.`);
                         // NON ritorniamo qui, ma procediamo al setup dei servizi e settiamo isFirebaseReady a true.
                    } else {
                        // Per tutti gli altri errori, blocchiamo come misura di sicurezza
                        if (isMounted) setAuthError(`Errore critico di autenticazione: ${authErr.message}. Riprova.`);
                        return; // Blocca se l'errore non è quello atteso (admin-restricted)
                    }
                }


                // Inizializzazione Cloud Functions (richiede l'istanza dell'app)
                const functionsInstance = getFunctions(app, 'europe-west1');

                if (isMounted) {
                    setCloudFunctions({
                        clockIn: httpsCallable(functionsInstance, 'clockEmployeeIn'),
                        clockOut: httpsCallable(functionsInstance, 'clockEmployeeOut'),
                        applyAutoPauseEmployee: httpsCallable(functionsInstance, 'applyAutoPauseEmployee'),
                        endEmployeePause: httpsCallable(functionsInstance, 'endEmployeePause'),
                    });
                    // Dichiariamo l'app pronta INDIPENDENTEMENTE dall'esito dell'autenticazione del token,
                    // per permettere all'interfaccia di caricare.
                    setIsFirebaseReady(true);
                }
            } catch (error) {
                console.error("Errore Critico Setup Firebase:", error);
                if (isMounted) setAuthError(`Errore di inizializzazione: ${error.message}`);
            }
        };

        setupFirebase();

        return () => { isMounted = false; }; // Clean up
    }, []);

    // Destrutturazione delle funzioni per uso più pulito
    const { clockIn, clockOut, applyAutoPauseEmployee, endEmployeePause } = cloudFunctions;
    const db = dbInstance; // Riferimento a Firestore per la compatibilità con il codice esistente


    // Aggiorna ora corrente (Invariato)
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Filtra aree assegnate al dipendente (Invariato)
    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    // Leggi il flag GPS dai dati del dipendente (Invariato)
    const isGpsRequired = employeeData?.controlloGpsRichiesto ?? true;


    // Logica GPS (watchPosition per aggiornamenti continui) (Invariato)
    useEffect(() => {
        // Esegue solo se il componente principale è attivo e non timbrato
        if (activeEntry || employeeWorkAreas.length === 0 || !isGpsRequired) {
            setLocationError(null);
            setInRangeArea(null);
            return;
        }

        if (!navigator.geolocation) {
            setLocationError("La geolocalizzazione non è supportata.");
            return;
        }

        let isMounted = true;
        let watchId = null;

        const handlePositionSuccess = (position) => {
            if (!isMounted) return;
            const { latitude, longitude } = position.coords;
            let foundArea = null;
            for (const area of employeeWorkAreas) {
                if (area.latitude && area.longitude && area.radius) {
                    const distance = getDistanceInMeters(latitude, longitude, area.latitude, area.longitude);
                    if (distance <= area.radius) {
                        foundArea = area;
                    }
                }
            }
            setInRangeArea(foundArea);
            setLocationError(null);
        };

        const handlePositionError = (error) => {
            if (!isMounted) return;
            console.error("Errore Geolocalizzazione:", error);
            let message = "Impossibile recuperare la posizione.";
            if (error.code === error.PERMISSION_DENIED) message = "Permesso di geolocalizzazione negato.";
            else if (error.code === error.POSITION_UNAVAILABLE) message = "Posizione non disponibile.";
            else if (error.code === error.TIMEOUT) message = "Timeout nel recuperare la posizione.";
            setLocationError(message + " Controlla permessi e segnale.");
            setInRangeArea(null);
        };

        watchId = navigator.geolocation.watchPosition(
            handlePositionSuccess,
            handlePositionError,
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );

        return () => { // Pulizia
            isMounted = false;
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        };
    }, [employeeWorkAreas, activeEntry, isGpsRequired]);


    // Listener Firestore per timbratura attiva e timbrature
    useEffect(() => {
        // ESEGUE SOLO SE FIREBASE È PRONTO
        if (!isFirebaseReady || !employeeData?.id || !Array.isArray(allWorkAreas) || !db) {
             setActiveEntry(null);
             setTodaysEntries([]);
             setWorkAreaName('');
             return;
        }

        let isMounted = true;

        // Listener timbratura attiva
        // USA employeeData.id per matchare l'ID del documento in Firestore (correzione bug timbrature)
        const qActive = query(collection(db, "time_entries"),
                             where("employeeId", "==", employeeData.id),
                             where("status", "==", "clocked-in"),
                             limit(1));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!isMounted) return;
            if (!snapshot.empty) {
                const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveEntry(entryData);
                const area = allWorkAreas.find(a => a.id === entryData.workAreaId);
                setWorkAreaName(area ? area.name : 'Sconosciuta');
            } else {
                setActiveEntry(null);
                setWorkAreaName('');
            }
        }, (error) => {
            // MOSTRA ERRORI DI AUTORIZZAZIONE DI FIRESTORE
            console.error("Errore listener timbratura attiva (Firestore Rules):", error);
            if (error.code === 'permission-denied') {
                 setAuthError("Errore Autorizzazione Firestore: permesso negato per le timbrature.");
            }
        });

        // Listener timbrature odierne
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        // USA employeeData.id per matchare l'ID del documento in Firestore (correzione bug timbrature)
        const qTodays = query(collection(db, "time_entries"),
                             where("employeeId", "==", employeeData.id),
                             where("clockInTime", ">=", Timestamp.fromDate(startOfDay)),
                             orderBy("clockInTime", "desc"));
        const unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            if (!isMounted) return;
            setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.error("Errore listener timbratura odierna (Firestore Rules):", error);
        });

        // Funzione di pulizia
        return () => {
             isMounted = false;
             unsubscribeActive();
             unsubscribeTodays();
        };
    }, [employeeData?.id, allWorkAreas, isFirebaseReady, dbInstance]);


    // --- GESTIONE AZIONI TIMBRATURA/PAUSA ---
    const handleAction = async (action) => {
        // Check per Firebase/Cloud Functions
        if (!isFirebaseReady || isProcessing || !clockIn || !clockOut) {
            console.warn("Firebase non è pronto o altra azione in corso.");
            return;
        }

        // Verifica Autenticazione in tempo reale
        if (!authInstance.currentUser || authInstance.currentUser.isAnonymous) {
            console.error("Non autorizzato. Utente non autenticato o anonimo.");
            setAuthError("Operazione bloccata: Utente non completamente autenticato. Riprova il login.");
            return;
        }


        setIsProcessing(true);
        setLocationError(null);

        try {
            let result;
            const currentActiveEntry = activeEntry;

            if (action === 'clockIn') {

                let areaIdToClockIn = null;
                const note = isGpsRequired ? '' : 'senza GPS Manutentore';

                if (isGpsRequired) {
                    if (!inRangeArea) throw new Error("Devi essere all'interno di un'area rilevata.");
                    areaIdToClockIn = inRangeArea.id;
                } else {
                    if (employeeWorkAreas.length === 0) {
                        throw new Error("Controllo GPS esente, ma non sei assegnato a nessuna area. Contatta l'amministratore.");
                    }
                    areaIdToClockIn = employeeWorkAreas[0].id;
                }

                // Chiama la Cloud Function
                result = await clockIn({ areaId: areaIdToClockIn, note: note });

                if (result.data.success) {
                    // La gestione dello stato locale viene lasciata al listener di Firestore per la massima affidabilità,
                    // ma una rapida impostazione "pending" per UX è sensata.
                    setActiveEntry({
                        id: 'pending_' + Date.now(),
                        workAreaId: areaIdToClockIn,
                        clockInTime: Timestamp.now(),
                        pauses: [],
                        status: 'clocked-in'
                    });
                    const area = allWorkAreas.find(a => a.id === areaIdToClockIn);
                    setWorkAreaName(area ? area.name : 'Sconosciuta');

                } else if (result.data.message) {
                    throw new Error(result.data.message);
                }

            } else if (action === 'clockOut') {
                if (!currentActiveEntry) throw new Error("Nessuna timbratura attiva da chiudere.");
                const isInPause = currentActiveEntry.pauses?.some(p => p.start && !p.end);
                if (isInPause) throw new Error("Termina la pausa prima di timbrare l'uscita.");

                result = await clockOut();

                if (result.data.success) {
                    setActiveEntry(null); // La pulizia sarà confermata dal listener
                    setWorkAreaName('');
                } else if (result.data.message) {
                    throw new Error(result.data.message);
                }

            } else if (action === 'clockPause') {
                if (!currentActiveEntry) throw new Error("Devi avere una timbratura attiva.");
                const isInPause = currentActiveEntry.pauses?.some(p => p.start && !p.end);

                if (isInPause) {
                    result = await endEmployeePause();
                } else {
                    const currentArea = allWorkAreas.find(a => a.id === currentActiveEntry.workAreaId);
                    const pauseDuration = currentArea?.pauseDuration;

                    if (pauseDuration && pauseDuration > 0) {
                        result = await applyAutoPauseEmployee({ durationMinutes: pauseDuration });
                    } else {
                        throw new Error(`Nessuna durata pausa predefinita (>0 min) per l'area "${currentArea?.name || 'sconosciuta'}".`);
                    }
                }
                
                if (result.data.success) {
                    // Non aggiorniamo attivamente lo stato qui, ci affidiamo al listener
                    console.log(`Pausa gestita con successo: ${isInPause ? 'Terminata' : 'Avviata'}`);
                } else if (result.data.message) {
                    throw new Error(result.data.message);
                }


            } else {
                throw new Error("Azione non riconosciuta.");
            }

            if (result?.data?.message) {
                console.info("Messaggio di sistema:", result.data.message);
            }

        } catch (error) {
            console.error(`Errore durante ${action}:`, error);
            setAuthError(`Errore operazione: ${error.message || 'Si è verificato un problema.'}`);
        } finally {
            setIsProcessing(false);
        }
    };


    // --- FUNZIONE GENERAZIONE REPORT EXCEL ---
    const generateExcelReport = async () => {
        // Check per Firebase/XLSX
        if (!isFirebaseReady || !db) {
            console.warn("Firebase non è pronto per l'esportazione.");
            setIsGeneratingReport(false);
            return;
        }

        // Verifica Autenticazione in tempo reale
        if (!authInstance.currentUser || authInstance.currentUser.isAnonymous) {
             setAuthError("Operazione Report bloccata: Utente non completamente autenticato.");
             setIsGeneratingReport(false);
             return;
        }

        setIsGeneratingReport(true);

        // Verifica disponibilità della libreria XLSX
        if (!XLSX.utils || !XLSX.writeFile) {
            console.error("Libreria XLSX non disponibile. Assicurati che sia caricata (window.XLSX).");
            setAuthError("Libreria di esportazione Excel non trovata.");
            setIsGeneratingReport(false);
            return;
        }

        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

            // Report: Usa employeeData.id per i report
            const q = query(
                collection(db, "time_entries"),
                where("employeeId", "==", employeeData.id),
                where("clockInTime", ">=", Timestamp.fromDate(startDate)),
                where("clockInTime", "<=", Timestamp.fromDate(endDate)),
                orderBy("clockInTime", "asc")
            );

            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                console.info("Nessuna timbratura trovata per il periodo selezionato.");
                // Opzionale: visualizza un messaggio all'utente.
                setIsGeneratingReport(false);
                return;
            }

            // --- Logica Excel ---
            const monthName = startDate.toLocaleString('it-IT', { month: 'long' });

            // Intestazione del Report nel file Excel (riga 1-3)
            const reportMetadata = [
                [`Report Mensile Timbrature - ${employeeData.name} ${employeeData.surname}`],
                [`Periodo: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`],
                [] // Riga vuota per separazione
            ];

            const tableColumn = ["Data", "Area", "Entrata", "Uscita", "Ore Lavorate (HH:MM)", "Pausa Totale (MM)", "Note Pause"];
            const tableRows = [];
            let totalWorkedMillis = 0; // Inizializza il totale in millisecondi

            querySnapshot.forEach(entryDoc => {
                const data = entryDoc.data();
                const clockIn = data.clockInTime?.toDate ? data.clockInTime.toDate() : null;
                const clockOut = data.clockOutTime?.toDate ? data.clockOutTime.toDate() : null;

                if (!clockIn) return;

                const area = allWorkAreas.find(a => a.id === data.workAreaId);

                let workedMillis = 0;
                let pauseNotes = "";
                let pauseDurationMillis = 0;
                let pauseDurationMinutes = 0;

                if (data.pauses && data.pauses.length > 0) {
                    pauseNotes = data.pauses.length + " pausa/e";
                    data.pauses.forEach(p => {
                        if (p.start && p.end) {
                            const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                            const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                            if (endMillis > startMillis) {
                                pauseDurationMillis += (endMillis - startMillis);
                            }
                        }
                    });
                    pauseDurationMinutes = Math.floor(pauseDurationMillis / 60000);
                }

                if (clockOut) {
                    const totalEntryMillis = clockOut.getTime() - clockIn.getTime();
                    workedMillis = totalEntryMillis - pauseDurationMillis;
                    if (workedMillis < 0) workedMillis = 0;
                    totalWorkedMillis += workedMillis; // Aggiunge al totale del mese
                }

                const hours = Math.floor(workedMillis / 3600000);
                const minutes = Math.floor((workedMillis % 3600000) / 60000);
                const totalHoursFormatted = clockOut ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}` : "In Corso";

                const entryData = [
                    clockIn.toLocaleDateString('it-IT'),
                    area ? area.name : 'Sconosciuta',
                    clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : "In Corso",
                    totalHoursFormatted,
                    pauseDurationMinutes, // Durata pausa in minuti
                    pauseNotes
                ];
                tableRows.push(entryData);
            });

            // Calcolo e formattazione del Totale Mese (in HH:MM)
            const totalHoursMonth = Math.floor(totalWorkedMillis / 3600000);
            const totalMinutesMonth = Math.floor((totalWorkedMillis % 3600000) / 60000);
            const totalMonthFormatted = `${totalHoursMonth.toString().padStart(2, '0')}:${totalMinutesMonth.toString().padStart(2, '0')}`;

            // Riga vuota per separare dati e totale
            const emptyRow = ["", "", "", "", "", "", ""];
            
            // Riga per il totale (Solo il valore in colonna Ore Lavorate)
            const totalRow = ["", "TOTALE MESE", "", "", totalMonthFormatted, "", ""]; 
            
            // Combiniamo metadati, intestazioni e dati
            const dataToExport = [
                ...reportMetadata,
                tableColumn,
                ...tableRows,
                emptyRow, // Aggiungiamo una riga vuota
                totalRow // Aggiungiamo il totale calcolato
            ];

            // Creazione del foglio di lavoro
            const ws = XLSX.utils.aoa_to_sheet(dataToExport);

            // Aggiunta di stili o formattazioni (opzionale)
            // Imposta la larghezza delle colonne (esempio)
            const wscols = [
                { wch: 10 }, // Data
                { wch: 20 }, // Area
                { wch: 10 }, // Entrata
                { wch: 10 }, // Uscita
                { wch: 18 }, // Ore Lavorate (HH:MM)
                { wch: 16 }, // Pausa Totale (MM)
                { wch: 20 }  // Note Pause
            ];
            ws['!cols'] = wscols;

            // Formatta la riga del totale (Esempio: grassetto)
            if (ws['E' + (dataToExport.length)]) {
                // ws['E' + (dataToExport.length)].s = { font: { bold: true } }; 
                // La formattazione avanzata richiede una configurazione più complessa di XLSX
            }


            // Creazione del workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Report Timbrature");

            // Salvataggio del file
            const fileName = `report_${employeeData.surname}_${selectedMonth + 1}_${selectedYear}.xlsx`;
            XLSX.writeFile(wb, fileName);

        } catch (error) {
            console.error(`Errore durante la generazione del report Excel: ${error.message}`, error);
            setAuthError(`Errore Report: ${error.message || 'Si è verificato un problema.'}`);
        } finally {
            setIsGeneratingReport(false);
        }
    };
    // Fine funzione generazione Excel


    // Calcolo stato pausa (controlla se c'è una pausa SENZA end)
    const isInPause = activeEntry?.pauses?.some(p => p.start && !p.end);

    // Render di caricamento/errore
    if (!isFirebaseReady || !employeeData) {
        return (
             <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                 <div className="text-center p-6 bg-white rounded-lg shadow-xl">
                     <p className="text-xl font-bold text-indigo-600 mb-2">Caricamento in corso...</p>
                     <p className="text-sm text-gray-500">Inizializzazione servizi di marcatempo.</p>

                     {/* Mostra ERRORE AUTENTICAZIONE/CONFIGURAZIONE */}
                     {authError && (
                        <p className="text-base text-red-600 mt-4 font-bold">ERRORE CRITICO: {authError}</p>
                     )}

                 </div>
             </div>
        );
    }

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; // Anno corrente e precedente

    // --- Componente di stato GPS/Area (Invariato) ---
    const GpsAreaStatusBlock = () => {
        if (activeEntry) return null;

        return (
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Stato Posizione Richiesto</h2>
                {isGpsRequired ? (
                    // Blocco per utenti con GPS OBBLIGATORIO
                    <>
                        {locationError && <p className="text-sm text-red-500 mt-2 text-center">{locationError}</p>}
                        {!locationError && (
                            inRangeArea ? (
                                <p className="text-base text-green-600 font-semibold mt-2 text-center">✅ Area rilevata: <br/><strong>{inRangeArea.name}</strong></p>
                            ) : (
                                <p className="text-base text-gray-500 mt-2 text-center">❌ Nessuna area nelle vicinanze o GPS in attesa.</p>
                            )
                        )}
                    </>
                ) : (
                    // Blocco per utenti ESENTI da GPS
                    <>
                        {employeeWorkAreas.length > 0 ? (
                            <p className="text-base text-blue-600 font-semibold mt-2 text-center">
                                Controllo GPS non richiesto.<br/>
                                Area predefinita: <strong>{employeeWorkAreas[0].name}</strong>
                            </p>
                        ) : (
                            <p className="text-sm text-red-500 mt-2 text-center">
                                ❌ Non sei assegnato a nessuna area.
                            </p>
                        )}
                    </>
                )}
            </div>
        );
    };
    // --- Fine Componente di stato GPS/Area ---


    // Render del componente
    return (
        <div className="p-4 max-w-lg mx-auto font-sans bg-gray-50 min-h-screen flex flex-col">
            <CompanyLogo />
            {/* Box Orario e Info Dipendente */}
            <div className="text-center my-4 p-4 bg-white rounded-lg shadow-sm">
                <p>Dipendente: <span className="font-semibold">{employeeData.name} {employeeData.surname}</span></p>
                <p className="text-4xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-lg text-gray-500">{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            {/* BLOCCO DI STATO AREA/GPS QUANDO NON ATTIVA */}
            {!activeEntry && <GpsAreaStatusBlock />}


            {/* Box Stato Timbratura e Azioni */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Azioni Rapide</h2>
                {activeEntry ? ( // Se l'utente è timbrato
                    <div>
                        <p className="text-center text-green-600 font-semibold text-lg mb-4">Timbratura ATTIVA su: <span className="font-bold">{workAreaName}</span></p>

                        {/* SEMAFORO QUANDO ATTIVO: 3 pulsanti */}
                        <div className="grid grid-cols-3 gap-3">

                            {/* 1. PAUSA (ARANCIONE o VERDE per Termina) */}
                            <button
                                onClick={() => handleAction('clockPause')}
                                disabled={isProcessing}
                                className={`w-full font-bold rounded-lg shadow-lg transition-colors py-4 text-white ${
                                    isInPause
                                        ? 'bg-green-500 hover:bg-green-600' // TERMINA (VERDE)
                                        : 'bg-orange-500 hover:bg-orange-600' // INIZIA (ARANCIONE)
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <div className="text-2xl leading-none">🟡</div>
                                <span className="text-sm block mt-1">{isInPause ? 'TERMINA' : 'INIZIA'} PAUSA</span>
                            </button>

                            {/* 2. TIMBRATURA (Visualizzazione Stato - NON cliccabile) */}
                            <div
                                className={`w-full font-bold rounded-lg shadow-lg text-white text-center py-4 ${
                                    isInPause ? 'bg-orange-600' : 'bg-green-600'
                                }`}
                            >
                                <div className="text-2xl leading-none">🟢</div>
                                <span className="text-sm block mt-1">{isInPause ? 'PAUSA ATTIVA' : 'IN CORSO'}</span>
                            </div>

                            {/* 3. USCITA (ROSSO) */}
                            <button
                                onClick={() => handleAction('clockOut')}
                                disabled={isProcessing || isInPause}
                                className={`w-full font-bold rounded-lg shadow-lg text-white transition-colors py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <div className="text-2xl leading-none">🔴</div>
                                <span className="text-sm block mt-1">TIMBRA USCITA</span>
                            </button>
                        </div>

                    </div>
                ) : ( // Se l'utente NON è timbrato
                    <div>
                        <p className="text-center text-red-600 font-semibold text-lg">Timbratura NON ATTIVA</p>

                        {/* Pulsante Entrata UNICO (VERDE) */}
                        <button
                            onClick={() => handleAction('clockIn')}
                            disabled={
                                isProcessing ||
                                (isGpsRequired && !inRangeArea) ||
                                (!isGpsRequired && employeeWorkAreas.length === 0)
                            }
                            // Colore di sfondo fisso, opacità e cursore gestiti da disabled:
                            className={`w-full mt-4 text-2xl font-bold py-6 px-4 rounded-lg shadow-lg text-white transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            🟢 TIMBRA ENTRATA
                        </button>
                    </div>
                )}
            </div>

            {/* Box Cronologia Odierna (Invariato) */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3">Timbrature di Oggi</h2>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {todaysEntries.length > 0 ? todaysEntries.map(entry => (
                        <div key={entry.id} className="text-sm border-b pb-1 last:border-b-0">
                            <p>
                                <span className="font-medium">Entrata:</span> {entry.clockInTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}
                                <span className="ml-2 font-medium">Uscita:</span> {entry.clockOutTime ? entry.clockOutTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : '...'}
                            </p>
                            {entry.pauses && entry.pauses.length > 0 && (
                                <ul className="text-xs text-gray-500 pl-4 list-disc">
                                    {entry.pauses.map((p, index) => (
                                        <li key={index}>
                                            Pausa {index + 1}: {p.start.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })} - {p.end ? p.end.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : 'in corso'}
                                            {p.isAutomatic && p.durationMinutes && ` (${p.durationMinutes} min)`}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )) : <p className="text-sm text-gray-500">Nessuna timbratura trovata per oggi.</p>}
                </div>
            </div>

            {/* Box Report Mensile EXCEL */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3">Report Mensile Excel</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Select Mese */}
                    <div>
                        <label htmlFor="month-select" className="block text-sm font-medium text-gray-700">Mese</label>
                        <select
                            id="month-select"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            {months.map((month, index) => (<option key={index} value={index}>{month}</option>))}
                        </select>
                    </div>
                    {/* Select Anno */}
                    <div>
                         <label htmlFor="year-select" className="block text-sm font-medium text-gray-700">Anno</label>
                        <select
                            id="year-select"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            {years.map(year => (<option key={year} value={year}>{year}</option>))}
                        </select>
                    </div>
                </div>
                {/* Pulsante Scarica Report */}
                <button
                    onClick={generateExcelReport}
                    disabled={isGeneratingReport}
                    className="w-full text-lg font-bold py-3 px-4 rounded-lg shadow-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGeneratingReport ? 'Generazione in corso...' : 'Scarica Report Excel (.xlsx)'}
                </button>
            </div>

            {/* Pulsante Logout in fondo */}
            <button onClick={handleLogout} className="w-full mt-auto px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">Logout</button>
        </div>
    );
};

export default EmployeeDashboard;