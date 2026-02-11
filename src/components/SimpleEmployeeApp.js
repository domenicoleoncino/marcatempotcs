import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from '../firebase';
// [MODIFICA] Aggiunto updateDoc per la modifica
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, Timestamp, deleteDoc, updateDoc, doc, addDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core'; 

const PAUSE_REASONS = [
    { code: '01', reason: 'Mancata pausa per intervento urgente.' },
    { code: '02', reason: 'Mancata pausa per ore non complete.' },
    { code: '03', reason: 'Mancata pausa per richiesta cantiere.' },
    { code: '04', reason: 'Altro... (specificare).' }
];

const styles = {
    container: { minHeight: '100vh', backgroundColor: '#f0f2f5', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, sans-serif', boxSizing: 'border-box' },
    headerOuter: { backgroundColor: '#ffffff', borderBottom: '1px solid #e8e8e8', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', width: '100%', display: 'flex', justifyContent: 'center' },
    headerInner: { width: '100%', maxWidth: '500px', padding: '8px 15px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' },
    headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
    logo: { height: '40px', objectFit: 'contain', marginBottom: '2px' }, 
    companyName: { fontWeight: '900', color: '#001529', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase' }, 
    logoutBtn: { justifySelf: 'end', backgroundColor: '#fff1f0', border: '1px solid #ffccc7', color: '#f5222d', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem' },
    body: { flex: 1, padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '500px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
    clockCard: { backgroundColor: '#fff', padding: '10px', borderRadius: '12px', textAlign: 'center', width: '100%', marginBottom: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' },
    clockTime: { fontSize: '2.8rem', fontWeight: '800', color: '#1890ff', lineHeight: 1, marginBottom: '2px' }, 
    clockDate: { color: '#8c8c8c', fontSize: '0.85rem', textTransform: 'capitalize', fontWeight: '500' },
    employeeName: { marginTop: '4px', color: '#262626', fontWeight: '600', fontSize: '0.95rem' },
    compactInfoLine: { width: '100%', fontSize: '1rem', fontWeight: '600', marginBottom: '15px', padding: '12px', borderRadius: '8px', border: '1px solid', backgroundColor: '#fff', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' },
    infoColLeft: { textAlign: 'right', paddingRight: '10px' },
    infoColCenter: { color: '#d9d9d9' },
    infoColRight: { textAlign: 'left', paddingLeft: '10px' },
    statusBox: { padding: '5px', borderRadius: '6px', marginBottom: '10px', width: '100%', textAlign: 'center', fontWeight: '600', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' },
    btnBig: { width: '100%', padding: '22px', fontSize: '1.3rem', fontWeight: '700', border: 'none', borderRadius: '12px', cursor: 'pointer', color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.15)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
    btnGreen: { backgroundColor: '#52c41a' },
    btnRed: { backgroundColor: '#ff4d4f' },
    btnOrange: { backgroundColor: '#faad14' },
    btnBlue: { backgroundColor: '#1890ff' },
    btnTeal: { backgroundColor: '#13c2c2' },
    btnPurple: { backgroundColor: '#722ed1' }, 
    btnDisabled: { backgroundColor: '#f5f5f5', color: '#b8b8b8', cursor: 'not-allowed', boxShadow: 'none' },
    reportSection: { marginTop: '25px', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', width: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '12px' },
    selectContainer: { display: 'flex', gap: '10px', width: '100%' },
    select: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', fontSize: '1rem', backgroundColor: '#fff', height: '45px' },
    btnReport: { width: '100%', padding: '12px', fontSize: '1rem', fontWeight: '700', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#fff', backgroundColor: '#595959', height: '45px' },
    footer: { marginTop: 'auto', textAlign: 'center', padding: '20px', color: '#8c8c8c', fontSize: '0.8rem' }
};

const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
const modalStyle = { backgroundColor: '#ffffff', width: '90%', maxWidth: '500px', maxHeight: '80vh', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', display: 'flex', flexDirection: 'column' };

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

const playSound = (soundName) => {
    try { const audio = new Audio(`/sounds/${soundName}.mp3`); audio.play().catch(err => { console.log("Audio bloccato:", err); }); } catch (e) { console.error("Errore audio:", e); }
};

// --- MODALE UNICO PER AGGIUNGERE O MODIFICARE SPESA ---
const ExpenseModalInternal = ({ show, onClose, user, employeeData, expenseToEdit }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState('Contanti');
    const [note, setNote] = useState('');
    const [file, setFile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Effetto per popolare i campi se stiamo modificando
    useEffect(() => {
        if (expenseToEdit) {
            setAmount(expenseToEdit.amount);
            setDescription(expenseToEdit.description);
            // Gestione data: se è Timestamp converti, altrimenti usa stringa
            if (expenseToEdit.date && expenseToEdit.date.toDate) {
                setDate(expenseToEdit.date.toDate().toISOString().split('T')[0]);
            }
            setPaymentMethod(expenseToEdit.paymentMethod || 'Contanti');
            setNote(expenseToEdit.note || '');
            setFile(null); // Reset file input (l'utente ne carica uno nuovo solo se vuole cambiare)
        } else {
            // Reset se è un nuovo inserimento
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
            
            // Se l'utente ha selezionato un NUOVO file, caricalo
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
                status: 'pending', // Torna sempre pending se modificata
                updatedAt: Timestamp.now()
            };

            if (expenseToEdit) {
                // MODIFICA
                await updateDoc(doc(db, "expenses", expenseToEdit.id), expenseData);
                alert("Spesa aggiornata!");
            } else {
                // CREAZIONE
                expenseData.createdAt = Timestamp.now();
                await addDoc(collection(db, "expenses"), expenseData);
                alert("Spesa registrata!");
            }

            onClose();
        } catch (error) {
            console.error(error); alert("Errore salvataggio: " + error.message);
        } finally { setIsSaving(false); }
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={{...containerStyle, pointerEvents:'none'}}>
                <div 
                    style={{...modalStyle, pointerEvents:'auto', padding:'20px'}}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 style={{margin:'0 0 15px 0', color:'#722ed1'}}>
                        {expenseToEdit ? '✏️ Modifica Spesa' : '💰 Nuova Spesa'}
                    </h3>
                    <form onSubmit={handleSave} style={{display:'flex', flexDirection:'column', gap:'10px', overflowY:'auto'}}>
                        <input type="date" value={date} onChange={e=>setDate(e.target.value)} required style={styles.select} />
                        <input type="number" step="0.01" placeholder="Importo €" value={amount} onChange={e=>setAmount(e.target.value)} required style={styles.select} />
                        <input type="text" placeholder="Descrizione (es. Pranzo)" value={description} onChange={e=>setDescription(e.target.value)} required style={styles.select} />
                        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={styles.select}>
                            <option value="Contanti">Contanti (Miei)</option>
                            <option value="Carta Personale">Carta Personale</option>
                            <option value="Carta Aziendale">Carta Aziendale</option>
                            <option value="Telepass">Telepass</option>
                            <option value="Buono Carburante">Buono Carburante</option>
                            <option value="Altro">Altro</option>
                        </select>
                        <div style={{padding:'10px', background:'#f9f9f9', borderRadius:'8px'}}>
                            <label style={{fontSize:'0.8rem', fontWeight:'bold', display:'block', marginBottom:'5px'}}>
                                {expenseToEdit && expenseToEdit.receiptUrl ? '📸 Cambia Foto (Opzionale)' : '📸 Foto/Allegato (Opzionale)'}
                            </label>
                            <input type="file" accept="image/*,.pdf" onChange={e=>setFile(e.target.files[0])} style={{width:'100%'}} />
                            {expenseToEdit && expenseToEdit.receiptUrl && !file && (
                                <p style={{fontSize:'0.7rem', color:'green', marginTop:'5px'}}>📎 File attuale presente (non verrà modificato se non ne scegli uno nuovo)</p>
                            )}
                        </div>
                        <textarea placeholder="Note extra..." value={note} onChange={e=>setNote(e.target.value)} style={{...styles.select, minHeight:'60px'}} />
                        <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                            <button type="button" onClick={onClose} style={{flex:1, padding:'10px', borderRadius:'8px', border:'1px solid #ddd', background:'#fff'}}>Annulla</button>
                            <button type="submit" disabled={isSaving} style={{flex:1, padding:'10px', borderRadius:'8px', border:'none', background:'#722ed1', color:'#fff', fontWeight:'bold'}}>{isSaving ? 'Salvataggio...' : 'Conferma'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

const SimpleEmployeeApp = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeEntry, setActiveEntry] = useState(null);
    const [lastEntry, setLastEntry] = useState(null); 
    const [inRangeArea, setInRangeArea] = useState(null); 
    const [locationError, setLocationError] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(true);
    const [manualAreaId, setManualAreaId] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [rawTodayEntries, setRawTodayEntries] = useState([]);
    const [dailyTotalString, setDailyTotalString] = useState('...');
    
    // Stati Spese
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showExpenseHistory, setShowExpenseHistory] = useState(false);
    const [myExpenses, setMyExpenses] = useState([]);
    const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState(null); // STATO PER LA MODIFICA

    const functions = getFunctions(undefined, 'europe-west1');
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee');
    const deviceId = localStorage.getItem('marcatempoDeviceId') || "UNKNOWN";

    useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); playSound('app_open'); return () => clearInterval(timer); }, []);

    useEffect(() => {
        if (!employeeData?.id) return;
        const qLast = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), orderBy("clockInTime", "desc"), limit(1));
        return onSnapshot(qLast, (snap) => {
            if (!snap.empty) { const data = { id: snap.docs[0].id, ...snap.docs[0].data() }; setLastEntry(data); if (data.status === 'clocked-in') setActiveEntry(data); else setActiveEntry(null); } else { setLastEntry(null); setActiveEntry(null); }
        });
    }, [employeeData]);

    useEffect(() => {
        if (!employeeData?.id || !lastEntry) { setRawTodayEntries([]); return; }
        const lastEntryDate = lastEntry.clockInTime.toDate(); const startOfReferenceDay = new Date(lastEntryDate); startOfReferenceDay.setHours(0, 0, 0, 0); const endOfReferenceDay = new Date(startOfReferenceDay); endOfReferenceDay.setDate(endOfReferenceDay.getDate() + 1);
        const qStats = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("clockInTime", ">=", Timestamp.fromDate(startOfReferenceDay)), where("clockInTime", "<", Timestamp.fromDate(endOfReferenceDay)));
        return onSnapshot(qStats, (snapshot) => { setRawTodayEntries(snapshot.docs.map(doc => doc.data())); });
    }, [employeeData, lastEntry]); 

    useEffect(() => {
        if (!rawTodayEntries || rawTodayEntries.length === 0) { setDailyTotalString("0h 0m"); return; }
        let totalMillis = 0; const now = new Date();
        rawTodayEntries.forEach(data => {
            const start = data.clockInTime.toDate(); const end = data.clockOutTime ? data.clockOutTime.toDate() : (data.status === 'clocked-in' ? now : null);
            if (end) {
                let duration = end - start;
                if (data.pauses) { data.pauses.forEach(p => { const pStart = p.start.toDate(); const pEnd = p.end ? p.end.toDate() : (data.status === 'clocked-in' ? now : null); if (pEnd) duration -= (pEnd - pStart); }); }
                if (duration > 0) totalMillis += duration;
            }
        });
        const totalMinutes = Math.floor(totalMillis / 60000); setDailyTotalString(`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`);
    }, [rawTodayEntries, currentTime]);

    const pauseStatus = useMemo(() => {
        if (!activeEntry) return 'NONE';
        const pauses = activeEntry.pauses || [];
        const isActive = pauses.some(p => p.start && !p.end); const isCompleted = pauses.some(p => p.start && p.end);
        if (isActive) return 'ACTIVE'; if (isCompleted) return 'COMPLETED'; return 'NONE';
    }, [activeEntry]);

    const isWorking = activeEntry && pauseStatus !== 'ACTIVE';
    const isOnPause = pauseStatus === 'ACTIVE';
    const isOut = !activeEntry;

    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    const isGpsRequired = employeeData?.controlloGpsRichiesto ?? true;

    useEffect(() => {
        if (!isGpsRequired || employeeWorkAreas.length === 0) { setGpsLoading(false); return; }
        const success = (pos) => {
            const { latitude, longitude } = pos.coords; let found = null;
            for (const area of employeeWorkAreas) { if (area.latitude && area.longitude && area.radius) { const dist = getDistanceInMeters(latitude, longitude, area.latitude, area.longitude); if (dist <= area.radius) { found = area; break; } } }
            setInRangeArea(found); setLocationError(null); setGpsLoading(false);
        };
        const error = () => { setLocationError("Attiva il GPS!"); setInRangeArea(null); setGpsLoading(false); };
        if (navigator.geolocation) { const watchId = navigator.geolocation.watchPosition(success, error, { enableHighAccuracy: true }); return () => navigator.geolocation.clearWatch(watchId); } else { setLocationError("GPS non supportato"); setGpsLoading(false); }
    }, [employeeWorkAreas, isGpsRequired]);

    const handleAction = async (action) => {
        setIsProcessing(true);
        try {
            if (action === 'clockIn') {
                const areaId = isGpsRequired ? inRangeArea?.id : manualAreaId;
                if (!areaId) throw new Error("Seleziona Area");
                const res = await clockIn({ areaId, deviceId, isGpsRequired, note: !isGpsRequired ? 'Manuale da App' : '' });
                if (!res.data.success) { alert(res.data.message); } else { playSound('clock_in'); setManualAreaId(''); }
            } else if (action === 'clockPause') {
                const area = allWorkAreas.find(a => a.id === activeEntry.workAreaId);
                if (!area?.pauseDuration) throw new Error("No Pausa");
                const res = await applyAutoPauseEmployee({ timeEntryId: activeEntry.id, durationMinutes: area.pauseDuration, deviceId });
                if (!res.data.success) { alert(res.data.message); } else { playSound('pause_start'); }
            } else if (action === 'clockOut') {
                let finalReasonCode = null; let finalNoteText = '';
                const area = allWorkAreas.find(a => a.id === activeEntry.workAreaId);
                const pauseDuration = area?.pauseDuration || 0;
                if (pauseDuration > 0 && pauseStatus !== 'COMPLETED') { 
                    if (window.confirm(`ATTENZIONE: Pausa non rilevata.\nVuoi uscire senza pausa?`)) {
                        const code = window.prompt(`Seleziona motivo (1-4):\n${PAUSE_REASONS.map((r,i)=>`${i+1}-${r.reason}`).join('\n')}`);
                        if (!code) { setIsProcessing(false); return; }
                        const reason = PAUSE_REASONS[parseInt(code)-1];
                        if (!reason) { alert("Invalido"); setIsProcessing(false); return; }
                        finalReasonCode = reason.code;
                        if (reason.code === '04') { finalNoteText = window.prompt("Specifica:"); if(!finalNoteText){ alert("Obbligatorio"); setIsProcessing(false); return;} } else { finalNoteText = reason.reason; }
                    } else { setIsProcessing(false); return; }
                }
                const res = await clockOut({ deviceId, isGpsRequired, note: finalNoteText, pauseSkipReason: finalReasonCode });
                if (res.data.success) { playSound('clock_out'); alert('Uscita registrata.'); } else { alert(res.data.message); }
            }
        } catch (e) { alert(e.message); } finally { setIsProcessing(false); }
    };

    const handleExportPDF = async () => {
        setIsGeneratingPdf(true);
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedMonth === 11 ? selectedYear + 1 : selectedYear, selectedMonth === 11 ? 0 : selectedMonth + 1, 1); 
            const q = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("clockInTime", ">=", Timestamp.fromDate(startDate)), where("clockInTime", "<", Timestamp.fromDate(endDate)), orderBy("clockInTime", "asc"));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { alert("Nessun dato."); setIsGeneratingPdf(false); return; }
            
            const rows = []; let totalMins = 0;
            snapshot.forEach(docSnap => {
                const d = docSnap.data(); 
                const start = d.clockInTime.toDate(); 
                const end = d.clockOutTime ? d.clockOutTime.toDate() : null; 
                const area = allWorkAreas.find(a => a.id === d.workAreaId)?.name || 'N/D';
                let pMins = 0;
                if (d.pauses) {
                    d.pauses.forEach(p => { 
                        if (p.start && p.end) pMins += Math.round((p.end.toMillis() - p.start.toMillis()) / 60000); 
                    });
                }
                let diff = end ? Math.round((end - start) / 60000) - pMins : 0;
                if (diff > 0) totalMins += diff;
                rows.push([
                    start.toLocaleDateString(),
                    start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                    end ? end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--',
                    pMins > 0 ? `${pMins}'` : '-',
                    diff > 0 ? `${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,'0')}` : '-',
                    area
                ]);
            });

            const docPDF = new jsPDF();
            try { const img = new Image(); img.src = '/icon-192x192.png'; docPDF.addImage(img, 'PNG', 160, 10, 30, 30); } catch(e){}
            docPDF.setFontSize(22); docPDF.setFont("helvetica", "bold"); docPDF.setTextColor(24, 144, 255); docPDF.text("TCS ITALIA S.R.L.", 14, 20);
            docPDF.setFontSize(10); docPDF.setFont("helvetica", "normal"); docPDF.setTextColor(100); docPDF.text("Via Castagna III Trav. 1, Casoria (NA)", 14, 26); docPDF.text("P.IVA: 05552321217", 14, 31);
            docPDF.setDrawColor(200); docPDF.line(14, 38, 196, 38);
            docPDF.setFontSize(14); docPDF.setTextColor(0); docPDF.setFont("helvetica", "bold");
            docPDF.text(`Report: ${["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][selectedMonth]} ${selectedYear}`, 14, 50);
            docPDF.setFontSize(12); docPDF.setFont("helvetica", "normal"); docPDF.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 14, 57);
            autoTable(docPDF, { head: [['Data','In','Out','Pausa','Tot','Cantiere']], body: rows, startY: 65, theme: 'grid', headStyles:{fillColor:[24,144,255]} });
            const totalH = Math.floor(totalMins / 60); const totalM = totalMins % 60;
            docPDF.text(`TOTALE: ${totalH}:${totalM.toString().padStart(2,'0')}`, 14, docPDF.lastAutoTable.finalY + 10);
            
            const pdfOutput = docPDF.output('datauristring'); 
            const base64Data = pdfOutput.split(',')[1]; 
            const fileName = `Report_${employeeData.surname}_${selectedMonth+1}_${selectedYear}.pdf`;

            if (Capacitor.getPlatform() === 'android') {
                await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Documents });
                alert(`✅ PDF Salvato!\nLo trovi nella cartella "Documenti" con nome:\n${fileName}`);
            } else {
                docPDF.save(fileName);
            }
        } catch (e) { alert("Errore PDF: " + e.message); } finally { setIsGeneratingPdf(false); }
    };

    const handleViewExpenses = async () => {
        setIsLoadingExpenses(true); setShowExpenseHistory(true);
        try {
            const targetId = user.uid; // Usiamo UID sicuro
            const q = query(collection(db, "expenses"), where("userId", "==", targetId));
            const snapshot = await getDocs(q);
            const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            expenses.sort((a, b) => (b.date?.toDate() || 0) - (a.date?.toDate() || 0));
            setMyExpenses(expenses);
        } catch (error) { console.error(error); } finally { setIsLoadingExpenses(false); }
    };

    const handleDeleteExpense = async (id) => { 
        if(window.confirm("Eliminare?")) { 
            await deleteDoc(doc(db, "expenses", id)); 
            setMyExpenses(p=>p.filter(e=>e.id!==id)); 
        } 
    };

    // --- FUNZIONE PER APRIRE MODALE MODIFICA ---
    const handleEditExpense = (expense) => {
        setExpenseToEdit(expense);
        setShowExpenseModal(true);
        // Chiudiamo lo storico per vedere il modale
        setShowExpenseHistory(false);
    };

    const handleCloseExpenseModal = () => {
        setShowExpenseModal(false);
        setExpenseToEdit(null); // Reset modifica
        // Riapriamo lo storico se vogliamo, o lasciamo chiuso. Qui non riapriamo.
    };

    return (
        <div style={styles.container}>
            <div style={styles.headerOuter}><div style={styles.headerInner}><div></div><div style={styles.headerCenter}><img src="/icon-192x192.png" style={styles.logo} alt="LOGO" onError={(e) => e.target.style.display='none'} /><span style={styles.companyName}>MARCATEMPO TCS</span></div><button style={styles.logoutBtn} onClick={handleLogout}>Esci</button></div></div>
            <div style={styles.body}>
                <div style={styles.clockCard}>
                    <div style={styles.clockDate}>{currentTime.toLocaleDateString()}</div>
                    <div style={styles.clockTime}>{currentTime.toLocaleTimeString()}</div>
                    <div style={styles.employeeName}>{employeeData.name} {employeeData.surname}</div>
                </div>
                
                <div style={{
                    ...styles.statusBox, 
                    backgroundColor: gpsLoading ? '#fffbe6' : !isGpsRequired ? '#e6f7ff' : inRangeArea ? '#f6ffed' : '#fff1f0',
                    color: gpsLoading ? '#d48806' : !isGpsRequired ? '#0050b3' : inRangeArea ? '#389e0d' : '#cf1322',
                    border: `1px solid ${gpsLoading ? '#ffe58f' : !isGpsRequired ? '#91d5ff' : inRangeArea ? '#b7eb8f' : '#ffa39e'}`
                }}>
                    {gpsLoading ? "📡 Ricerca GPS..." : !isGpsRequired ? "ℹ️ GPS non richiesto" : locationError ? `⚠️ ${locationError}` : inRangeArea ? `✅ Zona: ${inRangeArea.name}` : "❌ Fuori zona"}
                </div>

                {activeEntry && (
                    <div style={{...styles.compactInfoLine, backgroundColor:'#e6f7ff', borderColor:'#91d5ff', color:'#0050b3'}}>
                        <div style={styles.infoColLeft}>In: <strong>{activeEntry.clockInTime.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong></div>
                        <div style={styles.infoColCenter}>|</div>
                        <div style={styles.infoColRight}>Tot: <strong>{dailyTotalString}</strong></div>
                    </div>
                )}

                {isOut && lastEntry && (
                    <div style={{...styles.compactInfoLine, backgroundColor:'#fff1f0', borderColor:'#ffccc7', color:'#cf1322'}}>
                        <div style={styles.infoColLeft}>Uscita: <strong>{lastEntry.clockOutTime ? lastEntry.clockOutTime.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</strong></div>
                        <div style={styles.infoColCenter}>|</div>
                        <div style={styles.infoColRight}>Tot: <strong>{dailyTotalString}</strong></div>
                    </div>
                )}

                {isOut && (
                    <>
                        {!isGpsRequired && (
                            <select style={styles.select} value={manualAreaId} onChange={(e) => setManualAreaId(e.target.value)}>
                                <option value="">-- Seleziona Cantiere --</option>
                                {employeeWorkAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        )}
                        <button style={{...styles.btnBig, ...styles.btnGreen}} disabled={isProcessing || (isGpsRequired && !inRangeArea)} onClick={() => handleAction('clockIn')}>🕒 ENTRATA</button>
                    </>
                )}

                {isWorking && (
                    <div style={{display:'flex', gap:'10px', width:'100%'}}>
                        <button style={{...styles.btnBig, ...(pauseStatus==='COMPLETED'?styles.btnDisabled:styles.btnOrange), flex:1}} disabled={isProcessing || pauseStatus==='COMPLETED'} onClick={() => handleAction('clockPause')}>
                            {pauseStatus === 'COMPLETED' ? 'PAUSA OK' : '☕ PAUSA'}
                        </button>
                        <button style={{...styles.btnBig, ...styles.btnRed, flex:1}} disabled={isProcessing} onClick={() => handleAction('clockOut')}>
                            🚪 USCITA
                        </button>
                    </div>
                )}

                {isOnPause && (
                    <button style={{...styles.btnBig, ...styles.btnBlue}} disabled={isProcessing} onClick={() => handleAction('clockPause')}>▶️ FINE PAUSA</button>
                )}

                <div style={{width:'100%', marginTop:'15px', display:'flex', flexDirection:'column', gap:'10px'}}>
                    <button style={{...styles.btnBig, ...styles.btnPurple, padding:'15px', fontSize:'1rem'}} onClick={() => setShowExpenseModal(true)}>💰 Registra Spesa</button>
                    <button style={{...styles.btnBig, ...styles.btnTeal, padding:'15px', fontSize:'1rem'}} onClick={handleViewExpenses}>📜 I Miei Rimborsi</button>
                </div>

                <div style={styles.reportSection}>
                    <div style={{fontWeight:'bold', color:'#595959', textAlign:'center'}}>📄 Report Ore Mensile</div>
                    <div style={styles.selectContainer}>
                        <select style={styles.select} value={selectedMonth} onChange={(e)=>setSelectedMonth(parseInt(e.target.value))}>{["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"].map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
                        <select style={styles.select} value={selectedYear} onChange={(e)=>setSelectedYear(parseInt(e.target.value))}>{[2024, 2025, 2026].map(y=><option key={y} value={y}>{y}</option>)}</select>
                    </div>
                    <button style={styles.btnReport} onClick={handleExportPDF} disabled={isGeneratingPdf}>{isGeneratingPdf ? '...' : '⬇️ SCARICA PDF'}</button>
                </div>

                {/* MODALE LISTA SPESE */}
                {showExpenseHistory && (
                    <div style={overlayStyle} onClick={() => setShowExpenseHistory(false)}>
                        <div style={{...containerStyle, pointerEvents:'none'}}>
                            {/* [FIX] stopPropagation */}
                            <div 
                                style={{...modalStyle, pointerEvents:'auto', padding:'20px'}}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3>I Miei Rimborsi</h3>
                                <div style={{flex:1, overflowY:'auto', margin:'10px 0'}}>
                                    {isLoadingExpenses ? <p>Caricamento...</p> : myExpenses.length === 0 ? <p>Nessuna spesa.</p> : myExpenses.map(e => (
                                        <div key={e.id} style={{borderBottom:'1px solid #eee', padding:'5px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <div>
                                                <div style={{fontSize:'0.8rem', color:'#666'}}>{e.date?.toDate().toLocaleDateString()}</div>
                                                <div style={{fontWeight:'bold'}}>{e.description}</div>
                                                <div style={{fontSize:'0.7rem', color:'#555', fontStyle:'italic'}}>Pagato: {e.paymentMethod}</div>
                                                {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:'0.7rem', color:'blue', textDecoration:'underline'}}>📎 Vedi Scontrino</a>}
                                            </div>
                                            <div style={{textAlign:'right'}}>
                                                <div style={{color:'#1890ff', fontWeight:'bold'}}>€ {e.amount}</div>
                                                <div style={{fontSize:'0.7rem', color: e.status === 'approved' ? 'green' : e.status === 'rejected' ? 'red' : 'orange'}}>{e.status}</div>
                                                {e.status==='pending' && (
                                                    <div style={{marginTop:'5px'}}>
                                                        {/* PULSANTE MODIFICA */}
                                                        <button onClick={()=>handleEditExpense(e)} style={{border:'none', background:'none', fontSize:'1.2rem', cursor:'pointer', marginRight:'10px'}}>✏️</button>
                                                        {/* PULSANTE ELIMINA */}
                                                        <button onClick={()=>handleDeleteExpense(e.id)} style={{color:'red', border:'none', background:'none', fontSize:'1.2rem', cursor:'pointer'}}>🗑️</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={()=>setShowExpenseHistory(false)} style={{padding:'10px', background:'#eee', borderRadius:'5px'}}>Chiudi</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODALE UNICO (CREA/MODIFICA) */}
                <ExpenseModalInternal 
                    show={showExpenseModal} 
                    onClose={handleCloseExpenseModal} 
                    user={user} 
                    employeeData={employeeData} 
                    expenseToEdit={expenseToEdit}
                />

            </div>
            <div style={styles.footer}>TCS Italia App v2.6<br/>Creato da D. Leoncino</div>
        </div>
    );
};

export default SimpleEmployeeApp;