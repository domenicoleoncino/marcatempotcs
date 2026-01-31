import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, Timestamp, deleteDoc, doc } from 'firebase/firestore'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core'; // <--- NECESSARIO PER IL "BIVIO" ANDROID/WEB
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
    const [showExpenseHistory, setShowExpenseHistory] = useState(false);
    const [myExpenses, setMyExpenses] = useState([]);
    const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);

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

    // --- FUNZIONE PDF INTELLIGENTE (ANDROID APP vs WEB) ---
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

            // --- QUI LA MAGIA: CONTROLLA DOVE SIAMO ---
            if (Capacitor.getPlatform() === 'android') {
                // SE SIAMO NELL'APP ANDROID: Salva in Documenti (come ti piace)
                await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Documents
                });
                alert(`✅ PDF Salvato!\nLo trovi nella cartella "Documenti" con nome:\n${fileName}`);
            } else {
                // SE SIAMO SU WEB (IPHONE / PC): Scarica dal browser
                docPDF.save(fileName);
            }

        } catch (e) { alert("Errore PDF: " + e.message); } finally { setIsGeneratingPdf(false); }
    };

    const handleViewExpenses = async () => {
        setIsLoadingExpenses(true); setShowExpenseHistory(true);
        try {
            const targetId = employeeData.userId || employeeData.id;
            const q = query(collection(db, "employee_expenses"), where("userId", "==", targetId));
            const snapshot = await getDocs(q);
            const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            expenses.sort((a, b) => (b.date?.toDate() || 0) - (a.date?.toDate() || 0));
            setMyExpenses(expenses);
        } catch (error) { console.error(error); } finally { setIsLoadingExpenses(false); }
    };
    const handleDeleteExpense = async (id) => { if(window.confirm("Eliminare?")) { await deleteDoc(doc(db, "employee_expenses", id)); setMyExpenses(p=>p.filter(e=>e.id!==id)); } };

    return (
        <div style={styles.container}>
            <div style={styles.headerOuter}><div style={styles.headerInner}><div></div><div style={styles.headerCenter}><img src="/icon-192x192.png" style={styles.logo} alt="LOGO" onError={(e) => e.target.style.display='none'} /><span style={styles.companyName}>MARCATEMPO TCS</span></div><button style={styles.logoutBtn} onClick={handleLogout}>Esci</button></div></div>
            <div style={styles.body}>
                <div style={styles.clockCard}>
                    <div style={styles.clockDate}>{currentTime.toLocaleDateString()}</div>
                    <div style={styles.clockTime}>{currentTime.toLocaleTimeString()}</div>
                    <div style={styles.employeeName}>{employeeData.name} {employeeData.surname}</div>
                </div>
                
                {/* --- BOX GPS --- */}
                <div style={{
                    ...styles.statusBox, 
                    backgroundColor: gpsLoading ? '#fffbe6' : !isGpsRequired ? '#e6f7ff' : inRangeArea ? '#f6ffed' : '#fff1f0',
                    color: gpsLoading ? '#d48806' : !isGpsRequired ? '#0050b3' : inRangeArea ? '#389e0d' : '#cf1322',
                    border: `1px solid ${gpsLoading ? '#ffe58f' : !isGpsRequired ? '#91d5ff' : inRangeArea ? '#b7eb8f' : '#ffa39e'}`
                }}>
                    {gpsLoading ? "📡 Ricerca GPS..." : !isGpsRequired ? "ℹ️ GPS non richiesto" : locationError ? `⚠️ ${locationError}` : inRangeArea ? `✅ Zona: ${inRangeArea.name}` : "❌ Fuori zona"}
                </div>

                {/* --- RIEPILOGO MENTRE LAVORI (Blu/Verde) --- */}
                {activeEntry && (
                    <div style={{...styles.compactInfoLine, backgroundColor:'#e6f7ff', borderColor:'#91d5ff', color:'#0050b3'}}>
                        <div style={styles.infoColLeft}>In: <strong>{activeEntry.clockInTime.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong></div>
                        <div style={styles.infoColCenter}>|</div>
                        <div style={styles.infoColRight}>Tot: <strong>{dailyTotalString}</strong></div>
                    </div>
                )}

                {/* --- RIEPILOGO DOPO USCITA (Rosso) --- */}
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
                    <ExpenseModal user={user} employeeData={employeeData} />
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

                {showExpenseHistory && (
                    <div style={overlayStyle} onClick={() => setShowExpenseHistory(false)}>
                        <div style={{...containerStyle, pointerEvents:'none'}}>
                            <div style={{...modalStyle, pointerEvents:'auto', padding:'20px'}}>
                                <h3>I Miei Rimborsi</h3>
                                <div style={{flex:1, overflowY:'auto', margin:'10px 0'}}>
                                    {isLoadingExpenses ? <p>Caricamento...</p> : myExpenses.length === 0 ? <p>Nessuna spesa.</p> : myExpenses.map(e => (
                                        <div key={e.id} style={{borderBottom:'1px solid #eee', padding:'5px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <div>
                                                <div style={{fontSize:'0.8rem', color:'#666'}}>{e.date?.toDate().toLocaleDateString()}</div>
                                                <div style={{fontWeight:'bold'}}>{e.description}</div>
                                            </div>
                                            <div style={{textAlign:'right'}}>
                                                <div style={{color:'#1890ff', fontWeight:'bold'}}>€ {e.amount}</div>
                                                <div style={{fontSize:'0.7rem'}}>{e.status}</div>
                                                {e.status==='pending' && <button onClick={()=>handleDeleteExpense(e.id)} style={{color:'red', border:'none', background:'none'}}>🗑️</button>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={()=>setShowExpenseHistory(false)} style={{padding:'10px', background:'#eee', borderRadius:'5px'}}>Chiudi</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div style={styles.footer}>TCS Italia App v2.2<br/>Creato da D. Leoncino</div>
        </div>
    );
};

export default SimpleEmployeeApp;