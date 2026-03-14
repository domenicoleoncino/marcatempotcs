import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { db, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, Timestamp, deleteDoc, updateDoc, doc, addDoc, getDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core'; 

const MIN_REENTRY_DELAY_MINUTES = 60; 

const PAUSE_REASONS = [
    { code: '01', reason: 'Mancata pausa per intervento urgente.' },
    { code: '02', reason: 'Mancata pausa per ore non complete.' },
    { code: '03', reason: 'Mancata pausa per richiesta cantiere.' },
    { code: '04', reason: 'Altro... (specificare).' }
];

// --- STILI RESPONSIVE AVANZATI CON BOTTONI COLORATI ---
const styles = {
    container: { minHeight: '100vh', backgroundColor: '#f4f7fe', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, sans-serif', boxSizing: 'border-box' },
    headerOuter: { backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', width: '100%', display: 'flex', justifyContent: 'center', position: 'sticky', top: 0, zIndex: 100, borderBottomLeftRadius: '20px', borderBottomRightRadius: '20px' },
    headerInner: { width: '100%', maxWidth: '900px', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    logo: { height: '40px', objectFit: 'contain' }, 
    userInfo: { textAlign: 'center' },
    userName: { fontWeight: '900', color: '#1e293b', fontSize: '15px' }, 
    userRole: { fontSize: '11px', color: '#64748b', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase' },
    logoutBtn: { backgroundColor: '#fef2f2', color: '#ef4444', padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', border: 'none' },
    body: { flex: 1, padding: '20px 15px', display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '900px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
    clockCard: { backgroundColor: '#ffffff', padding: '25px', borderRadius: '24px', textAlign: 'center', width: '100%', marginBottom: '20px', boxShadow: '0 10px 30px rgba(17,38,146,0.04)' },
    clockTime: { fontSize: '4.5rem', fontWeight: '900', color: '#4f46e5', lineHeight: 1.1, marginBottom: '10px', letterSpacing: '-2px' }, 
    clockDate: { color: '#64748b', fontSize: '1.1rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '1px' },
    compactInfoLine: { width: '100%', fontSize: '1.1rem', fontWeight: '800', marginBottom: '15px', padding: '15px', borderRadius: '16px', backgroundColor: '#eef2ff', display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center', border: '1px solid #c7d2fe', color: '#4f46e5' },
    statusBox: { padding: '12px', borderRadius: '100px', marginBottom: '20px', width: 'auto', display:'inline-flex', gap:'8px', textAlign: 'center', fontWeight: '800', fontSize: '0.95rem' },
    actionBtn: { width: '100%', padding: '20px', borderRadius: '20px', color: '#fff', fontSize: '1.2rem', fontWeight: '900', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', transition: 'transform 0.1s' },
    select: { width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '1rem', backgroundColor: '#f8fafc', outline: 'none', color: '#334155', fontWeight: '700', marginBottom: '10px', boxSizing:'border-box' },
    input: { width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '1rem', backgroundColor: '#f8fafc', outline: 'none', color: '#334155', marginBottom: '10px', boxSizing:'border-box' },
    footer: { marginTop: 'auto', textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.85rem', fontWeight: '600' }
};

const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 99998, backdropFilter: 'blur(5px)' };
const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: '10px' };
const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '600px', maxHeight: '88vh', borderRadius: '24px', overflow: 'hidden', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' };

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

const playSound = (soundName) => { try { const audio = new Audio(`/sounds/${soundName}.mp3`); audio.play().catch(()=>{}); } catch (e) {} };

// --- MODALE SPESA NATIVA ---
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
            setAmount(expenseToEdit.amount); setDescription(expenseToEdit.description);
            if (expenseToEdit.date?.toDate) setDate(expenseToEdit.date.toDate().toISOString().split('T')[0]);
            setPaymentMethod(expenseToEdit.paymentMethod || 'Contanti'); setNote(expenseToEdit.note || ''); setFile(null); 
        } else {
            setAmount(''); setDescription(''); setNote(''); setFile(null); setPaymentMethod('Contanti'); setDate(new Date().toISOString().split('T')[0]);
        }
    }, [expenseToEdit, show]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!amount || !description || !date) { alert("Compila i campi obbligatori."); return; }
        setIsSaving(true);
        try {
            let receiptUrl = expenseToEdit ? expenseToEdit.receiptUrl : null;
            if (file) {
                const fileRef = ref(storage, `expenses/${user.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(fileRef, file);
                receiptUrl = await getDownloadURL(snapshot.ref);
            }
            const expenseData = { amount: parseFloat(amount), description, paymentMethod, note, date: Timestamp.fromDate(new Date(date)), userId: user.uid, userName: employeeData ? `${employeeData.name} ${employeeData.surname}` : user.email, userRole: 'employee', receiptUrl, status: 'pending', updatedAt: Timestamp.now() };
            if (expenseToEdit) { await updateDoc(doc(db, "expenses", expenseToEdit.id), expenseData); alert("Spesa aggiornata!"); } 
            else { expenseData.createdAt = Timestamp.now(); await addDoc(collection(db, "expenses"), expenseData); alert("Spesa registrata!"); }
            onClose();
        } catch (error) { alert("Errore: " + error.message); } finally { setIsSaving(false); }
    };

    if (!show) return null;
    return ReactDOM.createPortal(
        <div style={overlayStyle} onClick={onClose}>
            <div style={containerStyle}>
                <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                    <div style={{padding:'20px 25px', background:'#f0fdfa', borderBottom:'1px solid #ccfbf1', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <h3 style={{margin:0, color:'#0f766e', fontSize:'1.3rem', fontWeight:'900'}}>{expenseToEdit ? '✏️ Modifica Spesa' : '💰 Nuova Spesa'}</h3>
                        <button onClick={onClose} style={{border:'none', background:'none', fontSize:'28px', cursor:'pointer', color:'#0f766e', lineHeight:1}}>&times;</button>
                    </div>
                    <form onSubmit={handleSave} style={{padding: '25px', display:'flex', flexDirection:'column', gap:'10px', overflowY:'auto'}}>
                        <div><label style={{fontSize:'12px', fontWeight:'900', color:'#64748b'}}>Data Spesa</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} required style={styles.input} /></div>
                        <div><label style={{fontSize:'12px', fontWeight:'900', color:'#64748b'}}>Importo (€)</label><input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} required style={styles.input} /></div>
                        <div><label style={{fontSize:'12px', fontWeight:'900', color:'#64748b'}}>Descrizione</label><input type="text" placeholder="Es. Pranzo di lavoro" value={description} onChange={e=>setDescription(e.target.value)} required style={styles.input} /></div>
                        <div><label style={{fontSize:'12px', fontWeight:'900', color:'#64748b'}}>Pagamento</label><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={styles.select}><option value="Contanti">Contanti Personali (Da Rimborsare)</option><option value="Carta Personale">Carta Personale (Da Rimborsare)</option><option value="Carta Aziendale">Carta Aziendale (TCS)</option><option value="Telepass">Telepass TCS</option></select></div>
                        <div style={{padding:'15px', background:'#f8fafc', borderRadius:'12px', border:'2px dashed #cbd5e1', marginTop:'5px'}}><label style={{fontSize:'13px', fontWeight:'900', color:'#0f172a', display:'block', marginBottom:'8px'}}>{expenseToEdit && expenseToEdit.receiptUrl ? '📸 Cambia Foto' : '📸 Foto Scontrino'}</label><input type="file" accept="image/*,.pdf" onChange={e=>setFile(e.target.files[0])} style={{width:'100%', fontSize:'14px'}} /></div>
                        <button type="submit" disabled={isSaving} style={{width:'100%', padding:'20px', borderRadius:'16px', border:'none', background:'#0d9488', color:'#fff', fontWeight:'900', fontSize:'1.2rem', marginTop:'10px', cursor:'pointer'}}>{isSaving ? 'Salvataggio...' : 'SALVA SPESA'}</button>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- MODALE RAPPORTINO NATIVO ---
const MobileDailyReportModal = ({ show, onClose, employeeData, lockedAreaId, lockedAreaName, lockedAreaObj }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [presentEmployees, setPresentEmployees] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    
    // Cataloghi
    const [materialsCatalog, setMaterialsCatalog] = useState([]); 
    const [allBoqCatalog, setAllBoqCatalog] = useState([]); 

    // Array finali del rapportino
    const [reportWorkers, setReportWorkers] = useState([]);
    const [reportBoq, setReportBoq] = useState([]);
    const [reportMaterials, setReportMaterials] = useState([]);
    const [reportVehicles, setReportVehicles] = useState([]);
    const [notes, setNotes] = useState('');

    // Campi temporanei
    const [tWorker, setTWorker] = useState('');
    const [tVeh, setTVeh] = useState('');
    
    const [tBoqDesc, setTBoqDesc] = useState('');
    const [tBoqQty, setTBoqQty] = useState('');
    const [boqSuggestions, setBoqSuggestions] = useState([]);

    const [tMatDesc, setTMatDesc] = useState('');
    const [tMatQty, setTMatQty] = useState('');
    const [tMatFile, setTMatFile] = useState(null); // File Bolla
    const [matSuggestions, setMatSuggestions] = useState([]);

    const [isSaving, setIsSaving] = useState(false);
    const [saveStatusText, setSaveStatusText] = useState('INVIO RAPPORTINO');

    useEffect(() => {
        if (!show || !lockedAreaId) return;
        const loadData = async () => {
            try {
                // 1. CARICHIAMO IL CATALOGO MATERIALI (Super Scanner)
                let combinedMaterials = [];
                const seenMatNames = new Set();
                const addMat = (name) => {
                    if (!name) return;
                    const lName = name.toLowerCase();
                    if (!seenMatNames.has(lName)) { seenMatNames.add(lName); combinedMaterials.push(name); }
                };

                const mSnap = await getDocs(collection(db, 'materials')); mSnap.docs.forEach(d => addMat(d.data().name || d.data().description));
                const pSnap = await getDocs(collection(db, 'material_purchases')); pSnap.docs.forEach(d => (d.data().items||[]).forEach(i => addMat(i.description || i.name)));
                const smSnap = await getDocs(collection(db, 'site_materials')); smSnap.docs.forEach(d => (d.data().materials||d.data().items||[]).forEach(i => addMat(i.description || i.name)));
                const muSnap = await getDocs(collection(db, 'material_usage')); muSnap.docs.forEach(d => (d.data().materials||d.data().items||[]).forEach(i => addMat(i.description || i.name)));
                combinedMaterials.sort();
                setMaterialsCatalog(combinedMaterials);

                // 2. CARICHIAMO LE VOCI DEL COMPUTO (INTELLIGENTE: Solo quello del cantiere, se c'è!)
                let allBoq = [];
                const seenBoqNames = new Set();
                
                const preventivoId = lockedAreaObj?.preventivoId || lockedAreaObj?.quoteId;
                
                if (preventivoId) {
                    const quoteDoc = await getDoc(doc(db, "quotes", preventivoId));
                    if (quoteDoc.exists()) {
                        const data = quoteDoc.data();
                        if (data.items) {
                            data.items.forEach(i => {
                                const desc = i.description;
                                if (desc && !seenBoqNames.has(desc.toLowerCase())) {
                                    seenBoqNames.add(desc.toLowerCase());
                                    allBoq.push(desc);
                                }
                            });
                        }
                    }
                } else {
                    // Se non ha un preventivo specifico ma il pulsante è sbloccato per altri motivi
                    const qSnapAll = await getDocs(collection(db, "quotes"));
                    qSnapAll.docs.forEach(doc => {
                        const data = doc.data();
                        if (data.items) {
                            data.items.forEach(i => {
                                const desc = i.description;
                                if (desc && !seenBoqNames.has(desc.toLowerCase())) {
                                    seenBoqNames.add(desc.toLowerCase());
                                    allBoq.push(desc);
                                }
                            });
                        }
                    });
                }
                allBoq.sort();
                setAllBoqCatalog(allBoq);

                // 3. MEZZI E OPERAI
                const vSnap = await getDocs(collection(db, 'vehicles')); setVehicles(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                const startOfDay = new Date(date); startOfDay.setHours(0,0,0,0); const endOfDay = new Date(date); endOfDay.setHours(23,59,59,999);
                const presQuery = query(collection(db, "time_entries"), where("workAreaId", "==", lockedAreaId), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)), where("clockInTime", "<=", Timestamp.fromDate(endOfDay)));
                const presSnap = await getDocs(presQuery);
                const presentIds = [...new Set(presSnap.docs.map(d => d.data().employeeId))];
                const eSnap = await getDocs(collection(db, 'employees'));
                const allEmp = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setPresentEmployees(allEmp.filter(e => presentIds.includes(e.id)));
                const me = allEmp.find(e => e.id === employeeData.id);
                if (me) setReportWorkers([{ employeeId: me.id, employeeName: `${me.surname} ${me.name}` }]); else setReportWorkers([]);
            } catch (e) { console.error(e); }
        };
        loadData();
    }, [show, lockedAreaId, date, employeeData, lockedAreaObj]);

    const addWorker = () => { if (tWorker) { const e = presentEmployees.find(x => x.id === tWorker); setReportWorkers(p => [...p, { employeeId: e.id, employeeName: `${e.surname} ${e.name}` }]); setTWorker(''); }};
    const addVeh = () => { if (tVeh) { const v = vehicles.find(x => x.id === tVeh); setReportVehicles(p => [...p, { vehicleId: v.id, vehicleName: `${v.brand} ${v.plate}` }]); setTVeh(''); }};

    // LOGICA LAVORAZIONI (Cerca nei preventivi)
    const handleBoqChange = (val) => {
        setTBoqDesc(val);
        if (val.length > 1) {
            setBoqSuggestions(allBoqCatalog.filter(m => m.toLowerCase().includes(val.toLowerCase())).slice(0, 10));
        } else { setBoqSuggestions([]); }
    };
    const addBoq = () => {
        if (!tBoqDesc || !tBoqQty) { alert("Inserisci descrizione e quantità della lavorazione."); return; }
        setReportBoq(p => [...p, { description: tBoqDesc, qty: parseFloat(tBoqQty) }]);
        setTBoqDesc(''); setTBoqQty(''); setBoqSuggestions([]);
    };

    // LOGICA MATERIALI (Cerca ovunque + Bolla)
    const handleMatChange = (val) => {
        setTMatDesc(val);
        if (val.length > 1) {
            setMatSuggestions(materialsCatalog.filter(m => m.toLowerCase().includes(val.toLowerCase())).slice(0, 10));
        } else { setMatSuggestions([]); }
    };
    const addMaterial = () => {
        if (!tMatDesc || !tMatQty) { alert("Inserisci nome e quantità del materiale."); return; }
        setReportMaterials(p => [...p, { 
            description: tMatDesc, 
            qty: parseFloat(tMatQty),
            bollaFile: tMatFile,
            bollaFileName: tMatFile ? tMatFile.name : null
        }]);
        setTMatDesc(''); setTMatQty(''); setTMatFile(null); setMatSuggestions([]);
        document.getElementById('bollaFileInput').value = ""; 
    };

    const generatePdfBlob = (data) => {
        const doc = new jsPDF();
        doc.setFontSize(22); doc.setTextColor(24, 144, 255); doc.text("TCS ITALIA S.R.L.", 14, 20);
        doc.setFontSize(10); doc.setTextColor(100); doc.text("Rapportino Giornaliero Cantiere", 14, 26);
        doc.setDrawColor(200); doc.line(14, 32, 196, 32);
        doc.setFontSize(14); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text(`Cantiere: ${data.areaName}`, 14, 45);
        doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text(`Data: ${new Date(date).toLocaleDateString()}`, 14, 52);
        
        let currentY = 65;
        if (data.workers.length > 0) { 
            autoTable(doc, { startY: currentY, head: [['Operai Presenti']], body: data.workers.map(w => [w.employeeName]), theme: 'grid', headStyles: { fillColor: [24, 144, 255] } }); 
            currentY = doc.lastAutoTable.finalY + 10; 
        }
        if (data.boqItems.length > 0) { 
            autoTable(doc, { startY: currentY, head: [['Lavorazione Eseguita', 'Quantità']], body: data.boqItems.map(b => [b.description, b.qty]), theme: 'grid', headStyles: { fillColor: [82, 196, 26] } }); 
            currentY = doc.lastAutoTable.finalY + 10; 
        }
        if (data.materials.length > 0) { 
            autoTable(doc, { startY: currentY, head: [['Materiale', 'Quantità', 'Allegato']], body: data.materials.map(m => [m.description, m.qty, m.bollaUrl ? 'Bolla Allegata' : '-']), theme: 'grid', headStyles: { fillColor: [250, 140, 22] } }); 
            currentY = doc.lastAutoTable.finalY + 10; 
        }
        if (data.vehicles.length > 0) { 
            autoTable(doc, { startY: currentY, head: [['Mezzi Impiegati']], body: data.vehicles.map(v => [v.vehicleName]), theme: 'grid', headStyles: { fillColor: [114, 46, 209] } }); 
            currentY = doc.lastAutoTable.finalY + 10; 
        }
        if (data.notes) { doc.setFont("helvetica", "bold"); doc.text("Note:", 14, currentY); doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(data.notes, 180), 14, currentY + 7); }
        return doc.output('blob');
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatusText("Caricamento Bolle in corso...");
        try {
            const finalMaterialsList = [];
            for (let mat of reportMaterials) {
                let bollaUrl = null;
                if (mat.bollaFile) {
                    const fileRef = ref(storage, `bolle_rapportini/${lockedAreaId}/${Date.now()}_${mat.bollaFile.name}`);
                    await uploadBytes(fileRef, mat.bollaFile);
                    bollaUrl = await getDownloadURL(fileRef);
                }
                finalMaterialsList.push({
                    description: mat.description,
                    qty: mat.qty,
                    bollaUrl: bollaUrl
                });
            }

            setSaveStatusText("Creazione PDF...");
            const reportData = {
                date: Timestamp.fromDate(new Date(date)), areaId: lockedAreaId, areaName: lockedAreaName,
                workers: reportWorkers, materials: finalMaterialsList, boqItems: reportBoq, vehicles: reportVehicles, notes,
                authorRole: employeeData?.role || 'employee', authorName: `${employeeData?.name} ${employeeData?.surname}`, createdAt: Timestamp.now()
            };

            const pdfBlob = generatePdfBlob(reportData);
            const fileName = `Rapportino_${lockedAreaName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
            const storageRef = ref(storage, `rapportini/${lockedAreaId}/${fileName}`);
            await uploadBytes(storageRef, pdfBlob);
            reportData.pdfUrl = await getDownloadURL(storageRef);
            
            setSaveStatusText("Salvataggio Database...");
            await addDoc(collection(db, "daily_reports"), reportData);
            
            // --- LOGICA INVIO DIRETTO AL PREPOSTO ---
            const prepostoEmail = lockedAreaObj?.emailPreposto || lockedAreaObj?.email || lockedAreaObj?.clientEmail || '';
            let prepostoPhone = lockedAreaObj?.telefonoPreposto || lockedAreaObj?.telefono || '';

            const msgTesto = `Ciao, in allegato il rapportino giornaliero del cantiere *${lockedAreaName}*.\n\n📄 *Scarica il PDF qui:*\n${reportData.pdfUrl}`;

            if (prepostoPhone) {
                prepostoPhone = prepostoPhone.replace(/\s+/g, '');
                if (!prepostoPhone.startsWith('+') && !prepostoPhone.startsWith('00')) {
                    prepostoPhone = '+39' + prepostoPhone;
                }
                window.open(`https://wa.me/${prepostoPhone.replace('+', '')}?text=${encodeURIComponent(msgTesto)}`, '_blank');
            } else if (prepostoEmail) {
                window.location.href = `mailto:${prepostoEmail}?subject=Rapportino Cantiere ${lockedAreaName}&body=${encodeURIComponent(msgTesto)}`;
            } else {
                if (navigator.share) {
                    try { await navigator.share({ title: `Rapportino ${lockedAreaName}`, text: msgTesto }); } catch(e){}
                } else {
                    alert("Rapportino inviato e salvato nel gestionale!");
                }
            }
            
            onClose();
        } catch (e) { alert("Errore salvataggio: " + e.message); } finally { setIsSaving(false); setSaveStatusText("INVIA RAPPORTINO"); }
    };

    if (!show) return null;

    const rowStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.95rem', marginBottom:'8px', background:'#fff', padding:'10px 15px', borderRadius:'12px', border:'1px solid #e2e8f0', fontWeight:'700', color:'#334155' };
    const btnStyle = { background:'#4f46e5', color:'white', border:'none', width:'50px', height:'50px', borderRadius:'12px', fontWeight:'900', fontSize:'1.5rem', cursor:'pointer', flexShrink: 0 };

    return ReactDOM.createPortal(
        <div style={overlayStyle} onClick={onClose}>
            <div style={containerStyle}>
                <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                    <div style={{padding:'20px 25px', background:'#eef2ff', borderBottom:'1px solid #c7d2fe', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <h3 style={{margin:0, color:'#3730a3', fontSize:'1.2rem', fontWeight:'900'}}>📝 Rapportino Giornaliero</h3>
                        <button onClick={onClose} style={{border:'none', background:'none', fontSize:'28px', color:'#3730a3', cursor:'pointer', lineHeight:1}}>&times;</button>
                    </div>
                    <div style={{padding:'20px', overflowY:'auto', flex:1, backgroundColor:'#f8fafc'}}>
                        
                        <div style={{marginBottom:'20px', background:'#e0f2fe', border:'1px solid #bae6fd', padding:'15px', borderRadius:'16px'}}>
                            <div style={{fontSize:'0.75rem', color:'#0284c7', fontWeight:'800', textTransform:'uppercase', letterSpacing:'1px'}}>Cantiere in corso</div>
                            <div style={{fontSize:'1.2rem', color:'#0369a1', fontWeight:'900', marginTop:'5px'}}>{lockedAreaName}</div>
                        </div>

                        <label style={{fontSize:'12px', fontWeight:'800', color:'#64748b', textTransform:'uppercase'}}>Data</label>
                        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...styles.input, marginBottom:'20px'}} />
                        
                        {/* OPERAI */}
                        <div style={{background:'#eff6ff', padding:'15px', borderRadius:'16px', marginBottom:'20px', border:'1px solid #bfdbfe'}}>
                            <h4 style={{margin:'0 0 10px 0', color:'#1e40af', fontSize:'1rem', fontWeight:'900'}}>👷 Operai Presenti</h4>
                            {reportWorkers.map((w,i)=><div key={i} style={rowStyle}><span>{w.employeeName}</span><span onClick={()=>setReportWorkers(p=>p.filter((_,idx)=>idx!==i))} style={{color:'#ef4444', cursor:'pointer'}}>❌</span></div>)}
                            <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                                <select value={tWorker} onChange={e=>setTWorker(e.target.value)} style={{...styles.select, margin:0}}><option value="">Seleziona chi c'era...</option>{presentEmployees.map(e=><option key={e.id} value={e.id}>{e.surname} {e.name}</option>)}</select>
                                <button type="button" onClick={addWorker} style={btnStyle}>+</button>
                            </div>
                        </div>

                        {/* LAVORAZIONI */}
                        <div style={{background:'#f0fdf4', padding:'15px', borderRadius:'16px', marginBottom:'20px', border:'1px solid #bbf7d0'}}>
                            <h4 style={{margin:'0 0 10px 0', color:'#166534', fontSize:'1rem', fontWeight:'900'}}>✅ Lavori Svolti / Eseguiti</h4>
                            {reportBoq.map((b,i)=>(
                                <div key={i} style={rowStyle}>
                                    <span>{b.description}</span>
                                    <span style={{color:'#166534'}}>{b.qty} <span onClick={()=>setReportBoq(p=>p.filter((_,idx)=>idx!==i))} style={{color:'#ef4444', marginLeft:'15px', cursor:'pointer'}}>❌</span></span>
                                </div>
                            ))}
                            
                            <div style={{borderTop:'1px dashed #bbf7d0', paddingTop:'15px', marginTop:'15px'}}>
                                <label style={{fontSize:'11px', fontWeight:'900', color:'#166534', textTransform:'uppercase'}}>Scrivi lavoro svolto (Cerca nel computo o scrivi a mano):</label>
                                <div style={{ position: 'relative' }}>
                                    <input type="text" placeholder="Descrizione del lavoro..." value={tBoqDesc} onChange={e => handleBoqChange(e.target.value)} style={{...styles.input, marginBottom:'5px', width: '100%'}} />
                                    {boqSuggestions.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                                            {boqSuggestions.map((s, idx) => ( <div key={idx} onClick={() => {setTBoqDesc(s); setBoqSuggestions([]);}} style={{ padding: '12px 15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontWeight: '700', color: '#1e293b', fontSize: '0.95rem' }}>{s}</div> ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{display:'flex', gap:'10px', marginTop: '5px'}}>
                                    <input type="number" placeholder="Quantità" value={tBoqQty} onChange={e=>setTBoqQty(e.target.value)} style={{...styles.input, margin:0, flex:1}}/>
                                    <button type="button" onClick={addBoq} style={{...btnStyle, background:'#16a34a'}}>+</button>
                                </div>
                            </div>
                        </div>

                        {/* MATERIALI CON OPZIONE BOLLA */}
                        <div style={{background:'#fff7ed', padding:'15px', borderRadius:'16px', marginBottom:'20px', border:'1px solid #fed7aa'}}>
                            <h4 style={{margin:'0 0 10px 0', color:'#9a3412', fontSize:'1rem', fontWeight:'900'}}>🧱 Materiali Consumati / Acquistati</h4>
                            {reportMaterials.map((m,i)=>(
                                <div key={i} style={{...rowStyle, flexDirection:'column', alignItems:'flex-start'}}>
                                    <div style={{width:'100%', display:'flex', justifyContent:'space-between'}}>
                                        <span>{m.description}</span>
                                        <span style={{color:'#ea580c'}}>{m.qty} <span onClick={()=>setReportMaterials(p=>p.filter((_,idx)=>idx!==i))} style={{color:'#ef4444', marginLeft:'15px', cursor:'pointer'}}>❌</span></span>
                                    </div>
                                    {m.bollaFileName && <div style={{fontSize:'0.8rem', color:'#16a34a', marginTop:'5px'}}>📎 Bolla allegata</div>}
                                </div>
                            ))}

                            <div style={{borderTop:'1px dashed #fed7aa', paddingTop:'15px', marginTop:'15px'}}>
                                <label style={{fontSize:'11px', fontWeight:'900', color:'#9a3412', textTransform:'uppercase'}}>Cerca in magazzino o scrivi nuovo materiale:</label>
                                <div style={{ position: 'relative' }}>
                                    <input type="text" placeholder="Nome materiale..." value={tMatDesc} onChange={e => handleMatChange(e.target.value)} style={{...styles.input, marginBottom:'5px', width: '100%'}} />
                                    {matSuggestions.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                                            {matSuggestions.map((s, idx) => ( <div key={idx} onClick={() => {setTMatDesc(s); setMatSuggestions([]);}} style={{ padding: '12px 15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontWeight: '700', color: '#1e293b', fontSize: '0.95rem' }}>{s}</div> ))}
                                        </div>
                                    )}
                                </div>
                                <input type="number" placeholder="Quantità" value={tMatQty} onChange={e=>setTMatQty(e.target.value)} style={{...styles.input, marginBottom:'10px'}}/>
                                
                                {/* ALLEGATO BOLLA */}
                                <div style={{background:'#fff', padding:'10px', borderRadius:'12px', border:'1px dashed #fdba74', marginBottom:'10px'}}>
                                    <label style={{fontSize:'12px', fontWeight:'800', color:'#ea580c', display:'block', marginBottom:'5px'}}>Hai comprato ora questo materiale? Allega la bolla (Opzionale):</label>
                                    <input id="bollaFileInput" type="file" accept="image/*,.pdf" onChange={e=>setTMatFile(e.target.files[0])} style={{fontSize:'13px', width:'100%'}} />
                                </div>

                                <button type="button" onClick={addMaterial} style={{width:'100%', padding:'15px', borderRadius:'12px', border:'none', background:'#ea580c', color:'#fff', fontWeight:'900', cursor:'pointer'}}>+ AGGIUNGI MATERIALE</button>
                            </div>
                        </div>

                        {/* MEZZI */}
                        <div style={{background:'#faf5ff', padding:'15px', borderRadius:'16px', marginBottom:'20px', border:'1px solid #e9d5ff'}}>
                            <h4 style={{margin:'0 0 10px 0', color:'#6b21a8', fontSize:'1rem', fontWeight:'900'}}>🚐 Mezzi Impiegati</h4>
                            {reportVehicles.map((v,i)=><div key={i} style={rowStyle}><span>{v.vehicleName}</span><span onClick={()=>setReportVehicles(p=>p.filter((_,idx)=>idx!==i))} style={{color:'#ef4444', cursor:'pointer'}}>❌</span></div>)}
                            <div style={{display:'flex', gap:'10px'}}>
                                <select value={tVeh} onChange={e=>setTVeh(e.target.value)} style={{...styles.select, margin:0}}><option value="">Scegli veicolo...</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.brand} {v.plate}</option>)}</select>
                                <button type="button" onClick={addVeh} style={{...btnStyle, background:'#9333ea'}}>+</button>
                            </div>
                        </div>

                        <label style={{fontSize:'12px', fontWeight:'800', color:'#64748b', textTransform:'uppercase'}}>Note Giornata</label>
                        <textarea placeholder="Eventuali note sul lavoro svolto..." value={notes} onChange={e=>setNotes(e.target.value)} style={{...styles.input, minHeight:'100px', resize:'none'}} />
                    </div>
                    <div style={{padding:'20px', borderTop:'1px solid #e2e8f0', background:'#ffffff'}}>
                        <button type="button" onClick={handleSave} disabled={isSaving} style={{width:'100%', padding:'22px', borderRadius:'20px', background:'#4f46e5', color:'white', border:'none', fontWeight:'900', fontSize:'1.2rem', cursor:'pointer', boxShadow:'0 10px 25px rgba(79, 70, 229, 0.3)'}}>
                            {saveStatusText}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body 
    );
};

const EmployeeDashboard = ({ user, employeeData, handleLogout, allWorkAreas }) => {
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
    
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showExpenseHistory, setShowExpenseHistory] = useState(false);
    const [myExpenses, setMyExpenses] = useState([]);
    const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState(null); 
    const [showDailyReportModal, setShowDailyReportModal] = useState(false);

    const [assignedEquipment, setAssignedEquipment] = useState([]);
    const [assignedVehicles, setAssignedVehicles] = useState([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [showAssets, setShowAssets] = useState(false);

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

    let lockedAreaId = null;
    if (activeEntry) lockedAreaId = activeEntry.workAreaId;
    else if (rawTodayEntries && rawTodayEntries.length > 0) {
        const sortedEntries = [...rawTodayEntries].sort((a,b) => b.clockInTime.toDate() - a.clockInTime.toDate());
        lockedAreaId = sortedEntries[0].workAreaId;
    }
    const lockedAreaObj = allWorkAreas.find(a => a.id === lockedAreaId);
    const lockedAreaName = lockedAreaObj ? lockedAreaObj.name : '';

    // --- CONTROLLO COMPUTO ---
    // Verifica se il cantiere ha un preventivo/computo associato
    const cantiereHaComputo = lockedAreaObj && (lockedAreaObj.preventivoId || lockedAreaObj.quoteId || lockedAreaObj.hasComputo || lockedAreaObj.haComputo);

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

    useEffect(() => {
        if (!employeeData?.id) return;
        const fetchAssets = async () => {
            setIsLoadingAssets(true);
            try {
                const qEq = query(collection(db, "equipment"), where("assignedToUserId", "==", employeeData.id), where("status", "==", "in_use"));
                const snapEq = await getDocs(qEq);
                setAssignedEquipment(snapEq.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                const qVeh = query(collection(db, "vehicles"), where("assignedTo", "==", employeeData.id));
                const snapVeh = await getDocs(qVeh);
                const vehList = snapVeh.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAssignedVehicles(vehList.filter(v => v.status === 'active' && !v.isRentalReturned));
            } catch (error) {} finally { setIsLoadingAssets(false); }
        };
        fetchAssets();
    }, [employeeData?.id]);

    const handleAction = async (action) => {
        setIsProcessing(true);
        try {
            if (action === 'clockIn') {
                if (lastEntry && lastEntry.clockOutTime) {
                     const now = new Date();
                     const outTime = lastEntry.clockOutTime.toDate();
                     const diffMins = Math.floor((now - outTime) / 60000);
                     if (diffMins < MIN_REENTRY_DELAY_MINUTES) {
                         alert(`⛔ ATTENZIONE: Attendi almeno ${MIN_REENTRY_DELAY_MINUTES - diffMins} minuti prima di timbrare di nuovo l'entrata.`);
                         setIsProcessing(false);
                         return;
                     }
                }
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
            if (snapshot.empty) { alert("Nessun dato presente in questo mese."); setIsGeneratingPdf(false); return; }
            
            const rows = []; let totalMins = 0;
            snapshot.forEach(docSnap => {
                const d = docSnap.data(); 
                const start = d.clockInTime.toDate(); 
                const end = d.clockOutTime ? d.clockOutTime.toDate() : null; 
                const area = allWorkAreas.find(a => a.id === d.workAreaId)?.name || 'N/D';
                let pMins = 0;
                if (d.pauses) { d.pauses.forEach(p => { if (p.start && p.end) pMins += Math.round((p.end.toMillis() - p.start.toMillis()) / 60000); }); }
                let diff = end ? Math.round((end - start) / 60000) - pMins : 0;
                if (diff > 0) totalMins += diff;
                rows.push([start.toLocaleDateString(), start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), end ? end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--', pMins > 0 ? `${pMins}'` : '-', diff > 0 ? `${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,'0')}` : '-', area]);
            });

            const docPDF = new jsPDF();
            try { const img = new Image(); img.src = '/icon-192x192.png'; docPDF.addImage(img, 'PNG', 160, 10, 30, 30); } catch(e){}
            docPDF.setFontSize(22); docPDF.setFont("helvetica", "bold"); docPDF.setTextColor(79, 70, 229); docPDF.text("TCS ITALIA S.R.L.", 14, 20);
            docPDF.setFontSize(10); docPDF.setFont("helvetica", "normal"); docPDF.setTextColor(100); docPDF.text("Via Castagna III Trav. 1, Casoria (NA)", 14, 26); docPDF.text("P.IVA: 05552321217", 14, 31);
            docPDF.setDrawColor(200); docPDF.line(14, 38, 196, 38);
            docPDF.setFontSize(14); docPDF.setTextColor(0); docPDF.setFont("helvetica", "bold");
            docPDF.text(`Report Ore: ${["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][selectedMonth]} ${selectedYear}`, 14, 50);
            docPDF.setFontSize(12); docPDF.setFont("helvetica", "normal"); docPDF.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 14, 57);
            autoTable(docPDF, { head: [['Data','In','Out','Pausa','Tot','Cantiere']], body: rows, startY: 65, theme: 'grid', headStyles:{fillColor:[79,70,229]} });
            const totalH = Math.floor(totalMins / 60); const totalM = totalMins % 60;
            docPDF.text(`TOTALE ORE LAVORATE: ${totalH}:${totalM.toString().padStart(2,'0')}`, 14, docPDF.lastAutoTable.finalY + 10);
            
            const pdfOutput = docPDF.output('datauristring'); 
            const base64Data = pdfOutput.split(',')[1]; 
            const fileName = `Report_Ore_${employeeData.surname}_${selectedMonth+1}_${selectedYear}.pdf`;

            if (Capacitor.getPlatform() === 'android') {
                await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Documents });
                alert(`✅ PDF Salvato!\nLo trovi nella cartella "Documenti" con nome:\n${fileName}`);
            } else { docPDF.save(fileName); }
        } catch (e) { alert("Errore PDF: " + e.message); } finally { setIsGeneratingPdf(false); }
    };

    const handleViewExpenses = async () => {
        setIsLoadingExpenses(true); setShowExpenseHistory(true);
        try {
            const q = query(collection(db, "expenses"), where("userId", "==", user.uid));
            const snapshot = await getDocs(q);
            const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            expenses.sort((a, b) => (b.date?.toDate() || 0) - (a.date?.toDate() || 0));
            setMyExpenses(expenses);
        } catch (error) {} finally { setIsLoadingExpenses(false); }
    };

    const handleDeleteExpense = async (id) => { 
        if(window.confirm("Sei sicuro di voler eliminare questa spesa?")) { 
            await deleteDoc(doc(db, "expenses", id)); 
            setMyExpenses(p=>p.filter(e=>e.id!==id)); 
        } 
    };

    return (
        <div style={styles.container}>
            {/* HEADER STICKY */}
            <div style={styles.headerOuter}>
                <div style={styles.headerInner}>
                    <img src="/icon-192x192.png" style={styles.logo} alt="LOGO" onError={(e) => e.target.style.display='none'} />
                    <div style={styles.userInfo}>
                        <div style={styles.userName}>{employeeData.name} {employeeData.surname}</div>
                        <div style={styles.userRole}>DIPENDENTE</div>
                    </div>
                    <button style={styles.logoutBtn} onClick={handleLogout}>ESCI</button>
                </div>
            </div>

            <div style={styles.body}>
                
                {/* OROLOGIO E GPS */}
                <div style={styles.clockCard}>
                    <div style={styles.clockDate}>{currentTime.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    <div style={styles.clockTime}>{currentTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
                    
                    <div style={{ ...styles.statusBox, backgroundColor: gpsLoading ? '#fffbe6' : !isGpsRequired ? '#f8fafc' : inRangeArea ? '#f0fdf4' : '#fef2f2', color: gpsLoading ? '#d48806' : !isGpsRequired ? '#64748b' : inRangeArea ? '#16a34a' : '#ef4444', border: `1px solid ${gpsLoading ? '#ffe58f' : !isGpsRequired ? '#e2e8f0' : inRangeArea ? '#bbf7d0' : '#fecaca'}`, marginTop: '15px' }}>
                        {gpsLoading ? "📡 Ricerca GPS in corso..." : !isGpsRequired ? "ℹ️ Controllo GPS Disattivato" : locationError ? `⚠️ ${locationError}` : inRangeArea ? `✅ Sei nel cantiere: ${inRangeArea.name}` : "❌ Nessun cantiere nelle vicinanze"}
                    </div>
                </div>

                {/* STATO TURNI */}
                {activeEntry && (
                    <div style={styles.compactInfoLine}>
                        <span style={{display: 'flex', gap: '8px', alignItems: 'center'}}>🟢 IN TURNO <span style={{fontWeight:'900'}}>{activeEntry.clockInTime.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></span>
                        <span style={{color:'#94a3b8'}}>|</span>
                        <span style={{display: 'flex', gap: '8px', alignItems: 'center'}}>⏱️ TOT <span style={{fontWeight:'900'}}>{dailyTotalString}</span></span>
                    </div>
                )}

                {isOut && lastEntry && (
                    <div style={{...styles.compactInfoLine, color:'#64748b', borderColor:'#e2e8f0', backgroundColor:'#fff'}}>
                        <span style={{display: 'flex', gap: '8px', alignItems: 'center'}}>🔴 USCITA <span style={{fontWeight:'900'}}>{lastEntry.clockOutTime ? lastEntry.clockOutTime.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span></span>
                        <span style={{color:'#cbd5e1'}}>|</span>
                        <span style={{display: 'flex', gap: '8px', alignItems: 'center'}}>⏱️ TOT <span style={{fontWeight:'900'}}>{dailyTotalString}</span></span>
                    </div>
                )}

                {/* --- BOTTONI TIMBRATURA --- */}
                <div style={{width: '100%', marginBottom: '25px'}}>
                    {isOut && (
                        <>
                            {!isGpsRequired && (
                                <select style={{...styles.select, height:'55px'}} value={manualAreaId} onChange={(e) => setManualAreaId(e.target.value)}>
                                    <option value="">-- Seleziona Cantiere Manualmente --</option>
                                    {employeeWorkAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            )}
                            <button 
                                style={{ width: '100%', padding: '22px', borderRadius: '20px', backgroundColor: '#10b981', color: '#ffffff', fontSize: '1.4rem', fontWeight: '900', border: 'none', boxShadow: '0 8px 25px rgba(16,185,129,0.3)', cursor: isProcessing ? 'not-allowed' : 'pointer' }} 
                                disabled={isProcessing || (isGpsRequired && !inRangeArea)} 
                                onClick={() => handleAction('clockIn')}
                            >
                                🟢 ENTRA IN TURNO
                            </button>
                        </>
                    )}

                    {isWorking && (
                        <div style={{display:'flex', gap:'15px', width:'100%'}}>
                            <button 
                                style={{ flex:1, padding: '20px', borderRadius: '20px', backgroundColor: pauseStatus === 'COMPLETED' ? '#cbd5e1' : '#f59e0b', color: '#ffffff', fontSize: '1.2rem', fontWeight: '900', border: 'none', boxShadow: pauseStatus === 'COMPLETED' ? 'none' : '0 8px 25px rgba(245,158,11,0.3)', cursor: pauseStatus === 'COMPLETED' || isProcessing ? 'not-allowed' : 'pointer' }} 
                                disabled={isProcessing || pauseStatus==='COMPLETED'} 
                                onClick={() => handleAction('clockPause')}
                            >
                                {pauseStatus === 'COMPLETED' ? 'PAUSA FATTA' : '☕ PAUSA'}
                            </button>

                            <button 
                                style={{ flex:1, padding: '20px', borderRadius: '20px', backgroundColor: '#ef4444', color: '#ffffff', fontSize: '1.2rem', fontWeight: '900', border: 'none', boxShadow: '0 8px 25px rgba(239,68,68,0.3)', cursor: isProcessing ? 'not-allowed' : 'pointer' }} 
                                disabled={isProcessing} 
                                onClick={() => handleAction('clockOut')}
                            >
                                ⏹️ FINE TURNO
                            </button>
                        </div>
                    )}

                    {isOnPause && ( 
                        <button 
                            style={{ width: '100%', padding: '22px', borderRadius: '20px', backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '1.3rem', fontWeight: '900', border: 'none', boxShadow: '0 8px 25px rgba(59,130,246,0.3)', cursor: isProcessing ? 'not-allowed' : 'pointer', marginTop: '15px' }} 
                            disabled={isProcessing} 
                            onClick={() => handleAction('clockPause')}
                        >
                            ▶️ RIPRENDI LAVORO
                        </button> 
                    )}
                </div>

                {/* --- BOTTONI AZIONI GIGANTI E COLORATI --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', marginBottom: '25px' }}>
                    
                    {/* BOTTONE RAPPORTINO INTELLIGENTE */}
                    {cantiereHaComputo ? (
                        <button 
                            onClick={() => setShowDailyReportModal(true)}
                            style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', boxShadow: '0 8px 20px rgba(79,70,229,0.3)' }}
                        >
                            <span style={{fontSize: '1.5rem'}}>📝</span> Rapportino Cantiere
                        </button>
                    ) : (
                        <button 
                            disabled={true}
                            onClick={() => {
                                if (!lockedAreaId) alert("Devi prima entrare in turno in un cantiere.");
                                else alert("Rapportini bloccati: questo cantiere non ha un Computo Metrico associato.");
                            }}
                            style={{ ...styles.actionBtn, background: '#e2e8f0', color: '#94a3b8', boxShadow: 'none', cursor: 'not-allowed' }}
                        >
                            <span style={{fontSize: '1.5rem'}}>📝</span> Rapportino (Sospeso)
                        </button>
                    )}
                    
                    <button 
                        onClick={() => { setExpenseToEdit(null); setShowExpenseModal(true); }}
                        style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)', boxShadow: '0 8px 20px rgba(139,92,246,0.3)' }}
                    >
                        <span style={{fontSize: '1.5rem'}}>💰</span> Registra Spesa
                    </button>
                    
                    <button 
                        onClick={handleViewExpenses}
                        style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)', boxShadow: '0 8px 20px rgba(13,148,136,0.3)' }}
                    >
                        <span style={{fontSize: '1.5rem'}}>📜</span> I Miei Rimborsi
                    </button>

                    <button 
                        onClick={() => setShowAssets(!showAssets)}
                        style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 8px 20px rgba(217,119,6,0.3)' }}
                    >
                        <span style={{fontSize: '1.5rem'}}>📦</span> Le Mie Dotazioni
                    </button>
                </div>

                {/* PANNELLO DOTAZIONI ESPANSO */}
                {showAssets && (
                    <div style={{width:'100%', background:'#fff', padding:'25px 20px', borderRadius:'24px', border:'1px solid #f1f5f9', boxShadow:'0 8px 25px rgba(0,0,0,0.03)', marginBottom: '25px'}}>
                        <h3 style={{marginTop:0, color:'#1e293b', fontWeight:'900', fontSize:'1.2rem', marginBottom:'15px'}}>📦 In mio possesso:</h3>
                        {isLoadingAssets ? <p style={{color:'#64748b'}}>Caricamento...</p> : (assignedEquipment.length === 0 && assignedVehicles.length === 0) ? <p style={{color:'#64748b', fontStyle:'italic'}}>Nessuna dotazione in carico.</p> : (
                            <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                                {assignedVehicles.map(v => (<div key={v.id} style={{background:'#f8fafc', padding:'15px', borderRadius:'16px', border:'1px solid #e2e8f0'}}><div style={{fontWeight:'900', color:'#0f172a', fontSize:'1.1rem'}}>🚐 {v.brand} {v.model}</div><div style={{fontSize:'0.85rem', color:'#3b82f6', marginTop:'5px', fontWeight:'800', background:'#eff6ff', display:'inline-block', padding:'4px 10px', borderRadius:'8px'}}>{v.plate}</div></div>))}
                                {assignedEquipment.map(eq => (<div key={eq.id} style={{background:'#f8fafc', padding:'15px', borderRadius:'16px', border:'1px solid #e2e8f0'}}><div style={{fontWeight:'900', color:'#0f172a', fontSize:'1.1rem'}}>🛠️ {eq.name}</div><div style={{fontSize:'0.85rem', color:'#64748b', marginTop:'5px', fontWeight:'600'}}>{eq.brand} - {eq.serialNumber || 'N/D'}</div></div>))}
                            </div>
                        )}
                    </div>
                )}

                {/* PANNELLO SCARICO ORE MESE */}
                <div style={{ width: '100%', background: '#fff', borderRadius: '24px', padding: '30px 20px', boxShadow: '0 8px 25px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: '900', color: '#1e293b', textAlign: 'center', fontSize: '1.3rem', marginBottom: '20px' }}>📄 Report Mensile Ore</div>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                        <select style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #cbd5e1', fontSize: '1.1rem', backgroundColor: '#f8fafc', color: '#334155', fontWeight: '800', outline: 'none' }} value={selectedMonth} onChange={(e)=>setSelectedMonth(parseInt(e.target.value))}>
                            {["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].map((m,i)=><option key={i} value={i}>{m}</option>)}
                        </select>
                        <select style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #cbd5e1', fontSize: '1.1rem', backgroundColor: '#f8fafc', color: '#334155', fontWeight: '800', outline: 'none' }} value={selectedYear} onChange={(e)=>setSelectedYear(parseInt(e.target.value))}>
                            {[2024, 2025, 2026, 2027].map(y=><option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button 
                        onClick={handleExportPDF} 
                        disabled={isGeneratingPdf} 
                        style={{ width: '100%', padding: '20px', borderRadius: '100px', backgroundColor: '#334155', color: '#ffffff', border: 'none', fontWeight: '900', fontSize: '1.2rem', cursor: isGeneratingPdf ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px rgba(51,65,85,0.3)' }}
                    >
                        {isGeneratingPdf ? 'Elaborazione in corso...' : '⬇️ SCARICA PDF ORE'}
                    </button>
                </div>

                {/* MODALE STORICO SPESE (NATIVO HTML) */}
                {showExpenseHistory && ReactDOM.createPortal(
                    <div style={overlayStyle} onClick={() => setShowExpenseHistory(false)}>
                        <div style={containerStyle}>
                            <div style={{...modalStyle, padding:'0'}} onClick={(e) => e.stopPropagation()}>
                                <div style={{padding:'20px 25px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <h3 style={{margin:0, color:'#0f172a', fontSize:'1.3rem', fontWeight:'900'}}>📜 I Miei Rimborsi</h3>
                                    <button onClick={()=>setShowExpenseHistory(false)} style={{border:'none', background:'none', fontSize:'28px', cursor:'pointer', color:'#64748b', lineHeight:1}}>&times;</button>
                                </div>
                                <div style={{flex:1, overflowY:'auto', padding:'20px'}}>
                                    {isLoadingExpenses ? <p style={{textAlign:'center', fontWeight:'800', color:'#64748b'}}>Caricamento...</p> : myExpenses.length === 0 ? <p style={{textAlign:'center', fontWeight:'700', color:'#94a3b8'}}>Nessuna spesa registrata.</p> : myExpenses.map(e => (
                                        <div key={e.id} style={{border:'1px solid #e2e8f0', borderRadius:'16px', padding:'15px', marginBottom:'15px', backgroundColor:'#fff', boxShadow:'0 4px 10px rgba(0,0,0,0.02)'}}>
                                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px', alignItems:'center'}}>
                                                <span style={{fontWeight:'900', fontSize:'1.1rem', color:'#1e293b'}}>{e.description}</span>
                                                <span style={{fontWeight:'900', color:'#0d9488', fontSize:'1.3rem'}}>€ {e.amount}</span>
                                            </div>
                                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                                                <div>
                                                    <div style={{fontSize:'0.85rem', color:'#64748b', fontWeight:'700'}}>{e.date?.toDate().toLocaleDateString('it-IT')}</div>
                                                    <div style={{fontSize:'0.8rem', color:'#64748b', background:'#f1f5f9', padding:'4px 8px', borderRadius:'8px', display:'inline-block', marginTop:'5px', fontWeight:'600'}}>💳 {e.paymentMethod}</div>
                                                </div>
                                                <div style={{fontSize:'0.85rem', fontWeight:'900', padding:'6px 12px', borderRadius:'10px', backgroundColor: e.status === 'approved' || e.status === 'paid' ? '#dcfce7' : e.status === 'rejected' ? '#fee2e2' : '#fef3c7', color: e.status === 'approved' || e.status === 'paid' ? '#16a34a' : e.status === 'rejected' ? '#ef4444' : '#d97706'}}>
                                                    {e.status === 'pending' ? 'IN ATTESA' : e.status === 'paid' || e.status === 'closed' ? 'SALDATO' : e.status.toUpperCase()}
                                                </div>
                                            </div>
                                            {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:'0.9rem', color:'#3b82f6', textDecoration:'none', fontWeight:'800', display:'block', marginTop:'5px'}}>📎 Apri Scontrino</a>}
                                            
                                            {e.status==='pending' && (
                                                <div style={{marginTop:'15px', display:'flex', gap:'10px', justifyContent:'flex-end', borderTop:'1px dashed #e2e8f0', paddingTop:'15px'}}>
                                                    <button onClick={()=>{setExpenseToEdit(e); setShowExpenseModal(true); setShowExpenseHistory(false);}} style={{border:'none', background:'#eff6ff', color:'#3b82f6', padding:'10px 15px', borderRadius:'10px', fontWeight:'800', cursor:'pointer'}}>Modifica</button>
                                                    <button onClick={()=>handleDeleteExpense(e.id)} style={{border:'none', background:'#fef2f2', color:'#ef4444', padding:'10px 15px', borderRadius:'10px', fontWeight:'800', cursor:'pointer'}}>Elimina</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>, document.body
                )}

                <ExpenseModalInternal show={showExpenseModal} onClose={() => {setShowExpenseModal(false); setExpenseToEdit(null);}} user={user} employeeData={employeeData} expenseToEdit={expenseToEdit} />
                <MobileDailyReportModal show={showDailyReportModal} onClose={() => setShowDailyReportModal(false)} employeeData={employeeData} lockedAreaId={lockedAreaId} lockedAreaName={lockedAreaName} lockedAreaObj={lockedAreaObj} />

            </div>
            <div style={styles.footer}>TCS Italia App v2.7<br/>Design by D. Leoncino</div>
        </div>
    );
};

export default EmployeeDashboard;