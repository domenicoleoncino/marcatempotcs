/* eslint-disable no-unused-vars */
/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocs,
  Timestamp,
  limit,
} from 'firebase/firestore';

// Importazioni dalle istanze centralizzate (src/firebase.js)
import { db, auth, functions, useFirebase, INITIALIZATION_ERROR } from '../firebase'; 

// IMPORTAZIONE ESSENZIALE PER EXCEL/CSV
const XLSX = typeof window !== 'undefined' && typeof window.XLSX !== 'undefined' ? window.XLSX : {};

// --- COMPONENTI GLOBALI (INIZIO DEL FILE) ---

// URL diretto e corretto del logo aziendale.
const LOGO_URL = 'https://i.imgur.com/kUQf7Te.png';
const PLACEHOLDER_URL = 'https://placehold.co/200x60/cccccc/ffffff?text=Logo';

/**
 * Gestisce l'evento di errore per il tag <img>.
 * @param {React.SyntheticEvent<HTMLImageElement, Event>} e - L'evento di errore.
 */
const handleImageError = (e) => {
  // use currentTarget for React compatibility
  // eslint-disable-next-line no-param-reassign
  e.currentTarget.onerror = null;
  // eslint-disable-next-line no-param-reassign
  e.currentTarget.src = PLACEHOLDER_URL;
};

const CompanyLogo = () => {
    return (
        <div className="flex flex-col items-center text-center w-full py-4 border-b-2 border-indigo-100 mb-2">
            <p className="text-xs font-serif font-bold text-gray-700 mb-1">
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

// --- Funzioni Globali ---
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

// --- Componente GPS / Stato Dispositivo (Spostato fuori dallo scope di render) ---
const GpsAreaStatusBlock = ({ activeEntry, isGpsRequired, locationError, inRangeArea, employeeWorkAreas }) => {
    if (activeEntry) return null;

    const areaName = Array.isArray(employeeWorkAreas) && employeeWorkAreas.length > 0 ? employeeWorkAreas[0].name : 'Nessuna';

    return (
        <div className="bg-white p-4 rounded-lg shadow-md mb-4">
            <h2 className="text-xl font-bold mb-2 text-center">Stato Posizione Richiesto</h2>

            {isGpsRequired ? (
                <>
                    {locationError && (
                        <p className="text-xs text-red-500 mt-1 text-center">{locationError}</p>
                    )}

                    {!locationError && (
                        inRangeArea ? (
                            <p className="text-sm text-green-600 mt-1 text-center">
                                Area di lavoro rilevata: <strong>{inRangeArea.name}</strong>
                            </p>
                        ) : (
                            <p className="text-sm text-gray-500 mt-1 text-center">
                                Nessuna area di lavoro nelle vicinanze o GPS non attivo. Avvicinati a un cantiere per timbrare.
                            </p>
                        )
                    )}
                </>
            ) : (
                <>
                    {Array.isArray(employeeWorkAreas) && employeeWorkAreas.length > 0 ? (
                        <p className="text-sm text-blue-600 mt-1 text-center">
                            <strong>Controllo GPS non richiesto.</strong><br/>
                            Timbratura su area: <strong>{areaName}</strong>
                        </p>
                    ) : (
                        <p className="text-sm text-red-500 mt-1 text-center">
                            <strong>Controllo GPS non richiesto.</strong><br/>
                            Non sei assegnato a nessuna area. Contatta un admin.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};


// =================================================================================
// COMPONENTE PRINCIPALE
// =================================================================================
const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    // USA L'HOOK FIREBASE (Definito in ../firebase)
    const { 
        db: dbInstance, 
        auth: authInstance, 
        functions: functionsInstance, 
        isReady: isFirebaseReady, 
        error: firebaseHookError 
    } = useFirebase();

    // Stati locali per la gestione interna della dashboard
    const [authError, setAuthError] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null);
    const [isDataReady, setIsDataReady] = useState(false); 

    // Stati per report Excel
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    // DICHIARAZIONI DEGLI ARRAY DI UTILITY
    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; // Anno corrente e precedente

    // Variabili di stato per la pausa (Derivate)
    const isPauseUsed = activeEntry?.pauses?.length > 0 && activeEntry.pauses.every(p => p.end); 
    const isInPause = activeEntry?.pauses?.some(p => p.start && !p.end); 
    const isPauseUsedOrActive = activeEntry?.pauses?.length > 0; 

    // Assegnazione delle istanze di Firebase e Cloud Functions per uso locale
    const db = dbInstance;
    const auth = authInstance;
    
    const clockIn = functionsInstance ? httpsCallable(functionsInstance, 'clockEmployeeIn') : () => { throw new Error('Functions non pronte'); };
    const clockOut = functionsInstance ? httpsCallable(functionsInstance, 'clockEmployeeOut') : () => { throw new Error('Functions non pronte'); };
    const applyAutoPauseEmployee = functionsInstance ? httpsCallable(functionsInstance, 'applyAutoPauseEmployee') : () => { throw new Error('Functions non pronte'); };
    const endEmployeePause = functionsInstance ? httpsCallable(functionsInstance, 'endEmployeePause') : () => { throw new Error('Functions non pronte'); };
    
    // Controlla se c'è un errore di inizializzazione
    useEffect(() => {
        if (INITIALIZATION_ERROR || firebaseHookError) {
            setAuthError(INITIALIZATION_ERROR?.message || firebaseHookError?.message || "Errore di configurazione non specificato.");
        }
    }, [firebaseHookError]);


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
        // Se Firebase non è pronto, non avviare nulla
        if (!isFirebaseReady || activeEntry || employeeWorkAreas.length === 0 || !isGpsRequired) {
            setLocationError(null);
            setInRangeArea(null);
            return;
        }
        
        // Logica per watchPosition...
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
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
                        break;
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
            if (error?.code === 1) message = "Permesso di geolocalizzazione negato.";
            else if (error?.code === 2) message = "Posizione non disponibile.";
            else if (error?.code === 3) message = "Timeout nel recuperare la posizione.";
            setLocationError(message + " Controlla permessi e segnale.");
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
    }, [isFirebaseReady, employeeWorkAreas, activeEntry, isGpsRequired]);


    // Listener Firestore per timbratura attiva e timbrature odierne
    useEffect(() => {
        // Controlli robusti per evitare l'errore 'Cannot access db'
        if (!isFirebaseReady || !user?.uid || !employeeData?.id || !Array.isArray(allWorkAreas) || !db) {
            const timeout = setTimeout(() => setIsDataReady(false), 100); 
            setActiveEntry(null);
            setTodaysEntries([]);
            setWorkAreaName('');
            return () => clearTimeout(timeout);
        }

        let isMounted = true;

        // Listener timbratura attiva
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
            setIsDataReady(true);

        }, (error) => {
            console.error("Errore listener timbratura attiva:", error);
            if (error.code === 'permission-denied') {
                 setAuthError("Errore Autorizzazione Firestore: permesso negato per le timbrature.");
            }
            setIsDataReady(true); 
        });

        // Listener timbrature odierne
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"),
                             where("employeeId", "==", employeeData.id),
                             where("clockInTime", ">=", Timestamp.fromDate(startOfDay)),
                             orderBy("clockInTime", "desc"));
        const unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            if (!isMounted) return;
            setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.error("Errore listener timbratura odierne:", error);
        });

        // Funzione di pulizia
        return () => {
             unsubscribeActive();
             unsubscribeTodays();
        };
    }, [isFirebaseReady, db, user?.uid, employeeData, employeeData?.id, allWorkAreas]);


    // --- GESTIONE AZIONI TIMBRATURA/PAUSA ---
    const handleAction = async (action) => {
        // Check per Firebase/Cloud Functions
        if (!isFirebaseReady || isProcessing) {
            console.warn("Firebase non è pronto o altra azione in corso.");
            return;
        }

        // Verifica Autenticazione in tempo reale
        if (!auth.currentUser || auth.currentUser.isAnonymous) {
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
                await new Promise(resolve => setTimeout(resolve, 50)); 
                if (currentActiveEntry) throw new Error("Hai già una timbratura attiva. Riprova a ricaricare."); 

                let areaIdToClockIn = null;
                const note = isGpsRequired ? '' : 'senza GPS Manutentore';
                
                const deviceId = auth.currentUser?.uid || 'unknown_device'; 

                if (isGpsRequired) {
                    if (!inRangeArea) throw new Error("Devi essere all'interno di un'area rilevata.");
                    areaIdToClockIn = inRangeArea.id;
                } else {
                    if (employeeWorkAreas.length === 0) {
                        throw new Error("Controllo GPS esente, ma non sei assegnato a nessuna area. Contatta l'amministratore.");
                    }
                    areaIdToClockIn = employeeWorkAreas[0].id;
                }

                result = await clockIn({ 
                    areaId: areaIdToClockIn, 
                    note: note,
                    deviceId: deviceId 
                });

                if (result.data.success) {
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
                const isInPauseCheck = currentActiveEntry.pauses?.some(p => p.start && !p.end);
                if (isInPauseCheck) throw new Error("Termina la pausa prima di timbrare l'uscita.");

                result = await clockOut();

                if (result.data.success) {
                    setActiveEntry(null); 
                    setWorkAreaName('');
                } else if (result.data.message) {
                    throw new Error(result.data.message);
                }

            } else if (action === 'clockPause') {
                if (!currentActiveEntry) throw new Error("Devi avere una timbratura attiva.");
                if (currentActiveEntry.pauses?.length > 0) { 
                    throw new Error("Hai già usufruito della pausa per questo turno. La pausa è fissa.");
                }

                const currentArea = allWorkAreas.find(a => a.id === currentActiveEntry.workAreaId);
                const pauseDuration = currentArea?.pauseDuration;

                if (pauseDuration && pauseDuration > 0) {
                    result = await applyAutoPauseEmployee({ durationMinutes: pauseDuration });
                } else {
                    throw new Error(`Nessuna durata pausa predefinita (>0 min) per l'area "${currentArea?.name || 'sconosciuta'}".`);
                }

                if (result.data.success) {
                    console.log(`Pausa gestita con successo: Avviata`);
                } else if (result.data.message) {
                    throw new Error(result.data.message);
                }
            
            } else if (action === 'endPause') { 
                if (!currentActiveEntry) throw new Error("Nessuna timbratura attiva da riprendere.");
                const isInPauseCheck = currentActiveEntry.pauses?.some(p => p.start && !p.end);
                if (!isInPauseCheck) throw new Error("Non sei in pausa.");

                result = await endEmployeePause();

                if (result.data.success) {
                    console.log(`Pausa terminata con successo.`);
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
        if (!auth.currentUser || auth.currentUser.isAnonymous) {
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
                setAuthError(null);
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


    // --- Blocco di Caricamento e Errore ---

    // Priorità alta: Se c'è un errore di inizializzazione statica, mostralo immediatamente.
    if (INITIALIZATION_ERROR || firebaseHookError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="text-center p-6 bg-white rounded-lg shadow-xl border-t-4 border-red-500">
                    <p className="text-xl font-bold text-red-600 mb-2">ERRORE CRITICO DI INIZIALIZZAZIONE</p>
                    <p className="text-sm text-gray-700">Il sistema non ha potuto connettersi a Firebase.</p>
                    <p className="text-xs text-red-500 mt-2 font-mono">
                        {INITIALIZATION_ERROR?.message || firebaseHookError?.message || "Verifica le chiavi API/Credenziali .env"}
                    </p>
                </div>
            </div>
        );
    }

    // Dobbiamo mostrare 'Caricamento...' finché l'hook non ha finito l'autenticazione (isReady)
    if (!isFirebaseReady || !employeeData || !isDataReady) {
        return (
             <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                 <div className="text-center p-6 bg-white rounded-lg shadow-xl">
                     <p className="text-xl font-bold text-indigo-600 mb-2">Caricamento dati...</p>
                     {/* Mostra ERRORE AUTENTICAZIONE/CONFIGURAZIONE (Se fallisce l'Auth dopo l'inizializzazione) */}
                     {authError && (
                         <p className="text-base text-red-600 mt-4 font-bold">ERRORE CRITICO: {authError}</p>
                     )}
                 </div>
             </div>
        );
    }
    // Fine Blocco Caricamento

    // Render del componente (Mostrato solo quando isDataReady è true)
    return (
        <div className="p-6 max-w-3xl mx-auto font-sans bg-gray-50 min-h-screen flex flex-col gap-6">
            <CompanyLogo />
            <header className="text-center bg-white rounded-lg shadow-sm px-6 py-4">
                <p className="text-sm text-gray-600">Dipendente:</p>
                <p className="text-lg font-semibold">{employeeData.name} {employeeData.surname}</p>
                <p className="text-3xl font-bold mt-2">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
            </header>

            {/* AVVISO REGISTRAZIONE DEVICE */}
            {employeeData?.deviceIds && employeeData.deviceIds.length > 0 && (
                <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4 rounded-lg shadow-sm" role="alert">
                    <p className="font-bold">Attenzione Dispositivo Registrato</p>
                    <p className="text-sm mt-1">
                        Il tuo dispositivo è associato per la timbratura. 
                        Qualsiasi cambio deve essere comunicato con urgenza al preposto per resettare il vecchio device e riprendere a timbrare regolarmente.
                    </p>
                    <p className="text-xs mt-2 text-gray-600">ID Dispositivo: 
                        <span className="font-mono text-gray-800 ml-1">
                            {employeeData.deviceIds[0]} {/* Mostra il primo ID registrato */}
                        </span>
                    </p>
                </div>
            )}


            {/* BLOCCO DI STATO AREA/GPS QUANDO NON ATTIVA */}
            {!activeEntry && <GpsAreaStatusBlock 
                activeEntry={activeEntry} 
                isGpsRequired={isGpsRequired} 
                locationError={locationError} 
                inRangeArea={inRangeArea} 
                employeeWorkAreas={employeeWorkAreas} 
             />}


            {/* Box Stato Timbratura e Azioni - RIORGANIZZATO */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-2xl font-bold mb-4 text-center text-gray-800">Azioni Rapide</h2>

                {activeEntry ? ( // Se l'utente è timbrato
                    <div className="flex flex-col items-center">
                        
                        {/* STATO E AREA ATTIVA */}
                        <div className={`text-center p-3 rounded-lg w-full ${isInPause ? 'bg-orange-50 text-orange-800' : 'bg-green-50 text-green-800'} border mb-4`}>
                            <p className="text-lg font-semibold">
                                {isInPause ? '🟡 PAUSA ATTIVA' : '🟢 IN CORSO'}
                            </p>
                            <p className="text-sm mt-1">
                                Timbratura: <span className="font-bold">{workAreaName}</span>
                            </p>
                        </div>

                        {/* PULSANTI: PAUSA e USCITA */}
                        <div className="grid grid-cols-2 gap-3 w-full">

                            {/* 1. PULSANTE PAUSA/RIPRENDI */}
                            {isInPause ? (
                                // TERMINA PAUSA (diventa VERDE)
                                <button
                                    onClick={() => handleAction('endPause')}
                                    disabled={isProcessing}
                                    className="w-full py-3 rounded-lg bg-green-500 text-white font-bold disabled:opacity-50 shadow-md hover:bg-green-600 transition duration-150"
                                >
                                    TERMINA PAUSA
                                </button>
                            ) : (
                                // INIZIA PAUSA (diventa GIALLO/ARANCIONE)
                                <button
                                    onClick={() => handleAction('clockPause')}
                                    disabled={isProcessing || isPauseUsedOrActive} // Disabilita se già usufruita
                                    className={`w-full py-3 rounded-lg text-white font-bold shadow-md transition duration-150 ${isPauseUsedOrActive ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600'}`}
                                >
                                    INIZIA PAUSA
                                </button>
                            )}


                            {/* 2. PULSANTE USCITA (ROSSO) */}
                            <button
                                onClick={() => handleAction('clockOut')}
                                disabled={isProcessing || isInPause}
                                className="w-full py-3 rounded-lg bg-red-600 text-white font-bold disabled:opacity-50 shadow-md hover:bg-red-700 transition duration-150"
                            >
                                TIMBRA USCITA
                            </button>
                        </div>
                        {/* Messaggio Pausa Già Usufruita */}
                        {!isInPause && isPauseUsedOrActive && (
                            <p className="text-xs text-center text-gray-500 mt-2">La pausa è stata usufruita per questo turno.</p>
                        )}

                    </div>
                ) : ( // Se l'utente NON è timbrato
                    <div>
                        <p className="text-center text-red-600 font-semibold text-lg mb-4">Timbratura NON ATTIVA</p>

                        {/* Pulsante Entrata UNICO (VERDE) */}
                        <button
                            onClick={() => handleAction('clockIn')}
                            disabled={
                                isProcessing ||
                                (isGpsRequired && !inRangeArea) ||
                                (!isGpsRequired && employeeWorkAreas.length === 0)
                            }
                            className="w-full text-xl font-bold py-3 rounded-lg shadow-md text-white transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                            🟢 TIMBRA ENTRATA
                        </button>
                    </div>
                )}
            </div>
            {/* Fine Box Stato Timbratura e Azioni */}

            {/* Box Cronologia Odierna (ULTRA-COMPATTO) */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-2">Timbrature di Oggi</h2>
                <div className="max-h-60 overflow-y-auto space-y-1"> 
                    {todaysEntries.length > 0 ? todaysEntries.map(entry => (
                        <div key={entry.id} className="text-sm border-b pb-1 last:border-b-0 leading-tight space-y-0">
                            {/* RIGA PRINCIPALE ENTRATA/USCITA: usa flex compatto */}
                            <div className="flex justify-between w-full gap-x-2 pt-0.5">
                            <span className="font-medium">Entrata: {entry.clockInTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}</span>
                            <span className="font-medium text-gray-500">Uscita: {entry.clockOutTime ? entry.clockOutTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : '...'}</span>
                            </div>
                            {/* RIGA DETTAGLIO PAUSE (Ultra-Compatta) */}
                            {entry.pauses && entry.pauses.length > 0 && (
                                <div className="text-xs text-gray-600 mt-0.5">
                                    {entry.pauses.map((p, index) => (
                                        <p key={index} className="leading-tight">
                                            <span className="font-semibold">{p.isAutomatic ? 'Auto Pausa' : 'Pausa'}:</span>
                                            {p.start.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })} - 
                                            {p.end ? p.end.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : 'in corso'}
                                            {p.isAutomatic && p.durationMinutes && ` (${p.durationMinutes} min)`}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )) : <p className="text-sm text-gray-500">Nessuna timbratura trovata per oggi.</p>}
                </div>
            </div>

            {/* Box Report Mensile CSV/Excel */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3">Report Mensile Excel/CSV</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Select Mese */}
                    <div>
                        <label htmlFor="month-select" className="block text-sm font-medium text-gray-700">Mese</label>
                        <select
                            id="month-select"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
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
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                        >
                            {years.map(year => (<option key={year} value={year}>{year}</option>))}
                        </select>
                    </div>
                </div>
                {/* Pulsante Scarica Report */}
                <button
                    onClick={generateExcelReport}
                    disabled={isGeneratingReport}
                    className="w-full text-lg font-bold py-3 px-4 rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150"
                >
                    {isGeneratingReport ? 'Generazione in corso...' : 'Scarica Report Excel'}
                </button>
            </div>

            {/* Pulsante Logout in fondo */}
            <button onClick={handleLogout} className="w-full mt-auto px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition duration-150 shadow-md">Logout</button>
        </div>
    );
};

export default EmployeeDashboard;
