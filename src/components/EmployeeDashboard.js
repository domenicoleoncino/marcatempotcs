// File: src/components/EmployeeDashboard.js
/* eslint-disable no-unused-vars */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';

// === IMPORTAZIONI PER PDF ===
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ===========================================
// --- CONFIGURAZIONE BLOCCO RIENTRO ---
// ===========================================
const MIN_REENTRY_DELAY_MINUTES = 30; // Tempo minimo di attesa (in minuti) tra Uscita e nuova Entrata

// ===========================================
// --- 1. FUNZIONE UTILITY DEVICE ID ---
// ===========================================
function getOrGenerateDeviceId() {
    let deviceId = localStorage.getItem('marcatempoDeviceId'); 
    
    if (!deviceId) {
        // Genera un ID pseudo-univoco
        deviceId = (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)).toUpperCase();
        localStorage.setItem('marcatempoDeviceId', deviceId);
    }
    return deviceId;
}

// Funzione distanza GPS
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

// === MOTIVI DI MANCATA PAUSA STRUTTURATI E SEMPLIFICATI ===
const PAUSE_REASONS = [
    { code: '01', reason: 'Mancata pausa per intervento urgente.' },
    { code: '02', reason: 'Mancata pausa per ore non complete.' },
    { code: '03', reason: 'Mancata pausa per richiesta cantiere.' },
    { code: '04', reason: 'Altro... (specificare).' }
];

const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    // Stati Generali
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPauseAttempted, setIsPauseAttempted] = useState(false); 
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null); 
    const [manualAreaId, setManualAreaId] = useState(''); 
    
    // STATO Device ID
    const [deviceId, setDeviceId] = useState(null);

    // Stati per report PDF
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGenerating, setIsGenerating] = useState(false);

    // === GESTIONE MODULI MS FORMS (STATI) ===
    const [showFormsModal, setShowFormsModal] = useState(false);
    const [availableForms, setAvailableForms] = useState([]);
    const [isLoadingForms, setIsLoadingForms] = useState(false);
    const [selectedAreaForForms, setSelectedAreaForForms] = useState('');

    // Funzioni Cloud Firebase
    const functions = getFunctions(undefined, 'europe-west1');
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee');

    // === FUNZIONE HELPER AUDIO ===
    const playSound = (fileName) => {
        const audioPath = `/sounds/${fileName}.mp3`;
        try {
            const audio = new Audio(audioPath);
            audio.play().catch(e => {
                console.warn(`Riproduzione audio fallita per ${fileName} (blocco browser):`, e);
            });
        } catch (e) {
            console.warn("Errore creazione oggetto Audio:", e);
        }
    };

    // Aggiorna ora corrente
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        playSound('app_open');
        return () => clearInterval(timer);
    }, []);

    // INIZIALIZZAZIONE DEVICE ID
    useEffect(() => {
        const currentDeviceId = getOrGenerateDeviceId();
        setDeviceId(currentDeviceId); 
    }, []); 

    // Filtra aree assegnate al dipendente
    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    // Leggi il flag GPS dai dati del dipendente
    const isGpsRequired = employeeData?.controlloGpsRichiesto ?? true;

    // Logica GPS
    useEffect(() => {
        if (employeeWorkAreas.length === 0 || !isGpsRequired || !deviceId) {
            setLocationError(null);
            setInRangeArea(null);
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
        
        if (navigator.geolocation) {
             watchId = navigator.geolocation.watchPosition(
                 handlePositionSuccess,
                 handlePositionError,
                 { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
             );
        } else {
             setLocationError("La geolocalizzazione non è supportata.");
        }

        return () => {
            isMounted = false;
            if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
        };
    }, [employeeWorkAreas, isGpsRequired, deviceId]);

    // CALCOLO STATO PAUSA
    const pauseStatus = useMemo(() => {
        const pauses = activeEntry?.pauses || [];
        let isActive = false;
        let isCompleted = false;

        for (const p of pauses) {
            if (p.start && p.end) {
                isCompleted = true;
            } else if (p.start && !p.end) {
                isActive = true;
                break;
            }
        }

        if (isActive) return 'ACTIVE';
        if (isCompleted) return 'COMPLETED';
        return 'NONE';
    }, [activeEntry]);

    const isInPause = pauseStatus === 'ACTIVE'; 
    
    // Logica di Reset del flag di tentativo pausa
    useEffect(() => {
        if (!isInPause && isPauseAttempted) {
             setIsPauseAttempted(false);
        }
    }, [isInPause, isPauseAttempted]);

    // Listener Firestore
    useEffect(() => {
        if (!user?.uid || !employeeData?.id || !Array.isArray(allWorkAreas)) {
             setActiveEntry(null);
             setTodaysEntries([]);
             setWorkAreaName('');
             return;
        }
        
        let isMounted = true; 
        
        const qActive = query(collection(db, "time_entries"),
                               where("employeeId", "==", employeeData.id),
                               where("status", "==", "clocked-in"),
                               limit(1));
        
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"),
                               where("employeeId", "==", employeeData.id),
                               where("clockInTime", ">=", Timestamp.fromDate(startOfDay)),
                               orderBy("clockInTime", "desc"));

        let unsubscribeActive, unsubscribeTodays;

        unsubscribeActive = onSnapshot(qActive, (snapshot) => {
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
            if (isMounted) console.error("Errore listener timbratura attiva:", error);
        });

        unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            if (!isMounted) return;
            setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            if (isMounted) console.error("Errore listener timbratura odierna:", error);
        });
        
        return () => {
             isMounted = false;
             unsubscribeActive();
             unsubscribeTodays();
        };
    }, [user?.uid, employeeData?.id, allWorkAreas]);


    // --- GESTIONE AZIONI TIMBRATURA/PAUSA ---
    const handleAction = async (action) => {
        if (isProcessing) return;
        setIsProcessing(true);
        setLocationError(null);

        if (!deviceId) {
            alert("ID dispositivo non disponibile. Ricarica la pagina.");
            setIsProcessing(false);
            return;
        }

        try {
            let result;
            const currentActiveEntry = activeEntry;
            const isGpsRequiredCheck = isGpsRequired; 
            const currentLat = inRangeArea?.latitude;
            const currentLon = inRangeArea?.longitude;

            if (action === 'clockIn') {
                // =========================================================
                // CONTROLLO DI SICUREZZA: RIENTRO TROPPO RAPIDO
                // =========================================================
                if (todaysEntries.length > 0) {
                    const lastEntry = todaysEntries[0]; // È ordinato decrescente, quindi il primo è l'ultimo inserito
                    if (lastEntry.clockOutTime) {
                        const lastOutDate = lastEntry.clockOutTime.toDate();
                        const now = new Date();
                        const diffMs = now - lastOutDate;
                        const diffMins = Math.floor(diffMs / 60000); // Differenza in minuti

                        if (diffMins < MIN_REENTRY_DELAY_MINUTES) {
                            const remaining = MIN_REENTRY_DELAY_MINUTES - diffMins;
                            alert(`⛔ BLOCCO SICUREZZA: Non puoi timbrare subito dopo l'uscita.\n\nDevi attendere ancora ${remaining} minuti.`);
                            setIsProcessing(false);
                            return; // Blocca tutto
                        }
                    }
                }
                // =========================================================

                let areaIdToClockIn = null;
                let note = ''; 

                if (isGpsRequiredCheck) {
                    if (!inRangeArea) throw new Error("Devi essere all'interno di un'area rilevata per timbrare l'entrata.");
                    areaIdToClockIn = inRangeArea.id;
                } else {
                    areaIdToClockIn = manualAreaId;
                    
                    if (!areaIdToClockIn) {
                        throw new Error("Seleziona un'area di lavoro per la timbratura manuale.");
                    }

                    const selectedArea = employeeWorkAreas.find(a => a.id === areaIdToClockIn);
                    note = `Entrata Manuale su Area: ${selectedArea ? selectedArea.name : 'Sconosciuta'}`;
                }
                
                result = await clockIn({ 
                    areaId: areaIdToClockIn, 
                    note: note, 
                    deviceId: deviceId,
                    isGpsRequired: isGpsRequiredCheck,
                    currentLat: inRangeArea?.latitude,
                    currentLon: inRangeArea?.longitude
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
                    playSound('clock_in'); 
                    setManualAreaId(''); 
                } else if (result.data.message) {
                     alert(result.data.message);
                }
                
            } else if (action === 'clockOut') {
                if (!currentActiveEntry) throw new Error("Nessuna timbratura attiva da chiudere.");

                let finalReasonCode = null;
                let finalNoteText = '';
                const currentArea = allWorkAreas.find(a => a.id === currentActiveEntry.workAreaId);
                const pauseDuration = currentArea?.pauseDuration || 0;
                
                // === NUOVA LOGICA: VERIFICA PAUSA NON GODUTA ===
                if (pauseDuration > 0 && pauseStatus !== 'COMPLETED') { 
                    const reasonOptions = PAUSE_REASONS.map((r, i) => `${i + 1} - ${r.reason}`).join('\n');
                    const confirmExit = window.confirm(
                        `ATTENZIONE: La tua area prevede una pausa di ${pauseDuration} minuti, ma non risulta sia stata completata.\n\nVuoi uscire senza pausa? Clicca OK per selezionare il motivo.`
                    );

                    if (confirmExit) {
                        const selectedCode = window.prompt(
                            `Seleziona il numero del motivo (da 1 a ${PAUSE_REASONS.length}):\n\n${reasonOptions}`
                        );
                        const selectedIndex = parseInt(selectedCode) - 1; 
                        const selectedReason = PAUSE_REASONS[selectedIndex];
                        
                        if (!selectedReason) {
                            throw new Error("Selezione motivo non valida o mancante. Uscita annullata.");
                        }
                        finalReasonCode = selectedReason.code;

                        if (selectedReason.code === '04') { 
                            finalNoteText = window.prompt("Hai selezionato 'Altro'. Specifica il motivo (OBBLIGATORIO):");
                            if (!finalNoteText || finalNoteText.trim() === '') {
                                throw new Error("La specifica è obbligatoria per il motivo 'Altro'. Uscita annullata.");
                            }
                        } else {
                            finalNoteText = selectedReason.reason; 
                        }
                    } else {
                        throw new Error("Uscita annullata.");
                    }
                }

                if (isGpsRequiredCheck) {
                     if (!inRangeArea) throw new Error("Devi essere all'interno di un'area rilevata per timbrare l'uscita.");
                }

                result = await clockOut({ 
                    note: finalNoteText, 
                    pauseSkipReason: finalReasonCode, 
                    deviceId: deviceId,
                    isGpsRequired: isGpsRequiredCheck, 
                    currentLat: currentLat, 
                    currentLon: currentLon 
                }); 
                
                if (result.data.success) {
                    playSound('clock_out'); 
                    let successMessage = result.data.message || 'Timbratura di uscita registrata.';
                    if (finalReasonCode) {
                        successMessage += '\n\n⚠️ NOTA IMPORTANTE: Hai dichiarato di non aver fatto pausa. La richiesta è IN ATTESA DI APPROVAZIONE dal tuo responsabile.\nFino all\'approvazione, le ore di pausa verranno scalate cautelativamente.';
                    }
                    alert(successMessage);
                    return;
                } else if (result.data.message) {
                    alert(result.data.message);
                }
                
            } else if (action === 'clockPause') { 
                if (!currentActiveEntry) throw new Error("Devi avere una timbratura attiva.");
                
                if (pauseStatus !== 'NONE') { 
                    throw new Error(pauseStatus === 'COMPLETED' 
                        ? "Hai già effettuato la pausa in questo turno." 
                        : "Pausa già attiva o tentativo in corso. Attendere l'aggiornamento.");
                }

                const currentArea = allWorkAreas.find(a => a.id === currentActiveEntry.workAreaId);
                const pauseDuration = currentArea?.pauseDuration;

                if (pauseDuration && pauseDuration > 0) {
                    setIsPauseAttempted(true); 
                    playSound('pause_start'); 

                    result = await applyAutoPauseEmployee({ 
                        timeEntryId: currentActiveEntry.id, 
                        durationMinutes: pauseDuration,
                        deviceId: deviceId,
                    }); 
                } else {
                    throw new Error(`Nessuna pausa predefinita (>0 min) per l'area "${currentArea?.name || 'sconosciuta'}".`);
                }
            } else { 
                throw new Error("Azione non riconosciuta.");
            }

            if ((action === 'clockPause' || action === 'clockOut') && result?.data?.message) {
                if (!result.data.success) alert(result.data.message);
            }

        } catch (error) {
            console.error(`Errore durante ${action}:`, error);
            const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message;
            alert(`Errore: ${displayMessage || 'Si è verificato un problema.'}`);
        } finally {
            setIsProcessing(false);
        }
    };


    // ========================================================
    // --- 2. FUNZIONE GENERAZIONE PDF ---
    // ========================================================
    const handleExportPDF = async () => {
        setIsGenerating(true);

        if (!employeeData || !employeeData.id) {
             alert("Errore: Dati del dipendente non caricati. Ricarica la pagina.");
             setIsGenerating(false);
             return;
        }
        
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
            const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
            const endDate = new Date(nextYear, nextMonth, 1); 

            // Query Firestore
            const q = query(
                collection(db, "time_entries"),
                where("employeeId", "==", employeeData.id), 
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

            const tableRows = [];
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
                            pauseDurationMinutes += Math.round((endMillis - startMillis) / 60000); 
                        }
                    });
                }

                let totalHoursFormatted = "In corso";
                if (clockOut) {
                    const totalEntryMinutes = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000);
                    const workedMinutes = totalEntryMinutes - pauseDurationMinutes;
                    if (workedMinutes > 0) totalWorkedMinutes += workedMinutes;
                    
                    const hours = Math.floor(workedMinutes / 60);
                    const minutes = Math.floor(workedMinutes % 60);
                    totalHoursFormatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                }

                // Riga Tabella PDF
                tableRows.push([
                    clockIn.toLocaleDateString('it-IT'),
                    clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '---',
                    pauseDurationMinutes > 0 ? `${pauseDurationMinutes} min` : '-',
                    totalHoursFormatted,
                    data.isManual ? 'Manuale' : (area ? area.name : 'GPS')
                ]);
            });

            // Calcolo Totale Finale
            const finalTotalH = Math.floor(totalWorkedMinutes / 60);
            const finalTotalM = totalWorkedMinutes % 60;
            const finalTotalString = `${finalTotalH.toString().padStart(2, '0')}:${finalTotalM.toString().padStart(2, '0')}`;

            // --- CREAZIONE PDF ---
            const doc = new jsPDF();
            const monthsNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
            const monthName = monthsNames[selectedMonth];

            // 1. Aggiunta Logo
            try {
                const img = new Image();
                img.src = '/icon-192x192.png'; 
                doc.addImage(img, 'PNG', 14, 10, 30, 30); 
            } catch (e) {
                console.warn("Logo non trovato o errore caricamento immagine:", e);
                doc.setFontSize(10);
                doc.text("Azienda", 14, 20);
            }

            // 2. Intestazione Testo
            doc.setFontSize(16);
            doc.text(`Report Ore: ${monthName} ${selectedYear}`, 60, 20);
            
            doc.setFontSize(12);
            doc.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 60, 28);
            doc.text(`Data Stampa: ${new Date().toLocaleDateString('it-IT')}`, 60, 34);

            // 3. Generazione Tabella
            autoTable(doc, {
                head: [['Data', 'Entrata', 'Uscita', 'Pausa', 'Totale', 'Note']],
                body: tableRows,
                startY: 50,
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185] }, 
                styles: { fontSize: 10, cellPadding: 3 },
            });

            // 4. Piè di pagina: Solo il Totale
            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text(`TOTALE ORE LAVORATE: ${finalTotalString}`, 14, finalY);

            // 5. Salvataggio
            doc.save(`Report_${employeeData.surname}_${monthName}_${selectedYear}.pdf`);

        } catch (error) {
            console.error("Errore generazione PDF:", error);
            alert("Si è verificato un errore durante la generazione del PDF.");
        } finally {
            setIsGenerating(false);
        }
    };

    // ========================================================
    // --- 3. GESTIONE MODULI MS FORMS ---
    // ========================================================
    
    // Funzione per caricare i moduli da Firestore
    const fetchAreaForms = async (areaIdToFetch) => {
        if (!areaIdToFetch) {
            setAvailableForms([]);
            return;
        }
        setIsLoadingForms(true);
        try {
            // Presupponiamo una collezione 'area_forms' dove ogni documento ha un campo 'workAreaId'
            const q = query(collection(db, "area_forms"), where("workAreaId", "==", areaIdToFetch));
            const snapshot = await getDocs(q);
            const forms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAvailableForms(forms);
        } catch (error) {
            console.error("Errore caricamento moduli:", error);
            alert("Errore caricamento moduli/questionari.");
        } finally {
            setIsLoadingForms(false);
        }
    };

    // Apre il modale. Se c'è una timbratura attiva, carica subito i moduli di quell'area.
    const handleOpenFormsModal = () => {
        let defaultAreaId = '';
        if (activeEntry && activeEntry.workAreaId) {
            defaultAreaId = activeEntry.workAreaId;
        } else if (employeeWorkAreas.length === 1) {
            defaultAreaId = employeeWorkAreas[0].id;
        }

        setSelectedAreaForForms(defaultAreaId);
        
        if (defaultAreaId) {
            fetchAreaForms(defaultAreaId);
        } else {
            setAvailableForms([]); // Resetta se non c'è area
        }

        setShowFormsModal(true);
    };

    // Gestisce il cambio area nel dropdown dentro il modale
    const handleAreaChangeForForms = (e) => {
        const newAreaId = e.target.value;
        setSelectedAreaForForms(newAreaId);
        fetchAreaForms(newAreaId);
    };

    // STILI MODALE (Ripresi da AdminModal per uniformità)
    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', maxHeight: '85vh', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm";


    // Render iniziale
    if (!employeeData) return <div className="min-h-screen flex items-center justify-center">Caricamento dipendente...</div>;

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; 

    // Messaggio Dispositivo
    const renderDeviceMessage = () => {
        const MAX_DEVICES = 2; 
        const currentDeviceIds = employeeData.deviceIds || [];
        const currentDeviceCount = currentDeviceIds.length;
        const isCurrentDeviceAuthorized = currentDeviceIds.includes(deviceId);
        const isLimitReached = currentDeviceCount >= MAX_DEVICES;

        if (currentDeviceCount === 0 || isCurrentDeviceAuthorized) {
            return (
                <div className={`p-4 mb-4 rounded-lg shadow-sm bg-blue-100 border-l-4 border-blue-500 text-blue-700 text-center`} role="alert"> 
                    <p className="font-bold">Stato Dispositivo: {currentDeviceCount} / {MAX_DEVICES} registrati</p>
                    {isLimitReached ? <p className="text-xs font-semibold mt-1">Limite raggiunto. Per reset contattare Admin.</p> : <p className="text-xs font-semibold mt-1">Dispositivo autorizzato.</p>}
                </div>
            );
        }
        if (isLimitReached && !isCurrentDeviceAuthorized) {
             return (
                 <div className={`p-4 mb-4 rounded-lg shadow-sm bg-red-100 border-l-4 border-red-500 text-red-700 text-center`} role="alert">
                     <p className="font-bold">❌ TIMBRATURA BLOCCATA</p>
                     <p className="text-sm font-semibold mt-1">Limite dispositivi raggiunto.</p>
                 </div>
             );
        }
        return null;
    }; 
    
    // Componente GPS/Area
    const GpsAreaStatusBlock = () => {
        if (employeeWorkAreas.length === 0) {
            if (isGpsRequired) return <div className="bg-white p-4 rounded-lg shadow-md mb-6"><p className="text-sm text-red-500 mt-2 text-center">❌ Controllo GPS richiesto ma nessuna area assegnata.</p></div>
            else return null; 
        }
        return (
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Stato Posizione</h2>
                {isGpsRequired ? (
                    <>
                        {locationError && <p className="text-sm text-red-500 mt-2 text-center">{locationError}</p>}
                        {!locationError && (
                            inRangeArea ? <p className="text-base text-green-600 font-semibold mt-2 text-center">✅ Area rilevata: <br/><strong>{inRangeArea.name}</strong></p> : <p className="text-base text-gray-500 font-semibold mt-2 text-center">❌ Nessuna area nelle vicinanze o GPS in attesa.</p>
                        )}
                    </>
                ) : (
                    <>
                        {employeeWorkAreas.length > 0 ? (
                            <p className="text-base text-blue-600 font-semibold mt-2 text-center">GPS non richiesto.</p>
                        ) : <p className="text-sm text-red-500 font-semibold mt-2 text-center">❌ Non sei assegnato a nessuna area.</p>}
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 max-w-lg mx-auto font-sans bg-gray-50 min-h-screen flex flex-col">
            <CompanyLogo />
            {renderDeviceMessage()}

            <div className="text-center my-4 p-4 bg-white rounded-lg shadow-sm">
                <p>Dipendente: <span className="font-semibold">{employeeData.name} {employeeData.surname}</span></p>
                <p className="text-4xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-lg text-gray-500">{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <GpsAreaStatusBlock />
            
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 preposto-center text-center">Azioni Rapide</h2>
                {activeEntry ? ( 
                    <div>
                        <p className="text-center text-green-600 font-semibold text-lg mb-4">Timbratura ATTIVA su: <span className="font-bold">{workAreaName}</span></p>
                        
                        <div className="grid grid-cols-3 gap-3">

                            {/* 1. PAUSA */}
                            <button
                                onClick={() => handleAction('clockPause')} 
                                disabled={isProcessing || pauseStatus !== 'NONE' || !deviceId || (employeeData.deviceIds?.length >= 2 && !employeeData.deviceIds?.includes(deviceId))} 
                                className={`w-full font-bold rounded-lg shadow-lg transition-colors py-4 text-white ${
                                    pauseStatus !== 'NONE' ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600' 
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <div className="text-2xl leading-none">🟡</div>
                                <span className="text-sm block mt-1">{pauseStatus === 'ACTIVE' ? 'PAUSA ATTIVA' : pauseStatus === 'COMPLETED' ? 'PAUSA EFFETTUATA' : 'TIMBRA PAUSA'}</span>
                            </button>

                            {/* 2. IN CORSO */}
                            <div className={`w-full font-bold rounded-lg shadow-lg text-white text-center py-4 ${isInPause ? 'bg-orange-600' : 'bg-green-600'}`}>
                                <div className="text-2xl leading-none">🟢</div>
                                <span className="text-sm block mt-1">{isInPause ? 'IN PAUSA' : 'IN CORSO'}</span>
                            </div>

                            {/* 3. USCITA */}
                            <button
                                onClick={() => handleAction('clockOut')}
                                disabled={isProcessing || (isGpsRequired && !inRangeArea) || !deviceId || (employeeData.deviceIds?.length >= 2 && !employeeData.deviceIds?.includes(deviceId))}
                                className={`w-full font-bold rounded-lg shadow-lg text-white transition-colors py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <div className="text-2xl leading-none">🔴</div>
                                <span className="text-sm block mt-1">TIMBRA USCITA</span>
                            </button>
                        </div>
                    </div>
                ) : ( 
                    <div>
                        <p className="text-center text-red-600 font-semibold text-lg">Timbratura NON ATTIVA</p>
                        {!isGpsRequired && (
                            <div className="mb-4">
                                <label htmlFor="manualArea" className="block text-sm font-medium text-gray-700 mb-1">Seleziona Area di Lavoro:</label>
                                <select id="manualArea" value={manualAreaId} onChange={(e) => setManualAreaId(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white">
                                    <option value="">-- Seleziona un'area --</option>
                                    {employeeWorkAreas.map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={() => handleAction('clockIn')}
                            disabled={
                                isProcessing || 
                                (isGpsRequired && !inRangeArea) || 
                                (!isGpsRequired && !manualAreaId) || 
                                (!isGpsRequired && employeeWorkAreas.length === 0 && manualAreaId === "") ||
                                (!deviceId) || 
                                (employeeData.deviceIds?.length >= 2 && !employeeData.deviceIds?.includes(deviceId))
                            }
                            className={`w-full mt-4 text-2xl font-bold py-6 px-4 rounded-lg shadow-lg text-white transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            🟢 TIMBRA ENTRATA
                        </button>
                    </div>
                )}
            </div>

            {/* === NUOVA SEZIONE: MODULI MS FORMS === */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                 <h2 className="text-xl font-bold mb-3 text-center">Modulistica</h2>
                 <p className="text-sm text-gray-500 mb-4 text-center">Accedi ai questionari se caposquadra per la tua area.</p>
                 <button 
                    onClick={handleOpenFormsModal}
                    className="w-full py-3 px-4 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                 >
                    📋 Moduli e Questionari
                 </button>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Timbrature di Oggi</h2>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {todaysEntries.length > 0 ? todaysEntries.map(entry => (
                        <div key={entry.id} className="text-sm border-b pb-1 last:border-b-0">
                            <p className="text-center">
                                <span className="font-medium">Entrata:</span> {entry.clockInTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}
                                <span className="ml-2 font-medium">Uscita:</span> {entry.clockOutTime ? entry.clockOutTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : '...'}
                            </p>
                        </div>
                    )) : <p className="text-sm text-gray-500 text-center">Nessuna timbratura trovata per oggi.</p>}
                </div>
            </div>

            {/* === BOX REPORT PDF === */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Report Mensile PDF</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Mese</label>
                        <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white">
                            {months.map((month, index) => (<option key={index} value={index}>{month}</option>))}
                        </select>
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-700">Anno</label>
                        <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white">
                            {years.map(year => (<option key={year} value={year}>{year}</option>))}
                        </select>
                    </div>
                </div>
                <button
                    onClick={handleExportPDF}
                    disabled={isGenerating}
                    className="w-full text-lg font-bold py-3 px-4 rounded-lg shadow-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGenerating ? 'Generazione...' : 'Scarica Report PDF'}
                </button>
            </div>

            <button onClick={handleLogout} className="w-full mt-auto px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">Logout</button>

            {/* === MODALE LISTA MODULI MS FORMS (Style Corretto con Portal e Stili Inline) === */}
            {showFormsModal && (
                <>
                    {/* Poiché React Portal potrebbe complicare lo stile se non c'è un nodo root, uso un approccio fixed diretto che copre tutto, identico agli altri modali */}
                    <div style={overlayStyle} onClick={() => setShowFormsModal(false)} />
                    <div style={containerStyle}>
                        <div style={modalStyle}>
                            {/* Header */}
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: '#f9fafb' }}>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>📋 Moduli e Questionari</h3>
                                <button onClick={() => setShowFormsModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#9ca3af', cursor: 'pointer', lineHeight: '1' }}>&times;</button>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '24px', overflowY: 'auto' }}>
                                {/* Selezione Area */}
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase' }}>Area di Lavoro:</label>
                                    {activeEntry ? (
                                        <div style={{ padding: '10px 12px', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#374151', fontWeight: '600' }}>
                                            📍 {allWorkAreas.find(a => a.id === activeEntry.workAreaId)?.name || 'Area Attuale'}
                                        </div>
                                    ) : (
                                        <select 
                                            value={selectedAreaForForms} 
                                            onChange={handleAreaChangeForForms}
                                            className={inputClasses}
                                        >
                                            <option value="">-- Seleziona Area --</option>
                                            {employeeWorkAreas.map(area => (
                                                <option key={area.id} value={area.id}>{area.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {/* Lista Link */}
                                {isLoadingForms ? (
                                    <p style={{ textAlign: 'center', color: '#6b7280' }}>Caricamento moduli...</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {availableForms.length > 0 ? (
                                            availableForms.map(form => (
                                                <a 
                                                    key={form.id} 
                                                    href={form.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    style={{ display: 'block', padding: '16px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', textDecoration: 'none', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', transition: 'background-color 0.2s' }}
                                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div>
                                                            <h4 style={{ margin: 0, fontWeight: 'bold', color: '#1f2937', fontSize: '15px' }}>{form.title}</h4>
                                                            {form.description && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>{form.description}</p>}
                                                        </div>
                                                        <span style={{ fontSize: '18px', color: '#4f46e5' }}>↗️</span>
                                                    </div>
                                                </a>
                                            ))
                                        ) : (
                                            selectedAreaForForms ? 
                                                <p style={{ textAlign: 'center', color: '#6b7280', fontStyle: 'italic', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>Nessun modulo disponibile per questa area.</p>
                                                : 
                                                <p style={{ textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>Seleziona un'area per vedere i moduli.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Footer */}
                            <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
                                <button 
                                    onClick={() => setShowFormsModal(false)}
                                    style={{ padding: '10px 20px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#374151', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                                >
                                    Chiudi
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default EmployeeDashboard;