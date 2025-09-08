import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, doc, arrayUnion, Timestamp } from 'firebase/firestore';
import CompanyLogo from './CompanyLogo';

// Funzione per calcolare la distanza tra due punti geografici (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const d = R * c; // in metres
    return d;
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
    const [employeeTimestamps, setEmployeeTimestamps] = useState([]);
    const [activeEntry, setActiveEntry] = useState(null);
    const [workAreas, setWorkAreas] = useState([]);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [statusMessage, setStatusMessage] = useState({ type: '', text: '' }); // Unico stato per i messaggi
    const [isLoading, setIsLoading] = useState(true);
    const [isDeviceOk, setIsDeviceOk] = useState(false); // Stato per validare il dispositivo

    const isOnBreak = activeEntry?.pauses?.some(p => !p.end) || false;

    const fetchEmployeeData = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        try {
            const qEmployee = query(collection(db, "employees"), where("userId", "==", user.uid));
            const employeeSnapshot = await getDocs(qEmployee);

            if (!employeeSnapshot.empty) {
                const data = { id: employeeSnapshot.docs[0].id, ...employeeSnapshot.docs[0].data() };
                setEmployeeData(data);

                const deviceId = getDeviceId();
                if (!data.deviceId || data.deviceId === deviceId) {
                    setIsDeviceOk(true);
                } else {
                    setIsDeviceOk(false);
                    setStatusMessage({ type: 'error', text: "Questo non è il dispositivo autorizzato per la timbratura. Contatta un amministratore per resettare il tuo dispositivo." });
                }

                // *** FIX: Carica tutte le aree una sola volta per poterle usare nella cronologia ***
                const allAreasSnapshot = await getDocs(collection(db, "work_areas"));
                const allAreas = allAreasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                let assignedAreas = [];
                if (data.workAreaIds && data.workAreaIds.length > 0) {
                    assignedAreas = allAreas.filter(area => data.workAreaIds.includes(area.id));
                }
                setWorkAreas(assignedAreas);
                
                const qActiveEntry = query(
                    collection(db, "time_entries"),
                    where("employeeId", "==", data.id),
                    where("status", "==", "clocked-in")
                );
                const activeEntrySnapshot = await getDocs(qActiveEntry);
                if (!activeEntrySnapshot.empty) {
                    setActiveEntry({ id: activeEntrySnapshot.docs[0].id, ...activeEntrySnapshot.docs[0].data() });
                } else {
                    setActiveEntry(null);
                }

                const qPastEntries = query(
                    collection(db, "time_entries"),
                    where("employeeId", "==", data.id),
                    where("status", "==", "clocked-out"),
                    orderBy("clockInTime", "desc")
                );
                const pastEntriesSnapshot = await getDocs(qPastEntries);
                
                const pastEntries = pastEntriesSnapshot.docs.map(doc => {
                    const entryData = doc.data();
                    // *** FIX: Cerca il nome dell'area nella lista completa di tutte le aree ***
                    const area = allAreas.find(wa => wa.id === entryData.workAreaId);
                    const clockInTime = entryData.clockInTime?.toDate();
                    const clockOutTime = entryData.clockOutTime?.toDate();
                    
                    let duration = 0;
                    if (clockInTime && clockOutTime) {
                        const totalDurationMs = clockOutTime.getTime() - clockInTime.getTime();
                        const pauseDurationMs = (entryData.pauses || []).reduce((acc, p) => {
                            if (p.start && p.end) {
                                return acc + (p.end.toDate().getTime() - p.start.toDate().getTime());
                            }
                            return acc;
                        }, 0);
                        duration = (totalDurationMs - pauseDurationMs) / (1000 * 60 * 60);
                    }
                    
                    return {
                        id: doc.id,
                        areaName: area ? area.name : 'N/D',
                        clockIn: clockInTime ? clockInTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
                        clockOut: clockOutTime ? clockOutTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
                        date: clockInTime ? clockInTime.toLocaleDateString('it-IT') : 'N/A',
                        duration: duration > 0 ? duration.toFixed(2) : '0.00'
                    };
                });
                setEmployeeTimestamps(pastEntries);

            } else {
                setEmployeeData(null);
            }
        } catch (error) {
            console.error("Errore nel recupero dati dipendente:", error);
            setStatusMessage({ type: 'error', text: 'Errore nel caricamento dei dati.' });
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchEmployeeData();
    }, [fetchEmployeeData]);

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setStatusMessage({ type: 'error', text: "La geolocalizzazione non è supportata dal tuo browser."});
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setCurrentLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setStatusMessage({ type: '', text: '' });
            },
            (error) => {
                let message = "Errore sconosciuto di geolocalizzazione.";
                if (error.code === error.PERMISSION_DENIED) message = "Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser.";
                if (error.code === error.POSITION_UNAVAILABLE) message = "Informazioni sulla posizione non disponibili.";
                if (error.code === error.TIMEOUT) message = "La richiesta di geolocalizzazione è scaduta.";
                setStatusMessage({ type: 'error', text: message });
                setCurrentLocation(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    useEffect(() => {
        getCurrentLocation();
        const geoIntervalId = setInterval(getCurrentLocation, 60000);
        return () => clearInterval(geoIntervalId);
    }, []);

    const handleClockIn = async (areaId) => {
        if (!isDeviceOk) return;

        if (!currentLocation) {
            setStatusMessage({ type: 'error', text: "Impossibile rilevare la posizione. Riprova o abilita la geolocalizzazione."});
            return;
        }

        const selectedArea = workAreas.find(area => area.id === areaId);
        if (!selectedArea) {
            setStatusMessage({ type: 'error', text: "Area di lavoro non trovata." });
            return;
        }

        const distance = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            selectedArea.latitude, selectedArea.longitude
        );

        if (distance <= selectedArea.radius) {
            try {
                if (!employeeData.deviceId) {
                    const deviceId = getDeviceId();
                    const employeeRef = doc(db, "employees", employeeData.id);
                    await updateDoc(employeeRef, { deviceId: deviceId });
                }

                await addDoc(collection(db, "time_entries"), {
                    employeeId: employeeData.id,
                    workAreaId: areaId,
                    clockInTime: new Date(),
                    clockOutTime: null,
                    status: 'clocked-in',
                    pauses: []
                });
                fetchEmployeeData();
                setStatusMessage({ type: 'success', text: 'Timbratura di entrata registrata!' });
            } catch (error) {
                console.error("Errore durante la timbratura di entrata:", error);
                setStatusMessage({ type: 'error', text: "Errore durante la timbratura di entrata." });
            }
        } else {
            setStatusMessage({ type: 'error', text: `Non sei in un'area di lavoro autorizzata per la timbratura. Distanza: ${distance.toFixed(0)}m (Max: ${selectedArea.radius}m)` });
        }
    };

    const handleClockOut = async () => {
        if (!isDeviceOk) return;

        if (activeEntry && employeeData) {
            try {
                if (isOnBreak) {
                    await handleEndPause(false); 
                }
                await updateDoc(doc(db, "time_entries", activeEntry.id), {
                    clockOutTime: new Date(),
                    status: 'clocked-out'
                });
                fetchEmployeeData();
                setStatusMessage({ type: 'success', text: 'Timbratura di uscita registrata!' });
            } catch (error) {
                console.error("Errore durante la timbratura di uscita:", error);
                setStatusMessage({ type: 'error', text: "Errore durante la timbratura di uscita." });
            }
        }
    };

    const handleStartPause = async () => {
        if (!isDeviceOk || !activeEntry) return;
        try {
            const entryRef = doc(db, "time_entries", activeEntry.id);
            await updateDoc(entryRef, {
                pauses: arrayUnion({ start: Timestamp.now(), end: null })
            });
            fetchEmployeeData();
            setStatusMessage({ type: 'success', text: 'Pausa iniziata.' });
        } catch (error) {
            console.error("Errore durante l'inizio della pausa:", error);
            setStatusMessage({ type: 'error', text: "Errore durante l'inizio della pausa." });
        }
    };

    const handleEndPause = async (refresh = true) => {
        if (!isDeviceOk || !activeEntry) return;

        const currentPauses = activeEntry.pauses || [];
        const openPauseIndex = currentPauses.findIndex(p => !p.end);

        if (openPauseIndex > -1) {
            currentPauses[openPauseIndex].end = Timestamp.now();
            try {
                const entryRef = doc(db, "time_entries", activeEntry.id);
                await updateDoc(entryRef, {
                    pauses: currentPauses
                });
                if (refresh) fetchEmployeeData();
                setStatusMessage({ type: 'success', text: 'Pausa terminata.' });
            } catch (error) {
                console.error("Errore durante la fine della pausa:", error);
                setStatusMessage({ type: 'error', text: "Errore durante la fine della pausa." });
            }
        }
    };


    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Caricamento dati dipendente...</p></div>;
    }

    if (!employeeData) {
        return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
            <CompanyLogo />
            <p className="mt-8 text-xl text-red-600 text-center">Errore: Dati dipendente non trovati o non autorizzato.</p>
            <button onClick={handleLogout} className="mt-4 px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
        </div>;
    }

    const currentDateTime = new Date();
    const formattedDate = currentDateTime.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = currentDateTime.toLocaleTimeString('it-IT');

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4">
            <header className="bg-white shadow-md rounded-lg p-4 mb-6 w-full max-w-md flex flex-col items-center">
                <CompanyLogo />
                <div className="text-center mt-4">
                    <p className="text-gray-600 text-sm break-all">Dipendente: {employeeData.email} <button onClick={handleLogout} className="text-blue-500 hover:underline ml-2 text-sm">Logout</button></p>
                    <p className="text-gray-800 text-lg font-semibold mt-2">{formattedTime}</p>
                    <p className="text-gray-500 text-sm">{formattedDate}</p>
                </div>
            </header>

            <main className="bg-white shadow-md rounded-lg p-6 w-full max-w-md mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Stato Timbratura</h2>
                
                {!employeeData.deviceId && !activeEntry && isDeviceOk &&
                    <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-3 text-sm mb-4" role="alert">
                      <p>Questo dispositivo verrà registrato con la tua prossima timbratura.</p>
                    </div>
                }

                <div className="text-center mb-4">
                    {activeEntry ? (
                        <>
                            <p className={`text-xl font-bold ${isOnBreak ? 'text-yellow-600' : 'text-green-600'}`}>
                                {isOnBreak ? 'IN PAUSA' : 'Timbratura ATTIVA'}
                            </p>
                            <p className="text-gray-700 mt-2">Area: {workAreas.find(area => area.id === activeEntry.workAreaId)?.name || 'Sconosciuta'}</p>
                            <div className="mt-4 flex flex-col gap-3">
                                {!isOnBreak ? (
                                    <button onClick={handleStartPause} disabled={!isDeviceOk} className="px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-lg font-medium disabled:bg-gray-400">INIZIA PAUSA</button>
                                ) : (
                                    <button onClick={handleEndPause} disabled={!isDeviceOk} className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 text-lg font-medium disabled:bg-gray-400">FINE PAUSA</button>
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
                                        {workAreas.map(area => (
                                            <button 
                                                key={area.id}
                                                onClick={() => handleClockIn(area.id)}
                                                disabled={!isDeviceOk}
                                                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-lg font-medium w-full disabled:bg-gray-400"
                                            >
                                                TIMBRA ENTRATA ({area.name})
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-500 mt-2">Nessuna area di lavoro assegnata o disponibile.</p>
                            )}
                        </>
                    )}
                </div>
                {statusMessage.text && (
                    <p className={`${statusMessage.type === 'error' ? 'text-red-500' : 'text-green-500'} text-sm mt-4 text-center`}>{statusMessage.text}</p>
                )}
            </main>

            {employeeData && workAreas.length > 0 && (
                <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-md mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Le tue Aree di Lavoro</h2>
                    <ul className="list-disc list-inside text-gray-700 text-center">
                        {workAreas.map(area => (
                            <li key={area.id}>{area.name}</li>
                        ))}
                    </ul>
                </div>
            )}
            
            <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Cronologia Timbrature</h2>
                {employeeTimestamps.length > 0 ? (
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
                                {employeeTimestamps.map((entry) => (
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
                ) : (
                    <p className="text-gray-500 text-center">Nessuna timbratura passata trovata.</p>
                )}
            </div>
        </div>
    );
};

export default EmployeeDashboard;

