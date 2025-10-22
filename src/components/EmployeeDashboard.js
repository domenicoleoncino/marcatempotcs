// File: src/js/components/EmployeeDashboard.js

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp, limit } from 'firebase/firestore'; // Aggiunto limit
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
    const [activeEntry, setActiveEntry] = useState(null); // Contiene { id, ..., workAreaId, pauses: [...] }
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState(''); // Nome area timbratura attiva
    const [isProcessing, setIsProcessing] = useState(false); // Blocca pulsanti durante azione
    const [locationError, setLocationError] = useState(null); // Errore GPS
    const [inRangeArea, setInRangeArea] = useState(null); // Area rilevata dal GPS

    // Stati per report PDF
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Funzioni Cloud Firebase
    const functions = getFunctions(undefined, 'europe-west1'); // Specifica regione
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee'); // <-- NUOVA per iniziare pausa auto
    const endEmployeePause = httpsCallable(functions, 'endEmployeePause'); // <-- NUOVA per terminare pausa


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

    // Logica GPS (watchPosition per aggiornamenti continui)
    useEffect(() => {
        if (activeEntry || employeeWorkAreas.length === 0) {
            setLocationError(null);
            setInRangeArea(null);
            return; // Non serve GPS se timbrato o senza aree
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
    }, [employeeWorkAreas, activeEntry]); // Ricalcola se cambiano aree o stato timbratura


    // Listener Firestore per timbratura attiva e timbrature odierne
    useEffect(() => {
        // Controlli robusti per evitare errori se i dati non sono pronti
        if (!user?.uid || !employeeData?.id || !Array.isArray(allWorkAreas)) {
             setActiveEntry(null);
             setTodaysEntries([]);
             setWorkAreaName('');
             console.log("Listener Firestore in attesa di user, employeeData o allWorkAreas.");
             return; // Esce se mancano dati fondamentali
        }
        console.log("Imposto listener Firestore per employeeId:", employeeData.id);

        // Listener timbratura attiva
        const qActive = query(collection(db, "time_entries"),
                              where("employeeId", "==", employeeData.id),
                              where("status", "==", "clocked-in"),
                              limit(1));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!snapshot.empty) {
                const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveEntry(entryData); // Imposta timbratura attiva
                const area = allWorkAreas.find(a => a.id === entryData.workAreaId);
                setWorkAreaName(area ? area.name : 'Sconosciuta'); // Imposta nome area
                console.log("Timbratura attiva aggiornata:", entryData);
            } else {
                setActiveEntry(null); // Nessuna timbratura attiva
                setWorkAreaName('');
                console.log("Nessuna timbratura attiva trovata.");
            }
        }, (error) => console.error("Errore listener timbratura attiva:", error));

        // Listener timbrature odierne
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"),
                              where("employeeId", "==", employeeData.id),
                              where("clockInTime", ">=", Timestamp.fromDate(startOfDay)),
                              orderBy("clockInTime", "desc"));
        const unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Errore listener timbrature odierne:", error));

        // Funzione di pulizia
        return () => {
             console.log("Pulizia listener Firestore per employeeId:", employeeData.id);
             unsubscribeActive();
             unsubscribeTodays();
        };
    }, [user?.uid, employeeData?.id, allWorkAreas]); // Dipende da UID, ID dipendente e aree


    // --- GESTIONE AZIONI TIMBRATURA/PAUSA ---
    const handleAction = async (action) => {
        if (isProcessing) return;
        setIsProcessing(true);
        setLocationError(null);

        try {
            let result;
            const currentActiveEntry = activeEntry; // Usa stato al momento del click

            if (action === 'clockIn') {
                if (!inRangeArea) throw new Error("Devi essere all'interno di un'area rilevata.");
                console.log(`Tentativo clockIn per area ${inRangeArea.id}`);
                result = await clockIn({ areaId: inRangeArea.id });

            } else if (action === 'clockOut') {
                if (!currentActiveEntry) throw new Error("Nessuna timbratura attiva da chiudere.");
                const isInPause = currentActiveEntry.pauses?.some(p => !p.end);
                if (isInPause) throw new Error("Termina la pausa prima di timbrare l'uscita.");
                console.log(`Tentativo clockOut per entry ${currentActiveEntry.id}`);
                result = await clockOut();

            } else if (action === 'clockPause') {
                if (!currentActiveEntry) throw new Error("Devi avere una timbratura attiva.");
                const isInPause = currentActiveEntry.pauses?.some(p => !p.end);

                if (isInPause) { // Se è in pausa -> TERMINA
                    console.log(`Tentativo termina pausa per entry ${currentActiveEntry.id}`);
                    result = await endEmployeePause(); // Chiama CF per terminare
                } else { // Se NON è in pausa -> INIZIA (automatica)
                    const currentArea = allWorkAreas.find(a => a.id === currentActiveEntry.workAreaId);
                    const pauseDuration = currentArea?.pauseDuration;

                    if (pauseDuration && pauseDuration > 0) {
                        console.log(`Tentativo applica pausa automatica di ${pauseDuration} min`);
                        result = await applyAutoPauseEmployee({ durationMinutes: pauseDuration }); // Chiama CF per applicare
                    } else {
                        alert(`Nessuna pausa predefinita (>0 min) per l'area "${currentArea?.name || 'sconosciuta'}".`);
                        // Non fa nulla, non chiama CF
                    }
                }
            } else {
                 throw new Error("Azione non riconosciuta.");
            }

            // Mostra messaggio solo se una CF è stata chiamata e ha risposto
            if (result?.data?.message) {
                 alert(result.data.message);
            }

        } catch (error) {
            console.error(`Errore durante ${action}:`, error);
            alert(`Errore: ${error.message || 'Si è verificato un problema.'}`);
        } finally {
            setIsProcessing(false);
        }
    };


    // Funzione generazione PDF (invariata)
    const generatePdfReport = async () => {
        setIsGeneratingPdf(true);
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

            const q = query(
                collection(db, "time_entries"),
                where("employeeId", "==", employeeData.id), // Usa employeeData.id
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

                // Calcola durata pause
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

                // Calcola ore lavorate solo se c'è uscita
                if (clockOut) {
                    const totalEntryMillis = clockOut.getTime() - clockIn.getTime();
                    workedMillis = totalEntryMillis - pauseDurationMillis;
                    if (workedMillis < 0) workedMillis = 0; // Evita ore negative
                    totalWorkedMillis += workedMillis; // Accumula per totale mensile
                }

                // Formatta ore lavorate HH:MM
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

            // Calcola e aggiungi totale ore mensili
            const totalHours = Math.floor(totalWorkedMillis / 3600000);
            const totalMinutes = Math.floor((totalWorkedMillis % 3600000) / 60000);
            const totalHoursString = `Totale Ore Lavorate nel Mese: ${totalHours.toString().padStart(2, '0')}:${totalMinutes.toString().padStart(2, '0')}`;

            // Aggiungi tabella e totale al PDF
            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 50,
                didDrawPage: (data) => {
                    // Aggiunge il totale alla fine dell'ultima pagina
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


    // Calcolo stato pausa (controlla se c'è una pausa SENZA end)
    const isInPause = activeEntry?.pauses?.some(p => p.start && !p.end);

    // Render iniziale se mancano dati dipendente
    if (!employeeData) return <div className="min-h-screen flex items-center justify-center">Caricamento dipendente...</div>;

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; // Anno corrente e precedente

    // Render del componente
    return (
        <div className="p-4 max-w-lg mx-auto font-sans bg-gray-50 min-h-screen flex flex-col">
            <CompanyLogo />
            {/* Box Orario e Info Dipendente */}
            <div className="text-center my-4">
                <p>Dipendente: <span className="font-semibold">{employeeData.name} {employeeData.surname}</span></p>
                <p className="text-3xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-sm text-gray-500">{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            {/* Box Stato Timbratura e Azioni */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Stato Timbratura</h2>
                {activeEntry ? ( // Se l'utente è timbrato
                    <div>
                        <p className="text-center text-green-600 font-semibold text-lg">Timbratura ATTIVA</p>
                        <p className="text-center text-sm">Area: <span className="font-medium">{workAreaName}</span></p>
                        <p className="text-center text-sm">Entrata: <span className="font-medium">{activeEntry.clockInTime?.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}</span></p>
                        {/* Mostra stato Pausa */}
                        {isInPause && <p className="text-center text-yellow-600 font-semibold mt-2">-- IN PAUSA --</p>}

                        {/* Pulsanti Azione */}
                        <div className={`grid ${isInPause ? 'grid-cols-1' : 'grid-cols-2'} gap-4 mt-4`}>
                            {/* Pulsante Pausa: cambia testo e azione in base allo stato */}
                            <button
                                onClick={() => handleAction('clockPause')}
                                disabled={isProcessing}
                                className={`w-full text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white ${
                                    isInPause
                                    ? 'bg-green-500 hover:bg-green-600' // Verde per Terminare
                                    : 'bg-yellow-500 hover:bg-yellow-600' // Giallo per Iniziare (automatica)
                                } disabled:bg-gray-400`}
                            >
                                {isInPause ? 'TERMINA PAUSA' : 'INIZIA PAUSA'}
                            </button>

                            {/* Pulsante Uscita: mostrato solo se NON in pausa */}
                            {!isInPause && (
                                <button
                                    onClick={() => handleAction('clockOut')}
                                    disabled={isProcessing}
                                    className="w-full text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400"
                                >
                                    TIMBRA USCITA
                                </button>
                            )}
                        </div>
                    </div>
                ) : ( // Se l'utente NON è timbrato
                    <div>
                        <p className="text-center text-red-600 font-semibold text-lg">Timbratura NON ATTIVA</p>
                        {/* Messaggio errore GPS o stato area */}
                        {locationError && <p className="text-xs text-red-500 mt-2 text-center">{locationError}</p>}
                        {!locationError && (
                            inRangeArea ? (
                                <p className="text-sm text-green-600 mt-2 text-center">Area di lavoro rilevata: <strong>{inRangeArea.name}</strong></p>
                            ) : (
                                <p className="text-sm text-gray-500 mt-2 text-center">Nessuna area di lavoro nelle vicinanze o GPS non attivo. Avvicinati a un cantiere per timbrare.</p>
                            )
                        )}
                        {/* Pulsante Entrata */}
                        <button
                            onClick={() => handleAction('clockIn')}
                            disabled={isProcessing || !inRangeArea} // Disabilitato se fuori area o processando
                            className="w-full mt-4 text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                        >
                            TIMBRA ENTRATA
                        </button>
                    </div>
                )}
            </div>

            {/* Box Cronologia Odierna */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3">Timbrature di Oggi</h2>
                <div className="space-y-2 max-h-40 overflow-y-auto"> {/* Scroll se contenuto eccede */}
                    {todaysEntries.length > 0 ? todaysEntries.map(entry => (
                        <div key={entry.id} className="text-sm border-b pb-1 last:border-b-0">
                            <p>
                                <span className="font-medium">Entrata:</span> {entry.clockInTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}
                                <span className="ml-2 font-medium">Uscita:</span> {entry.clockOutTime ? entry.clockOutTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : '...'}
                            </p>
                            {/* Mostra dettagli pause */}
                            {entry.pauses && entry.pauses.length > 0 && (
                                <ul className="text-xs text-gray-500 pl-4 list-disc">
                                    {entry.pauses.map((p, index) => (
                                        <li key={index}>
                                            Pausa {index + 1}: {p.start.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })} - {p.end ? p.end.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : 'in corso'}
                                            {/* Mostra durata se automatica */}
                                            {p.isAutomatic && p.durationMinutes && ` (${p.durationMinutes} min)`}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )) : <p className="text-sm text-gray-500">Nessuna timbratura trovata per oggi.</p>}
                </div>
            </div>

            {/* Box Report Mensile PDF */}
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
                    className="w-full text-lg font-bold py-3 px-4 rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
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