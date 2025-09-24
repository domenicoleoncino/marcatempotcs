import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { 
    collection, query, where, orderBy, getDocs, addDoc, updateDoc, doc, 
    arrayUnion, Timestamp, writeBatch
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CompanyLogo from './CompanyLogo';

// Funzione per arrotondare l'orario per DIFETTO al multiplo di 10 minuti
const roundTimeDownTo10Minutes = (date) => {
  const roundedDate = new Date(date.getTime());
  const minutes = roundedDate.getMinutes();
  const remainder = minutes % 10;
  roundedDate.setMinutes(minutes - remainder);
  roundedDate.setSeconds(0);
  roundedDate.setMilliseconds(0);
  return roundedDate;
};

// Funzione per arrotondare l'orario per ECCESSO al multiplo di 10 minuti
const roundTimeUpTo10Minutes = (date) => {
  const roundedDate = new Date(date.getTime());
  const minutes = roundedDate.getMinutes();
  const seconds = roundedDate.getSeconds();
  const milliseconds = roundedDate.getMilliseconds();
  if (minutes % 10 === 0 && seconds === 0 && milliseconds === 0) {
    return roundedDate;
  }
  const remainder = minutes % 10;
  const minutesToAdd = 10 - remainder;
  roundedDate.setMinutes(roundedDate.getMinutes() + minutesToAdd);
  roundedDate.setSeconds(0);
  roundedDate.setMilliseconds(0);
  return roundedDate;
};

// Funzione per calcolare la distanza tra due punti geografici (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in metres
};

// Funzione per ottenere (o creare) un ID unico per il dispositivo
const getDeviceId = () => {
    let deviceId = localStorage.getItem('marcatempotcs_deviceId');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('marcatempotcs_deviceId', deviceId);
    }
    return deviceId;
};

const EmployeeDashboard = ({ user, handleLogout }) => {
    const [employeeData, setEmployeeData] = useState(null);
    const [allTimestamps, setAllTimestamps] = useState([]);
    const [filteredTimestamps, setFilteredTimestamps] = useState([]);
    const [activeEntry, setActiveEntry] = useState(null);
    const [workAreas, setWorkAreas] = useState([]);
    const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isDeviceOk, setIsDeviceOk] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    
    const [selectedMonth, setSelectedMonth] = useState('');
    const [availableMonths, setAvailableMonths] = useState([]);
    const [configPausa, setConfigPausa] = useState(null);
    const [pausaRegistrata, setPausaRegistrata] = useState(false);
    const isOnBreak = activeEntry?.pauses?.some(p => !p.end) || false;

    const fetchEmployeeData = useCallback(async () => {
        if (!user) { setIsLoading(false); return; }
        
        try {
            // 1. Trova il profilo del dipendente
            const qEmployee = query(collection(db, "employees"), where("userId", "==", user.uid));
            const employeeSnapshot = await getDocs(qEmployee);

            if (employeeSnapshot.empty) {
                setEmployeeData(null);
                setIsLoading(false);
                return;
            }
            const data = { id: employeeSnapshot.docs[0].id, ...employeeSnapshot.docs[0].data() };
            setEmployeeData(data);

            // 2. Controllo dispositivo
            const deviceId = getDeviceId();
            const deviceIds = data.deviceIds || [];
            if (deviceIds.includes(deviceId)) {
                setIsDeviceOk(true);
            } else if (deviceIds.length < 2) {
                setIsDeviceOk(true);
                setStatusMessage({ type: 'info', text: 'Questo nuovo dispositivo verrà registrato.' });
            } else {
                setIsDeviceOk(false);
                setStatusMessage({ type: 'error', text: "Limite dispositivi raggiunto." });
            }

            // 3. Carica TUTTE le aree di lavoro (la regola `read: if request.auth != null` lo permette)
            const allAreasSnapshot = await getDocs(collection(db, "work_areas"));
            const allAreas = allAreasSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

            // 4. Filtra le aree assegnate al dipendente
            const assignedAreaIds = data.workAreaIds || [];
            const assignedAreas = allAreas.filter(area => assignedAreaIds.includes(area.id));
            setWorkAreas(assignedAreas);

            // 5. Cerca la timbratura attiva
            const qActiveEntry = query(collection(db, "time_entries"), where("employeeId", "==", data.id), where("status", "==", "clocked-in"));
            const activeEntrySnapshot = await getDocs(qActiveEntry);
            const activeEntryData = activeEntrySnapshot.empty ? null : { id: activeEntrySnapshot.docs[0].id, ...activeEntrySnapshot.docs[0].data() };
            setActiveEntry(activeEntryData);
            
            // 6. Imposta la configurazione della pausa
            if (activeEntryData) {
                const currentArea = assignedAreas.find(area => area.id === activeEntryData.workAreaId);
                setConfigPausa(currentArea?.pauseDuration?.toString() || '0');
                const hasFixedPause = activeEntryData.pauses?.some(p => p.isFixed === true);
                setPausaRegistrata(hasFixedPause);
            } else {
                setConfigPausa(null);
                setPausaRegistrata(false);
            }
            
            // 7. Carica le timbrature passate
            const qPastEntries = query(collection(db, "time_entries"), where("employeeId", "==", data.id), where("status", "==", "clocked-out"), orderBy("clockInTime", "desc"));
            const pastEntriesSnapshot = await getDocs(qPastEntries);
            const pastEntries = pastEntriesSnapshot.docs.map(docSnap => {
                const entryData = docSnap.data();
                const area = allAreas.find(wa => wa.id === entryData.workAreaId); // Usa la lista completa per trovare il nome
                const clockInTime = entryData.clockInTime?.toDate();
                const clockOutTime = entryData.clockOutTime?.toDate();
                let duration = 0;
                if (clockInTime && clockOutTime) {
                    const totalDurationMs = clockOutTime.getTime() - clockInTime.getTime();
                    const pauseDurationMs = (entryData.pauses || []).reduce((acc, p) => {
                        if (p.start && p.end) return acc + (p.end.toDate().getTime() - p.start.toDate().getTime());
                        return acc;
                    }, 0);
                    duration = (totalDurationMs - pauseDurationMs) / (1000 * 60 * 60);
                }
                return {
                    id: docSnap.id,
                    areaName: area ? area.name : 'N/D',
                    clockIn: clockInTime ? clockInTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
                    clockOut: clockOutTime ? clockOutTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
                    date: clockInTime ? clockInTime.toLocaleDateString('it-IT') : 'N/A',
                    duration: duration > 0 ? duration.toFixed(2) : '0.00'
                };
            });
            setAllTimestamps(pastEntries);
            
        } catch (error) {
            console.error("Errore nel recupero dati dipendente:", error);
            setStatusMessage({ type: 'error', text: 'Errore nel caricamento dei dati.' });
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        setIsLoading(true);
        fetchEmployeeData();
    }, [fetchEmployeeData]);
    
    useEffect(() => {
        if (allTimestamps.length > 0) {
            const months = [...new Set(allTimestamps.map(entry => {
                const dateParts = entry.date.split('/');
                const date = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
                return date.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
            }))];
            setAvailableMonths(months);
            const currentMonthStr = new Date().toLocaleString('it-IT', { month: 'long', year: 'numeric' });
            setSelectedMonth(months.includes(currentMonthStr) ? currentMonthStr : months[0] || '');
        }
    }, [allTimestamps]);

    useEffect(() => {
        if (selectedMonth) {
            const filtered = allTimestamps.filter(entry => {
                const dateParts = entry.date.split('/');
                const entryMonthStr = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`).toLocaleString('it-IT', { month: 'long', year: 'numeric' });
                return entryMonthStr === selectedMonth;
            });
            setFilteredTimestamps(filtered);
        } else {
            setFilteredTimestamps([]);
        }
    }, [selectedMonth, allTimestamps]);

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    const handleDownloadPdf = () => {
        if (!employeeData || filteredTimestamps.length === 0) {
            alert("Nessun dato da esportare per il mese selezionato.");
            return;
        }

        try {
            const doc = new jsPDF();
            doc.setFontSize(18);
            doc.text(`Report Mensile - ${selectedMonth}`, 14, 22);
            doc.setFontSize(11);
            doc.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 14, 30);
            
            const tableColumn = ["Data", "Area", "Entrata", "Uscita", "Ore"];
            const tableRows = [];
            let totalHours = 0;
            
            filteredTimestamps.forEach(entry => {
                const entryData = [
                    entry.date || 'N/D', 
                    entry.areaName || 'N/D', 
                    entry.clockIn || 'N/A', 
                    entry.clockOut || 'N/A', 
                    entry.duration || '0.00'
                ];
                tableRows.push(entryData);
                totalHours += parseFloat(entry.duration) || 0;
            });
            
            autoTable(doc, { 
                head: [tableColumn], 
                body: tableRows, 
                startY: 35 
            });
            
            const finalY = doc.lastAutoTable.finalY;
            doc.setFontSize(12);
            doc.text(`Totale Ore Lavorate: ${totalHours.toFixed(2)}`, 14, finalY + 10);
            
            const fileName = `Report_${selectedMonth.replace(/ /g, '_')}_${employeeData.surname}.pdf`;
            doc.save(fileName);

        } catch (error) {
            console.error("Errore durante la creazione del PDF:", error);
            alert("Si è verificato un errore durante la creazione del PDF. Controlla la console del browser per i dettagli.");
        }
    };

    const handleClockIn = async (areaId) => {
        if (!isDeviceOk) return;
        setStatusMessage({ type: 'info', text: 'Rilevamento posizione in corso...' });
        let currentLocation;
        try {
            currentLocation = await getCurrentLocation();
        } catch(err) {
            setStatusMessage({ type: 'error', text: err });
            return;
        }

        const selectedArea = workAreas.find(area => area.id === areaId);
        if (!selectedArea) {
            setStatusMessage({ type: 'error', text: "Area di lavoro non trovata." });
            return;
        }

        const distance = calculateDistance(currentLocation.latitude, currentLocation.longitude, selectedArea.latitude, selectedArea.longitude);

        if (distance <= selectedArea.radius) {
            try {
                const deviceId = getDeviceId();
                const deviceIds = employeeData.deviceIds || [];
                
                if (!deviceIds.includes(deviceId)) {
                    const employeeRef = doc(db, "employees", employeeData.id);
                    await updateDoc(employeeRef, { deviceIds: arrayUnion(deviceId) });
                }
                
                const clockInTimeRounded = roundTimeUpTo10Minutes(new Date());

                await addDoc(collection(db, "time_entries"), { 
                    employeeId: employeeData.id, 
                    workAreaId: areaId, 
                    clockInTime: clockInTimeRounded,
                    clockOutTime: null, 
                    status: 'clocked-in', 
                    pauses: [] 
                });

                setStatusMessage({ type: 'success', text: 'Timbratura di entrata registrata!' });
                fetchEmployeeData();
            } catch (error) {
                console.error("Errore durante la timbratura di entrata:", error);
                setStatusMessage({ type: 'error', text: "Errore durante la timbratura di entrata." });
            }
        } else {
            setStatusMessage({ type: 'error', text: `Non sei in un'area di lavoro autorizzata. Distanza: ${distance.toFixed(0)}m (Max: ${selectedArea.radius}m)` });
        }
    };

    const handleClockOut = async () => {
        if (!isDeviceOk || !activeEntry) return;
        try {
            const batch = writeBatch(db);
            const entryRef = doc(db, "time_entries", activeEntry.id);

            if (isOnBreak) {
                const currentPauses = activeEntry.pauses || [];
                const openPauseIndex = currentPauses.findIndex(p => !p.end);
                if (openPauseIndex > -1) {
                    currentPauses[openPauseIndex].end = Timestamp.now();
                    batch.update(entryRef, { pauses: currentPauses });
                }
            }
            
            const clockOutTimeRounded = roundTimeDownTo10Minutes(new Date());

            batch.update(entryRef, { 
                clockOutTime: clockOutTimeRounded, 
                status: 'clocked-out' 
            });
            await batch.commit();
            setStatusMessage({ type: 'success', text: 'Timbratura di uscita registrata!' });
            fetchEmployeeData();
        } catch (error) {
            console.error("Errore durante la timbratura di uscita:", error);
            setStatusMessage({ type: 'error', text: "Errore durante la timbratura di uscita." });
        }
    };

    const registraPausaFissa = async () => {
        if (!isDeviceOk || !activeEntry || !configPausa || pausaRegistrata) return;

        const durataMinuti = parseInt(configPausa, 10);
        if (durataMinuti === 0) return;

        setStatusMessage({ type: 'info', text: 'Registrazione della pausa in corso...' });

        try {
            const oraInizio = Timestamp.now();
            const oraFine = Timestamp.fromMillis(oraInizio.toMillis() + durataMinuti * 60000);

            const pausaDaAggiungere = {
                start: oraInizio,
                end: oraFine,
                isFixed: true, 
                duration: durataMinuti
            };

            const entryRef = doc(db, "time_entries", activeEntry.id);
            await updateDoc(entryRef, {
                pauses: arrayUnion(pausaDaAggiungere)
            });
            
            setStatusMessage({ type: 'success', text: `Pausa di ${durataMinuti} minuti registrata!` });
            await fetchEmployeeData();
        } catch (error) {
            console.error("Errore nella registrazione della pausa fissa:", error);
            setStatusMessage({ type: 'error', text: "Si è verificato un errore durante la registrazione della pausa." });
        }
    };
    
    if (isLoading) { return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Caricamento dati dipendente...</p></div>; }
    if (!employeeData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
                <CompanyLogo />
                <p className="mt-8 text-xl text-red-600 text-center">Errore: Dati dipendente non trovati o non autorizzato.</p>
                <button onClick={handleLogout} className="mt-4 px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
            </div>
        );
    }

    const formattedDate = currentTime.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = currentTime.toLocaleTimeString('it-IT');

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4">
            <header className="bg-white shadow-md rounded-lg p-4 mb-6 w-full max-w-md flex flex-col items-center">
                <CompanyLogo />
                <div className="text-center mt-4">
                    <p className="text-gray-600 text-sm break-all">Dipendente: {employeeData.name} {employeeData.surname} <button onClick={handleLogout} className="text-blue-500 hover:underline ml-2 text-sm">Logout</button></p>
                    <p className="text-gray-800 text-lg font-semibold mt-2">{formattedTime}</p>
                    <p className="text-gray-500 text-sm">{formattedDate}</p>
                </div>
            </header>

            <main className="bg-white shadow-md rounded-lg p-6 w-full max-w-md mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Stato Timbratura</h2>
                {statusMessage.text && <p className={`${statusMessage.type === 'error' ? 'text-red-500' : statusMessage.type === 'info' ? 'text-blue-500' : 'text-green-500'} text-sm mb-4 text-center`}>{statusMessage.text}</p>}
                
                <div className="text-center mb-4">
                    {activeEntry ? (
                        <>
                            <p className={`text-xl font-bold ${isOnBreak ? 'text-yellow-600' : 'text-green-600'}`}>{isOnBreak ? 'IN PAUSA' : 'Timbratura ATTIVA'}</p>
                            <p className="text-gray-700 mt-2">Area: {workAreas.find(area => area.id === activeEntry.workAreaId)?.name || 'Sconosciuta'}</p>
                            <div className="mt-4 flex flex-col gap-3">
                                
                                {configPausa && configPausa !== '0' && (
                                    <button 
                                        onClick={registraPausaFissa} 
                                        disabled={!isDeviceOk || pausaRegistrata || isOnBreak} 
                                        className="px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                                    >
                                        {pausaRegistrata ? `PAUSA DI ${configPausa} MIN REGISTRATA` : `INIZIA PAUSA ${configPausa} MIN`}
                                    </button>
                                )}
                                
                                <button onClick={handleClockOut} disabled={!isDeviceOk} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 text-lg font-medium disabled:bg-gray-400">TIMBRA USCITA</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-red-600 text-xl font-bold">Timbratura NON ATTIVA</p>
                            {workAreas.length > 0 ? (
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Seleziona Area per timbrare:</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {workAreas.map(area => (<button key={area.id} onClick={() => handleClockIn(area.id)} disabled={!isDeviceOk} className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-lg font-medium w-full disabled:bg-gray-400">TIMBRA ENTRATA ({area.name})</button>))}
                                    </div>
                                </div>
                            ) : <p className="text-gray-500 mt-2">Nessuna area di lavoro assegnata.</p>}
                        </>
                    )}
                </div>
            </main>

            <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-md">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-2xl font-bold text-gray-800">Cronologia Timbrature</h2>
                    <button onClick={handleDownloadPdf} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 w-full sm:w-auto disabled:bg-gray-400" disabled={filteredTimestamps.length === 0}>Scarica PDF</button>
                </div>

                {availableMonths.length > 0 && (
                    <div className="mb-4">
                        <label htmlFor="month-select" className="block text-sm font-medium text-gray-700">Seleziona Mese:</label>
                        <select id="month-select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                            {availableMonths.map(month => <option key={month} value={month}>{month}</option>)}
                        </select>
                    </div>
                )}

                {filteredTimestamps.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uscita</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredTimestamps.map((entry) => (
                                    <tr key={entry.id}>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.date}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.areaName}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.clockIn}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.clockOut}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.duration}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="text-gray-500 text-center">Nessuna timbratura trovata per il mese selezionato.</p>}
            </div>
        </div>
    );
};

export default EmployeeDashboard;
