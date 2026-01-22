import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, Timestamp, limit, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';

// --- MOTIVI DI MANCATA PAUSA (Presi dal tuo EmployeeDashboard.js) ---
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
        padding: '10px 20px', 
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
    logo: { height: '55px', objectFit: 'contain', marginBottom: '4px' }, 
    companyName: { fontWeight: '900', color: '#001529', fontSize: '0.9rem', letterSpacing: '1.5px', textTransform: 'uppercase' }, 
    logoutBtn: { 
        justifySelf: 'end',
        backgroundColor: '#fff1f0', 
        border: '1px solid #ffccc7', 
        color: '#f5222d', 
        padding: '8px 16px', 
        borderRadius: '8px', 
        cursor: 'pointer', 
        fontWeight: 'bold', 
        fontSize: '0.85rem',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap' 
    },
    body: { 
        flex: 1, 
        padding: '20px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        maxWidth: '500px', 
        margin: '0 auto', 
        width: '100%',
        boxSizing: 'border-box'
    },
    clockCard: { backgroundColor: '#fff', padding: '20px', borderRadius: '15px', textAlign: 'center', width: '100%', marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', boxSizing: 'border-box' },
    clockTime: { fontSize: '3rem', fontWeight: '800', color: '#1890ff', lineHeight: 1, marginBottom: '5px', letterSpacing: '-1px' }, 
    clockDate: { color: '#8c8c8c', fontSize: '1rem', textTransform: 'capitalize', fontWeight: '500' },
    employeeName: { marginTop: '8px', color: '#262626', fontWeight: '600', fontSize: '0.95rem' },
    statusBox: { padding: '12px', borderRadius: '10px', marginBottom: '25px', width: '100%', textAlign: 'center', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxSizing: 'border-box' },
    btnBig: { 
        width: '100%', 
        padding: '22px', 
        fontSize: '1.2rem', 
        fontWeight: '700', 
        border: 'none', 
        borderRadius: '14px', 
        cursor: 'pointer', 
        color: '#fff', 
        boxShadow: '0 6px 12px rgba(0,0,0,0.1)', 
        transition: 'transform 0.1s, filter 0.2s', 
        marginBottom: '12px', 
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
    btnDisabled: { backgroundColor: '#f5f5f5', color: '#b8b8b8', cursor: 'not-allowed', boxShadow: 'none', backgroundImage: 'none', border: '1px solid #d9d9d9' },
    select: { width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #d9d9d9', fontSize: '1rem', marginBottom: '15px', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' },
    reportSection: { marginTop: '10px', backgroundColor: '#fff', padding: '20px', borderRadius: '15px', width: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid #f0f0f0', boxSizing: 'border-box' },
    footer: { textAlign: 'center', padding: '30px 20px', color: '#bfbfbf', fontSize: '0.75rem', lineHeight: '1.5', boxSizing: 'border-box' }
};

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
        audio.play().catch(err => {
            console.log("Audio bloccato:", err);
        });
    } catch (e) {
        console.error("Errore audio:", e);
    }
};

const SimpleEmployeeApp = ({ user, employeeData, handleLogout, allWorkAreas }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeEntry, setActiveEntry] = useState(null);
    const [workAreaName, setWorkAreaName] = useState('');
    const [inRangeArea, setInRangeArea] = useState(null); 
    const [locationError, setLocationError] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(true);
    const [manualAreaId, setManualAreaId] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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

    const employeeWorkAreas = useMemo(() => {
        if (!employeeData || !employeeData.workAreaIds || !allWorkAreas) return [];
        return allWorkAreas.filter(area => employeeData.workAreaIds.includes(area.id));
    }, [employeeData, allWorkAreas]);

    const isGpsRequired = employeeData?.controlloGpsRichiesto ?? true;

    useEffect(() => {
        if (!isGpsRequired || employeeWorkAreas.length === 0) {
            setGpsLoading(false);
            return;
        }
        const success = (pos) => {
            const { latitude, longitude } = pos.coords;
            let found = null;
            for (const area of employeeWorkAreas) {
                if (area.latitude && area.longitude && area.radius) {
                    const dist = getDistanceInMeters(latitude, longitude, area.latitude, area.longitude);
                    if (dist <= area.radius) { found = area; break; }
                }
            }
            setInRangeArea(found);
            setLocationError(null);
            setGpsLoading(false);
        };
        const error = () => { setLocationError("Attiva il GPS!"); setInRangeArea(null); setGpsLoading(false); };
        if (navigator.geolocation) navigator.geolocation.watchPosition(success, error, { enableHighAccuracy: true });
        else { setLocationError("GPS non supportato"); setGpsLoading(false); }
    }, [employeeWorkAreas, isGpsRequired]);

    useEffect(() => {
        if (!employeeData?.id) return;
        const qActive = query(collection(db, "time_entries"),
            where("employeeId", "==", employeeData.id),
            where("status", "==", "clocked-in"),
            limit(1));
        const unsub = onSnapshot(qActive, (snap) => {
            if (!snap.empty) {
                const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
                setActiveEntry(data);
                const area = allWorkAreas.find(a => a.id === data.workAreaId);
                setWorkAreaName(area ? area.name : 'Sconosciuta');
            } else { setActiveEntry(null); setWorkAreaName(''); }
        });
        return () => unsub();
    }, [employeeData, allWorkAreas]);

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

    // --- FUNZIONE AZIONI COMPLETA DI LOGICA PAUSA ---
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
                
                // --- LOGICA MANCATA PAUSA COME DA DASHBOARD ORIGINALE ---
                let finalReasonCode = null;
                let finalNoteText = '';
                const area = allWorkAreas.find(a => a.id === activeEntry.workAreaId);
                const pauseDuration = area?.pauseDuration || 0;
                
                // Se c'è una pausa prevista e non è stata completata
                if (pauseDuration > 0 && pauseStatus !== 'COMPLETED') { 
                    const reasonOptions = PAUSE_REASONS.map((r, i) => `${i + 1} - ${r.reason}`).join('\n');
                    
                    const confirmExit = window.confirm(
                        `ATTENZIONE: La tua area prevede una pausa di ${pauseDuration} minuti, ma non risulta sia stata completata.\n\nVuoi uscire senza pausa? Clicca OK per selezionare il motivo.`
                    );

                    if (confirmExit) {
                        const selectedCode = window.prompt(
                            `Seleziona il numero del motivo (da 1 a ${PAUSE_REASONS.length}):\n\n${reasonOptions}`
                        );
                        
                        // Controllo annullamento prompt
                        if (selectedCode === null) {
                            setIsProcessing(false);
                            return; 
                        }

                        const selectedIndex = parseInt(selectedCode) - 1; 
                        const selectedReason = PAUSE_REASONS[selectedIndex];
                        
                        if (!selectedReason) {
                            alert("Selezione motivo non valida. Uscita annullata.");
                            setIsProcessing(false);
                            return;
                        }
                        
                        finalReasonCode = selectedReason.code;

                        // Se ha scelto "Altro" (04), chiediamo il testo
                        if (selectedReason.code === '04') { 
                            finalNoteText = window.prompt("Hai selezionato 'Altro'. Specifica il motivo (OBBLIGATORIO):");
                            if (!finalNoteText || finalNoteText.trim() === '') {
                                alert("La specifica è obbligatoria per il motivo 'Altro'. Uscita annullata.");
                                setIsProcessing(false);
                                return;
                            }
                        } else {
                            finalNoteText = selectedReason.reason; 
                        }
                    } else {
                        // Ha premuto Annulla sul confirm iniziale
                        setIsProcessing(false);
                        return;
                    }
                }
                // ----------------------------------------------------

                // Eseguiamo l'uscita passando anche il motivo (pauseSkipReason)
                const res = await clockOut({ 
                    deviceId, 
                    isGpsRequired, 
                    note: finalNoteText, 
                    pauseSkipReason: finalReasonCode 
                });
                
                if (!res.data.success) { 
                    alert(res.data.message); 
                } else { 
                    playSound('clock_out'); 
                    let msg = 'Uscita registrata.';
                    if (finalReasonCode) {
                        msg += '\n\n⚠️ NOTA: Hai dichiarato di non aver fatto pausa. La richiesta è IN ATTESA DI APPROVAZIONE dal preposto.';
                    }
                    alert(msg);
                }
            }
        } catch (e) { alert(e.message || "Errore"); } finally { setIsProcessing(false); }
    };

    const handleExportPDF = async () => {
        setIsGeneratingPdf(true);
        try {
            const startDate = new Date(selectedYear, selectedMonth, 1);
            const endDate = new Date(selectedMonth === 11 ? selectedYear + 1 : selectedYear, selectedMonth === 11 ? 0 : selectedMonth + 1, 1); 
            const q = query(collection(db, "time_entries"), where("employeeId", "==", employeeData.id), where("clockInTime", ">=", Timestamp.fromDate(startDate)), where("clockInTime", "<", Timestamp.fromDate(endDate)), orderBy("clockInTime", "asc"));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { alert("Nessun dato."); setIsGeneratingPdf(false); return; }

            const rows = [];
            let totalMins = 0;
            snapshot.forEach(doc => {
                const d = doc.data();
                const start = d.clockInTime.toDate();
                const end = d.clockOutTime ? d.clockOutTime.toDate() : null;
                const area = allWorkAreas.find(a => a.id === d.workAreaId)?.name || 'N/D';
                let worked = end ? Math.round((end - start) / 60000) : 0;
                let pMins = 0;
                if (d.pauses) d.pauses.forEach(p => { if (p.start && p.end) pMins += Math.round((p.end.toMillis() - p.start.toMillis()) / 60000); });
                worked -= pMins;
                if (worked > 0) totalMins += worked;
                rows.push([
                    start.toLocaleDateString(), start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                    end ? end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-',
                    pMins > 0 ? `${pMins}'` : '-', worked > 0 ? `${Math.floor(worked/60)}:${(worked%60).toString().padStart(2,'0')}` : '-', area
                ]);
            });

            const docPDF = new jsPDF();
            try { const img = new Image(); img.src = '/icon-192x192.png'; docPDF.addImage(img, 'PNG', 160, 10, 30, 30); } catch(e){}
            docPDF.setFontSize(22); docPDF.setFont("helvetica", "bold"); docPDF.setTextColor(24, 144, 255);
            docPDF.text("TCS ITALIA S.R.L.", 14, 20);
            docPDF.setFontSize(10); docPDF.setFont("helvetica", "normal"); docPDF.setTextColor(100);
            docPDF.text("Via Castagna III Trav 1, Casoria (NA)", 14, 26); docPDF.text("P.IVA: 05552321217", 14, 31);
            docPDF.setDrawColor(200); docPDF.line(14, 38, 196, 38);
            docPDF.setFontSize(14); docPDF.setTextColor(0); docPDF.setFont("helvetica", "bold");
            docPDF.text(`Report: ${["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][selectedMonth]} ${selectedYear}`, 14, 50);
            docPDF.setFontSize(12); docPDF.setFont("helvetica", "normal");
            docPDF.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 14, 57);
            autoTable(docPDF, { head: [['Data','In','Out','Pausa','Tot','Cantiere']], body: rows, startY: 65, theme: 'grid', headStyles:{fillColor:[24,144,255]} });
            const totalH = Math.floor(totalMins / 60); const totalM = totalMins % 60;
            docPDF.text(`TOTALE: ${totalH}:${totalM.toString().padStart(2,'0')}`, 14, docPDF.lastAutoTable.finalY + 10);
            
            try {
                const pdfOutput = docPDF.output('datauristring');
                const base64Data = pdfOutput.split(',')[1];
                const fileName = `Report_${employeeData.surname}_${selectedMonth+1}_${selectedYear}.pdf`;
                await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Documents
                });
                alert(`✅ PDF Salvato!\nLo trovi nella cartella "Documenti" del telefono con nome:\n${fileName}`);
            } catch (err) {
                console.error("Errore salvataggio:", err);
                alert("Errore nel salvataggio del file: " + err.message);
            }

        } catch (e) { alert("Errore generazione PDF: " + e.message); } finally { setIsGeneratingPdf(false); }
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
                    <>
                        <div style={{...styles.statusBox, backgroundColor:'#e6f7ff', border:'1px solid #91d5ff', color:'#0050b3'}}>📍 Lavoro in corso: <strong>{workAreaName}</strong></div>
                        <div style={{display:'flex', gap:'15px', width:'100%'}}>
                            <button style={{...styles.btnBig, ...(isProcessing || pauseStatus === 'COMPLETED' ? styles.btnDisabled : styles.btnOrange), flex:1, fontSize:'1.1rem'}} disabled={isProcessing || pauseStatus === 'COMPLETED'} onClick={() => handleAction('clockPause')}>
                                {pauseStatus === 'COMPLETED' ? 'PAUSA OK' : '☕ PAUSA'}
                            </button>
                            <button style={{...styles.btnBig, ...styles.btnRed, flex:1, fontSize:'1.1rem'}} disabled={isProcessing} onClick={() => handleAction('clockOut')}>
                                🚪 USCITA
                            </button>
                        </div>
                    </>
                )}
                {isOnPause && (
                    <>
                        <div style={{...styles.statusBox, backgroundColor:'#fffbe6', border:'1px solid #ffe58f', color:'#d48806'}}>⏸️ SEI IN PAUSA</div>
                        <button style={{...styles.btnBig, ...styles.btnBlue}} disabled={isProcessing} onClick={() => handleAction('clockPause')}>▶️ FINE PAUSA</button>
                    </>
                )}
                <div style={styles.reportSection}>
                    <h4 style={{margin:'0 0 15px 0', textAlign:'center', color:'#595959'}}>📄 Scarica Report Ore</h4>
                    <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                        <select style={{...styles.select, marginBottom:0}} value={selectedMonth} onChange={(e)=>setSelectedMonth(parseInt(e.target.value))}>
                            {["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"].map((m,i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <select style={{...styles.select, marginBottom:0}} value={selectedYear} onChange={(e)=>setSelectedYear(parseInt(e.target.value))}>
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button style={{...styles.btnBig, backgroundColor: '#434343', fontSize:'1rem', padding:'15px', marginBottom:0, boxShadow:'none'}} onClick={handleExportPDF} disabled={isGeneratingPdf}>
                        {isGeneratingPdf ? 'PDF...' : 'SCARICA PDF'}
                    </button>
                </div>
            </div>
            <div style={styles.footer}>
                TCS Italia App v2.0 <br/>
                <strong>Creato da D.Leoncino</strong>
            </div>
        </div>
    );
};
export default SimpleEmployeeApp;