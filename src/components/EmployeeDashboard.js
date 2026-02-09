import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp, limit, deleteDoc, doc, updateDoc, addDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MIN_REENTRY_DELAY_MINUTES = 30; 

function getOrGenerateDeviceId() {
    let deviceId = localStorage.getItem('marcatempoDeviceId'); 
    if (!deviceId) {
        deviceId = (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)).toUpperCase();
        localStorage.setItem('marcatempoDeviceId', deviceId);
    }
    return deviceId;
}

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

const PAUSE_REASONS = [
    { code: '01', reason: 'Mancata pausa per intervento urgente.' },
    { code: '02', reason: 'Mancata pausa per ore non complete.' },
    { code: '03', reason: 'Mancata pausa per richiesta cantiere.' },
    { code: '04', reason: 'Altro... (specificare).' }
];

// --- MODALE UNICO PER SPESE (AGGIUNGI/MODIFICA) ---
const ExpenseModalInternal = ({ show, onClose, user, employeeData, expenseToEdit }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState('Contanti');
    const [note, setNote] = useState('');
    const [file, setFile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (expenseToEdit) {
            setAmount(expenseToEdit.amount);
            setDescription(expenseToEdit.description);
            if (expenseToEdit.date && expenseToEdit.date.toDate) {
                setDate(expenseToEdit.date.toDate().toISOString().split('T')[0]);
            }
            setPaymentMethod(expenseToEdit.paymentMethod || 'Contanti');
            setNote(expenseToEdit.note || '');
            setFile(null); 
        } else {
            setAmount(''); setDescription(''); setNote(''); setFile(null); 
            setPaymentMethod('Contanti');
            setDate(new Date().toISOString().split('T')[0]);
        }
    }, [expenseToEdit, show]);

    if (!show) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        if (!amount || !description || !date) { alert("Compila i campi obbligatori."); return; }
        setIsSaving(true);
        try {
            let receiptUrl = expenseToEdit ? expenseToEdit.receiptUrl : null;
            if (file) {
                if (!storage) throw new Error("Storage non inizializzato.");
                const fileRef = ref(storage, `expenses/${user.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(fileRef, file);
                receiptUrl = await getDownloadURL(snapshot.ref);
            }

            const expenseData = {
                amount: parseFloat(amount),
                description: description,
                paymentMethod: paymentMethod,
                note: note,
                date: Timestamp.fromDate(new Date(date)),
                userId: user.uid,
                userName: employeeData ? `${employeeData.name} ${employeeData.surname}` : user.email,
                userRole: 'employee',
                receiptUrl: receiptUrl,
                status: 'pending',
                createdAt: Timestamp.now()
            };

            if (expenseToEdit) {
                await updateDoc(doc(db, "expenses", expenseToEdit.id), expenseData);
                alert("Spesa aggiornata!");
            } else {
                expenseData.createdAt = Timestamp.now();
                await addDoc(collection(db, "expenses"), expenseData);
                alert("Spesa registrata!");
            }
            onClose();
        } catch (error) {
            console.error(error); alert("Errore salvataggio: " + error.message);
        } finally { setIsSaving(false); }
    };

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm";

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={containerStyle}>
                <div 
                    style={modalStyle}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#047857' }}>
                             {expenseToEdit ? '✏️ Modifica Spesa' : '💰 Nuova Spesa'}
                        </h3>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#047857' }}>&times;</button>
                    </div>
                    <div style={{ padding: '24px' }}>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClasses} required /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Importo (€)</label><input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputClasses} required /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrizione</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Es. Carburante" className={inputClasses} required /></div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Metodo di Pagamento</label>
                                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputClasses}>
                                    <option value="Contanti">Contanti (Miei)</option>
                                    <option value="Carta Personale">Carta Personale</option>
                                    <option value="Carta Aziendale">Carta Aziendale</option>
                                    <option value="Telepass">Telepass</option>
                                    <option value="Buono Carburante">Buono Carburante</option>
                                    <option value="Altro">Altro</option>
                                </select>
                            </div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                {expenseToEdit && expenseToEdit.receiptUrl ? 'Cambia File (Opzionale)' : 'Allegato (Foto/File)'}
                            </label>
                            <input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Note</label><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Opzionale" className={`${inputClasses} resize-y min-h-[80px]`} /></div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button type="button" onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100 text-sm">Annulla</button>
                                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 disabled:opacity-50 text-sm">{isSaving ? 'Caricamento...' : 'Conferma'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeEntry, setActiveEntry] = useState(null);
    const [todaysEntries, setTodaysEntries] = useState([]);
    const [workAreaName, setWorkAreaName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPauseAttempted, setIsPauseAttempted] = useState(false); 
    const [locationError, setLocationError] = useState(null);
    const [inRangeArea, setInRangeArea] = useState(null); 
    const [manualAreaId, setManualAreaId] = useState(''); 
    const [deviceId, setDeviceId] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGenerating, setIsGenerating] = useState(false);
    const [showFormsModal, setShowFormsModal] = useState(false);
    const [availableForms, setAvailableForms] = useState([]);
    const [isLoadingForms, setIsLoadingForms] = useState(false);
    const [selectedAreaForForms, setSelectedAreaForForms] = useState('');
    
    // === SPESE ===
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
    const [showExpenseHistory, setShowExpenseHistory] = useState(false);
    const [myExpenses, setMyExpenses] = useState([]);
    const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState(null);

    const functions = getFunctions(undefined, 'europe-west1');
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee');

    const playSound = (fileName) => {
        const audioPath = `/sounds/${fileName}.mp3`;
        try { const audio = new Audio(audioPath); audio.play().catch(e => { console.warn(`Audio fallito:`, e); }); } catch (e) { console.warn("Errore Audio:", e); }
    };

    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); playSound('app_open'); return () => clearInterval(timer); }, []);
    useEffect(() => { const currentDeviceId = getOrGenerateDeviceId(); setDeviceId(currentDeviceId); }, []); 

    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    const isGpsRequired = employeeData?.controlloGpsRichiesto ?? true;

    // Logica GPS
    useEffect(() => {
        if (employeeWorkAreas.length === 0 || !isGpsRequired || !deviceId) { setLocationError(null); setInRangeArea(null); return; }
        let isMounted = true; let watchId = null;
        const handlePositionSuccess = (position) => {
            if (!isMounted) return;
            const { latitude, longitude } = position.coords;
            let foundArea = null;
            for (const area of employeeWorkAreas) {
                if (area.latitude && area.longitude && area.radius) {
                    const distance = getDistanceInMeters(latitude, longitude, area.latitude, area.longitude);
                    if (distance <= area.radius) { foundArea = area; break; }
                }
            }
            setInRangeArea(foundArea); setLocationError(null);
        };
        const handlePositionError = (error) => { if (!isMounted) return; setLocationError("Errore GPS: " + error.message); setInRangeArea(null); };
        if (navigator.geolocation) { watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); } else { setLocationError("GPS non supportato."); }
        return () => { isMounted = false; if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
    }, [employeeWorkAreas, isGpsRequired, deviceId]);

    const pauseStatus = useMemo(() => {
        const pauses = activeEntry?.pauses || [];
        let isActive = false; let isCompleted = false;
        for (const p of pauses) { if (p.start && p.end) { isCompleted = true; } else if (p.start && !p.end) { isActive = true; break; } }
        if (isActive) return 'ACTIVE'; if (isCompleted) return 'COMPLETED'; return 'NONE';
    }, [activeEntry]);
    const isInPause = pauseStatus === 'ACTIVE'; 
    useEffect(() => { if (!isInPause && isPauseAttempted) { setIsPauseAttempted(false); } }, [isInPause, isPauseAttempted]);

    // Listener Firestore
    useEffect(() => {
        if (!user?.uid || !employeeData?.id) { setActiveEntry(null); setTodaysEntries([]); setWorkAreaName(''); return; }
        let isMounted = true; 
        const qActive = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("status", "==", "clocked-in"), limit(1));
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const qTodays = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)), orderBy("clockInTime", "desc"));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => { if (isMounted && !snapshot.empty) { const entryData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() }; setActiveEntry(entryData); const area = allWorkAreas.find(a => a.id === entryData.workAreaId); setWorkAreaName(area ? area.name : 'Sconosciuta'); } else { setActiveEntry(null); setWorkAreaName(''); } });
        const unsubscribeTodays = onSnapshot(qTodays, (snapshot) => { if (isMounted) setTodaysEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
        return () => { isMounted = false; unsubscribeActive(); unsubscribeTodays(); };
    }, [user?.uid, employeeData?.id, allWorkAreas]);

    const handleAction = async (action) => {
        if (isProcessing) return; setIsProcessing(true); setLocationError(null);
        if (!deviceId) { alert("ID dispositivo non disponibile."); setIsProcessing(false); return; }
        try {
            let result;
            if (action === 'clockIn') {
                if (todaysEntries.length > 0 && todaysEntries[0].clockOutTime) {
                    const diffMins = Math.floor((new Date() - todaysEntries[0].clockOutTime.toDate()) / 60000); 
                    if (diffMins < MIN_REENTRY_DELAY_MINUTES) { alert(`⛔ Attendi ancora ${MIN_REENTRY_DELAY_MINUTES - diffMins} minuti.`); setIsProcessing(false); return; }
                }
                const areaId = isGpsRequired ? inRangeArea?.id : manualAreaId;
                if (!areaId) throw new Error(isGpsRequired ? "Entra in un'area." : "Seleziona area.");
                result = await clockIn({ areaId, note: isGpsRequired ? '' : 'Manuale', deviceId, isGpsRequired, currentLat: inRangeArea?.latitude, currentLon: inRangeArea?.longitude });
                if (result.data.success) { playSound('clock_in'); setManualAreaId(''); }
            } else if (action === 'clockOut') {
                let finalReasonCode = null; let finalNoteText = '';
                const currentArea = allWorkAreas.find(a => a.id === activeEntry.workAreaId);
                const pauseDuration = currentArea?.pauseDuration || 0;
                
                if (pauseDuration > 0 && pauseStatus !== 'COMPLETED') { 
                    if(window.confirm("Attenzione: Pausa non rilevata. Vuoi uscire senza pausa?")) {
                        const reasonCode = window.prompt(`Inserisci codice motivo (1-4):\n${PAUSE_REASONS.map((r,i)=>`${i+1}: ${r.reason}`).join('\n')}`);
                        if(!reasonCode) { setIsProcessing(false); return; }
                        finalReasonCode = PAUSE_REASONS[parseInt(reasonCode)-1]?.code || '04';
                        if(finalReasonCode === '04') finalNoteText = window.prompt("Specifica il motivo:");
                    } else { setIsProcessing(false); return; }
                }
                result = await clockOut({ deviceId, isGpsRequired, note: finalNoteText, currentLat: inRangeArea?.latitude, currentLon: inRangeArea?.longitude, pauseSkipReason: finalReasonCode });
                if (result.data.success) playSound('clock_out');
            } else if (action === 'clockPause') {
                const area = allWorkAreas.find(a => a.id === activeEntry.workAreaId);
                if (!area?.pauseDuration) throw new Error("Nessuna pausa prevista.");
                setIsPauseAttempted(true); playSound('pause_start');
                result = await applyAutoPauseEmployee({ timeEntryId: activeEntry.id, durationMinutes: area.pauseDuration, deviceId });
            }
            if (result?.data?.message && !result.data.success) alert(result.data.message);
        } catch (error) { alert("Errore: " + error.message); } finally { setIsProcessing(false); }
    };

    const handleExportPDF = async () => {
        setIsGenerating(true);
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedMonth === 11 ? selectedYear + 1 : selectedYear, selectedMonth === 11 ? 0 : selectedMonth + 1, 1); 
            const q = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("clockInTime", ">=", Timestamp.fromDate(startDate)), where("clockInTime", "<", Timestamp.fromDate(endDate)), orderBy("clockInTime", "asc"));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { alert("Nessun dato."); setIsGenerating(false); return; }
            
            const rows = []; let totalMins = 0;
            snapshot.forEach(docSnap => {
                const d = docSnap.data(); 
                const start = d.clockInTime.toDate(); 
                const end = d.clockOutTime ? d.clockOutTime.toDate() : null; 
                let pMins = 0;
                if (d.pauses) d.pauses.forEach(p => { if (p.start && p.end) pMins += Math.round((p.end.toMillis() - p.start.toMillis()) / 60000); });
                let diff = end ? Math.round((end - start) / 60000) - pMins : 0;
                if (diff > 0) totalMins += diff;
                rows.push([start.toLocaleDateString(), start.toLocaleTimeString(), end ? end.toLocaleTimeString() : '--', pMins, diff > 0 ? `${Math.floor(diff/60)}h ${diff%60}m` : '-']);
            });

            const doc = new jsPDF();
            doc.text(`Report: ${selectedMonth+1}/${selectedYear}`, 14, 20);
            autoTable(doc, { head: [['Data','In','Out','Pausa','Tot']], body: rows, startY: 30 });
            doc.text(`TOTALE: ${Math.floor(totalMins/60)}h ${totalMins%60}m`, 14, doc.lastAutoTable.finalY + 10);
            doc.save(`Report.pdf`);
        } catch (e) { alert("Errore PDF: " + e.message); } finally { setIsGenerating(false); }
    };

    const fetchAreaForms = async (areaIdToFetch) => {
        setIsLoadingForms(true);
        try {
            const q = query(collection(db, "area_forms"), where("workAreaId", "==", areaIdToFetch));
            const snapshot = await getDocs(q);
            setAvailableForms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) { console.error(error); } finally { setIsLoadingForms(false); }
    };
    const handleOpenFormsModal = () => {
        const areaId = activeEntry?.workAreaId || (employeeWorkAreas.length === 1 ? employeeWorkAreas[0].id : '');
        setSelectedAreaForForms(areaId);
        if(areaId) fetchAreaForms(areaId); else setAvailableForms([]);
        setShowFormsModal(true);
    };

    const handleViewExpenses = async () => {
        setIsLoadingExpenses(true); setShowExpenseHistory(true);
        try {
            const targetId = user.uid; 
            const q = query(collection(db, "expenses"), where("userId", "==", targetId));
            const snapshot = await getDocs(q);
            const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            expenses.sort((a, b) => (b.date?.toDate() || 0) - (a.date?.toDate() || 0));
            setMyExpenses(expenses);
        } catch (error) { console.error(error); } finally { setIsLoadingExpenses(false); }
    };

    const handleDeleteExpense = async (id) => {
        if(!window.confirm("Eliminare questa spesa?")) return;
        try {
            await deleteDoc(doc(db, "expenses", id));
            setMyExpenses(p => p.filter(e => e.id !== id));
        } catch (e) { alert("Errore: " + e.message); }
    };

    const handleEditExpense = (expense) => {
        setExpenseToEdit(expense);
        setShowAddExpenseModal(true);
        setShowExpenseHistory(false);
    };

    const handleCloseExpenseModal = () => {
        setShowAddExpenseModal(false);
        setExpenseToEdit(null); 
    };

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', maxHeight: '85vh', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };

    if (!employeeData) return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; 

    return (
        <div className="p-4 max-w-lg mx-auto font-sans bg-gray-50 min-h-screen flex flex-col">
            <CompanyLogo />
            
            <div className="text-center my-4 p-4 bg-white rounded-lg shadow-sm">
                <p>Dipendente: <span className="font-semibold">{employeeData.name} {employeeData.surname}</span></p>
                <p className="text-4xl font-bold">{currentTime.toLocaleTimeString('it-IT')}</p>
                {activeEntry && <p className="text-green-600 font-bold mt-2">Area Attuale: {workAreaName}</p>}
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Stato Posizione</h2>
                {isGpsRequired ? (
                    <>
                        {locationError && <p className="text-sm text-red-500 mt-2 text-center">{locationError}</p>}
                        {!locationError && (
                            inRangeArea ? <p className="text-base text-green-600 font-semibold mt-2 text-center">✅ Area rilevata: <br/><strong>{inRangeArea.name}</strong></p> : <p className="text-base text-gray-500 font-semibold mt-2 text-center">❌ Nessuna area nelle vicinanze o GPS in attesa.</p>
                        )}
                    </>
                ) : (
                    <p className="text-base text-blue-600 font-semibold mt-2 text-center">GPS non richiesto.</p>
                )}
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Azioni Rapide</h2>
                {!activeEntry ? (
                    <div>
                         {!isGpsRequired && (
                            <select value={manualAreaId} onChange={(e) => setManualAreaId(e.target.value)} className="w-full p-2 border rounded mb-2">
                                <option value="">-- Seleziona Area --</option>
                                {employeeWorkAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        )}
                        <button onClick={() => handleAction('clockIn')} className="w-full py-6 bg-green-600 text-white font-bold rounded shadow text-xl">🟢 ENTRATA</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleAction('clockPause')} className="py-4 bg-orange-500 text-white font-bold rounded shadow">🟡 PAUSA</button>
                        <button onClick={() => handleAction('clockOut')} className="py-4 bg-red-600 text-white font-bold rounded shadow">🔴 USCITA</button>
                    </div>
                )}
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                 <h2 className="text-xl font-bold mb-3 text-center">Spese e Rimborsi</h2>
                 <div className="flex flex-col gap-3">
                     <button onClick={() => setShowAddExpenseModal(true)} className="w-full py-2 bg-green-600 text-white font-bold rounded shadow">💰 Registra Spesa</button>
                     <button onClick={handleViewExpenses} className="w-full py-2 bg-teal-600 text-white font-bold rounded shadow">📜 Storico</button>
                 </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                 <button onClick={handleOpenFormsModal} className="w-full py-3 bg-indigo-600 text-white font-bold rounded shadow">📋 Moduli</button>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <h2 className="text-xl font-bold mb-3 text-center">Report Mensile PDF</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="border p-2 rounded">{months.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="border p-2 rounded">{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                </div>
                <button onClick={handleExportPDF} disabled={isGenerating} className="w-full py-3 bg-red-600 text-white font-bold rounded shadow">{isGenerating ? 'Generazione...' : 'Scarica PDF'}</button>
            </div>
            
            <button onClick={handleLogout} className="w-full mt-auto px-4 py-2 bg-gray-500 text-white rounded-lg">Logout</button>

            {showFormsModal && (
                <div style={overlayStyle} onClick={() => setShowFormsModal(false)}>
                    <div style={{...containerStyle, pointerEvents:'none'}}>
                        <div style={{...modalStyle, pointerEvents:'auto', padding:'20px'}}>
                            <h3>Moduli {selectedAreaForForms && '(Area Selezionata)'}</h3>
                            {isLoadingForms ? <p>Caricamento...</p> : availableForms.map(f => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block p-3 border mb-2 rounded bg-gray-50">{f.title} ↗️</a>)}
                            <button onClick={() => setShowFormsModal(false)} className="mt-4 p-2 bg-gray-200 rounded w-full">Chiudi</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modale Unico (Aggiungi/Modifica) */}
            <ExpenseModalInternal 
                show={showAddExpenseModal} 
                onClose={handleCloseExpenseModal} 
                user={user} 
                employeeData={employeeData} 
                expenseToEdit={expenseToEdit}
            />

            {showExpenseHistory && (
                <div style={overlayStyle} onClick={() => setShowExpenseHistory(false)}>
                    <div style={{...containerStyle, pointerEvents:'none'}}>
                        <div 
                            style={{...modalStyle, pointerEvents:'auto', padding:'20px'}}
                            onClick={(e) => e.stopPropagation()} 
                        >
                            <h3>I Miei Rimborsi</h3>
                            <div style={{flex:1, overflowY:'auto', margin:'10px 0'}}>
                                {isLoadingExpenses ? <p>Caricamento...</p> : myExpenses.length === 0 ? <p>Nessuna spesa.</p> : myExpenses.map(e => (
                                    <div key={e.id} className="border-b p-2 flex justify-between items-center">
                                        <div>
                                            <div className="text-xs text-gray-500">{e.date?.toDate().toLocaleDateString()}</div>
                                            <div className="font-bold">{e.description}</div>
                                            <div className="text-xs text-gray-500 italic">Pagato: {e.paymentMethod}</div>
                                            {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-500 text-xs underline">📎 Vedi File</a>}
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-blue-600">€ {e.amount}</div>
                                            <div style={{fontSize:'0.7rem', color: e.status === 'approved' ? 'green' : e.status === 'rejected' ? 'red' : 'orange'}}>{e.status}</div>
                                            
                                            {e.status === 'pending' && (
                                                <div style={{marginTop:'5px'}}>
                                                    <button onClick={()=>handleEditExpense(e)} style={{marginRight:'10px', background:'none', border:'none', cursor:'pointer', fontSize:'1.2rem'}}>✏️</button>
                                                    <button onClick={()=>handleDeleteExpense(e.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer', fontSize:'1.2rem'}}>🗑️</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={()=>setShowExpenseHistory(false)} className="mt-4 p-2 bg-gray-200 rounded w-full">Chiudi</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeDashboard;