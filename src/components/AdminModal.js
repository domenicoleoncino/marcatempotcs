// File: src/js/components/EmployeeDashboard.js (COMPLETO E FINALE)

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
// === NUOVE IMPORTAZIONI PER EXCEL ===
import { utils, writeFile } from 'xlsx';

const requiredRestHours = 8; // Regola delle 8 ore di riposo

// Funzione distanza GPS (invariata)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raggio Terra in metri
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaL = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distanza in metri
}

const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    // Stati
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPauseAttempted, setIsPauseAttempted] = useState(false); // Flag di tentativo di pausa
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null);
    const [lastClockOutTime, setLastClockOutTime] = useState(null); // Ora dell'ultima uscita completata
    const [isRestBypassActive, setIsRestBypassActive] = useState(false); // NUOVO STATO: Bypass attivo

    // Stati per report Excel
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGenerating, setIsGenerating] = useState(false);

    // Funzioni Cloud Firebase
    const functions = getFunctions(undefined, 'europe-west1');
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee');


    // === FUNZIONE HELPER AUDIO ===
    const playSound = (fileName) => {
        const audioPath = process.env.PUBLIC_URL + `/sounds/${fileName}.mp3`;
        try {
            const audio = new Audio(audioPath);
            audio.play().catch(e => {
                console.warn(`Riproduzione audio fallita per ${fileName}:`, e);
            });
        } catch (e) {
            console.warn("Errore creazione oggetto Audio:", e);
        }
    };
    // =============================

    // Funzione per forzare l'aggiornamento della pagina (Refresh Manuale)
    const handleManualRefresh = () => {
        window.location.reload();
    };


    // Aggiorna ora corrente
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        
        // SUONO ALL'APERTURA DELL'APP
        playSound('app_open');
        
        return () => clearInterval(timer);
    }, []);

    // Filtra aree assegnate al dipendente
    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    // Leggi il flag GPS dai dati del dipendente
    const isGpsRequired = employeeData?.controlloGpsRichiesto ?? true;


    // Logica GPS (watchPosition per aggiornamenti continui)
    useEffect(() => {
        if (employeeWorkAreas.length === 0 || !isGpsRequired) {
            setLocationError(null);
            setInRangeArea(null);
            return; // Non serve GPS
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
            
            if (error.code === error.PERMISSION_DENIED) {
                 message = "Permesso di geolocalizzazione negato. Aggiorna i permessi del browser o riavvia la pagina.";
                 setInRangeArea(null);
                 setLocationError(message);
                 if (watchId !== null) {
                      navigator.geolocation.clearWatch(watchId);
                      watchId = null;
                 }
                 return;
            }
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

        return () => {
            isMounted = false;
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        };
    }, [employeeWorkAreas, isGpsRequired]); 


    // Calcolo stato pausa (controlla se c'è una pausa SENZA end)
    const isInPause = activeEntry?.pauses?.some(p => p.start && !p.end);
    
    // Logica di Reset del flag di tentativo pausa
    useEffect(() => {
        if (!isInPause && isPauseAttempted) {
             setIsPauseAttempted(false);
        }
    }, [isInPause, isPauseAttempted]);

    // Listener Firestore per timbratura attiva, timbrature odierne e BYPASS
    useEffect(() => {
        if (!user?.uid || !employeeData?.id || !Array.isArray(allWorkAreas)) {
             setActiveEntry(null);
             setTodaysEntries([]);
             setWorkAreaName('');
             return;
        }

        // 1. Listener timbratura attiva
        // FIX: Rimosso orderBy per stabilità e per evitare problemi di cache/indice in produzione
        const qActive = query(collection(db, "time_entries"),
                               where("employeeId", "==", employeeData.id),
                               where("status", "==", "clocked-in"),
                               limit(1));
        
        // 2. Listener timbrature odierne
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"),
                               where("employeeId", "==", employeeData.id),
                               where("clockInTime", ">=", Timestamp.fromDate(startOfDay)),
                               orderBy("clockInTime", "desc"));

        // 3. Listener Bypass Riposo (Eccezione)
        const qBypass = query(collection(db, "rest_bypass_requests"),
                              where("employeeId", "==", employeeData.id),
                              where("expiresAt", ">", Timestamp.now()), // L'eccezione è valida
                              orderBy("expiresAt", "desc"),
                              limit(1));


        let unsubscribeActive, unsubscribeTodays, unsubscribeBypass;

        // Esegue l'ascolto per la timbratura attiva
        unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!snapshot.empty) {
                const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveEntry(entryData);
                const area = allWorkAreas.find(a => a.id === entryData.workAreaId);
                setWorkAreaName(area ? area.name : 'Sconosciuta');
                setLastClockOutTime(null); // Resetta l'ora di uscita se si è timbrato
            } else {
                setActiveEntry(null);
                setWorkAreaName('');
                
                // CERCA L'ULTIMA USCITA COMPLETATA (se non c'è timbratura attiva)
                const qLastClockOut = query(collection(db, "time_entries"),
                                            where("employeeId", "==", employeeData.id),
                                            where("status", "==", "clocked-out"),
                                            orderBy("clockOutTime", "desc"),
                                            limit(1));
                getDocs(qLastClockOut).then(snap => {
                     if (!snap.empty && snap.docs[0].data().clockOutTime) {
                          // Imposta l'ora di uscita solo se l'utente non ha timbrature attive
                          setLastClockOutTime(snap.docs[0].data().clockOutTime.toDate());
                     } else {
                          setLastClockOutTime(null);
                     }
                }).catch(e => console.error("Errore recupero ultima uscita:", e));
            }
        }, (error) => console.error("Errore listener timbratura attiva:", error));

        // Esegue l'ascolto per le timbrature odierne
        unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Errore listener timbratura attiva:", error));
        
        // Esegue l'ascolto per il bypass
        unsubscribeBypass = onSnapshot(qBypass, (snap) => {
            setIsRestBypassActive(!snap.empty); // Imposta a true se c'è un'eccezione valida
        });


        // Funzione di pulizia
        return () => {
             unsubscribeActive();
             unsubscribeTodays();
             unsubscribeBypass();
        };
    }, [user?.uid, employeeData?.id, allWorkAreas]);


    // Calcola se sono necessarie ore di riposo (almeno 8 ore dall'ultima uscita)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const isRestPeriodRequired = useMemo(() => {
        // Se c'è un bypass attivo, non è richiesto il riposo
        if (isRestBypassActive) return false;
        
        if (!lastClockOutTime) return false;
        
        const requiredRestMs = requiredRestHours * 3600000; // 8 ore in millisecondi
        const elapsedMs = new Date().getTime() - lastClockOutTime.getTime();
        
        return elapsedMs < requiredRestMs;
    }, [lastClockOutTime, requiredRestHours, isRestBypassActive, currentTime]);


    // --- GESTIONE AZIONI TIMBRATURA/PAUSA ---
    const handleAction = async (action) => {
        if (isProcessing) return;
        setIsProcessing(true);
        setLocationError(null);

        try {
            let result;
            const currentActiveEntry = activeEntry;

            if (action === 'clockIn') {
                
                // *** BLOCCO: CONTROLLO RIPOSO 8 ORE ***
                if (isRestPeriodRequired) {
                    throw new Error(`Devi riposare per almeno ${requiredRestHours} ore prima di una nuova entrata.`);
                }
                
                let areaIdToClockIn = null;
                const note = isGpsRequired ? '' : 'senza GPS Manutentore'; 

                // Logica GPS Entrata
                if (isGpsRequired) {
                    if (!inRangeArea) throw new Error("Devi essere all'interno di un'area rilevata per timbrare l'entrata.");
                    areaIdToClockIn = inRangeArea.id;
                } else {
                    if (employeeWorkAreas.length === 0) {
                        throw new Error("Controllo GPS esente, ma non sei assegnato a nessuna area. Contatta l'amministratore.");
                    }
                    areaIdToClockIn = employeeWorkAreas[0].id;
                }
                
                // Chiama la Cloud Function
                result = await clockIn({ areaId: areaIdToClockIn, note: note }); 
                
                // Aggiornamento ottimistico stato
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
                    setLastClockOutTime(null); // Rimuovi l'ora di uscita precedente
                    
                    // SUONO DI SUCCESSO
                    playSound('clock_in'); 

                } else if (result.data.message) {
                     alert(result.data.message);
                }
                
            } else if (action === 'clockOut') {
                if (!currentActiveEntry) throw new Error("Nessuna timbratura attiva da chiudere.");

                // *** CONTROLLO GPS USCITA ***
                if (isGpsRequired) {
                     if (!inRangeArea) throw new Error("Devi essere all'interno di un'area rilevata per timbrare l'uscita.");
                }

                // Chiama la Cloud Function
                result = await clockOut();
                
                // Logica di successo dopo la chiamata al backend
                if (result.data.success) {
                    playSound('clock_out'); 
                    alert(result.data.message || 'Timbratura di uscita registrata.');
                    
                    // AGGIUNTA REFRESH FORZATO
                    setTimeout(() => {
                        window.location.reload(); 
                    }, 500); 
                    return;

                } else if (result.data.message) {
                    alert(result.data.message);
                }
                
            } else if (action === 'clockPause') { // AZIONE INIZIO PAUSA
                if (!currentActiveEntry) throw new Error("Devi avere una timbratura attiva.");
                const isInPauseFromDb = currentActiveEntry.pauses?.some(p => p.start && !p.end);

                // *** BLOCCO ANTI DOPPIA PAUSA ***
                if (isInPauseFromDb || isPauseAttempted) { 
                    throw new Error("Pausa già attiva o tentativo in corso. Attendere l'aggiornamento.");
                }

                const currentArea = allWorkAreas.find(a => a.id === currentActiveEntry.workAreaId);
                const pauseDuration = currentArea?.pauseDuration;

                if (pauseDuration && pauseDuration > 0) {
                    setIsPauseAttempted(true); 
                    result = await applyAutoPauseEmployee({ durationMinutes: pauseDuration });
                    
                    // SUONO DI SUCCESSO
                    playSound('pause_start'); 
                    
                } else {
                    throw new Error(`Nessuna pausa predefinita (>0 min) per l'area "${currentArea?.name || 'sconosciuta'}".`);
                }
            } else {
                throw new Error("Azione non riconosciuta.");
            }

            if (action !== 'clockIn' && result?.data?.message) {
                alert(result.data.message);
            }

        } catch (error) {
            console.error(`Errore durante ${action}:`, error);
            alert(`Errore: ${error.message || 'Si è verificato un problema.'}`);
        } finally {
            setIsProcessing(false);
        }
    };


    // Logica handleExportExcel (Omessa per brevità)
    const handleExportExcel = async () => {
        setIsGenerating(true);

        if (!employeeData || !employeeData.id) {
             alert("Errore: Dati del dipendente non caricati. Ricarica la pagina.");
             setIsGenerating(false);
             return;
        }
        const employeeId = employeeData.id;
        
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
            const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
            const endDate = new Date(nextYear, nextMonth, 1); 

            const q = query(
                collection(db, "time_entries"),
                where("employeeId", "==", employeeId), 
                where("clockInTime", ">=", Timestamp.fromDate(startDate)),
                where("clockInTime", "<", Timestamp.fromDate(endDate)), 
                orderBy("clockInTime", "asc")
            );

            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                alert("Nessuna timbratura trovata per il periodo selezionato.");
                setIsGenerating(false);
                return;
            }

            const dataToExport = [];
            let totalWorkedMinutes = 0;

            querySnapshot.forEach(entryDoc => {
                const data = entryDoc.data();
                const clockIn = data.clockInTime.toDate();
                const clockOut = data.clockOutTime ? data.clockOutTime.toDate() : null;
                const area = allWorkAreas.find(a => a.id === data.workAreaId);

                let pauseDurationMinutes = 0;

                if (data.pauses && data.pauses.length > 0) {
                    data.pauses.forEach(p => {
                        if (p.start && p.end) {
                            const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                            const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                            pauseDurationMinutes += Math.round((endMillis - startMillis) / 60000); // Minuti
                        }
                    });
                }

                if (clockOut) {
                    const totalEntryMinutes = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000);
                    const workedMinutes = totalEntryMinutes - pauseDurationMinutes;
                    if (workedMinutes > 0) {
                        totalWorkedMinutes += workedMinutes;
                    }
                    const hours = Math.floor(workedMinutes / 60);
                    const minutes = Math.floor(workedMinutes % 60);
                    const totalHoursFormatted = clockOut ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}` : "In corso";

                    dataToExport.push({
                        'Dipendente': `${employeeData.name} ${employeeData.surname}`,
                        'Area': area ? area.name : 'Sconosciuta',
                        'Data': clockIn.toLocaleDateString('it-IT'),
                        'Entrata': clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
                        'Uscita': clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : 'In corso',
                        'Durata Lavorata (h:m)': totalHoursFormatted,
                        'Pausa Totale (min)': pauseDurationMinutes,
                        'Manual': data.isManual ? 'SI' : 'NO'
                    });
                }
            });

            const totalH = Math.floor(totalWorkedMinutes / 60);
            const totalM = totalWorkedMinutes % 60;
            
            dataToExport.push({}); 
            dataToExport.push({
                'Dipendente': 'TOTALE MESE:',
                'Area': `${totalH.toString().padStart(2, '0')}:${totalM.toString().padStart(2, '0')}`, 
                'Data': '',
                'Entrata': '',
                'Uscita': '',
                'Durata Lavorata (h:m)': '',
                'Pausa Totale (min)': '',
                'Manual': ''
            });

            const ws = utils.json_to_sheet(dataToExport);
            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "Report Ore");
            ws['!cols'] = [
                { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 10 }
            ];

            writeFile(wb, `Report_${employeeData.surname}_${selectedMonth + 1}_${selectedYear}.xlsx`);

        } catch (error) {
            console.error("Errore durante la generazione del Report Excel:", error);
            alert("Si è verificato un errore durante la generazione del report.");
        } finally {
            setIsGenerating(false);
        }
    };
    // Fine funzione generazione Excel


    // Render iniziale se mancano dati dipendente
    if (!employeeData) return <div className="min-h-screen flex items-center justify-center">Caricamento dipendente...</div>;

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; // Anno corrente e precedente

    // Messaggio Dispositivo/Reset
    const renderDeviceMessage = () => {
        return (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
                <p className="font-bold">Attenzione Dispositivo Registrato</p>
                <p className="text-sm">In caso di guasto o cambio cellulare contattare Preposto o Admin.</p>
            </div>
        );
    }
    


    // --- Componente di stato GPS/Area ---
    const GpsAreaStatusBlock = () => {
        if (employeeWorkAreas.length === 0) {
            if (isGpsRequired) {
                 return <div className="bg-white p-4 rounded-lg shadow-md mb-6"><p className="text-sm text-red-500 mt-2 text-center">❌ Controllo GPS richiesto ma nessuna area assegnata.</p></div>
            } else {
                 return null; 
            }
        }
        
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
            
            {/* Box Messaggio Dispositivo (Modificato) */}
            {renderDeviceMessage()}

            {/* Box Orario e Info Dipendente */}
            <div className="text-center my-4 p-4 bg-white rounded-lg shadow-sm">
                <p>Dipendente: <span className="font-semibold">{employeeData.name} {employeeData.surname}</span></p>
                <p className="text-4xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-lg text-gray-500">{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                
                {/* PULSANTE AGGIORNA STATO */}
                <button
                    onClick={handleManualRefresh}
                    className="mt-2 text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                    🔄 Aggiorna Stato
                </button>
            </div>

            {/* BLOCCO DI STATO AREA/GPS */}
            <GpsAreaStatusBlock />
            

            {/* Box Stato Timbratura e Azioni */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Azioni Rapide</h2>
                {activeEntry ? ( // Se l'utente è timbrato
                    <div>
                        <p className="text-center text-green-600 font-semibold text-lg mb-4">Timbratura ATTIVA su: <span className="font-bold">{workAreaName}</span></p>
                        
                        {/* SEMAFORO QUANDO ATTIVO: 3 pulsanti */}
                        <div className="grid grid-cols-3 gap-3">

                            {/* 1. PAUSA (ARANCIONE o GRIGIO se già attiva) */}
                            <button
                                onClick={() => handleAction('clockPause')}
                                disabled={isProcessing || isInPause || isPauseAttempted} 
                                className={`w-full font-bold rounded-lg shadow-lg transition-colors py-4 text-white ${
                                    isInPause || isPauseAttempted
                                        ? 'bg-gray-400' 
                                        : 'bg-orange-500 hover:bg-orange-600'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <div className="text-2xl leading-none">🟡</div>
                                <span className="text-sm block mt-1">{isInPause || isPauseAttempted ? 'PAUSA ATTIVA' : 'INIZIA PAUSA'}</span>
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
                                disabled={isProcessing || isInPause || (isGpsRequired && !inRangeArea)}
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
                                isRestPeriodRequired || 
                                (isGpsRequired && !inRangeArea) || 
                                (!isGpsRequired && employeeWorkAreas.length === 0)
                            }
                            className={`w-full mt-4 text-2xl font-bold py-6 px-4 rounded-lg shadow-lg text-white transition-colors 
                                ${isRestPeriodRequired ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isRestPeriodRequired 
                                ? `⛔ Riposo richiesto (${requiredRestHours} ore)` 
                                : '🟢 TIMBRA ENTRATA'}
                        </button>
                        {isRestPeriodRequired && (
                            <p className="text-sm text-red-500 mt-2 text-center">
                                Rientro non consentito prima di <span className='font-bold'>
                                    {new Date(lastClockOutTime?.getTime() + requiredRestHours * 3600000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) || 'N/D'}
                                </span>. 
                                {isRestBypassActive && <span className='text-blue-500 font-semibold'> (Bypass Admin attivo)</span>}
                            </p>
                        )}
                    </div>
                )}
            </div>
            
            {/* Box Cronologia Odierna */}
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

            {/* Box Report Mensile Excel */}
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
                    onClick={handleExportExcel}
                    disabled={isGenerating}
                    className="w-full text-lg font-bold py-3 px-4 rounded-lg shadow-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGenerating ? 'Generazione in corso...' : 'Scarica Report Excel'}
                </button>
            </div>

            {/* Pulsante Logout in fondo */}
            <button onClick={handleLogout} className="w-full mt-auto px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">Logout</button>
        </div>
    );
};

export default EmployeeDashboard;