import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ... (La funzione getDistanceInMeters rimane invariata)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaL = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}


const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    // ... (Tutti gli stati che avevamo prima rimangono invariati)
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null);

    // NUOVI STATI PER LA SELEZIONE DEL REPORT
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // ... (Le funzioni Firebase e la logica GPS/timbratura rimangono invariate)
    const functions = getFunctions();
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const clockPause = httpsCallable(functions, 'clockEmployeePause');

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    useEffect(() => {
        if (activeEntry || employeeWorkAreas.length === 0) {
            setLocationError(null);
            return;
        }
        if (!navigator.geolocation) {
            setLocationError("La geolocalizzazione non è supportata da questo browser.");
            return;
        }
        const getLocation = () => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
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
                },
                () => {
                    setLocationError("Impossibile recuperare la posizione. Controlla i permessi e il segnale GPS.");
                    setInRangeArea(null);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        };
        getLocation();
        const intervalId = setInterval(getLocation, 7000);
        return () => clearInterval(intervalId);
    }, [employeeWorkAreas, activeEntry]);
    
    useEffect(() => {
        if (!user || !Array.isArray(allWorkAreas) || allWorkAreas.length === 0) return;
        const qActive = query(collection(db, "time_entries"), where("employeeId", "==", user.uid), where("status", "==", "clocked-in"));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!snapshot.empty) {
                const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveEntry(entryData);
                const area = allWorkAreas.find(a => a.id === entryData.workAreaId);
                if (area) setWorkAreaName(area.name);
            } else {
                setActiveEntry(null);
                setWorkAreaName('');
            }
        });
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"), where("employeeId", "==", user.uid), where("clockInTime", ">=", startOfDay), orderBy("clockInTime", "desc"));
        const unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => { unsubscribeActive(); unsubscribeTodays(); };
    }, [user, allWorkAreas]);
    
    const handleAction = async (action) => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            let result;
            if (action === 'clockIn') {
                if (!inRangeArea) throw new Error("Devi essere all'interno di un'area di lavoro per timbrare.");
                result = await clockIn({ areaId: inRangeArea.id });
            } else if (action === 'clockOut') {
                result = await clockOut();
            } else if (action === 'clockPause') {
                result = await clockPause();
            }
            alert(result.data.message);
        } catch (error) {
            alert(`Errore: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    // ===================================================================
    // ## NUOVA FUNZIONE PER GENERARE IL PDF ##
    // ===================================================================
    const generatePdfReport = async () => {
        setIsGeneratingPdf(true);
        try {
            // Calcola data di inizio e fine del mese selezionato
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

            // Query a Firestore per le timbrature del mese
            const q = query(
                collection(db, "time_entries"),
                where("employeeId", "==", user.uid),
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
            
            // Titolo del PDF
            doc.setFontSize(18);
            doc.text(`Report Mensile Timbrature`, 14, 22);
            doc.setFontSize(11);
            doc.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 14, 30);
            doc.text(`Periodo: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`, 14, 36);

            const tableColumn = ["Data", "Entrata", "Uscita", "Ore Lavorate"];
            const tableRows = [];

            // Prepara i dati per la tabella
            querySnapshot.forEach(entryDoc => {
                const data = entryDoc.data();
                const clockIn = data.clockInTime.toDate();
                const clockOut = data.clockOutTime ? data.clockOutTime.toDate() : null;

                let totalHours = "N/A";
                if (clockOut) {
                    const diffMs = clockOut - clockIn;
                    const hours = Math.floor(diffMs / 3600000);
                    const minutes = Math.floor((diffMs % 3600000) / 60000);
                    totalHours = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                }

                const entryData = [
                    clockIn.toLocaleDateString('it-IT'),
                    clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : "In corso",
                    totalHours,
                ];
                tableRows.push(entryData);
            });

            // Crea la tabella nel PDF
            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 50,
            });

            // Salva il file
            doc.save(`report_${employeeData.surname}_${selectedMonth + 1}_${selectedYear}.pdf`);

        } catch (error) {
            console.error("Errore durante la generazione del PDF:", error);
            alert("Si è verificato un errore durante la generazione del report.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };


    const hasPauseBeenTaken = activeEntry?.pauses && activeEntry.pauses.length > 0;
    if (!employeeData) return <div className="min-h-screen flex items-center justify-center">Caricamento dipendente...</div>;

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

    return (
        <div className="p-4 max-w-lg mx-auto font-sans">
            {/* ... (La parte superiore con il logo e lo stato timbratura rimane invariata) ... */}
            <CompanyLogo />
            <div className="text-center my-4">
                <p>Dipendente: {employeeData.name} {employeeData.surname}</p>
                <p className="text-3xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-sm text-gray-500">{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-2">Stato Timbratura</h2>
                {/* ... (Logica visualizzazione timbratura attiva/non attiva) ... */}
                 {activeEntry ? (
                    <div>
                        <p className="text-green-600 font-semibold">Timbratura ATTIVA</p>
                        <p>Area: {workAreaName}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            {!hasPauseBeenTaken && (
                                <button onClick={() => handleAction('clockPause')} disabled={isProcessing} className="w-full text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400">
                                    TIMBRA PAUSA
                                </button>
                            )}
                            <button onClick={() => handleAction('clockOut')} disabled={isProcessing} className="w-full text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400">
                                TIMBRA USCITA
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-red-600 font-semibold">Timbratura NON ATTIVA</p>
                        {locationError && <p className="text-xs text-red-500 mt-2">{locationError}</p>}
                        
                        {inRangeArea ? (
                            <p className="text-sm text-green-600 mt-2">Area di lavoro rilevata: <strong>{inRangeArea.name}</strong></p>
                        ) : (
                            <p className="text-sm text-gray-500 mt-2">Nessuna area di lavoro nelle vicinanze. Avvicinati a un cantiere per timbrare.</p>
                        )}
                        
                        <button 
                            onClick={() => handleAction('clockIn')} 
                            disabled={isProcessing || !inRangeArea} 
                            className="w-full mt-4 text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                        >
                            TIMBRA ENTRATA
                        </button>
                    </div>
                )}
            </div>
            <div className="mt-6">
                <h2 className="text-xl font-bold mb-2">Cronologia Timbrature di Oggi</h2>
                {/* ... (Visualizzazione timbrature di oggi) ... */}
                <div className="bg-white p-4 rounded-lg shadow-md space-y-2">
                    {todaysEntries.length > 0 ? todaysEntries.map(entry => (
                        <div key={entry.id} className="text-sm border-b pb-1">
                            <p>
                                <strong>Entrata:</strong> {entry.clockInTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })} - 
                                <strong> Uscita:</strong> {entry.clockOutTime ? entry.clockOutTime.toDate().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : 'In corso'}
                            </p>
                            {entry.pauses && entry.pauses.length > 0 && (
                                <p className="text-xs text-gray-500 pl-2">
                                    {entry.pauses.length} pausa/e registrata/e.
                                </p>
                            )}
                        </div>
                    )) : <p className="text-sm text-gray-500">Nessuna timbratura trovata per oggi.</p>}
                </div>
            </div>

            {/* =================================================================== */}
            {/* ## NUOVA SEZIONE PER I REPORT PDF ## */}
            {/* =================================================================== */}
            <div className="mt-6">
                <h2 className="text-xl font-bold mb-2">Report Mensile</h2>
                <div className="bg-white p-4 rounded-lg shadow-md">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label htmlFor="month-select" className="block text-sm font-medium text-gray-700">Mese</label>
                            <select
                                id="month-select"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                            >
                                {months.map((month, index) => (
                                    <option key={index} value={index}>{month}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                             <label htmlFor="year-select" className="block text-sm font-medium text-gray-700">Anno</label>
                            <select
                                id="year-select"
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                            >
                                {years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                     <button
                        onClick={generatePdfReport}
                        disabled={isGeneratingPdf}
                        className="w-full text-lg font-bold py-3 px-4 rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                    >
                        {isGeneratingPdf ? 'Generazione in corso...' : 'Scarica Report PDF'}
                    </button>
                </div>
            </div>

            <button onClick={handleLogout} className="w-full mt-6 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">Logout</button>
        </div>
    );
};

export default EmployeeDashboard;
