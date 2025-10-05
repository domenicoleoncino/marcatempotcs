import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
    doc, getDoc, collection, addDoc, getDocs, query, where, 
    updateDoc, onSnapshot, orderBy, Timestamp
} from 'firebase/firestore';
import CompanyLogo from './CompanyLogo';
import Clock from './Clock';

// NUOVA FUNZIONE DI ARROTONDAMENTO
const roundTimeWithCustomRules = (date, type) => {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();
    if (type === 'entrata') {
        if (minutes >= 46) {
            newDate.setHours(newDate.getHours() + 1);
            newDate.setMinutes(0);
        } else if (minutes >= 16) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    } else if (type === 'uscita') {
        if (minutes >= 30) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    }
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
};

// Funzione di utilità per la geolocalizzazione
const getDistance = (coords1, coords2) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Raggio della Terra in km
    const dLat = toRad(coords2.latitude - coords1.latitude);
    const dLon = toRad(coords2.longitude - coords1.longitude);
    const lat1 = toRad(coords1.latitude);
    const lat2 = toRad(coords2.latitude);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // in metri
};


const EmployeeDashboard = ({ user, handleLogout }) => {
    const [employeeData, setEmployeeData] = useState(null);
    const [workAreas, setWorkAreas] = useState([]);
    const [currentPosition, setCurrentPosition] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [status, setStatus] = useState({ clockedIn: false, area: null, entryId: null, isOnBreak: false });
    const [canClockIn, setCanClockIn] = useState(false);
    const [clockingInProgress, setClockingInProgress] = useState(false);
    const [history, setHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "employees"), where("userId", "==", user.uid));
        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            if (!querySnapshot.empty) {
                const empDoc = querySnapshot.docs[0];
                const empData = { id: empDoc.id, ...empDoc.data() };
                setEmployeeData(empData);
                if (empData.workAreaIds && empData.workAreaIds.length > 0) {
                    const areasQuery = query(collection(db, "work_areas"), where("__name__", "in", empData.workAreaIds));
                    const areasSnapshot = await getDocs(areasQuery);
                    setWorkAreas(areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                } else {
                    setWorkAreas([]);
                }
            }
        });
        return () => unsubscribe();
    }, [user.uid]);

    useEffect(() => {
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setCurrentPosition(pos.coords);
                setLocationError('');
            },
            (err) => {
                setLocationError('Impossibile ottenere la posizione. Assicurati di aver concesso i permessi.');
                console.error(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);
    
    useEffect(() => {
        if (!employeeData) return;
        const q = query(collection(db, "time_entries"), 
            where("employeeId", "==", employeeData.id),
            where("status", "==", "clocked-in")
        );
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (!snapshot.empty) {
                const entryDoc = snapshot.docs[0];
                const entryData = entryDoc.data();
                const areaDoc = await getDoc(doc(db, "work_areas", entryData.workAreaId));
                const isOnBreak = entryData.pauses?.some(p => !p.end) || false;
                setStatus({ clockedIn: true, area: areaDoc.exists() ? areaDoc.data().name : 'Sconosciuta', entryId: entryDoc.id, isOnBreak });
            } else {
                setStatus({ clockedIn: false, area: null, entryId: null, isOnBreak: false });
            }
        });
        return () => unsubscribe();
    }, [employeeData]);

    useEffect(() => {
        if (currentPosition && workAreas.length > 0 && !status.clockedIn) {
            const isInsideAnyArea = workAreas.some(area => {
                const distance = getDistance(currentPosition, area);
                return distance <= area.radius;
            });
            setCanClockIn(isInsideAnyArea);
        } else {
            setCanClockIn(false);
        }
    }, [currentPosition, workAreas, status.clockedIn]);

    useEffect(() => {
        if (!employeeData) return;
        const qHistory = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), orderBy("clockInTime", "desc"));
        const unsubscribeHistory = onSnapshot(qHistory, async (snapshot) => {
            const allAreas = await getDocs(collection(db, "work_areas"));
            const areasMap = new Map(allAreas.docs.map(doc => [doc.id, doc.data().name]));
            const entriesData = snapshot.docs.map(docSnapshot => {
                const entry = { id: docSnapshot.id, ...docSnapshot.data() };
                return {
                    ...entry,
                    areaName: areasMap.get(entry.workAreaId) || "Area Sconosciuta"
                };
            });
            setHistory(entriesData);
            setIsLoadingHistory(false);
        }, (error) => {
            console.error("Errore nel caricare la cronologia:", error);
            setIsLoadingHistory(false);
        });
        return () => unsubscribeHistory();
    }, [employeeData]);


    const handleClockIn = async () => {
        if (!canClockIn || !currentPosition || !employeeData) return;
        setClockingInProgress(true);
        let areaToClockIn = null;
        for (const area of workAreas) {
            if (getDistance(currentPosition, area) <= area.radius) {
                areaToClockIn = area;
                break;
            }
        }
        if (areaToClockIn) {
            try {
                await addDoc(collection(db, "time_entries"), {
                    employeeId: employeeData.id,
                    workAreaId: areaToClockIn.id,
                    clockInTime: roundTimeWithCustomRules(new Date(), 'entrata'),
                    clockOutTime: null,
                    status: 'clocked-in',
                    createdBy: user.uid,
                    pauses: []
                });
            } catch (err) { console.error("Error clocking in: ", err); }
        }
        setClockingInProgress(false);
    };

    const handleClockOut = async () => {
        if (!status.entryId) return;
        setClockingInProgress(true);
        try {
            await updateDoc(doc(db, "time_entries", status.entryId), {
                clockOutTime: roundTimeWithCustomRules(new Date(), 'uscita'),
                status: 'clocked-out',
                createdBy: user.uid
            });
        } catch (err) { console.error("Error clocking out: ", err); }
        setClockingInProgress(false);
    };

    const handlePause = async () => {
        if (!status.entryId) return;
        setClockingInProgress(true);
        try {
            const entryRef = doc(db, "time_entries", status.entryId);
            const entryDoc = await getDoc(entryRef);
            const currentPauses = entryDoc.data().pauses || [];
            if (status.isOnBreak) { // L'utente sta finendo la pausa
                const lastPauseIndex = currentPauses.length - 1;
                if (lastPauseIndex >= 0 && !currentPauses[lastPauseIndex].end) {
                    currentPauses[lastPauseIndex].end = Timestamp.fromDate(new Date());
                    await updateDoc(entryRef, { pauses: currentPauses });
                }
            } else { // L'utente sta iniziando la pausa
                const newPause = { start: Timestamp.fromDate(new Date()), end: null };
                await updateDoc(entryRef, { pauses: [...currentPauses, newPause] });
            }
        } catch (err) { console.error("Error handling pause: ", err); }
        setClockingInProgress(false);
    };
    
    return (
        <div className="min-h-screen bg-gray-100 w-full">
            <header className="bg-white shadow-md p-4 flex justify-between items-center w-full">
                <CompanyLogo />
                <div className="flex items-center space-x-4">
                    <span className="text-gray-600 hidden sm:block">Dipendente: {employeeData ? `${employeeData.name} ${employeeData.surname}` : user.email}</span>
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
                </div>
            </header>
            <main className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 w-full">
                <Clock />
                <div className="bg-white p-6 rounded-xl shadow-lg text-center space-y-4">
                    <h2 className="text-2xl font-bold text-gray-800">Stato Timbratura</h2>
                    {status.clockedIn ? (
                        <div className="p-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-lg">
                            <p className="font-bold">Timbratura ATTIVA</p>
                            <p>Area: {status.area}</p>
                            {status.isOnBreak && <p className="font-semibold text-yellow-600">In Pausa</p>}
                        </div>
                    ) : (
                        <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-lg">
                            <p className="font-bold">Timbratura NON ATTIVA</p>
                        </div>
                    )}
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                        {status.clockedIn && (
                            <button
                                onClick={handlePause}
                                disabled={clockingInProgress}
                                className={`w-full sm:w-auto py-3 px-5 text-white font-bold rounded-lg shadow-lg transition duration-300 ${status.isOnBreak ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
                            >
                                {status.isOnBreak ? 'TERMINA PAUSA' : 'INIZIA PAUSA'}
                            </button>
                        )}
                        {status.clockedIn ? (
                            <button 
                                onClick={handleClockOut}
                                disabled={clockingInProgress || status.isOnBreak}
                                className="w-full sm:w-auto py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-bold text-xl rounded-lg shadow-lg transition duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {clockingInProgress ? '...' : 'TIMBRA USCITA'}
                            </button>
                        ) : (
                            <button 
                                onClick={handleClockIn}
                                disabled={!canClockIn || clockingInProgress}
                                className="w-full md:w-1/2 py-4 px-6 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-lg shadow-lg transition duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                 {clockingInProgress ? '...' : 'TIMBRA ENTRATA'}
                            </button>
                        )}
                    </div>
                    {!status.clockedIn && !canClockIn && (
                        <p className="text-red-500 mt-2 text-sm">
                            {locationError ? locationError : "Non sei in un'area di lavoro autorizzata per la timbratura."}
                        </p>
                    )}
                </div>

                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Cronologia Timbrature</h3>
                    {isLoadingHistory ? ( <p>Caricamento...</p> ) : history.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uscita</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {history.map(entry => {
                                        const clockIn = entry.clockInTime.toDate();
                                        const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : null;
                                        return (
                                            <tr key={entry.id}>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm">{clockIn.toLocaleDateString('it-IT')}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm">{entry.areaName}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm">{clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm">{clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'In corso...'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : ( <p className="text-gray-500">Nessuna timbratura trovata.</p> )}
                </div>
            </main>
        </div>
    );
};

export default EmployeeDashboard;
