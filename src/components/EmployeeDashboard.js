import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDoc, doc, getDocs, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';

// Funzione per calcolare la distanza tra due punti GPS (formula di Haversine)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raggio della Terra in metri
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaL = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(deltaL / 2) * Math.sin(deltaL / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distanza in metri
}


const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Nuovi stati per la geolocalizzazione
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null); // L'area in cui si trova l'utente

    const functions = getFunctions();
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const clockPause = httpsCallable(functions, 'clockEmployeePause');

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Lista delle aree assegnate al dipendente
    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    // Gestione della geolocalizzazione
    useEffect(() => {
        if (activeEntry || employeeWorkAreas.length === 0) return; // Non cercare la posizione se già al lavoro

        if (!navigator.geolocation) {
            setLocationError("La geolocalizzazione non è supportata da questo browser.");
            return;
        }

        const success = (position) => {
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

        const error = () => {
            setLocationError("Impossibile recuperare la posizione. Assicurati di aver dato i permessi.");
            setInRangeArea(null);
        };

        const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
        const watcher = navigator.geolocation.watchPosition(success, error, options);
        return () => navigator.geolocation.clearWatch(watcher);
    }, [employeeWorkAreas, activeEntry]);


    // Ascolta le timbrature del dipendente
    useEffect(() => {
        if (!user) return;
        const qActive = query(collection(db, "time_entries"), where("employeeId", "==", user.uid), where("status", "==", "clocked-in"));
        const unsubscribeActive = onSnapshot(qActive, async (snapshot) => {
            if (!snapshot.empty) {
                const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveEntry(entryData);
                if (entryData.workAreaId && allWorkAreas.length > 0) {
                    const area = allWorkAreas.find(a => a.id === entryData.workAreaId);
                    if (area) setWorkAreaName(area.name);
                }
            } else {
                setActiveEntry(null);
                setWorkAreaName('');
            }
        });

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"), where("employeeId", "==", user.uid), where("clockInTime", ">=", startOfDay), orderBy("clockInTime", "desc"));
        const unsubscribeTodays = onSnapshot(qTodays, (snapshot) => {
            const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTodaysEntries(entries);
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
    
    const hasPauseBeenTaken = activeEntry?.pauses && activeEntry.pauses.length > 0;

    if (!employeeData) return <div className="min-h-screen flex items-center justify-center">Profilo non trovato. Contatta l'amministratore. <button onClick={handleLogout}>Logout</button></div>;

    return (
        <div className="p-4 max-w-lg mx-auto font-sans">
            <CompanyLogo />
            <div className="text-center my-4">
                <p>Dipendente: {employeeData.name} {employeeData.surname}</p>
                <p className="text-3xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-sm text-gray-500">{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-2">Stato Timbratura</h2>
                {activeEntry ? (
                    <div>
                        <p className="text-green-600 font-semibold">Timbratura ATTIVA</p>
                        <p>Area: {workAreaName}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            {!hasPauseBeenTaken && (
                                <button onClick={() => handleAction('clockPause')} disabled={isProcessing} className="w-full text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:bg-gray-400">
                                    TIMBRA PAUSA
                                </button>
                            )}
                            <button onClick={() => handleAction('clockOut')} disabled={isProcessing} className="w-full text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-400">
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
                            className="w-full mt-4 text-lg font-bold py-4 px-4 rounded-lg shadow-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400"
                        >
                            TIMBRA ENTRATA
                        </button>
                    </div>
                )}
            </div>

            <div className="mt-6">
                <h2 className="text-xl font-bold mb-2">Cronologia Timbrature di Oggi</h2>
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
             <button onClick={handleLogout} className="w-full mt-6 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">Logout</button>
        </div>
    );
};

export default EmployeeDashboard;