import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, Timestamp, deleteDoc, doc } from 'firebase/firestore'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import ExpenseModal from './ExpenseModal';

// --- MOTIVI DI MANCATA PAUSA ---
const PAUSE_REASONS = [
    { code: '01', reason: 'Mancata pausa per intervento urgente.' },
    { code: '02', reason: 'Mancata pausa per ore non complete.' },
    { code: '03', reason: 'Mancata pausa per richiesta cantiere.' },
    { code: '04', reason: 'Altro... (specificare).' }
];

// --- STILI CSS ---
const styles = {
    container: { 
        minHeight: '100vh', 
        backgroundColor: '#f0f2f5', 
        display: 'flex', 
        flexDirection: 'column', 
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        boxSizing: 'border-box' 
    },
    headerOuter: { 
        backgroundColor: '#ffffff', 
        borderBottom: '1px solid #e8e8e8', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        boxSizing: 'border-box' 
    },
    headerInner: {
        width: '100%',
        maxWidth: '500px', 
        padding: '8px 15px', 
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr', 
        alignItems: 'center',
        position: 'relative',
        boxSizing: 'border-box' 
    },
    headerCenter: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
    },
    logo: { height: '40px', objectFit: 'contain', marginBottom: '2px' }, 
    companyName: { fontWeight: '900', color: '#001529', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase' }, 
    logoutBtn: { 
        justifySelf: 'end',
        backgroundColor: '#fff1f0', 
        border: '1px solid #ffccc7', 
        color: '#f5222d', 
        padding: '6px 12px', 
        borderRadius: '6px', 
        cursor: 'pointer', 
        fontWeight: 'bold', 
        fontSize: '0.75rem',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap' 
    },
    body: { 
        flex: 1, 
        padding: '15px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        maxWidth: '500px', 
        margin: '0 auto', 
        width: '100%',
        boxSizing: 'border-box'
    },
    clockCard: { backgroundColor: '#fff', padding: '10px', borderRadius: '12px', textAlign: 'center', width: '100%', marginBottom: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', boxSizing: 'border-box' },
    clockTime: { fontSize: '2.8rem', fontWeight: '800', color: '#1890ff', lineHeight: 1, marginBottom: '2px', letterSpacing: '-1px' }, 
    clockDate: { color: '#8c8c8c', fontSize: '0.85rem', textTransform: 'capitalize', fontWeight: '500' },
    employeeName: { marginTop: '4px', color: '#262626', fontWeight: '600', fontSize: '0.95rem' },
    
    compactInfoLine: {
        width: '100%',
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '15px', 
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid', 
        backgroundColor: '#fff',
        display: 'grid', 
        gridTemplateColumns: '1fr auto 1fr', 
        alignItems: 'center',
        color: '#333',
        boxSizing: 'border-box'
    },
    infoColLeft: { textAlign: 'right', paddingRight: '10px' },
    infoColCenter: { color: '#d9d9d9' },
    infoColRight: { textAlign: 'left', paddingLeft: '10px' },

    statusBox: { padding: '5px', borderRadius: '6px', marginBottom: '10px', width: '100%', textAlign: 'center', fontWeight: '600', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', boxSizing: 'border-box' },
    
    btnBig: { 
        width: '100%', 
        padding: '22px', 
        fontSize: '1.3rem', 
        fontWeight: '700', 
        border: 'none', 
        borderRadius: '12px', 
        cursor: 'pointer', 
        color: '#fff', 
        boxShadow: '0 4px 10px rgba(0,0,0,0.15)', 
        transition: 'transform 0.1s, filter 0.2s', 
        marginBottom: '10px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: '10px',
        boxSizing: 'border-box'
    },
    btnGreen: { backgroundColor: '#52c41a', backgroundImage: 'linear-gradient(to bottom right, #73d13d, #52c41a)' },
    btnRed: { backgroundColor: '#ff4d4f', backgroundImage: 'linear-gradient(to bottom right, #ff7875, #ff4d4f)' },
    btnOrange: { backgroundColor: '#faad14', backgroundImage: 'linear-gradient(to bottom right, #ffc53d, #faad14)' },
    btnBlue: { backgroundColor: '#1890ff', backgroundImage: 'linear-gradient(to bottom right, #40a9ff, #1890ff)' },
    btnTeal: { backgroundColor: '#13c2c2', backgroundImage: 'linear-gradient(to bottom right, #36cfc9, #13c2c2)' },
    btnDisabled: { backgroundColor: '#f5f5f5', color: '#b8b8b8', cursor: 'not-allowed', boxShadow: 'none', backgroundImage: 'none', border: '1px solid #d9d9d9' },
    
    reportSection: { 
        marginTop: '25px', 
        backgroundColor: '#fff', 
        padding: '20px', 
        borderRadius: '12px', 
        width: '100%', 
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)', 
        border: '1px solid #f0f0f0', 
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px' 
    },
    selectContainer: { display: 'flex', gap: '10px', width: '100%' },
    select: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', fontSize: '1rem', backgroundColor: '#fff', outline: 'none', height: '45px' },
    btnReport: { width: '100%', padding: '12px', fontSize: '1rem', fontWeight: '700', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#fff', backgroundColor: '#595959', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    
    footer: { marginTop: 'auto', textAlign: 'center', padding: '20px', color: '#8c8c8c', fontSize: '0.8rem', lineHeight: '1.5', boxSizing: 'border-box' }
};

// Modale e Overlay Styles
const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
const modalStyle = { backgroundColor: '#ffffff', width: '90%', maxWidth: '500px', maxHeight: '80vh', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };

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
    try {
        const audio = new Audio(`/sounds/${soundName}.mp3`);
        audio.play().catch(err => { console.log("Audio bloccato:", err); });
    } catch (e) { console.error("Errore audio:", e); }
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

    // STATI STORICO SPESE
    const [showExpenseHistory, setShowExpenseHistory] = useState(false);
    const [myExpenses, setMyExpenses] = useState([]);
    const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);

    const functions = getFunctions(undefined, 'europe-west1');
    const clockIn = httpsCallable(functions, 'clockEmployeeIn');
    const clockOut = httpsCallable(functions, 'clockEmployeeOut');
    const applyAutoPauseEmployee = httpsCallable(functions, 'applyAutoPauseEmployee');
    const deviceId = localStorage.getItem('marcatempoDeviceId') || "UNKNOWN";

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        playSound('app_open'); 
        return () => clearInterval(timer);
    }, []);

    // Listener Ultima Timbratura
    useEffect(() => {
        if (!employeeData?.id) return;
        const qLast = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), orderBy("clockInTime", "desc"), limit(1));
        const unsub = onSnapshot(qLast, (snap) => {
            if (!snap.empty) {
                const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
                setLastEntry(data);
                if (data.status === 'clocked-in') setActiveEntry(data);
                else setActiveEntry(null);
            } else { setLastEntry(null); setActiveEntry(null); }
        });
        return () => unsub();
    }, [employeeData]);

    // Listener Statistiche Oggi
    useEffect(() => {
        if (!employeeData?.id || !lastEntry) { setRawTodayEntries([]); return; }
        const lastEntryDate = lastEntry.clockInTime.toDate();
        const startOfReferenceDay = new Date(lastEntryDate); startOfReferenceDay.setHours(0, 0, 0, 0);
        const endOfReferenceDay = new Date(startOfReferenceDay); endOfReferenceDay.setDate(endOfReferenceDay.getDate() + 1);
        const qStats = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("clockInTime", ">=", Timestamp.fromDate(startOfReferenceDay)), where("clockInTime", "<", Timestamp.fromDate(endOfReferenceDay)));
        const unsub = onSnapshot(qStats, (snapshot) => { setRawTodayEntries(snapshot.docs.map(doc => doc.data())); });
        return () => unsub();
    }, [employeeData, lastEntry]); 

    // Calcolo Totale Ore
    useEffect(() => {
        if (!rawTodayEntries || rawTodayEntries.length === 0) { setDailyTotalString("0h 0m"); return; }
        let totalMillis = 0;
        const now = new Date();
        rawTodayEntries.forEach(data => {
            const start = data.clockInTime.toDate();
            const end = data.clockOutTime ? data.clockOutTime.toDate() : (data.status === 'clocked-in' ? now : null);
            if (end) {
                let duration = end - start;
                if (data.pauses) {
                    data.pauses.forEach(p => {
                        const pStart = p.start.toDate();
                        const pEnd = p.end ? p.end.toDate() : (data.status === 'clocked-in' ? now : null);
                        if (pEnd) duration -= (pEnd - pStart);
                    });
                }
                if (duration > 0) totalMillis += duration;
            }
        });
        const totalMinutes = Math.floor(totalMillis / 60000);
        setDailyTotalString(`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`);
    }, [rawTodayEntries, currentTime]);

    const pauseStatus = useMemo(() => {
        if (!activeEntry) return 'NONE';
        const pauses = activeEntry.pauses || [];
        const isActive = pauses.some(p => p.start && !p.end);
        const isCompleted = pauses.some(p => p.start && p.end);
        if (isActive) return 'ACTIVE'; if (isCompleted) return 'COMPLETED'; return 'NONE';
    }, [activeEntry]);

    const isWorking = activeEntry && pauseStatus !== 'ACTIVE';
    const isOnPause = pauseStatus === 'ACTIVE';
    const isOut = !activeEntry;

    // GPS Logic
    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    const isGpsRequired = employeeData?.controlloGpsRichiesto ?? true;

    useEffect(() => {
        if (!isGpsRequired || employeeWorkAreas.length === 0) { setGpsLoading(false); return; }
        const success = (pos) => {
            const { latitude, longitude } = pos.coords;
            let found = null;
            for (const area of employeeWorkAreas) {
                if (area.latitude && area.longitude && area.radius) {
                    const dist = getDistanceInMeters(latitude, longitude, area.latitude, area.longitude);
                    if (dist <= area.radius) { found = area; break; }
                }
            }
            setInRangeArea(found); setLocationError(null); setGpsLoading(false);
        };
        const error = () => { setLocationError("Attiva il GPS!"); setInRangeArea(null); setGpsLoading(false); };
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(success, error, { enableHighAccuracy: true });
            return () => navigator.geolocation.clearWatch(watchId);
        } else { setLocationError("GPS non supportato"); setGpsLoading(false); }
    }, [employeeWorkAreas, isGpsRequired]);

    // Azioni Timbratura
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
                    const confirmExit = window.confirm(`ATTENZIONE: Pausa di ${pauseDuration} min non rilevata.\nVuoi uscire senza pausa?`);
                    if (confirmExit) {
                        const reasonOptions = PAUSE_REASONS.map((r, i) => `${i + 1} - ${r.reason}`).join('\n');
                        const selectedCode = window.prompt(`Seleziona motivo (1-${PAUSE_REASONS.length}):\n\n${reasonOptions}`);
                        if (selectedCode === null) { setIsProcessing(false); return; }
                        const selectedIndex = parseInt(selectedCode) - 1; 
                        const selectedReason = PAUSE_REASONS[selectedIndex];
                        if (!selectedReason) { alert("Motivo non valido"); setIsProcessing(false); return; }
                        finalReasonCode = selectedReason.code;
                        if (selectedReason.code === '04') { 
                            finalNoteText = window.prompt("Specifica motivo:");
                            if (!finalNoteText) { alert("Specifica obbligatoria"); setIsProcessing(false); return; }
                        } else { finalNoteText = selectedReason.reason; }
                    } else { setIsProcessing(false); return; }
                }
                const res = await clockOut({ deviceId, isGpsRequired, note: finalNoteText, pauseSkipReason: finalReasonCode });
                if (!res.data.success) { alert(res.data.message); } else { playSound('clock_out'); alert('Uscita registrata.'); }
            }
        } catch (e) { alert(e.message || "Errore"); } finally { setIsProcessing(false); }
    };

    // --- FUNZIONE EXPORT PDF (CAPACITOR SPECIFICA) ---
    const handleExportPDF = async () => {
        setIsGeneratingPdf(true);
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedMonth === 11 ? selectedYear + 1 : selectedYear, selectedMonth === 11 ? 0 : selectedMonth + 1, 1); 
            const q = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("clockInTime", ">=", Timestamp.fromDate(startDate)), where("clockInTime", "<", Timestamp.fromDate(endDate)), orderBy("clockInTime", "asc"));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { alert("Nessun dato."); setIsGeneratingPdf(false); return; }
            const rows = []; let totalMins = 0;
            snapshot.forEach(doc => {
                const d = doc.data(); const start = d.clockInTime.toDate(); const end = d.clockOutTime ? d.clockOutTime.toDate() : null; const area = allWorkAreas.find(a => a.id === d.workAreaId)?.name || 'N/D';
                let worked = end ? Math.round((end - start) / 60000) : 0; let pMins = 0;
                if (d.pauses) d.pauses.forEach(p => { if (p.start && p.end) pMins += Math.round((p.end.toMillis() - p.start.toMillis()) / 60000); });
                worked -= pMins; if (worked > 0) totalMins += worked;
                rows.push([start.toLocaleDateString(), start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), end ? end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-', pMins > 0 ? `${pMins}'` : '-', worked > 0 ? `${Math.floor(worked/60)}:${(worked%60).toString().padStart(2,'0')}` : '-', area]);
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
            const pdfOutput = docPDF.output('datauristring'); const base64Data = pdfOutput.split(',')[1]; const fileName = `Report_${employeeData.surname}_${selectedMonth+1}_${selectedYear}.pdf`;
            await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Documents });
            alert(`✅ PDF Salvato!\nLo trovi nella cartella "Documenti" del telefono con nome:\n${fileName}`);
        } catch (e) { alert("Errore generazione PDF: " + e.message); } finally { setIsGeneratingPdf(false); }
    };

    // --- LOGICA SPESE (CORRETTA) ---
    const handleViewExpenses = async () => {
        setIsLoadingExpenses(true);
        setShowExpenseHistory(true);
        try {
            // FIX: Usiamo employeeData.userId (che nel tuo DB è "Hke...")
            // Se per qualche motivo userId non c'è, usa id come fallback
            const targetUserId = employeeData.userId || employeeData.id;

            const q = query(
                collection(db, "employee_expenses"), 
                where("userId", "==", targetUserId) // <--- ECCO LA CORREZIONE
            );
            const snapshot = await getDocs(q);
            const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Ordinamento manuale lato client
            expenses.sort((a, b) => {
                const dateA = a.date?.toDate() || 0;
                const dateB = b.date?.toDate() || 0;
                return dateB - dateA;
            });

            setMyExpenses(expenses);
        } catch (error) {
            console.error("Errore caricamento spese:", error);
            alert("Errore caricamento spese");
        } finally {
            setIsLoadingExpenses(false);
        }
    };

    const handleDeleteExpense = async (expenseId) => {
        if (!window.confirm("Vuoi eliminare questa spesa?")) return;
        try {
            await deleteDoc(doc(db, "employee_expenses", expenseId));
            setMyExpenses(prev => prev.filter(e => e.id !== expenseId));
        } catch (error) {
            alert("Errore eliminazione");
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.headerOuter}>
                <div style={styles.headerInner}>
                    <div></div>
                    <div style={styles.headerCenter}>
                        <img src="/icon-192x192.png" alt="LOGO" style={styles.logo} onError={(e) => { e.target.style.display='none'; }} />
                        <span style={styles.companyName}>MARCATEMPO</span>
                    </div>
                    <button style={styles.logoutBtn} onClick={handleLogout}>Esci</button>
                </div>
            </div>
            <div style={styles.body}>
                <div style={styles.clockCard}>
                    <div style={styles.clockDate}>{currentTime.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                    <div style={styles.clockTime}>{currentTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div style={styles.employeeName}>{employeeData.name} {employeeData.surname}</div>
                </div>
                
                <div style={{...styles.statusBox, backgroundColor: gpsLoading?'#fffbe6':inRangeArea?'#f6ffed':'#fff1f0', color: gpsLoading?'#d48806':inRangeArea?'#389e0d':'#cf1322', border:`1px solid ${gpsLoading?'#ffe58f':inRangeArea?'#b7eb8f':'#ffa39e'}`}}>
                    {gpsLoading ? "📡 Ricerca GPS..." : locationError ? `⚠️ ${locationError}` : inRangeArea ? `✅ Zona: ${inRangeArea.name}` : isGpsRequired ? "❌ Fuori Zona" : "ℹ️ GPS Opzionale"}
                </div>

                {activeEntry && (
                    <div style={{...styles.compactInfoLine, backgroundColor:'#e6f7ff', borderColor:'#91d5ff', color:'#0050b3'}}>
                        <div style={styles.infoColLeft}>🟢 Entrata: <strong>{activeEntry.clockInTime.toDate().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})}</strong></div>
                        <div style={styles.infoColCenter}>|</div>
                        <div style={styles.infoColRight}>⏱️ Tot: <strong>{dailyTotalString}</strong></div>
                    </div>
                )}

                {isOut && lastEntry && (
                    <div style={{...styles.compactInfoLine, backgroundColor:'#fff1f0', borderColor:'#ffccc7', color:'#cf1322'}}>
                        <div style={styles.infoColLeft}>🔴 Uscita: <strong>{lastEntry.clockOutTime ? lastEntry.clockOutTime.toDate().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : '--:--'}</strong></div>
                        <div style={styles.infoColCenter}>|</div>
                        <div style={styles.infoColRight}>⏱️ Tot: <strong>{dailyTotalString}</strong></div>
                    </div>
                )}

                {isOut && (
                    <>
                        {!isGpsRequired && (
                            <select style={styles.select} value={manualAreaId} onChange={(e)=>setManualAreaId(e.target.value)}>
                                <option value="">-- Seleziona Cantiere --</option>
                                {employeeWorkAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        )}
                        <button style={{...styles.btnBig, ...(isProcessing || (isGpsRequired && !inRangeArea) ? styles.btnDisabled : styles.btnGreen)}} disabled={isProcessing || (isGpsRequired && !inRangeArea)} onClick={() => handleAction('clockIn')}>
                            <span>🕒</span> TIMBRA ENTRATA
                        </button>
                    </>
                )}
                
                {isWorking && (
                    <div style={{display:'flex', gap:'15px', width:'100%'}}>
                        <button style={{...styles.btnBig, ...(isProcessing || pauseStatus === 'COMPLETED' ? styles.btnDisabled : styles.btnOrange), flex:1, fontSize:'1rem'}} disabled={isProcessing || pauseStatus === 'COMPLETED'} onClick={() => handleAction('clockPause')}>
                            {pauseStatus === 'COMPLETED' ? 'PAUSA OK' : '☕ PAUSA'}
                        </button>
                        <button style={{...styles.btnBig, ...styles.btnRed, flex:1, fontSize:'1rem'}} disabled={isProcessing} onClick={() => handleAction('clockOut')}>
                            🚪 USCITA
                        </button>
                    </div>
                )}
                
                {isOnPause && (
                    <button style={{...styles.btnBig, ...styles.btnBlue}} disabled={isProcessing} onClick={() => handleAction('clockPause')}>▶️ FINE PAUSA</button>
                )}

                {/* --- SEZIONE SPESE --- */}
                <div style={{width:'100%', marginTop:'10px', display:'flex', flexDirection:'column', gap:'10px'}}>
                    <ExpenseModal user={user} employeeData={employeeData} />
                    <button style={{...styles.btnBig, ...styles.btnTeal, padding:'15px', fontSize:'1rem'}} onClick={handleViewExpenses}>
                        📜 I Miei Rimborsi
                    </button>
                </div>

                <div style={styles.reportSection}>
                    <div style={{fontSize:'1rem', fontWeight:'bold', color:'#595959', textAlign:'center'}}>📄 Scarica Report Ore</div>
                    <div style={styles.selectContainer}>
                        <select style={styles.select} value={selectedMonth} onChange={(e)=>setSelectedMonth(parseInt(e.target.value))}>
                            {["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"].map((m,i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <select style={{...styles.select}} value={selectedYear} onChange={(e)=>setSelectedYear(parseInt(e.target.value))}>
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button style={styles.btnReport} onClick={handleExportPDF} disabled={isGeneratingPdf}>
                        {isGeneratingPdf ? 'GENERAZIONE PDF...' : '⬇️ SCARICA PDF'}
                    </button>
                </div>
            </div>
            <div style={styles.footer}>
                TCS Italia App v2.1<br/>
                Creato da D. Leoncino
            </div>

            {/* MODALE STORICO SPESE */}
            {showExpenseHistory && (
                <>
                    <div style={overlayStyle} onClick={() => setShowExpenseHistory(false)} />
                    <div style={containerStyle}>
                        <div style={modalStyle}>
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#111827' }}>💰 I Miei Rimborsi</h3>
                                <button onClick={() => setShowExpenseHistory(false)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#9ca3af', cursor: 'pointer' }}>&times;</button>
                            </div>
                            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                                {isLoadingExpenses ? (
                                    <p style={{ textAlign: 'center', color: '#6b7280' }}>Caricamento...</p>
                                ) : myExpenses.length === 0 ? (
                                    <p style={{ textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>Nessuna spesa registrata.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {myExpenses.map(expense => (
                                            <div key={expense.id} style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                                        {expense.date && expense.date.toDate ? expense.date.toDate().toLocaleDateString() : 'N/D'}
                                                    </span>
                                                    <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                                                        <span style={{ 
                                                            fontSize: '0.75rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase',
                                                            backgroundColor: expense.status === 'approved' ? '#def7ec' : expense.status === 'rejected' ? '#fde8e8' : '#fef3c7',
                                                            color: expense.status === 'approved' ? '#03543f' : expense.status === 'rejected' ? '#9b1c1c' : '#92400e'
                                                        }}>
                                                            {expense.status === 'approved' ? 'Approvato' : expense.status === 'rejected' ? 'Rifiutato' : 'In Attesa'}
                                                        </span>
                                                        {expense.status === 'pending' && (
                                                            <button 
                                                                onClick={() => handleDeleteExpense(expense.id)}
                                                                style={{border:'none', background:'transparent', cursor:'pointer', fontSize:'1rem'}}
                                                            >🗑️</button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#1f2937', fontSize:'0.95rem' }}>{expense.description || 'Spesa'}</span>
                                                    <span style={{ fontWeight: 'bold', color: '#4f46e5', fontSize:'1rem' }}>€ {Number(expense.amount).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', textAlign:'right' }}>
                                <button onClick={() => setShowExpenseHistory(false)} style={{ padding: '10px 20px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: 'bold' }}>Chiudi</button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
export default SimpleEmployeeApp;