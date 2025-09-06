import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
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

const EmployeeDashboard = ({ user, handleLogout }) => {
    const [employeeData, setEmployeeData] = useState(null);
    const [employeeTimestamps, setEmployeeTimestamps] = useState([]);
    const [activeEntry, setActiveEntry] = useState(null);
    const [workAreas, setWorkAreas] = useState([]);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [isLoading, setIsLoading] = useState(true);

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

                let fetchedAreas = [];
                if (data.workAreaIds && data.workAreaIds.length > 0) {
                    const areasQuery = query(collection(db, "work_areas"), where("__name__", "in", data.workAreaIds));
                    const areasSnapshot = await getDocs(areasQuery);
                    fetchedAreas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setWorkAreas(fetchedAreas);
                } else {
                    setWorkAreas([]);
                }
                
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
                    const area = fetchedAreas.find(wa => wa.id === entryData.workAreaId);
                    const clockInTime = entryData.clockInTime?.toDate();
                    const clockOutTime = entryData.clockOutTime?.toDate();
                    let duration = null;

                    if (clockInTime && clockOutTime) {
                        duration = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
                    }
                    
                    return {
                        id: doc.id,
                        areaName: area ? area.name : 'N/D',
                        clockIn: clockInTime ? clockInTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
                        clockOut: clockOutTime ? clockOutTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
                        date: clockInTime ? clockInTime.toLocaleDateString('it-IT') : 'N/A',
                        duration: duration ? duration.toFixed(2) : 'N/A'
                    };
                });
                setEmployeeTimestamps(pastEntries);

            } else {
                setEmployeeData(null);
            }
        } catch (error) {
            console.error("Errore nel recupero dati dipendente:", error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchEmployeeData();
    }, [fetchEmployeeData]);

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setLocationError("La geolocalizzazione non è supportata dal tuo browser.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setCurrentLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setLocationError('');
            },
            (error) => {
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        setLocationError("Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser.");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        setLocationError("Informazioni sulla posizione non disponibili.");
                        break;
                    case error.TIMEOUT:
                        setLocationError("La richiesta di geolocalizzazione è scaduta.");
                        break;
                    default:
                        setLocationError("Errore sconosciuto di geolocalizzazione.");
                        break;
                }
                setCurrentLocation(null);
                console.error("Errore di geolocalizzazione:", error);
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
        if (!currentLocation) {
            setLocationError("Impossibile rilevare la posizione. Riprova o abilita la geolocalizzazione.");
            return;
        }

        const selectedArea = workAreas.find(area => area.id === areaId);
        if (!selectedArea) {
            setLocationError("Area di lavoro non trovata.");
            return;
        }

        const distance = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            selectedArea.latitude, selectedArea.longitude
        );

        if (distance <= selectedArea.radius) {
            try {
                await addDoc(collection(db, "time_entries"), {
                    employeeId: employeeData.id,
                    workAreaId: areaId,
                    clockInTime: new Date(),
                    clockOutTime: null,
                    status: 'clocked-in'
                });
                fetchEmployeeData();
                setLocationError('');
            } catch (error) {
                console.error("Errore durante la timbratura di entrata:", error);
                setLocationError("Errore durante la timbratura di entrata.");
            }
        } else {
            setLocationError(`Non sei in un'area di lavoro autorizzata per la timbratura. Distanza: ${distance.toFixed(2)}m (Max: ${selectedArea.radius}m)`);
        }
    };

    const handleClockOut = async () => {
        if (activeEntry && employeeData) {
            try {
                await updateDoc(doc(db, "time_entries", activeEntry.id), {
                    clockOutTime: new Date(),
                    status: 'clocked-out'
                });
                fetchEmployeeData();
                setLocationError('');
            } catch (error) {
                console.error("Errore durante la timbratura di uscita:", error);
                setLocationError("Errore durante la timbratura di uscita.");
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
                <div className="text-center mb-4">
                    {activeEntry ? (
                        <>
                            <p className="text-green-600 text-xl font-bold">Timbratura ATTIVA</p>
                            <p className="text-gray-700 mt-2">Area: {workAreas.find(area => area.id === activeEntry.workAreaId)?.name || 'Sconosciuta'}</p>
                            <button onClick={handleClockOut} className="mt-4 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 text-lg font-medium">TIMBRA USCITA</button>
                        </>
                    ) : (
                        <>
                            <p className="text-red-600 text-xl font-bold">Timbratura NON ATTIVA</p>
                            {workAreas.length > 0 ? (
                                <div className="mt-4">
                                    <label htmlFor="areaSelect" className="block text-sm font-medium text-gray-700 mb-2">Seleziona Area per timbrare:</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {workAreas.map(area => (
                                            <button 
                                                key={area.id}
                                                onClick={() => handleClockIn(area.id)}
                                                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-lg font-medium w-full"
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
                {locationError && (
                    <p className="text-red-500 text-sm mt-4 text-center">{locationError}</p>
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
