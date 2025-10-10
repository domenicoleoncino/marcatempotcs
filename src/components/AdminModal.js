import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, deleteDoc, getDoc} from 'firebase/firestore';

// --- FUNZIONE DI ARROTONDAMENTO ---
const roundTimeWithCustomRules = (date, type) => {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();
    if (type === 'entrata') {
        if (minutes >= 46) {
            newDate.setHours(newDate.getHours() + 1);
            newDate.setMinutes(0);
        } else if (minutes >= 16) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    } else if (type === 'uscita') {
        if (minutes >= 30) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    }
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
};

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, superAdminEmail, user, allEmployees, currentUserRole, userData, onAdminClockIn, onAdminApplyPause }) => {
    const [formData, setFormData] = useState(item || {});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleCheckboxChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.workAreaIds || item?.workAreaIds || [];
        if (checked) {
            setFormData({ ...formData, workAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, workAreaIds: currentAreas.filter(id => id !== name) });
        }
    };

    const handleManagedAreasChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.managedAreaIds || item?.managedAreaIds || [];
        if (checked) {
            setFormData({ ...formData, managedAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, managedAreaIds: currentAreas.filter(id => id !== name) });
        }
    };

    useEffect(() => {
        if (type === 'manualClockIn' || type === 'manualClockOut' || type === 'adminClockIn') {
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '', note: item?.activeEntry?.note || '' });
        } else {
            setFormData(item ? { ...item } : {});
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((type === 'newEmployee' || type === 'newAdmin') && (!formData.password || formData.password.length < 6)) {
            setError("La password deve essere di almeno 6 caratteri.");
            return;
        }
        if (type === 'deleteAdmin' && item.id === user.uid) {
            setError("Non puoi eliminare te stesso.");
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            if (type === 'adminClockIn') {
                await onAdminClockIn(formData.workAreaId, formData.timestamp);
            } else if (type === 'applyPredefinedPause') {
                await onAdminApplyPause(item);
            } else if (type === 'newEmployee' || type === 'newAdmin') {
                // --- INIZIO CODICE CORRETTO ---
                
                // 1. Definisci l'URL della tua funzione
                const functionURL = 'https://us-central1-marcatempo-tcs.cloudfunctions.net/createNewUser';

                // 2. Prepara il pacchetto di dati (payload) con i nomi GIUSTI (in italiano)
                const newUserPayload = {
                    email: formData.email.toLowerCase().trim(),
                    password: formData.password,
                    nome: formData.name,       // Corretto: invia 'nome'
                    cognome: formData.surname, // Corretto: invia 'cognome'
                    telefono: formData.phone || "", // Corretto: invia 'telefono'
                    role: type === 'newEmployee' ? 'employee' : (formData.role || 'preposto'),
                };
                
                // 3. Esegui la chiamata con il metodo standard 'fetch'
                const response = await fetch(functionURL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(newUserPayload)
                });
                
                // 4. Controlla se la risposta dal server è positiva
                if (!response.ok) {
                    const errorData = await response.json();
                    // Se c'è un errore, lo mostra all'utente
                    throw new Error(errorData.error || 'Si è verificato un errore durante la creazione dell\'utente.');
                }
                
                // --- FINE CODICE CORRETTO ---

            } else {
                switch (type) {
                    // ... il resto della logica rimane invariato ...
                    case 'assignEmployeeToArea':
                        const empRef = doc(db, "employees", formData.employeeId);
                        const empDoc = await getDoc(empRef);
                        if (empDoc.exists()) {
                            const currentWorkAreaIds = empDoc.data().workAreaIds || [];
                            const newWorkAreaIds = [...new Set([...currentWorkAreaIds, ...(formData.workAreaIds || [])])];
                            await updateDoc(empRef, { workAreaIds: newWorkAreaIds });
                        }
                        break;
                    case 'editEmployee':
                        await updateDoc(doc(db, "employees", item.id), { name: formData.name, surname: formData.surname, phone: formData.phone });
                        break;
                    case 'deleteEmployee':
                        await deleteDoc(doc(db, "employees", item.id));
                        break;
                    case 'newArea':
                        await addDoc(collection(db, "work_areas"), { 
                            name: formData.name, 
                            latitude: parseFloat(formData.latitude), 
                            longitude: parseFloat(formData.longitude), 
                            radius: parseInt(formData.radius, 10),
                            pauseDuration: parseInt(formData.pauseDuration || 0, 10)
                        });
                        break;
                    case 'editArea':
                        await updateDoc(doc(db, "work_areas", item.id), { 
                            name: formData.name, 
                            latitude: parseFloat(formData.latitude), 
                            longitude: parseFloat(formData.longitude), 
                            radius: parseInt(formData.radius, 10),
                            pauseDuration: parseInt(formData.pauseDuration || 0, 10)
                        });
                        break;
                    case 'deleteArea':
                        await deleteDoc(doc(db, "work_areas", item.id));
                        break;
                    case 'assignArea':
                        await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.workAreaIds || [] });
                        break;
                    case 'deleteAdmin':
                        if (item.email === superAdminEmail) { throw new Error("Non puoi eliminare il Super Admin."); }
                        await deleteDoc(doc(db, "users", item.id));
                        break;
                    case 'assignManagedAreas':
                        await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.managedAreaIds || [] });
                        break;
                    case 'manualClockIn':
                        await addDoc(collection(db, "time_entries"), { 
                            employeeId: item.id, 
                            workAreaId: formData.workAreaId, 
                            clockInTime: roundTimeWithCustomRules(new Date(formData.timestamp), 'entrata'), 
                            clockOutTime: null, 
                            status: 'clocked-in', 
                            note: formData.note || null, 
                            pauses: [],
                            createdBy: user.uid 
                        });
                        break;
                    case 'manualClockOut':
                        await updateDoc(doc(db, "time_entries", item.activeEntry.id), { 
                            clockOutTime: roundTimeWithCustomRules(new Date(formData.timestamp), 'uscita'), 
                            status: 'clocked-out', 
                            note: formData.note || item.activeEntry.note || null,
                            createdBy: user.uid
                        });
                        break;
                    case 'resetDevice':
                        await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                        break;
                    default: break;
                }
            }

            if(onDataUpdate) await onDataUpdate();
            setShowModal(false);
        } catch (err) {
            setError(err.message);
            console.error("Errore nell'handleSubmit:", err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const titles = {
        newEmployee: 'Aggiungi Nuovo Dipendente',
        editEmployee: 'Modifica Dati Dipendente',
        deleteEmployee: 'Elimina Dipendente',
        newArea: 'Aggiungi Nuova Area',
        editArea: 'Modifica Area di Lavoro',
        deleteArea: 'Elimina Area di Lavoro',
        assignArea: `Assegna Aree a ${item?.name} ${item?.surname}`,
        newAdmin: 'Aggiungi Personale Amministrativo',
        deleteAdmin: 'Elimina Personale Amministrativo',
        assignManagedAreas: `Assegna Aree a Preposto ${item?.name}`,
        manualClockIn: `Timbra Entrata per ${item?.name} ${item?.surname}`,
        manualClockOut: `Timbra Uscita per ${item?.name} ${item?.surname}`,
        resetDevice: `Resetta Dispositivi di ${item?.name} ${item?.surname}`,
        adminClockIn: `Timbra Entrata Personale`,
        assignEmployeeToArea: 'Assegna Dipendente ad Aree',
        applyPredefinedPause: `Applica Pausa a ${item?.name} ${item?.surname}`,
    };

    const renderForm = () => {
        switch (type) {
            case 'newEmployee':
            case 'newAdmin':
                return ( <div className="space-y-4">
                    <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                    <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                    <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" required className="w-full p-2 border rounded" />
                    <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" required className="w-full p-2 border rounded" />
                    <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefono (opzionale)" className="w-full p-2 border rounded" />
                    {type === 'newAdmin' && currentUserRole === 'admin' && (
                        <select name="role" value={formData.role || 'preposto'} onChange={handleInputChange} required className="w-full p-2 border rounded">
                            <option value="preposto">Preposto</option>
                            <option value="admin">Admin</option>
                        </select>
                    )}
                </div> );
            // ... il resto del file rimane invariato ...
            default: return null;
        }
    };

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 m-4 max-w-lg w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">{titles[type]}</h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="text-2xl">&times;</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">{renderForm()}</div>
                    {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Annulla</button>
                        <button type="submit" disabled={isLoading} className={`px-4 py-2 text-white rounded-md ${type.includes('delete') || type === 'applyPredefinedPause' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:bg-gray-400 flex items-center gap-2`}>
                            {isLoading ? 'Caricamento...' : (type.includes('delete') || type === 'applyPredefinedPause' ? 'Conferma' : 'Salva')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminModal;

