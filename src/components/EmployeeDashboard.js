import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDoc, doc, getDocs, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';

const EmployeeDashboard = ({ user, handleLogout }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [employeeProfile, setEmployeeProfile] = useState(null);
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const functions = getFunctions();
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const clockPause = httpsCallable(functions, 'clockEmployeePause');

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Carica il profilo del dipendente e tutte le aree di lavoro
    useEffect(() => {
        if (!user) return;
        setIsLoading(true);

        const fetchInitialData = async () => {
            // Carica profilo
            const employeeRef = doc(db, "employees", user.uid);
            const employeeSnap = await getDoc(employeeRef);
            if (employeeSnap.exists()) {
                setEmployeeProfile({ id: employeeSnap.id, ...employeeSnap.data() });
            } else {
                setEmployeeProfile(null);
            }

            // Carica tutte le aree
            const areasSnapshot = await getDocs(collection(db, "work_areas"));
            setAllWorkAreas(areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            
            setIsLoading(false);
        };
        fetchInitialData();
    }, [user]);

    // Ascolta le timbrature
    useEffect(() => {
        if (!user) return;
        
        const qActive = query(collection(db, "time_entries"), where("employeeId", "==", user.uid), where("status", "==", "clocked-in"));
        const unsubscribeActive = onSnapshot(qActive, async (snapshot) => {
            if (!snapshot.empty) {
                const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setActiveEntry(entryData);
                if (entryData.workAreaId) {
                    const areaDoc = await getDoc(doc(db, "work_areas", entryData.workAreaId));
                    if (areaDoc.exists()) setWorkAreaName(areaDoc.data().name);
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

        return () => {
            unsubscribeActive();
            unsubscribeTodays();
        };
    }, [user]);

    const handleAction = async (action, areaId = null) => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            let result;
            if (action === 'clockIn') {
                if (!areaId) throw new Error("Seleziona un'area prima di timbrare.");
                result = await clockIn({ areaId });
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
    
    // Lista delle aree assegnate al dipendente per il menu a tendina
    const employeeWorkAreas = useMemo(() => {
        if (!employeeProfile || !employeeProfile.workAreaIds) return [];
        return allWorkAreas.filter(area => employeeProfile.workAreaIds.includes(area.id));
    }, [employeeProfile, allWorkAreas]);

    // NUOVA CONDIZIONE: controlla se è già stata registrata una pausa
    const hasPauseBeenTaken = activeEntry?.pauses && activeEntry.pauses.length > 0;

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;
    if (!employeeProfile) return <div className="min-h-screen flex items-center justify-center">Profilo non trovato. Contatta l'amministratore. <button onClick={handleLogout}>Logout</button></div>;

    return (
        <div className="p-4 max-w-lg mx-auto font-sans">
            <CompanyLogo />
            <div className="text-center my-4">
                <p>Dipendente: {employeeProfile.name} {employeeProfile.surname}</p>
                <p className="text-3xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                <p className="text-sm text-gray-500">{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-2">Stato Timbratura</h2>
                {activeEntry ? (
                    <div>
                        <p className="text-green-600 font-semibold">Timbratura ATTIVA</p>
                        <p>Area: {workAreaName}</p>
                        <div className="flex gap-2 mt-4">
                            {/* IL PULSANTE APPARE SOLO SE NON È STATA PRESA LA PAUSA */}
                            {!hasPauseBeenTaken && (
                                <button onClick={() => handleAction('clockPause')} disabled={isProcessing} className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
                                    Timbra Pausa
                                </button>
                            )}
                            <button onClick={() => handleAction('clockOut')} disabled={isProcessing} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
                                Timbra Uscita
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-red-600 font-semibold">Timbratura NON ATTIVA</p>
                        <select id="areaSelect" className="w-full p-2 border rounded mt-2" defaultValue="">
                            <option value="" disabled>Seleziona la tua area...</option>
                            {employeeWorkAreas.map(area => (
                                <option key={area.id} value={area.id}>{area.name}</option>
                            ))}
                        </select>
                        <button onClick={() => handleAction('clockIn', document.getElementById('areaSelect').value)} disabled={isProcessing} className="w-full mt-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                            Timbra Entrata
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