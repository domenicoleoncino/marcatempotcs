import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { db, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, Timestamp, limit, deleteDoc, doc, updateDoc, addDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MIN_REENTRY_DELAY_MINUTES = 60; 

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

// --- MODALE UNICO PER SPESE ---
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
                updatedAt: Timestamp.now()
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

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998 };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg outline-none mb-3";

    return ReactDOM.createPortal(
        <div className="portal-root">
            <div style={overlayStyle} onClick={onClose} />
            <div style={containerStyle}>
                <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#047857' }}>
                             {expenseToEdit ? '✏️ Modifica Spesa' : '💰 Nuova Spesa'}
                        </h3>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#047857' }}>&times;</button>
                    </div>
                    <div style={{ padding: '24px' }}>
                        <form onSubmit={handleSave}>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClasses} required />
                            
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Importo (€)</label>
                            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputClasses} required />
                            
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrizione</label>
                            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Es. Carburante" className={inputClasses} required />
                            
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Metodo di Pagamento</label>
                            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputClasses}>
                                <option value="Contanti">Contanti (Miei)</option>
                                <option value="Carta Personale">Carta Personale</option>
                                <option value="Carta Aziendale">Carta Aziendale</option>
                                <option value="Telepass">Telepass</option>
                                <option value="Buono Carburante">Buono Carburante</option>
                                <option value="Altro">Altro</option>
                            </select>
                            
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Allegato (Foto/File)</label>
                            <input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])} className={inputClasses} />
                            
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Note</label>
                            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Opzionale" className={inputClasses} style={{minHeight: '80px'}} />
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-sm">Annulla</button>
                                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-green-600 text-white font-bold rounded text-sm">{isSaving ? 'Caricamento...' : 'Conferma'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>,
        document.body
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

    // === DOTAZIONI (Attrezzature e Veicoli) ===
    const [assignedEquipment, setAssignedEquipment] = useState([]);
    const [assignedVehicles, setAssignedVehicles] = useState([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [showAssets, setShowAssets] = useState(false);

    const functions = getFunctions(undefined, 'europe-west1');
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee');

    const playSound = (fileName) => {
        const audioPath = `/sounds/${fileName}.mp3`;
        try { const audio = new Audio(audioPath); audio.play().catch(() => {}); } catch (e) {}
    };

    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); playSound('app_open'); return () => clearInterval(timer); }, []);
    useEffect(() => { setDeviceId(getOrGenerateDeviceId()); }, []); 

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

    // Listener Firestore Timbrature
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

    // Listener Dotazioni (Attrezzatura e Veicoli FILTRATI)
    useEffect(() => {
        if (!employeeData?.id) return;
        let isMounted = true;
        const fetchAssets = async () => {
            setIsLoadingAssets(true);
            try {
                const qEq = query(collection(db, "equipment"), where("assignedToUserId", "==", employeeData.id), where("status", "==", "in_use"));
                const snapEq = await getDocs(qEq);
                
                const qVeh = query(collection(db, "vehicles"), where("assignedTo", "==", employeeData.id));
                const snapVeh = await getDocs(qVeh);
                const vehList = snapVeh.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                if (isMounted) {
                    setAssignedEquipment(snapEq.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                    setAssignedVehicles(vehList.filter(v => v.status === 'active' && !v.isRentalReturned));
                }
            } catch (error) {
                console.error("Errore dotazioni:", error);
            } finally {
                if (isMounted) setIsLoadingAssets(false);
            }
        };
        fetchAssets();
        return () => { isMounted = false; };
    }, [employeeData?.id]);

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

    if (!employeeData) return <div translate="no" className="min-h-screen flex items-center justify-center bg-gray-100">Caricamento...</div>;

    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1]; 

    return (
        <div translate="no" className="p-4 max-w-lg mx-auto font-sans bg-gray-50 min-h-screen flex flex-col">
            <CompanyLogo />
            
            <div className="text-center my-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                <p className="text-gray-500">Dipendente: <span className="font-semibold text-gray-800">{employeeData.name} {employeeData.surname}</span></p>
                <p className="text-4xl font-bold text-gray-800 my-2">{currentTime.toLocaleTimeString('it-IT')}</p>
                {activeEntry && <p className="text-green-600 font-bold mt-2 bg-green-50 py-1 rounded">Area Attuale: {workAreaName}</p>}
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                <h2 className="text-lg font-bold mb-3 text-center text-gray-700">Stato Posizione</h2>
                {isGpsRequired ? (
                    <>
                        {locationError && <p className="text-sm text-red-500 mt-2 text-center bg-red-50 p-2 rounded">{locationError}</p>}
                        {!locationError && (
                            inRangeArea ? <p className="text-base text-green-600 font-semibold mt-2 text-center bg-green-50 p-2 rounded">✅ Area rilevata: <br/><strong>{inRangeArea.name}</strong></p> : <p className="text-base text-gray-500 font-semibold mt-2 text-center bg-gray-50 p-2 rounded">❌ Nessuna area nelle vicinanze o GPS in attesa.</p>
                        )}
                    </>
                ) : (
                    <p className="text-base text-blue-600 font-semibold mt-2 text-center bg-blue-50 p-2 rounded">GPS non richiesto.</p>
                )}
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                <h2 className="text-lg font-bold mb-3 text-center text-gray-700">Azioni Rapide</h2>
                {!activeEntry ? (
                    <div>
                         {!isGpsRequired && (
                            <select value={manualAreaId} onChange={(e) => setManualAreaId(e.target.value)} className="w-full p-3 border rounded-lg mb-4 bg-gray-50">
                                <option value="">-- Seleziona Area --</option>
                                {employeeWorkAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        )}
                        <button onClick={() => handleAction('clockIn')} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow text-xl transition-colors">🟢 ENTRATA</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleAction('clockPause')} className="py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg shadow transition-colors">☕ PAUSA</button>
                        <button onClick={() => handleAction('clockOut')} className="py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition-colors">⏹️ USCITA</button>
                    </div>
                )}
            </div>

            {/* === SEZIONE RICHIUDIBILE: LE MIE DOTAZIONI === */}
            <div className="bg-white rounded-lg shadow-sm mb-6 overflow-hidden border border-gray-200">
                <button 
                    type="button"
                    onClick={() => setShowAssets(!showAssets)} 
                    className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors border-none cursor-pointer"
                >
                    <span className="text-lg font-bold text-gray-800">📦 Le Mie Dotazioni</span>
                    <span className="text-xl text-blue-600 font-bold">{showAssets ? '▲' : '▼'}</span>
                </button>
                
                {showAssets && (
                    <div className="p-4 border-t border-gray-100 bg-white">
                        {isLoadingAssets ? (
                            <p className="text-center text-gray-500">Caricamento...</p>
                        ) : (assignedEquipment.length === 0 && assignedVehicles.length === 0) ? (
                            <p className="text-center text-gray-500 italic">Nessuna dotazione in carico.</p>
                        ) : (
                            <div className="space-y-4">
                                {assignedVehicles.map(v => (
                                    <div key={v.id} className="bg-blue-50 p-3 rounded-lg border border-blue-100 shadow-sm">
                                        <div className="font-bold text-blue-900">🚐 {v.brand} {v.model}</div>
                                        <div className="text-xs text-blue-700 font-mono mt-1 font-bold bg-white inline-block px-2 py-1 rounded">Targa: {v.plate}</div>
                                    </div>
                                ))}
                                {assignedEquipment.map(eq => (
                                    <div key={eq.id} className="bg-orange-50 p-3 rounded-lg border border-orange-100 shadow-sm">
                                        <div className="font-bold text-orange-900">🛠️ {eq.name}</div>
                                        <div className="text-xs text-orange-700 mt-1">{eq.brand}</div>
                                        {eq.accessories && <div className="text-xs text-orange-600 italic mt-2">📦 {eq.accessories}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                 <h2 className="text-lg font-bold mb-3 text-center text-gray-700">Spese e Rimborsi</h2>
                 <div className="flex flex-col gap-3">
                     <button onClick={() => setShowAddExpenseModal(true)} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow transition-colors">💰 Registra Spesa</button>
                     <button onClick={handleViewExpenses} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow transition-colors">📜 Storico Rimborsi</button>
                 </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                 <button onClick={handleOpenFormsModal} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow transition-colors">📋 Moduli Cantiere</button>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                <h2 className="text-lg font-bold mb-3 text-center text-gray-700">Report Mensile PDF</h2>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="border p-2 rounded-lg bg-gray-50">{months.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="border p-2 rounded-lg bg-gray-50">{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                </div>
                <button onClick={handleExportPDF} disabled={isGenerating} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition-colors disabled:opacity-50">{isGenerating ? 'Generazione...' : 'Scarica PDF'}</button>
            </div>
            
            <button onClick={handleLogout} className="w-full mt-auto px-4 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-lg transition-colors border border-gray-400">Esci dall'App</button>

            {/* MODALI ESTERNI CON PORTALS */}
            {showFormsModal && ReactDOM.createPortal(
                <div className="portal-root">
                    <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',backgroundColor:'rgba(0,0,0,0.6)',zIndex:99998}} onClick={() => setShowFormsModal(false)} />
                    <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                        <div style={{backgroundColor:'#fff',width:'90%',maxWidth:'400px',borderRadius:'12px',overflow:'hidden',pointerEvents:'auto',padding:'20px'}}>
                            <h3 className="font-bold text-lg mb-4 text-center">Moduli Cantiere</h3>
                            {isLoadingForms ? <p className="text-center text-gray-500">Caricamento...</p> : availableForms.map(f => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block p-3 border border-indigo-200 mb-2 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-center">{f.title} ↗️</a>)}
                            <button onClick={() => setShowFormsModal(false)} className="mt-4 p-3 bg-gray-200 rounded-lg w-full font-bold">Chiudi</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            <ExpenseModalInternal 
                show={showAddExpenseModal} 
                onClose={handleCloseExpenseModal} 
                user={user} 
                employeeData={employeeData} 
                expenseToEdit={expenseToEdit}
            />

            {showExpenseHistory && ReactDOM.createPortal(
                <div className="portal-root">
                    <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',backgroundColor:'rgba(0,0,0,0.6)',zIndex:99998}} onClick={() => setShowExpenseHistory(false)} />
                    <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                        <div style={{backgroundColor:'#fff',width:'95%',maxWidth:'500px',borderRadius:'12px',overflow:'hidden',pointerEvents:'auto',padding:'20px', maxHeight:'80vh', display:'flex', flexDirection:'column'}} onClick={(e) => e.stopPropagation()}>
                            <h3 className="font-bold text-lg border-b pb-2 mb-2">I Miei Rimborsi</h3>
                            <div style={{flex:1, overflowY:'auto'}}>
                                {isLoadingExpenses ? <p className="text-center my-4">Caricamento...</p> : myExpenses.length === 0 ? <p className="text-center my-4 text-gray-500">Nessuna spesa.</p> : myExpenses.map(e => (
                                    <div key={e.id} className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50 flex justify-between items-center">
                                        <div>
                                            <div className="text-xs text-gray-500">{e.date?.toDate().toLocaleDateString('it-IT')}</div>
                                            <div className="font-bold text-gray-800">{e.description}</div>
                                            <div className="text-xs text-gray-500 italic">Metodo: {e.paymentMethod}</div>
                                            {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-xs underline font-bold mt-1 inline-block">📎 Apri Allegato</a>}
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-green-600 text-lg">€ {e.amount}</div>
                                            <div className={`text-xs font-bold px-2 py-1 rounded inline-block mt-1 ${e.status === 'approved' || e.status === 'paid' || e.status === 'closed' ? 'bg-green-100 text-green-700' : e.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {e.status === 'pending' ? 'IN ATTESA' : e.status === 'paid' || e.status === 'closed' ? 'SALDATO' : e.status.toUpperCase()}
                                            </div>
                                            {e.status === 'pending' && (
                                                <div className="flex justify-end gap-3 mt-2">
                                                    <button type="button" onClick={()=>handleEditExpense(e)} className="text-blue-600 text-lg border-none bg-transparent cursor-pointer">✏️</button>
                                                    <button type="button" onClick={()=>handleDeleteExpense(e.id)} className="text-red-600 text-lg border-none bg-transparent cursor-pointer">🗑️</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={()=>setShowExpenseHistory(false)} className="mt-4 p-3 bg-gray-300 hover:bg-gray-400 rounded-lg w-full font-bold">Chiudi</button>
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

export default EmployeeDashboard;
