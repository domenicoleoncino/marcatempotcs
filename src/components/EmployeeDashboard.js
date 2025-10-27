import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null);

    // Stati per report PDF
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Funzioni Cloud Firebase
    const functions = getFunctions(undefined, 'europe-west1');
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee');
    const endEmployeePause = httpsCallable(functions, 'endEmployeePause');


    // Aggiorna ora corrente
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
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
        // Se l'utente è timbrato, O non ha aree, O non richiede il GPS, ALLORA non avviare il GPS.
        if (activeEntry || employeeWorkAreas.length === 0 || !isGpsRequired) {
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


    // Listener Firestore per timbratura attiva e timbrature (FILTRO AGGIUSTATO: user.uid)
    useEffect(() => {
        // Controlla che l'UID sia disponibile per il filtro di sicurezza Firestore
        if (!user?.uid || !employeeData?.id || !Array.isArray(allWorkAreas)) {
             setActiveEntry(null);
             setTodaysEntries([]);
             setWorkAreaName('');
             return;
        }

        // Listener timbratura attiva
        // USA user.uid per matchare le regole di Firestore su time_entries
        const qActive = query(collection(db, "time_entries"),
                               where("employeeId", "==", user.uid), // <--- CORREZIONE QUI
                               where("status", "==", "clocked-in"),
                               limit(1));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!snapshot.empty) {
                const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveEntry(entryData);
                const area = allWorkAreas.find(a => a.id === entryData.workAreaId);
                setWorkAreaName(area ? area.name : 'Sconosciuta');
            } else {
                setActiveEntry(null);
                setWorkAreaName('');
            }
        }, (error) => console.error("Errore listener timbratura attiva:", error));

        // Listener timbrature odierne
        // USA user.uid per matchare le regole di Firestore su time_entries
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"),
                               where("employeeId", "==", user.uid), // <--- CORREZIONE QUI
                               where("clockInTime", ">=", Timestamp.fromDate(startOfDay)),
                               orderBy("clockInTime", "desc"));
        const unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Errore listener timbratura attiva:", error));

        // Funzione di pulizia
        return () => {
             unsubscribeActive();
             unsubscribeTodays();
        };
    }, [user?.uid, employeeData?.id, allWorkAreas]);


    // --- GESTIONE AZIONI TIMBRATURA/PAUSA (FIX SINCRONIZZAZIONE INCLUSO) ---
    const handleAction = async (action) => {
        if (isProcessing) return;
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
                
                // **********************************************
                // FIX: AGGIORNAMENTO OTTIMISTICO DELLO STATO
                // **********************************************
                if (result.data.success) {
                    // Imposta immediatamente lo stato attivo con l'area e un Timestamp fittizio (l'ora corrente)
                    // Questo risolve la transizione immediata dei pulsanti Pausa/Uscita
                    setActiveEntry({
                        id: 'pending_' + Date.now(), // ID temporaneo, verrà sovrascritto dal listener
                        workAreaId: areaIdToClockIn,
                        clockInTime: Timestamp.now(), 
                        pauses: [],
                        status: 'clocked-in'
                    });
                    const area = allWorkAreas.find(a => a.id === areaIdToClockIn);
                    setWorkAreaName(area ? area.name : 'Sconosciuta');

                } else if (result.data.message) {
                     alert(result.data.message);
                }
                // **********************************************
                
            } else if (action === 'clockOut') {
                if (!currentActiveEntry) throw new Error("Nessuna timbratura attiva da chiudere.");
                const isInPause = currentActiveEntry.pauses?.some(p => !p.end);
                if (isInPause) throw new Error("Termina la pausa prima di timbrare l'uscita.");
                result = await clockOut();

            } else if (action === 'clockPause') {
                if (!currentActiveEntry) throw new Error("Devi avere una timbratura attiva.");
                const isInPause = currentActiveEntry.pauses?.some(p => !p.end);

                if (isInPause) {
                    result = await endEmployeePause();
                } else {
                    const currentArea = allWorkAreas.find(a => a.id === currentActiveEntry.workAreaId);
                    const pauseDuration = currentArea?.pauseDuration;

                    if (pauseDuration && pauseDuration > 0) {
                        result = await applyAutoPauseEmployee({ durationMinutes: pauseDuration });
                    } else {
                        alert(`Nessuna pausa predefinita (>0 min) per l'area "${currentArea?.name || 'sconosciuta'}".`);
                    }
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


    // Funzione generazione PDF (omessa per brevità, invariata)
    const generatePdfReport = async () => {
        setIsGeneratingPdf(true);
        // Logica di generazione PDF (omessa per brevità)
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

            // Per il report completo (non per il listener) si usa employeeData.id
            const q = query(
                collection(db, "time_entries"),
                where("employeeId", "==", employeeData.id), 
                where("clockInTime", ">=", Timestamp.fromDate(startDate)),
                where("clockInTime", "<=", Timestamp.fromDate(endDate)),
                orderBy("clockInTime", "asc")
            );

            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                alert("Nessuna timbratura trovata per il periodo selezionato.");
                setIsGeneratingPdf(false);
                return;
            }

            // ... (logica generazione PDF completa) ...
            const doc = new jsPDF();
            const monthName = startDate.toLocaleString('it-IT', { month: 'long' });

            doc.setFontSize(18);
            doc.text(`Report Mensile Timbrature`, 14, 22);
            doc.setFontSize(11);
            doc.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 14, 30);
            doc.text(`Periodo: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`, 14, 36);

            const tableColumn = ["Data", "Area", "Entrata", "Uscita", "Ore Lavorate", "Note Pause"];
            const tableRows = [];
            let totalWorkedMillis = 0;

            querySnapshot.forEach(entryDoc => {
                const data = entryDoc.data();
                const clockIn = data.clockInTime.toDate();
                const clockOut = data.clockOutTime ? data.clockOutTime.toDate() : null;
                const area = allWorkAreas.find(a => a.id === data.workAreaId);

                let workedMillis = 0;
                let pauseNotes = "";
                let pauseDurationMillis = 0;

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
                }

                if (clockOut) {
                    const totalEntryMillis = clockOut.getTime() - clockIn.getTime();
                    workedMillis = totalEntryMillis - pauseDurationMillis;
                    if (workedMillis < 0) workedMillis = 0;
                    totalWorkedMillis += workedMillis;
                }

                const hours = Math.floor(workedMillis / 3600000);
                const minutes = Math.floor((workedMillis % 3600000) / 60000);
                const totalHoursFormatted = clockOut ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}` : "N/A";

                const entryData = [
                    clockIn.toLocaleDateString('it-IT'),
                    area ? area.name : 'Sconosciuta',
                    clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : "In corso",
                    totalHoursFormatted,
                    pauseNotes
                ];
                tableRows.push(entryData);
            });

            const totalHours = Math.floor(totalWorkedMillis / 3600000);
            const totalMinutes = Math.floor((totalWorkedMillis % 3600000) / 60000);
            const totalHoursString = `Totale Ore Lavorate nel Mese: ${totalHours.toString().padStart(2, '0')}:${totalMinutes.toString().padStart(2, '0')}`;

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 50,
                didDrawPage: (data) => {
                    if (data.pageNumber === doc.internal.getNumberOfPages()) {
                        doc.setFontSize(10);
                        doc.text(totalHoursString, 14, data.cursor.y + 10);
                    }
                }
            });

            doc.save(`report_${employeeData.surname}_${selectedMonth + 1}_${selectedYear}.pdf`);

        } catch (error) {
            console.error("Errore durante la generazione del PDF:", error);
            alert("Si è verificato un errore durante la generazione del report.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };
    // Fine funzione generazione PDF


    // Calcolo stato pausa (controlla se c'è una pausa SENZA end)
    const isInPause = activeEntry?.pauses?.some(p => p.start && !p.end);

    // Render iniziale se mancano dati dipendente
    if (!employeeData) return <div className="min-h-screen flex items-center justify-center">Caricamento dipendente...</div>;

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; // Anno corrente e precedente

    // --- Componente di stato GPS/Area (INVARIATO) ---
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
            
            {/* Box Cronologia Odierna (INVARIATO) */}
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

            {/* Box Report Mensile PDF (INVARIATO) */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3">Report Mensile PDF</h2>
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
                    onClick={generatePdfReport}
                    disabled={isGeneratingPdf}
                    className="w-full text-lg font-bold py-3 px-4 rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGeneratingPdf ? 'Generazione in corso...' : 'Scarica Report PDF'}
                </button>
            </div>

            {/* Pulsante Logout in fondo */}
            <button onClick={handleLogout} className="w-full mt-auto px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">Logout</button>
        </div>
    );
};

export default EmployeeDashboard;