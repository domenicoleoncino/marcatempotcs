import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, addDoc, arrayUnion, Timestamp, writeBatch } from 'firebase/firestore';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import CompanyLogo from './CompanyLogo';

// ... (le funzioni calculateDistance e getDeviceId rimangono invariate) ...
const calculateDistance = (lat1, lon1, lat2, lon2) => { /* ... */ };
const getDeviceId = () => { /* ... */ };


const EmployeeDashboard = ({ user, handleLogout }) => {
    const [employeeData, setEmployeeData] = useState(null);
    const [allTimestamps, setAllTimestamps] = useState([]); // Salva TUTTE le timbrature qui
    const [filteredTimestamps, setFilteredTimestamps] = useState([]); // Timbrature filtrate per mese
    const [activeEntry, setActiveEntry] = useState(null);
    const [workAreas, setWorkAreas] = useState([]);
    const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isDeviceOk, setIsDeviceOk] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    
    // NUOVI STATI PER IL FILTRO
    const [selectedMonth, setSelectedMonth] = useState('');
    const [availableMonths, setAvailableMonths] = useState([]);

    const isOnBreak = activeEntry?.pauses?.some(p => !p.end) || false;

    // ... (la funzione getCurrentLocation rimane invariata) ...
    const getCurrentLocation = () => { /* ... */ };

    const fetchEmployeeData = useCallback(async () => {
        // ... (la logica iniziale di fetchEmployeeData rimane la stessa) ...
        // FINO A:
        
        // Modifica: Ora carica TUTTE le timbrature passate e le salva in allTimestamps
        const qPastEntries = query(
            collection(db, "time_entries"),
            where("employeeId", "==", data.id),
            where("status", "==", "clocked-out"),
            orderBy("clockInTime", "desc")
        );
        const pastEntriesSnapshot = await getDocs(qPastEntries);
        const pastEntries = pastEntriesSnapshot.docs.map(doc => {
            // ... (la tua logica per mappare i dati della timbratura) ...
        });
        setAllTimestamps(pastEntries); // Salva tutte le timbrature

    }, [user]);

    // EFFETTO PER GESTIRE I FILTRI QUANDO LE TIMBRATURE SONO CARICATE
    useEffect(() => {
        if (allTimestamps.length > 0) {
            // Genera la lista dei mesi disponibili (es. "Settembre 2025")
            const months = [...new Set(allTimestamps.map(entry => {
                const date = new Date(entry.date.split('/').reverse().join('-'));
                return date.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
            }))];
            setAvailableMonths(months);

            // Imposta il mese corrente come preselezionato
            const currentMonthStr = new Date().toLocaleString('it-IT', { month: 'long', year: 'numeric' });
            setSelectedMonth(months.includes(currentMonthStr) ? currentMonthStr : months[0] || '');
        }
    }, [allTimestamps]);

    // EFFETTO PER FILTRARE LE TIMBRATURE QUANDO CAMBIA IL MESE SELEZIONATO
    useEffect(() => {
        if (selectedMonth) {
            const filtered = allTimestamps.filter(entry => {
                const entryMonthStr = new Date(entry.date.split('/').reverse().join('-'))
                    .toLocaleString('it-IT', { month: 'long', year: 'numeric' });
                return entryMonthStr === selectedMonth;
            });
            setFilteredTimestamps(filtered);
        } else {
            setFilteredTimestamps([]);
        }
    }, [selectedMonth, allTimestamps]);

    useEffect(() => {
        setIsLoading(true);
        fetchEmployeeData();
    }, [fetchEmployeeData]);

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    const handleDownloadPdf = () => {
        if (!employeeData || filteredTimestamps.length === 0) {
            alert("Nessun dato da esportare per il mese selezionato.");
            return;
        }

        const doc = new jsPDF();
        
        // Titolo del documento
        doc.setFontSize(18);
        doc.text(`Report Mensile - ${selectedMonth}`, 14, 22);
        doc.setFontSize(11);
        doc.text(`Dipendente: ${employeeData.name} ${employeeData.surname}`, 14, 30);
        
        // Prepara i dati per la tabella
        const tableColumn = ["Data", "Area", "Entrata", "Uscita", "Ore"];
        const tableRows = [];

        let totalHours = 0;
        filteredTimestamps.forEach(entry => {
            const entryData = [
                entry.date,
                entry.areaName,
                entry.clockIn,
                entry.clockOut,
                entry.duration
            ];
            tableRows.push(entryData);
            totalHours += parseFloat(entry.duration);
        });

        // Crea la tabella
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 35,
        });
        
        // Aggiungi il totale ore alla fine
        const finalY = doc.lastAutoTable.finalY; // Posizione Y dopo la tabella
        doc.setFontSize(12);
        doc.text(`Totale Ore Lavorate: ${totalHours.toFixed(2)}`, 14, finalY + 10);

        // Salva il file
        const fileName = `Report_${selectedMonth.replace(' ', '_')}_${employeeData.surname}.pdf`;
        doc.save(fileName);
    };
    
    // ... (tutte le altre funzioni: handleClockIn, handleClockOut, etc. rimangono invariate) ...
    const handleClockIn = async (areaId) => { /* ... */ };
    const handleClockOut = async () => { /* ... */ };
    const handleStartPause = async () => { /* ... */ };
    const handleEndPause = async () => { /* ... */ };

    // --- RENDERIZZAZIONE ---
    
    // ... (La parte iniziale del return con header, stato timbratura, etc. rimane invariata) ...
    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4">
            {/* ... header, stato timbratura, aree di lavoro ... */}

            <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-md">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-2xl font-bold text-gray-800">Cronologia Timbrature</h2>
                    <button 
                        onClick={handleDownloadPdf} 
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 w-full sm:w-auto disabled:bg-gray-400"
                        disabled={filteredTimestamps.length === 0}
                    >
                        Scarica PDF
                    </button>
                </div>

                {/* NUOVO MENU A TENDINA PER IL FILTRO MESE */}
                {availableMonths.length > 0 && (
                    <div className="mb-4">
                        <label htmlFor="month-select" className="block text-sm font-medium text-gray-700">Seleziona Mese:</label>
                        <select 
                            id="month-select" 
                            name="month-select"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            {availableMonths.map(month => (
                                <option key={month} value={month}>{month}</option>
                            ))}
                        </select>
                    </div>
                )}

                {filteredTimestamps.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uscita</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredTimestamps.map((entry) => (
                                    <tr key={entry.id}>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.date}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.areaName}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.clockIn}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.clockOut}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{entry.duration}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-gray-500 text-center">Nessuna timbratura trovata per il mese selezionato.</p>
                )}
            </div>
        </div>
    );
};

export default EmployeeDashboard;