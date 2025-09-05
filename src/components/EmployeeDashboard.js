import React from 'react';
import { db } from '../firebase';
import { 
    doc, getDoc, collection, addDoc, getDocs, query, where, 
    updateDoc, onSnapshot, orderBy 
} from 'firebase/firestore';

// Importa i componenti che ci servono
import CompanyLogo from './CompanyLogo';
import Clock from './Clock';

// Importa la funzione di utilità
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
    const [employeeData, setEmployeeData] = React.useState(null);
    const [workAreas, setWorkAreas] = React.useState([]);
    const [currentPosition, setCurrentPosition] = React.useState(null);
    const [locationError, setLocationError] = React.useState('');
    const [status, setStatus] = React.useState({ clockedIn: false, area: null, entryId: null });
    const [canClockIn, setCanClockIn] = React.useState(false);
    const [clockingInProgress, setClockingInProgress] = React.useState(false);
    const [history, setHistory] = React.useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = React.useState(true);

    React.useEffect(() => {
        if (!user) return;
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
    }, [user]);

    React.useEffect(() => {
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

    React.useEffect(() => {
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
                setStatus({ clockedIn: true, area: areaDoc.data()?.name || 'Sconosciuta', entryId: entryDoc.id });
            } else {
                setStatus({ clockedIn: false, area: null, entryId: null });
            }
        });
        return () => unsubscribe();
    }, [employeeData]);
    
    React.useEffect(() => {
        if (!employeeData) return;
        setIsLoadingHistory(true);
        const q = query(
            collection(db, "time_entries"), 
            where("employeeId", "==", employeeData.id),
            where("status", "==", "clocked-out"),
            orderBy("clockInTime", "desc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setHistory(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})));
            setIsLoadingHistory(false);
        }, (error) => {
            console.error("Errore nel caricamento della cronologia: ", error);
            setIsLoadingHistory(false);
        });
        return () => unsubscribe();
    }, [employeeData]);

    React.useEffect(() => {
        if (currentPosition && workAreas.length > 0) {
            const isInsideAnyArea = workAreas.some(area => {
                const distance = getDistance(currentPosition, area);
                return distance <= area.radius;
            });
            setCanClockIn(isInsideAnyArea);
        } else {
            setCanClockIn(false);
        }
    }, [currentPosition, workAreas]);

    const handleClockIn = async () => {
        if (!canClockIn || !currentPosition) return;
        setClockingInProgress(true);
        let areaToClockIn = null;
        for (const area of workAreas) {
            if (getDistance(currentPosition, area) <= area.radius) {
                areaToClockIn = area;
                break;
            }
        }
        if (areaToClockIn && employeeData) {
            try {
                await addDoc(collection(db, "time_entries"), {
                    employeeId: employeeData.id,
                    workAreaId: areaToClockIn.id,
                    clockInTime: new Date(),
                    clockOutTime: null,
                    status: 'clocked-in'
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
                clockOutTime: new Date(),
                status: 'clocked-out'
            });
        } catch (err) { console.error("Error clocking out: ", err); }
        setClockingInProgress(false);
    };

    return (
        // ATTENZIONE: abbiamo rimosso il div esterno con "min-h-screen"
        <>
            <header className="bg-white shadow-md p-4 flex justify-between items-center w-full max-w-4xl mb-4">
                <CompanyLogo />
                <div className="flex items-center space-x-4">
                    <span className="text-gray-600 hidden sm:block">Dipendente: {user.email}</span>
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
                </div>
            </header>
            <main className="w-full max-w-4xl space-y-8">
                <Clock />
                <div className="bg-white p-6 rounded-xl shadow-lg text-center space-y-4">
                    <h2 className="text-2xl font-bold text-gray-800">Stato Timbratura</h2>
                    {status.clockedIn ? (
                        <div className="p-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-lg">
                            <p className="font-bold">Timbratura ATTIVA</p>
                            <p>Area: {status.area}</p>
                        </div>
                    ) : (
                        <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-lg">
                            <p className="font-bold">Timbratura NON ATTIVA</p>
                        </div>
                    )}
                    {status.clockedIn ? (
                        <button 
                            onClick={handleClockOut}
                            disabled={clockingInProgress}
                            className="w-full md:w-1/2 py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-bold text-xl rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:bg-red-300"
                        >
                            {clockingInProgress ? '...' : 'TIMBRA USCITA'}
                        </button>
                    ) : (
                        <button 
                            onClick={handleClockIn}
                            disabled={!canClockIn || clockingInProgress}
                            className="w-full md:w-1/2 py-4 px-6 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                             {clockingInProgress ? '...' : 'TIMBRA ENTRATA'}
                        </button>
                    )}
                    {!status.clockedIn && !canClockIn && (
                        <p className="text-red-500 mt-2 text-sm">
                            {locationError ? locationError : "Non sei in un'area di lavoro autorizzata per la timbratura."}
                        </p>
                    )}
                </div>
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Le tue Aree di Lavoro</h3>
                    {workAreas.length > 0 ? (
                        <ul className="list-disc list-inside space-y-2 text-gray-700">
                            {workAreas.map(area => <li key={area.id}>{area.name}</li>)}
                        </ul>
                    ) : (
                        <p className="text-gray-500">Nessuna area di lavoro assegnata.</p>
                    )}
                </div>
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Cronologia Timbrature</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                             <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uscita</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Totale Ore</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {isLoadingHistory ? (
                                    <tr><td colSpan="5" className="text-center py-4">Caricamento cronologia...</td></tr>
                                ) : history.length > 0 ? (
                                    history.map(entry => (
                                        <tr key={entry.id}>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">{entry.clockInTime.toDate().toLocaleDateString('it-IT')}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                                                {workAreas.find(wa => wa.id === entry.workAreaId)?.name || 'N/A'}
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">{entry.clockInTime.toDate().toLocaleTimeString('it-IT')}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">{entry.clockOutTime.toDate().toLocaleTimeString('it-IT')}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                                                {((entry.clockOutTime.toDate() - entry.clockInTime.toDate()) / 3600000).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" className="text-center py-4 text-gray-500">Nessuna timbratura passata trovata.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </>
    );
};

export default EmployeeDashboard;
