/* eslint-disable no-unused-vars */
/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
    collection, getDocs, query, where,
    Timestamp, onSnapshot, updateDoc, doc, limit,
    addDoc, writeBatch
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import AdminModal from './AdminModal'; 
import MappaPresenze from './MappaPresenze'; 
import { utils, writeFile } from 'xlsx';
import { saveAs } from 'file-saver';

// ===========================================
// --- SUB-COMPONENTI E FUNZIONI INIZIALI ---
// ===========================================

// VARIABILE PER IL CONTROLLO SUPER ADMIN
const SUPER_ADMIN_EMAIL = "domenico.leoncino@tcsitalia.com"; 

const NotificationPopup = ({ message, type, onClose }) => {
    const baseClasses = "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 p-4 rounded-lg shadow-xl text-white transition-opacity duration-300";
    const typeClasses = {
        success: "bg-green-500",
        error: "bg-red-500",
        info: "bg-blue-500"
    };

    return (
        <div className={`${baseClasses} ${typeClasses[type]}`}>
            <p className="font-semibold">{type === 'error' ? 'ERRORE:' : 'Successo:'}</p>
            <p className="text-sm">{message}</p>
            <button onClick={onClose} className="absolute top-1 right-2 text-lg font-bold">&times;</button>
        </div>
    );
};

export const renderField = (formData, handleChange, label, name, type = 'text', options = [], required = true) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
        {type === 'select' ? (
             <select
                 id={name} name={name} value={formData[name] ?? ''} onChange={handleChange}
                 required={required}
                 className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
             >
                 {(!required || options.length > 0) && <option value="">{options.length > 0 ? '-- Seleziona --' : '-- Nessuna Opzione --'}</option>}
                 {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
             </select>
        ) : (
            <input
                id={name} name={name} type={type} value={formData[name] ?? ''} onChange={handleChange}
                step={type === 'number' ? 'any' : undefined}
                required={required}
                placeholder={name === 'latitude' ? 'Es. 40.8518' : name === 'longitude' ? 'Es. 14.2681' : undefined}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
        )}
    </div>
);

export const renderSingleCheckbox = (formData, handleChange, label, name, description = '') => (
    <div className="flex items-start pt-4">
        <div className="flex items-center h-5">
            <input
                id={name}
                name={name}
                type="checkbox"
                checked={!!formData[name]}
                onChange={handleChange}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
        </div>
        <div className="ml-3 text-sm">
            <label htmlFor={name} className="font-medium text-gray-700">{label}</label>
            {description && <p className="text-gray-500">{description}</p>}
        </div>
    </div>
);

// === FUNZIONI PER I FORM IN-LINE ===

const NewEmployeeForm = ({ onDataUpdate, user, setView, showNotification }) => {
    const [formData, setFormData] = useState({ name: '', surname: '', email: '', password: '', controlloGpsRichiesto: true });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const functions = getFunctions(undefined, 'europe-west1');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: type === 'checkbox' ? checked : value 
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!formData.name || !formData.surname || !formData.email || !formData.password) {
            setError('Nome, Cognome, Email e Password sono obbligatori.');
            setIsLoading(false);
            return;
        }

        try {
            const createUser = httpsCallable(functions, 'createUser');
            await createUser({ ...formData, role: 'dipendente', createdBy: user.uid });
            showNotification('Dipendente creato con successo!', 'success');
            await onDataUpdate();
            setView('employees'); 
        } catch (err) {
            const errorMessage = err.message || "Si è verificato un errore sconosciuto.";
            setError(errorMessage.includes(":") ? errorMessage.split(":")[1].trim() : errorMessage);
            console.error("Errore creazione dipendente:", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Crea Nuovo Dipendente</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-sm text-red-600 mb-4 bg-red-100 p-3 rounded border border-red-200">{error}</p>}
                
                {renderField(formData, handleChange, 'Nome', 'name')}
                {renderField(formData, handleChange, 'Cognome', 'surname')}
                {renderField(formData, handleChange, 'Email', 'email', 'email')}
                {renderField(formData, handleChange, 'Password (min. 6 caratteri)', 'password', 'password')}
                {renderSingleCheckbox(formData, handleChange, 'Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, l\'utente potrà timbrare ovunque.')}
                
                <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={() => setView('employees')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Annulla</button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {isLoading ? 'Creazione...' : 'Crea Dipendente'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// --- NUOVO: MODIFICA DIPENDENTE (PAGINA PULITA) ---
const EditEmployeeForm = ({ employee, onDataUpdate, setView, showNotification }) => {
    const [formData, setFormData] = useState({
        name: employee?.name || '',
        surname: employee?.surname || '',
        email: employee?.email || '', 
        controlloGpsRichiesto: employee?.controlloGpsRichiesto !== false 
    });
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: type === 'checkbox' ? checked : value 
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const employeeRef = doc(db, "employees", employee.id);
            
            await updateDoc(employeeRef, {
                name: formData.name,
                surname: formData.surname,
                controlloGpsRichiesto: formData.controlloGpsRichiesto
            });

            showNotification('Dipendente aggiornato con successo!', 'success');
            await onDataUpdate();
            setView('employees'); 
        } catch (err) {
            console.error("Errore aggiornamento:", err);
            showNotification("Errore durante l'aggiornamento: " + err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-4 mb-6 animate-fade-in">
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Modifica Dipendente: {employee?.name} {employee?.surname}</h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderField(formData, handleChange, 'Nome', 'name')}
                    {renderField(formData, handleChange, 'Cognome', 'surname')}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Email (Sola lettura)</label>
                    <input 
                        disabled 
                        value={formData.email} 
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-gray-100 text-gray-500 rounded-md shadow-sm sm:text-sm cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-400 mt-1">Per modificare l'email di accesso, contattare l'assistenza tecnica.</p>
                </div>

                {renderSingleCheckbox(formData, handleChange, 'Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, l\'utente potrà timbrare ovunque.')}
                
                <div className="flex justify-end space-x-3 pt-6">
                    <button type="button" onClick={() => setView('employees')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Annulla</button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {isLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const NewAreaForm = ({ onDataUpdate, setView, showNotification }) => {
    const [formData, setFormData] = useState({ name: '', pauseDuration: 0, latitude: '', longitude: '', radius: 100 });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const functions = getFunctions(undefined, 'europe-west1');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!formData.name || formData.latitude == null || formData.longitude == null || formData.radius == null) {
            setError('Tutti i campi (Nome, Latitudine, Longitudine, Raggio) sono obbligatori.');
            setIsLoading(false);
            return;
        }

        try {
            const lat = Number(formData.latitude); 
            const lon = Number(formData.longitude); 
            const rad = Number(formData.radius);
            
            if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0) { 
                throw new Error('Latitudine, Longitudine devono essere numeri validi e Raggio deve essere > 0.'); 
            }

            const createArea = httpsCallable(functions, 'createWorkArea');
            await createArea({ 
                name: formData.name, 
                pauseDuration: Number(formData.pauseDuration || 0), 
                latitude: lat, 
                longitude: lon, 
                radius: rad 
            });

            showNotification('Area creata con successo!', 'success');
            await onDataUpdate();
            setView('areas'); 
        } catch (err) {
            const errorMessage = err.message || "Si è verificato un errore sconosciuto.";
            setError(errorMessage.includes(":") ? errorMessage.split(":")[1].trim() : errorMessage);
            console.error("Errore creazione area:", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Aggiungi Nuova Area di Lavoro</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                 {error && <p className="text-sm text-red-600 mb-4 bg-red-100 p-3 rounded border border-red-200">{error}</p>}
                
                 {renderField(formData, handleChange, 'Nome Area', 'name')}
                 {renderField(formData, handleChange, 'Durata Pausa Predefinita (minuti)', 'pauseDuration', 'number', [], false)}
                 {renderField(formData, handleChange, 'Latitudine', 'latitude', 'number')}
                 {renderField(formData, handleChange, 'Longitudine', 'longitude', 'number')}
                 {renderField(formData, handleChange, 'Raggio di Tolleranza (metri)', 'radius', 'number')}
                
                <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={() => setView('areas')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Annulla</button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {isLoading ? 'Creazione...' : 'Crea Area'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const NewAdminForm = ({ onDataUpdate, user, setView, showNotification }) => {
    const [formData, setFormData] = useState({ name: '', surname: '', email: '', password: '', phone: '', role: 'preposto', controlloGpsRichiesto: true });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const functions = getFunctions(undefined, 'europe-west1');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: type === 'checkbox' ? checked : value 
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!formData.name || !formData.surname || !formData.email || !formData.password || !formData.role) {
            setError('Tutti i campi (eccetto Telefono) sono obbligatori.');
            setIsLoading(false);
            return;
        }
        if (formData.password.length < 6) {
            setError('La password deve essere di almeno 6 caratteri.');
            setIsLoading(false);
            return;
        }

        try {
            const createAdminFn = httpsCallable(functions, 'createUser');
            await createAdminFn({ ...formData, createdBy: user.uid });
            showNotification(`Utente ${formData.role} creato con successo!`, 'success');
            await onDataUpdate();
            setView('admins'); 
        } catch (err) {
            const errorMessage = err.message || "Si è verificato un errore sconosciuto.";
            setError(errorMessage.includes(":") ? errorMessage.message.split(":")[1].trim() : errorMessage);
            console.error("Errore creazione Admin/Preposto:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const roleOptions = [
        {value: 'preposto', label: 'Preposto (Caposquadra)'}, 
        {value: 'admin', label: 'Admin (Amministratore)'}
    ];

    return (
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Crea Nuovo Admin/Preposto</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                 {error && <p className="text-sm text-red-600 mb-4 bg-red-100 p-3 rounded border border-red-200">{error}</p>}
                
                {renderField(formData, handleChange, 'Nome', 'name')}
                {renderField(formData, handleChange, 'Cognome', 'surname')}
                {renderField(formData, handleChange, 'Email', 'email', 'email')}
                {renderField(formData, handleChange, 'Password (min. 6 caratteri)', 'password', 'password')}
                {renderField(formData, handleChange, 'Telefono (Opzionale)', 'phone', 'tel', [], false)}
                {renderField(formData, handleChange, 'Ruolo', 'role', 'select', roleOptions)}
                {renderSingleCheckbox(formData, handleChange, 'Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, questo preposto/admin potrà timbrare ovunque.')}
                
                <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={() => setView('admins')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Annulla</button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {isLoading ? 'Creazione...' : 'Crea Utente'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const PrepostoAddEmployeeForm = ({ onDataUpdate, user, setView, showNotification, workAreas, allEmployees, userData }) => {
    const [formData, setFormData] = useState({ selectedEmployee: '', selectedPrepostoAreas: [] });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const functions = getFunctions(undefined, 'europe-west1');

    const managedAreas = useMemo(() => 
        workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id)), 
    [workAreas, userData]);

    const employeeOptions = useMemo(() => 
        allEmployees
            .sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`))
            .map(emp => ({ value: emp.id, label: `${emp.name} ${emp.surname} (${emp.email})` })),
    [allEmployees]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            if (name === 'selectedPrepostoAreas') {
                const currentSelection = formData[name] || [];
                if (checked) {
                    setFormData(prev => ({ ...prev, [name]: [...currentSelection, value] }));
                } else {
                    setFormData(prev => ({ ...prev, [name]: currentSelection.filter(id => id !== value) }));
                }
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const renderCheckboxes = (label, name, items, disabled = false) => (
         <div>
             <label className="block text-sm font-medium text-gray-700">{label}</label>
             {items && items.length > 0 ? (
                  <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-2 bg-gray-50">
                      {items
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(it => (
                              <div key={it.id} className="flex items-center">
                                  <input
                                      id={`${name}-${it.id}`} name={name} type="checkbox" value={it.id}
                                      checked={(formData[name] || []).includes(it.id)}
                                      onChange={handleChange} disabled={disabled}
                                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:opacity-50"
                                  />
                                  <label htmlFor={`${name}-${it.id}`} className={`ml-3 block text-sm ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>{it.name}</label>
                              </div>
                          ))}
                      </div>
                 ) : (
                      <p className="text-sm text-red-500 mt-2">{disabled ? 'Nessuna area disponibile.' : 'Nessuna area definita.'}</p>
                 )}
         </div>
      );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!formData.selectedEmployee) {
            setError("Devi selezionare un dipendente.");
            setIsLoading(false);
            return;
        }
        if (!formData.selectedPrepostoAreas || formData.selectedPrepostoAreas.length === 0) {
            setError("Devi selezionare almeno un'area da assegnare.");
            setIsLoading(false);
            return;
        }
        
        try {
            const employeeToAssignId = formData.selectedEmployee;
            const areaIdsToAssign = formData.selectedPrepostoAreas;

            const prepostoAssign = httpsCallable(functions, 'prepostoAssignEmployeeToArea');
            await prepostoAssign({ employeeId: employeeToAssignId, areaIds: areaIdsToAssign });

            showNotification('Aree assegnate con successo al dipendente selezionato.', 'success');
            await onDataUpdate();
            setView('employees'); 
        } catch (err) {
            const errorMessage = err.message || "Si è verificato un errore sconosciuto.";
            setError(errorMessage.includes(":") ? errorMessage.message.split(":")[1].trim() : errorMessage);
            console.error("Errore assegnazione aree:", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Assegna Aree di Tua Competenza</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-sm text-red-600 mb-4 bg-red-100 p-3 rounded border border-red-200">{error}</p>}
                
                {renderField(formData, handleChange, 'Seleziona Dipendente da Aggiungere', 'selectedEmployee', 'select', employeeOptions, true)}
                {renderCheckboxes('Seleziona le aree di tua competenza a cui assegnarlo', 'selectedPrepostoAreas', managedAreas, managedAreas.length === 0)}
                
                <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={() => setView('employees')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Annulla</button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:bg-teal-300 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {isLoading ? 'Assegnazione...' : 'Assegna Aree'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// --- FORM DI INSERIMENTO MANUALE (RECUPERO) ---
const ManualEntryForm = ({ onDataUpdate, setView, showNotification, allEmployees, allWorkAreas, preselectedEmployee }) => {
    const [f, setF] = useState({
        employeeId: preselectedEmployee ? preselectedEmployee.id : '',
        workAreaId: '',
        date: new Date().toISOString().split('T')[0], 
        startTime: '08:00',
        endTime: '17:00'
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setF(prev => ({ ...prev, [name]: value }));
    };

    const sub = async (e) => {
        e.preventDefault();
        
        if(!f.employeeId || !f.workAreaId || !f.date || !f.startTime || !f.endTime) {
            return showNotification("Compila tutti i campi.", "error");
        }

        try {
            const startDateTime = new Date(`${f.date}T${f.startTime}`);
            const endDateTime = new Date(`${f.date}T${f.endTime}`);

            if (endDateTime <= startDateTime) {
                return showNotification("L'ora di uscita deve essere successiva all'ora di entrata.", "error");
            }

            const newEntry = {
                employeeId: f.employeeId,
                workAreaId: f.workAreaId,
                clockInTime: Timestamp.fromDate(startDateTime),
                clockOutTime: Timestamp.fromDate(endDateTime),
                status: 'clocked-out', 
                isManual: true, 
                note: 'Recupero dimenticanza (Inserito da Admin/Preposto)',
                pauses: [] 
            };

            await addDoc(collection(db, "time_entries"), newEntry);

            showNotification('Timbratura manuale salvata con successo!', 'success');
            await onDataUpdate(); 
            setView('employees'); 

        } catch(err) {
            console.error("Errore salvataggio manuale:", err);
            showNotification("Errore durante il salvataggio: " + err.message, 'error');
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Aggiungi Timbratura Mancante (Recupero)</h3>
            <form onSubmit={sub} className="space-y-4">
                {preselectedEmployee ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Dipendente</label>
                        <input disabled value={`${preselectedEmployee.name} ${preselectedEmployee.surname}`} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-gray-100 rounded-md shadow-sm sm:text-sm text-gray-500" />
                    </div>
                ) : (
                    renderField(f, handleChange, 'Dipendente', 'employeeId', 'select', [{value:'',label:'-- Seleziona --'}, ...allEmployees.map(e=>({value:e.id, label:e.name+' '+e.surname}))])
                )}

                {renderField(f, handleChange, 'Area di Lavoro', 'workAreaId', 'select', [{value:'',label:'-- Seleziona --'}, ...allWorkAreas.map(a=>({value:a.id, label:a.name}))])}
                
                {renderField(f, handleChange, 'Data', 'date', 'date')}
                
                <div className="grid grid-cols-2 gap-4">
                    {renderField(f, handleChange, 'Ora Entrata', 'startTime', 'time')}
                    {renderField(f, handleChange, 'Ora Uscita', 'endTime', 'time')}
                </div>

                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-sm text-yellow-800">
                    ⚠️ Attenzione: Stai inserendo manualmente una timbratura passata. Questa operazione creerà un record immediato nel report.
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={() => setView('employees')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Annulla</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">Salva Timbratura</button>
                </div>
            </form>
        </div>
    );
};

// --- NUOVO FORM: INSERIMENTO GIUSTIFICATIVO (RANGE DATE) ---
const AbsenceEntryForm = ({ onDataUpdate, setView, showNotification, allEmployees, preselectedEmployee }) => {
    const [f, setF] = useState({
        employeeId: preselectedEmployee ? preselectedEmployee.id : '',
        startDate: new Date().toISOString().split('T')[0], 
        endDate: new Date().toISOString().split('T')[0],   
        type: 'Ferie', 
        note: ''
    });

    const absenceTypes = [
        { value: 'Ferie', label: '🏖️ Ferie' },
        { value: 'Malattia', label: '🤒 Malattia' },
        { value: 'Permesso', label: '🕒 Permesso Retribuito' },
        { value: 'Legge 104', label: '♿ Legge 104' },
        { value: 'Infortunio', label: '🚑 Infortunio' },
        { value: 'Assenza Ingiustificata', label: '❌ Assenza Ingiustificata' },
        { value: 'Altro', label: '📝 Altro Motivo' }
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setF(prev => ({ ...prev, [name]: value }));
    };

    const sub = async (e) => {
        e.preventDefault();
        
        if(!f.employeeId || !f.startDate || !f.endDate || !f.type) {
            return showNotification("Compila tutti i campi obbligatori.", "error");
        }

        const start = new Date(f.startDate);
        const end = new Date(f.endDate);

        if (end < start) {
            return showNotification("La data di fine deve essere successiva o uguale alla data di inizio.", "error");
        }

        try {
            const batch = writeBatch(db);
            const timeEntriesRef = collection(db, "time_entries");

            let current = new Date(start);
            let count = 0;

            while (current <= end) {
                const eventDate = new Date(current);
                eventDate.setHours(12, 0, 0, 0);

                const newDocRef = doc(timeEntriesRef); 

                const newEntry = {
                    employeeId: f.employeeId,
                    workAreaId: null,
                    clockInTime: Timestamp.fromDate(eventDate),
                    clockOutTime: Timestamp.fromDate(eventDate),
                    status: 'clocked-out',
                    isManual: true,
                    isAbsence: true,
                    absenceType: f.type,
                    note: f.note ? f.note : f.type,
                    pauses: []
                };

                batch.set(newDocRef, newEntry);

                current.setDate(current.getDate() + 1);
                count++;
            }

            await batch.commit();

            showNotification(`Inseriti ${count} giorni di "${f.type}" con successo!`, 'success');
            await onDataUpdate(); 
            setView('employees'); 

        } catch(err) {
            console.error("Errore salvataggio assenza:", err);
            showNotification("Errore durante il salvataggio: " + err.message, 'error');
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-4 mb-6 animate-fade-in">
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Inserisci Giustificativo / Assenza</h3>
            <form onSubmit={sub} className="space-y-4">
                {preselectedEmployee ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Dipendente</label>
                        <input disabled value={`${preselectedEmployee.name} ${preselectedEmployee.surname}`} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-gray-100 rounded-md shadow-sm sm:text-sm text-gray-500" />
                    </div>
                ) : (
                    renderField(f, handleChange, 'Dipendente', 'employeeId', 'select', [{value:'',label:'-- Seleziona --'}, ...allEmployees.map(e=>({value:e.id, label:e.name+' '+e.surname}))])
                )}

                <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700">Tipo di Assenza</label>
                    <select
                        id="type" name="type" value={f.type} onChange={handleChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                        {absenceTypes.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    {renderField(f, handleChange, 'Dal giorno', 'startDate', 'date')}
                    {renderField(f, handleChange, 'Al giorno (incluso)', 'endDate', 'date')}
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700">Note Aggiuntive (Opzionale)</label>
                    <textarea 
                        name="note" 
                        value={f.note} 
                        onChange={handleChange} 
                        placeholder="Es. Protocollo medico n. 123..."
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 sm:text-sm"
                        rows="3"
                    ></textarea>
                </div>

                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm text-blue-800">
                    ℹ️ Verrà creata una riga di assenza (0 ore) per <strong>ogni giorno</strong> dell'intervallo selezionato.
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={() => setView('employees')} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Annulla</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium">Salva Assenze</button>
                </div>
            </form>
        </div>
    );
};

// === COMPONENTE AGGIORNATO: MODALE MODIFICA TIMBRATURA ESISTENTE (CON CAMBIO DATA) ===
const EditTimeEntryModal = ({ entry, workAreas, onClose, onSave, isLoading }) => {
    
    const formatDateForInput = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('/'); 
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; 
        return dateStr;
    };

    const [skipPause, setSkipPause] = useState(!!entry.skippedBreak);

    const [formData, setFormData] = useState({
        workAreaId: entry.workAreaId || '',
        note: entry.note || '',
        date: formatDateForInput(entry.clockInDate), 
        clockInTime: entry.clockInTimeFormatted || '08:00',
        clockOutTime: entry.clockOutTimeFormatted !== 'In corso' ? entry.clockOutTimeFormatted : ''
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (skipPause && (!formData.note || formData.note.trim() === '')) {
            alert("ATTENZIONE: Se indichi che il dipendente NON ha effettuato la pausa, è OBBLIGATORIO inserire il motivo nelle note.");
            return;
        }

        onSave(entry.id, { ...formData, skippedBreak: skipPause });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl m-4">
                <h3 className="text-lg font-bold mb-4">Modifica Timbratura</h3>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data</label>
                        <input 
                            type="date" 
                            name="date" 
                            value={formData.date} 
                            onChange={handleChange} 
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" 
                        />
                    </div>

                    {!entry.isAbsence && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Area di Lavoro</label>
                            <select 
                                name="workAreaId" 
                                value={formData.workAreaId} 
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white"
                            >
                                {workAreas.map(area => (
                                    <option key={area.id} value={area.id}>{area.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {!entry.isAbsence && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Ora Entrata</label>
                                <input type="time" name="clockInTime" value={formData.clockInTime} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border rounded-md" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Ora Uscita</label>
                                <input type="time" name="clockOutTime" value={formData.clockOutTime} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border rounded-md" />
                                <p className="text-xs text-gray-500 mt-1">Lascia vuoto se in corso</p>
                            </div>
                        </div>
                    )}

                    {!entry.isAbsence && (
                        <div className="bg-orange-50 p-3 rounded-md border border-orange-200">
                            <div className="flex items-center">
                                <input
                                    id="skipPauseCheck"
                                    type="checkbox"
                                    checked={skipPause}
                                    onChange={(e) => setSkipPause(e.target.checked)}
                                    className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <label htmlFor="skipPauseCheck" className="ml-3 block text-sm font-bold text-gray-800">
                                    Non ha effettuato la pausa
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-8">
                                Se selezionato, le ore verranno calcolate per intero (senza detrazione). Motivo obbligatorio.
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Note / Motivo Modifica {skipPause && <span className="text-red-500">*</span>}
                        </label>
                        <textarea 
                            name="note" 
                            value={formData.note} 
                            onChange={handleChange} 
                            placeholder={skipPause ? "Inserire OBBLIGATORIAMENTE il motivo..." : "Opzionale"}
                            className={`mt-1 block w-full px-3 py-2 border rounded-md ${skipPause && !formData.note ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`} 
                            rows="2"
                        ></textarea>
                    </div>

                    <div className="flex justify-end space-x-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">Annulla</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
                            {isLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// =======================================================

const DashboardView = ({ totalEmployees, activeEmployeesDetails, totalDayHours, workAreas }) => {
    const [isMapMode, setIsMapMode] = useState(false);

    return (
        <div className="fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                    {isMapMode ? 'Mappa in Tempo Reale' : 'Dashboard'}
                </h1>
                
                <button
                    onClick={() => setIsMapMode(!isMapMode)}
                    className={`flex items-center gap-2 px-6 py-2 font-bold rounded-lg shadow-md transition-all transform hover:scale-105 ${
                        isMapMode 
                        ? 'bg-gray-600 text-white hover:bg-gray-700' 
                        : 'bg-blue-600 text-white hover:bg-blue-700' 
                    }`}
                >
                    {isMapMode ? (
                        <>🔙 Torna alla Lista</>
                    ) : (
                        <>🌍 Apri Mappa Presenze</>
                    )}
                </button>
            </div>
            
            {!isMapMode && (
                <>
                    <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                            <p className="text-sm text-gray-500">Dipendenti Attivi</p>
                            <p className="text-2xl font-bold text-gray-800">{activeEmployeesDetails.length} / {totalEmployees}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                            <p className="text-sm text-gray-500">Ore Lavorate Oggi (Totali)</p>
                            <p className="text-2xl font-bold text-gray-800">{totalDayHours}</p>
                        </div>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3">Chi è al Lavoro Ora</h2>
                    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                        {activeEmployeesDetails.length > 0 ? (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pausa</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {activeEmployeesDetails.map(entry => (
                                        <tr key={entry.id}>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.employeeName}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.areaName}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInTimeFormatted}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${entry.status === 'In Pausa' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{entry.status}</span>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                                 {entry.status === 'In Pausa' ? (
                                                     <span className="text-yellow-600 font-bold">In Corso</span>
                                                 ) : entry.hasCompletedPause ? (
                                                     <span className="text-green-600 font-bold">Eseguita</span>
                                                 ) : (
                                                     <span className="text-gray-400">-</span>
                                                 )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p className="p-4 text-sm text-gray-500">Nessun dipendente (tra quelli che gestisci) è attualmente al lavoro.</p>}
                    </div>
                </>
            )}

            {isMapMode && (
                <div className="bg-white p-2 rounded-lg shadow-lg h-[600px] flex flex-col animate-fade-in">
                    <p className="text-sm text-gray-500 mb-2 px-2">
                        Visualizzazione live dei cantieri attivi. Clicca sui pin per i dettagli.
                    </p>
                    <div style={{ flex: 1, minHeight: '500px' }}>
                        <MappaPresenze 
                            aree={workAreas} 
                            presenzeAttive={activeEmployeesDetails} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm, handleResetEmployeeDevice, adminEmployeeId, handleEmployeePauseClick, handleOpenManualEntry, handleOpenAbsenceEntry, handleOpenEditEmployee }) => { 
    const getSortIndicator = (key) => {
        if (!sortConfig || sortConfig.key !== key) return '';
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
            </div>
            <div className="mb-4">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cerca dipendente per nome o cognome..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('name')}>Nome{getSortIndicator('name')}</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree Assegnate</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {employees.map(emp => {
                            const isSelfClockIn = emp.id === adminEmployeeId;
                            const clockInType = isSelfClockIn ? 'manualClockIn' : 'adminClockIn'; 
                            const clockOutType = isSelfClockIn ? 'manualClockOut' : 'adminClockOut'; 

                            return ( 
                                <tr key={emp.id}>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{emp.name} {emp.surname}</div>
                                        <div className="text-xs text-gray-500 break-all">{emp.email}</div>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.activeEntry ? (emp.activeEntry.status === 'In Pausa' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800') : 'bg-red-100 text-red-800'}`}>
                                            {emp.activeEntry ? emp.activeEntry.status : 'Non al Lavoro'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{emp.workAreaNames?.join(', ') || 'Nessuna'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                        <div className="flex flex-col items-start gap-1">
                                            {emp.activeEntry ? (
                                                <>
                                                    <button
                                                        onClick={() => openModal(clockOutType, emp)}
                                                        disabled={emp.activeEntry.status === 'In Pausa'}
                                                        className={`px-2 py-1 text-xs text-white rounded-md w-full text-center ${
                                                            emp.activeEntry.status === 'In Pausa'
                                                            ? 'bg-gray-400 cursor-not-allowed'
                                                            : 'bg-yellow-500 hover:bg-yellow-600'
                                                        }`}
                                                    >
                                                        Timbra Uscita
                                                    </button>
                                                    <button
                                                        onClick={() => handleEmployeePauseClick(emp)} 
                                                        disabled={!emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end)}
                                                        className={`px-2 py-1 text-xs text-white rounded-md w-full text-center mt-1 ${
                                                            !emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end)
                                                            ? 'bg-gray-400 cursor-not-allowed'
                                                            : 'bg-orange-500 hover:bg-orange-600'
                                                        }`}
                                                    >
                                                        Applica Pausa
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => openModal(clockInType, emp)} className="px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center">Timbra Entrata</button>
                                            )}
                                            
                                            <div className="flex flex-col sm:flex-row gap-2 w-full justify-start mt-1 items-start sm:items-center">
                                                {currentUserRole === 'admin' && (
                                                    <>
                                                        <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap">Assegna Aree (Tutte)</button>
                                                        {/* PULSANTE MODIFICA AGGIORNATO */}
                                                        <button onClick={() => handleOpenEditEmployee(emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                                        <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                                    </>
                                                )}
                                                
                                                <div className="flex gap-2">
                                                    {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                                        <button onClick={() => openModal('resetDevice', emp)} disabled={emp.deviceIds?.length === 0} className="text-xs px-2 py-1 bg-yellow-500 text-gray-800 rounded-md hover:bg-yellow-600 whitespace-nowrap disabled:bg-gray-400 disabled:cursor-not-allowed">
                                                            Reset Device
                                                        </button>
                                                    )}
                                                </div>
                                                
                                                {currentUserRole === 'preposto' && (
                                                    <button onClick={() => openModal('assignEmployeeToPrepostoArea', emp)} className="text-xs text-blue-600 hover:text-blue-900 whitespace-nowrap">Gestisci Mie Aree</button>
                                                )}

                                                {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                                    <div className="flex flex-col gap-1 mt-1">
                                                        <button 
                                                            onClick={() => handleOpenManualEntry(emp)} 
                                                            className="text-xs px-2 py-1 bg-purple-500 text-white rounded-md hover:bg-purple-600 whitespace-nowrap"
                                                            title="Inserisci manualmente una timbratura dimenticata (es. ieri)"
                                                        >
                                                            ➕ Agg. Ore
                                                        </button>
                                                        <button 
                                                            onClick={() => handleOpenAbsenceEntry(emp)} 
                                                            className="text-xs px-2 py-1 bg-teal-600 text-white rounded-md hover:bg-teal-700 whitespace-nowrap"
                                                            title="Inserisci Ferie, Malattia, Permessi..."
                                                        >
                                                            🤒 Giustifica
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                 {employees.length === 0 && searchTerm === '' && currentUserRole === 'preposto' && (
                     <p className="p-4 text-sm text-gray-500">Nessun dipendente attualmente assegnato alle tue aree di gestione. Usa il pulsante "Aggiungi Dipendente..." per assegnarne.</p>
                 )}
                 {employees.length === 0 && searchTerm !== '' && (
                     <p className="p-4 text-sm text-gray-500">Nessun dipendente trovato per "{searchTerm}".</p>
                 )}
            </div>
        </div>
    );
};

const AreaManagementView = ({ workAreas, openModal, currentUserRole }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Aree di Lavoro</h1>
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome Area</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore Totali (nel report)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pausa (min)</th>
                        {currentUserRole === 'admin' && (
                            <>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lat</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lon</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raggio (m)</th>
                            </>
                        )}
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {workAreas.map(area => (
                        <tr key={area.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{area.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold">{area.totalHours ? `${area.totalHours}h` : 'N/D'}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-700">{area.pauseDuration || 0}</td>
                            {currentUserRole === 'admin' && (
                                <>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{area.latitude?.toFixed(4) || 'N/D'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{area.longitude?.toFixed(4) || 'N/D'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{area.radius || 'N/D'}</td>
                                </>
                            )}
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center gap-4">
                                    {currentUserRole === 'admin' ? (
                                        <button onClick={() => openModal('editArea', area)} className="text-green-600 hover:text-green-900">Modifica</button>
                                    ) : currentUserRole === 'preposto' ? (
                                        <button onClick={() => openModal('editAreaPauseOnly', area)} className="text-green-600 hover:text-green-900">Modifica Pausa</button>
                                    ) : null}
                                    
                                    {currentUserRole === 'admin' && <button onClick={() => openModal('deleteArea', area)} className="text-red-600 hover:text-red-900">Elimina</button>}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const AdminManagementView = ({ admins, openModal, user, superAdminEmail, currentUserRole, onDataUpdate }) => {
    
    if (currentUserRole !== 'admin') {
         return <div className="p-4 text-sm text-red-600 font-medium">Accesso negato. Solo gli amministratori hanno accesso a questa sezione.</div>;
    }

    const filteredAdmins = admins.filter(admin => admin.email !== superAdminEmail);

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Utenti Admin/Preposti</h1>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
                In questa lista sono inclusi tutti gli utenti con ruolo "admin" e "preposto".
            </p>

            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utente</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruolo</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree Gestite</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAdmins.map(admin => ( 
                            <tr key={admin.id}>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{admin.name} {admin.surname}</div>
                                    <div className="text-xs text-gray-500 break-all">{admin.email}</div>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold text-gray-700 capitalize">{admin.role}</td>
                                <td className="px-4 py-2 whitespace-normal text-sm text-gray-500">{admin.managedAreaNames?.join(', ') || 'Nessuna Area'}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        {currentUserRole === 'admin' && (
                                            <button 
                                                onClick={() => openModal('deleteAdmin', admin)} 
                                                className="px-2 py-1 text-xs text-white bg-red-500 rounded-md hover:bg-red-600 disabled:opacity-50"
                                                disabled={admin.email === user?.email} 
                                            >
                                                Elimina
                                            </button>
                                        )}
                                        {admin.role === 'preposto' && (
                                            <button 
                                                onClick={() => openModal('assignPrepostoAreas', admin)} 
                                                className="px-2 py-1 text-xs text-white bg-blue-500 rounded-md hover:bg-blue-600"
                                            >
                                                Assegna Aree
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredAdmins.length === 0 && (
                    <p className="p-4 text-sm text-gray-500">Nessun utente Admin/Preposto trovato (eccetto l'utente Super Admin corrente).</p>
                )}
            </div>
        </div>
    );
};

const ReportView = ({ reports, title, handleExportXml, dateRange, allWorkAreas, allEmployees, currentUserRole, userData, setDateRange, setReportAreaFilter, reportAreaFilter, reportEmployeeFilter, setReportEmployeeFilter, generateReport, isLoading, isActionLoading, managedEmployees, showNotification, handleReviewSkipBreak, onEditEntry }) => {
    
    const handleExportExcel = () => {
        if (typeof utils === 'undefined' || typeof writeFile === 'undefined') {
            showNotification("Libreria esportazione non caricata.", 'error'); return;
        }
        if (!reports || reports.length === 0) {
            showNotification("Nessun dato da esportare.", 'info'); return;
        }
        
        const dataToExport = reports.map(entry => ({
            'Dipendente': entry.employeeName, 
            'Area': entry.areaName, 
            'Data': entry.clockInDate,
            'Entrata': entry.clockInTimeFormatted, 
            'Uscita': entry.clockOutTimeFormatted,
            'Ore Lavorate (Netto)': entry.isAbsence ? 0 : ((entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso"),
            'Pausa Totale (Ore)': (entry.pauseHours !== null) ? parseFloat(entry.pauseHours.toFixed(2)) : 0,
            'Stato Pausa': entry.skippedBreak ? (entry.skipBreakStatus === 'approved' ? 'No Pausa (Approvato)' : 'Pausa Scalata (Default)') : 'Standard',
            'Motivo/Nota': entry.note
        }));
        
        const ws = utils.json_to_sheet(dataToExport);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Report Ore");
        
        ws['!cols'] = [
            { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, 
            { wch: 20 },
            { wch: 20 }, 
            { wch: 30 }
        ];
        
        writeFile(wb, `${(title || 'Report').replace(/ /g, '_')}.xlsx`);
        showNotification(`File Excel '${(title || 'Report').replace(/ /g, '_')}.xlsx' generato con successo.`, 'success');
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report Risultati'}</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleExportExcel} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta Excel</button>
                    <button onClick={() => handleExportXml(reports)} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-sm">Esporta XML</button>
                </div>
            </div>
            
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                {!reports || reports.length === 0 ? <p className="p-4 text-sm text-gray-500">Nessun dato per il periodo selezionato.</p> : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uscita</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato Pausa</th> 
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni / Note</th> 
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {reports.map((entry) => (
                                <tr key={entry.id} className={entry.isAbsence ? "bg-red-50" : ""}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.employeeName}{entry.createdBy && entry.employeeId && entry.createdBy !== entry.employeeId ? <span className="text-red-500 ml-1 font-bold">*</span> : ''}</td>
                                    
                                    {entry.isAbsence ? (
                                        <>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400 italic">N/A</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInDate}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-center" colSpan="2">
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-teal-100 text-teal-800">
                                                    {entry.statusLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-400">0.00</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">-</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 font-medium">
                                                <div className="flex flex-col gap-2">
                                                    <button 
                                                        onClick={() => onEditEntry(entry)} 
                                                        className="flex items-center text-blue-600 hover:text-blue-900 font-medium"
                                                        title="Modifica Giustificativo"
                                                    >
                                                        ✏️ Modifica
                                                    </button>
                                                    {entry.note}
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.areaName}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInDate}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInTimeFormatted}</td> 
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockOutTimeFormatted}</td> 
                                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-800">{entry.duration !== null ? entry.duration.toFixed(2) : '...'}</td>
                                            
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">
                                                {entry.skippedBreak ? (
                                                    entry.skipBreakStatus === 'pending' ? (
                                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800 animate-pulse">
                                                            ⚠️ In Attesa Verifica
                                                        </span>
                                                    ) : entry.skipBreakStatus === 'approved' ? (
                                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                            ✅ No Pausa (Approvato)
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                            ❌ Pausa Scalata
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-500 text-xs">Standard ({entry.pauseHours !== null ? entry.pauseHours.toFixed(2) : '0.00'}h)</span>
                                                )}
                                            </td>

                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                                <div className="flex flex-col gap-2">
                                                    <button 
                                                        onClick={() => onEditEntry(entry)}
                                                        className="flex items-center text-blue-600 hover:text-blue-900 font-medium"
                                                        title="Correggi timbratura (Area, Orari, Note)"
                                                    >
                                                        ✏️ Modifica
                                                    </button>

                                                    {entry.skippedBreak && entry.skipBreakStatus === 'pending' ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-xs italic text-gray-600">"{entry.note}"</span>
                                                            <div className="flex gap-2 mt-1">
                                                                <button 
                                                                    onClick={() => handleReviewSkipBreak(entry.id, 'approved')}
                                                                    disabled={isActionLoading}
                                                                    className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded"
                                                                >
                                                                    Approva
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleReviewSkipBreak(entry.id, 'rejected')}
                                                                    disabled={isActionLoading}
                                                                    className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded"
                                                                >
                                                                    Rifiuta
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span>{entry.note}</span>
                                                    )}
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const ActionHeader = ({ view, currentUserRole, handleSwitchView, isSuperAdmin }) => { 
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') return null;

    let button = null;
    let text = null;
    
    // Logica per determinare quale bottone mostrare basandosi sulla vista
    let targetView = view;
    if (view === 'newEmployeeForm' || view === 'prepostoAddEmployeeForm' || view === 'absenceEntryForm' || view === 'editEmployeeForm') targetView = 'employees';
    else if (view === 'newAreaForm') targetView = 'areas';
    else if (view === 'newAdminForm') targetView = 'admins';

    const isCurrentViewForm = ['newEmployeeForm', 'newAreaForm', 'newAdminForm', 'prepostoAddEmployeeForm', 'absenceEntryForm', 'editEmployeeForm'].includes(view);

    if (targetView === 'employees' && currentUserRole === 'admin') {
        text = 'Crea Nuovo Dipendente';
        button = (
            <button onClick={() => handleSwitchView('newEmployeeForm')} 
                className={`px-4 py-2 ${view === 'newEmployeeForm' ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-lg w-full sm:w-auto text-sm`}
                disabled={isCurrentViewForm && view !== 'newEmployeeForm'}
            >
                {text}
            </button>
        );
    } 
    else if (targetView === 'areas' && currentUserRole === 'admin') {
        text = 'Aggiungi Area';
        button = (
            <button onClick={() => handleSwitchView('newAreaForm')} 
                className={`px-4 py-2 ${view === 'newAreaForm' ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-lg w-full sm:w-auto text-sm`}
                disabled={isCurrentViewForm && view !== 'newAreaForm'}
            >
                {text}
            </button>
        );
    }
    else if (targetView === 'admins' && currentUserRole === 'admin') { 
        text = 'Crea Nuovo Admin/Preposto';
        button = (
            <button onClick={() => handleSwitchView('newAdminForm')} 
                className={`px-4 py-2 ${view === 'newAdminForm' ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-lg w-full sm:w-auto text-sm`}
                disabled={isCurrentViewForm && view !== 'newAdminForm'}
            >
                {text}
            </button>
        );
    }
    else if (targetView === 'employees' && currentUserRole === 'preposto') {
         text = 'Aggiungi Dipendente alle Mie Aree';
         button = (
            <button
                onClick={() => handleSwitchView('prepostoAddEmployeeForm')} 
                className={`px-4 py-2 ${view === 'prepostoAddEmployeeForm' ? 'bg-teal-300' : 'bg-teal-600 hover:bg-teal-700'} text-white rounded-lg w-full sm:w-auto text-sm`}
                disabled={isCurrentViewForm && view !== 'prepostoAddEmployeeForm'}
            >
                {text}
            </button>
        );
    }

    if (!button) return null;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-4 bg-gray-100">
            <div className="flex justify-end">
                {button}
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPALE ---
const AdminDashboard = ({ user, handleLogout, userData }) => {

    const [view, setView] = useState('dashboard');
    const [allEmployees, setAllEmployees] = useState([]); 
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [activeEmployeesDetails, setActiveEmployeesDetails] = useState([]);
    const [reports, setReports] = useState([]);
    const [reportTitle, setReportTitle] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isLoading, setIsLoading] = useState(false); 
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [reportAreaFilter, setReportAreaFilter] = useState('all');
    const [reportEmployeeFilter, setReportEmployeeFilter] = useState('all');
    const [adminEmployeeProfile, setAdminEmployeeProfile] = useState(null);
    const [adminActiveEntry, setAdminActiveEntry] = useState(null);
    const [totalDayHours, setTotalDayHours] = useState('0.00');
    const [workAreasWithHours, setWorkAreasWithHours] = useState([]);
    
    // === STATO NOTIFICHE PENDING ===
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0); 
    const [notification, setNotification] = useState(null); 
    
    // === STATI PER FORM E MODALI ===
    const [manualEntryEmployee, setManualEntryEmployee] = useState(null);
    const [absenceEmployee, setAbsenceEmployee] = useState(null); 
    const [entryToEdit, setEntryToEdit] = useState(null);
    const [employeeToEdit, setEmployeeToEdit] = useState(null);

    const currentUserRole = userData?.role;
    const superAdminEmail = SUPER_ADMIN_EMAIL; 

    // === FUNZIONE PULIZIA TOTALE (RESET) ===
    const resetAllForms = useCallback(() => {
        // Chiude eventuali modali
        setShowModal(false);
        setSelectedItem(null);
        setEntryToEdit(null);
        
        // Pulisce stati dei form "pagina intera"
        setManualEntryEmployee(null);
        setAbsenceEmployee(null);
        setEmployeeToEdit(null);
        
    }, []);

    // Wrapper per cambiare vista pulendo tutto
    const handleSwitchView = (newView) => {
        resetAllForms();
        setView(newView);
    };

    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4000); 
    }, []);

    const managedEmployees = useMemo(() => {
        if (currentUserRole === 'admin') return allEmployees;
        if (currentUserRole === 'preposto') {
            const managedAreaIds = userData?.managedAreaIds || []; 
            if (managedAreaIds.length === 0) return [];
            return allEmployees.filter(emp => emp.workAreaIds && emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId)));
        }
        return []; 
    }, [allEmployees, currentUserRole, userData]);

    const fetchData = useCallback(async () => {
        if (!user || !userData) { setIsLoading(false); return; }
        const role = userData?.role;
        if (role !== 'admin' && role !== 'preposto') { setIsLoading(false); return; }
        
        let isMounted = true; 
        setIsLoading(true);
        
        try {
            const [areasSnap, empsSnap] = await Promise.all([
                getDocs(collection(db, "work_areas")),
                getDocs(collection(db, "employees")) 
            ]);
            
            if (!isMounted) return;

            const allAreasList = areasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allEmployeesList = empsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setAllWorkAreas(allAreasList);
            setWorkAreasWithHours(allAreasList.map(a => ({...a, totalHours: 'N/D'})));
            setAllEmployees(allEmployeesList); 

            if (role === 'preposto' || (role === 'admin' && user.email !== superAdminEmail)) {
                 const q = query(collection(db, "employees"), where("userId", "==", user.uid));
                 const adminEmployeeSnapshot = await getDocs(q);
                 if (!isMounted) return; 
                 const profile = adminEmployeeSnapshot.empty ? null : { id: adminEmployeeSnapshot.docs[0].id, userId: user.uid, ...adminEmployeeSnapshot.docs[0].data() };
                 setAdminEmployeeProfile(profile);
            } else {
                 setAdminEmployeeProfile(null); 
            }

            if (role === 'admin') {
                const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
                const adminsSnapshot = await getDocs(qAdmins);
                if (!isMounted) return; 
                const adminUsers = adminsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || [];
                    return { id: doc.id, ...data, managedAreaNames };
                });
                setAdmins(adminUsers);
            } else {
                setAdmins([]); 
            }
        } catch (error) {
            console.error("Errore caricamento dati statici:", error);
            if (isMounted) showNotification("Errore caricamento dati iniziali. Controlla console.", 'error');
        } finally {
            if (isMounted) setIsLoading(false);
        }
        
        return () => { isMounted = false; };
    }, [user, userData, superAdminEmail, showNotification]);

    useEffect(() => {
        if (user && userData) fetchData();
    }, [user, userData, fetchData]); 

    // ... (Il resto delle funzioni di calcolo e listener rimane invariato) ...
    const sortedAndFilteredEmployees = useMemo(() => {
        const employeesWithDetails = managedEmployees.map(emp => ({
            ...emp,
            workAreaNames: (emp.workAreaIds || []).map(id => {
                const area = allWorkAreas.find(a => a.id === id);
                return area ? area.name : `ID Mancante: ${id.substring(0, 5)}...`; 
            }).filter(Boolean),
            activeEntry: activeEmployeesDetails.find(detail => detail.employeeId === emp.id) || null,
        }));
        
        let filterableItems = [...employeesWithDetails];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filterableItems = filterableItems.filter(emp => `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter));
        }
        
        if (sortConfig.key) {
             filterableItems.sort((a, b) => { 
                 let aValue = (sortConfig.key === 'name') ? `${a.name} ${a.surname}` : a[sortConfig.key];
                 let bValue = (sortConfig.key === 'name') ? `${b.name} ${b.surname}` : b[sortConfig.key];
                 if (aValue == null) aValue = ''; if (bValue == null) bValue = '';
                 aValue = String(aValue); bValue = String(bValue);
                 if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                 if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                 return 0;
             });
        }
        return filterableItems;
    }, [managedEmployees, activeEmployeesDetails, searchTerm, allWorkAreas, sortConfig]);

    const visibleWorkAreas = useMemo(() => {
        if (currentUserRole === 'admin') return workAreasWithHours;
        if (currentUserRole === 'preposto') {
            const managedAreaIds = userData?.managedAreaIds || [];
            return workAreasWithHours.filter(area => managedAreaIds.includes(area.id));
        }
        return [];
    }, [workAreasWithHours, currentUserRole, userData]);

    useEffect(() => {
        if (!allEmployees.length || !allWorkAreas.length) return;
        let isMounted = true; 
        const qActive = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!isMounted) return; 
            const activeEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (adminEmployeeProfile) {
                const adminEntry = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id);
                const hasCompletedPause = adminEntry?.pauses?.some(p => p.start && p.end) || false;
                setAdminActiveEntry(adminEntry ? { ...adminEntry, id: adminEntry.id, isOnBreak: adminEntry.pauses?.some(p => !p.end) || false, hasCompletedPause: hasCompletedPause } : null);
            }
            const details = activeEntriesList.filter(entry => entry.clockInTime).map(entry => {
                    const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                    const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                    const isOnBreak = entry.pauses?.some(p => !p.end) || false; 
                    const hasCompletedPause = entry.pauses?.some(p => p.start && p.end) || false; 
                    let clockInFormatted = 'N/D';
                    if (entry.clockInTime && typeof entry.clockInTime.toDate === 'function') {
                        try {
                           const clockInDate = entry.clockInTime.toDate();
                           clockInFormatted = new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'}).format(clockInDate);
                        } catch (e) { console.error("Errore formattazione ora entrata:", e); }
                    }
                    return { id: entry.id, employeeId: entry.employeeId, employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto', areaName: area ? area.name : 'Sconosciuta', workAreaId: entry.workAreaId, clockInTimeFormatted: clockInFormatted, status: isOnBreak ? 'In Pausa' : 'Al Lavoro', pauses: entry.pauses || [], hasCompletedPause: hasCompletedPause };
                }).filter(detail => {
                    if (currentUserRole === 'admin') return true; 
                    if (currentUserRole === 'preposto') {
                         const managedAreaIds = userData?.managedAreaIds || []; 
                         if (managedAreaIds.length === 0) return false; 
                        const employee = allEmployees.find(emp => emp.id === detail.employeeId);
                        return employee?.workAreaIds?.some(waId => managedAreaIds.includes(waId));
                    }
                    return false; 
                }).sort((a, b) => a.employeeName.localeCompare(b.employeeName)); 
            setActiveEmployeesDetails(details);
        }, (error) => { if (isMounted) { console.error("Errore listener timbratura attive:", error); showNotification("Errore aggiornamento presenze.", 'error'); } });

        const qPending = query(collection(db, "time_entries"), where("skipBreakStatus", "==", "pending"));
        const unsubscribePending = onSnapshot(qPending, (snapshot) => {
            if (!isMounted) return;
            const pendingDocs = snapshot.docs.map(doc => doc.data());
            let count = 0;
            if (currentUserRole === 'admin') count = pendingDocs.length;
            else if (currentUserRole === 'preposto') {
                const managedAreaIds = userData?.managedAreaIds || [];
                const myPending = pendingDocs.filter(d => managedAreaIds.includes(d.workAreaId));
                count = myPending.length;
            }
            setPendingRequestsCount(count);
        });
        return () => { isMounted = false; unsubscribeActive(); unsubscribePending(); };
    }, [allEmployees, allWorkAreas, adminEmployeeProfile, currentUserRole, userData, showNotification]);

    useEffect(() => {
        let isMounted = true; 
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!isMounted) return; 
            let totalMinutes = 0; const now = new Date();
            snapshot.docs.forEach(doc => {
                const entry = doc.data(); if (!entry.clockInTime) return;
                if (currentUserRole === 'preposto') {
                     const managedAreaIds = userData?.managedAreaIds || []; 
                     if (managedAreaIds.length === 0) return; 
                     const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                     if (!employee || !employee.workAreaIds?.some(waId => managedAreaIds.includes(waId))) return; 
                 }
                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : (entry.status === 'clocked-in' ? now : clockIn);
                const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                    if (p.start && p.end) {
                        const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                        const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                        return acc + (endMillis - startMillis);
                    } return acc;
                }, 0);
                const durationMs = (clockOut.getTime() - clockIn.getTime()) - pauseDurationMs;
                if (durationMs > 0) totalMinutes += (durationMs / 60000);
            });
            setTotalDayHours((totalMinutes / 60).toFixed(2));
        }, (error) => { if (isMounted) { console.error("Errore listener ore totali:", error); showNotification("Errore aggiornamento ore totali.", 'error'); } });
        return () => { isMounted = false; unsubscribe(); };
    }, [currentUserRole, userData, allEmployees, showNotification]);

    const handleAdminClockIn = useCallback(async (areaId, timestamp, note) => {
        if (!adminEmployeeProfile) return showNotification("Profilo dipendente non trovato.", 'error');
        console.log(`[AdminDashboard] Tentativo Timbratura ENTRATA manuale per ${adminEmployeeProfile.name}`);
    }, [adminEmployeeProfile, showNotification]);

    const handleAdminClockOut = useCallback(async (note) => { 
        if (!adminActiveEntry) return showNotification("Nessuna timbratura attiva trovata.", 'error');
        console.log(`[AdminDashboard] Tentativo Timbratura USCITA manuale per ${adminEmployeeProfile.name}`);
    }, [adminActiveEntry, adminEmployeeProfile, showNotification]);

    const handleAdminPause = useCallback(async () => {
        if (!adminEmployeeProfile) return showNotification("Profilo dipendente non trovato.", 'error');
        if (!adminActiveEntry) return showNotification("Nessuna timbratura attiva trovata.", 'error');
        if (adminActiveEntry.isOnBreak) {
            setIsActionLoading(true);
            try {
                const togglePauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'prepostoTogglePause');
                const result = await togglePauseFunction({ deviceId: 'ADMIN_MANUAL_ACTION' });
                showNotification(result.data.message, 'success'); 
            } catch (error) { const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message; showNotification(`Errore pausa: ${displayMessage || 'Errore Server.'}`, 'error'); console.error(error); }
            finally { setIsActionLoading(false); } return; 
        }
        if (adminActiveEntry.hasCompletedPause) return showNotification("Hai già completato la pausa automatica in questa sessione.", 'info');
        const workArea = allWorkAreas.find(area => area.id === adminActiveEntry.workAreaId);
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) return showNotification(`Nessuna pausa predefinita (>0 min) configurata per l'area "${workArea?.name || 'sconosciuta'}".`, 'info');
        const pauseDurationInMinutes = workArea.pauseDuration;
        if (!window.confirm(`Applicare la pausa predefinita di ${pauseDurationInMinutes} minuti per te stesso? L'azione è immediata e irreversibile.`)) return;
        setIsActionLoading(true);
        try {
            const applyPauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'applyAutoPauseEmployee');
            const result = await applyPauseFunction({ timeEntryId: adminActiveEntry.id, durationMinutes: pauseDurationInMinutes, deviceId: 'ADMIN_MANUAL_ACTION' });
            showNotification(result.data.message, 'success'); 
        } catch (error) { const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message; showNotification(`Errore pausa: ${displayMessage || 'Errore Server.'}`, 'error'); console.error(error); }
        finally { setIsActionLoading(false); }
    }, [adminActiveEntry, adminEmployeeProfile, allWorkAreas, showNotification]);

    const handleEmployeePauseClick = useCallback(async (employee) => {
        const timeEntryId = employee?.activeEntry?.id; 
        if (!timeEntryId) return showNotification("Errore: ID della timbratura attiva non trovato.", 'error');
        const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId);
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) return showNotification(`Nessuna pausa predefinita configurata per l'area "${workArea?.name || 'sconosciuta'}". Modifica l'area per aggiungerla.`, 'info');
        const pauseDurationInMinutes = workArea.pauseDuration;
        if (employee.activeEntry.hasCompletedPause) return showNotification(`La pausa predefinita di ${pauseDurationInMinutes} minuti è stata già completata per ${employee.name} in questa sessione.`, 'info');
        if (!window.confirm(`Applicare la pausa predefinita di ${pauseDurationInMinutes} minuti a ${employee.name} ${employee.surname}? L'azione è immediata e irreversibile.`)) return;
        setIsActionLoading(true);
        try {
            const applyPauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'applyAutoPauseEmployee');
            const result = await applyPauseFunction({ timeEntryId: timeEntryId, durationMinutes: pauseDurationInMinutes, deviceId: 'PREPOSTO_MANUAL_ACTION', employeeIdToUpdate: employee.id });
            showNotification(result.data.message, 'success');
        } catch (error) { console.error("Errore applicazione pausa (Server):", error); const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message; showNotification(`Errore applicazione pausa: ${displayMessage || 'Errore Server.'}`, 'error'); }
        finally { setIsActionLoading(false); }
    }, [allWorkAreas, showNotification]);

    // HANDLERS AGGIORNATI CON RESET
    const openModal = useCallback((type, item = null) => {
        // Resetta i form a pagina intera ma NON la vista, poiché il modale si sovrappone
        setManualEntryEmployee(null); setAbsenceEmployee(null); setEmployeeToEdit(null);
        
        // Imposta vista di base se necessario (es. torna a 'employees' se apri un modale dipendente)
        setView(type.includes('Employee') ? 'employees' : (type.includes('Area') ? 'areas' : 'admins'));
        
        setModalType(type);
        setSelectedItem(item);
        setShowModal(true);
    }, []);

    const handleOpenManualEntry = (employee) => {
        resetAllForms();
        setManualEntryEmployee(employee);
        setView('manualEntryForm');
    };

    const handleOpenAbsenceEntry = (employee) => {
        resetAllForms();
        setAbsenceEmployee(employee);
        setView('absenceEntryForm');
    };

    const handleOpenEditEmployee = (employee) => {
        resetAllForms();
        setEmployeeToEdit(employee);
        setView('editEmployeeForm');
    };

    const handleResetEmployeeDevice = useCallback(async (employee) => {
        if (!employee || !employee.id) return showNotification("Dipendente non valido.", 'error');
        if (!window.confirm(`Sei sicuro di resettare il dispositivo per ${employee.name} ${employee.surname}?`)) return;
        setIsActionLoading(true);
        try {
            const employeeRef = doc(db, "employees", employee.id);
            await updateDoc(employeeRef, { deviceIds: [] });
            showNotification(`Dispositivo resettato per ${employee.name} ${employee.surname}.`, 'success');
            await fetchData();
        } catch (error) { console.error("Errore reset dispositivo:", error); showNotification(`Errore reset dispositivo: ${error.message}`, 'error'); } finally { setIsActionLoading(false); }
    }, [fetchData, showNotification]);
    
    // ... (generateReport, handleReviewSkipBreak, handleSaveEntryEdit, handleExportXml rimangono uguali) ...
    const generateReport = useCallback(async () => {
        if (!dateRange.start || !dateRange.end) return showNotification("Seleziona date valide.", 'info');
        setIsLoading(true);
        let isMounted = true; 
        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const generateReportFunction = httpsCallable(functions, 'generateTimeReport');
            const result = await generateReportFunction({ startDate: dateRange.start, endDate: dateRange.end, employeeIdFilter: reportEmployeeFilter, areaIdFilter: reportAreaFilter });
            if (!isMounted) return; 
            const fetchedEntries = result.data.reports;
            const areaHoursMap = new Map(allWorkAreas.map(area => [area.id, 0]));
            const formatTime = (date, time) => { const finalTime = time === 'In corso' ? '99:99' : time; const formattedDate = date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'); return new Date(`${formattedDate} ${finalTime}`); };
            const reportData = fetchedEntries.map(entry => {
                const clockIn = entry.clockInTime ? new Date(entry.clockInTime) : null;
                const clockOut = entry.clockOutTime ? new Date(entry.clockOutTime) : null;
                if (!clockIn) return null; 
                const employee = allEmployees.find(e => e.id === entry.employeeId);
                const area = allWorkAreas.find(a => a.id === entry.workAreaId);
                if (!employee) return null; 
                let durationHours = null; let pauseDurationMinutes = 0; let pauseHours = 0; let clockInFormatted = 'N/D'; let clockOutFormatted = 'In corso';
                try {
                    clockInFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockIn);
                    if (clockOut) { clockOutFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockOut); }
                } catch (e) { console.error("Errore formattazione ora report:", e); }
                if (entry.isAbsence) {
                    return { id: entry.id, employeeName: `${employee.name} ${employee.surname}`, employeeId: entry.employeeId, areaName: "---", clockInDate: clockIn.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }), clockInTimeFormatted: "-", clockOutTimeFormatted: "-", duration: 0, pauseHours: 0, note: entry.note || entry.absenceType, statusLabel: entry.absenceType ? entry.absenceType.toUpperCase() : "ASSENZA", isAbsence: true, workAreaId: null };
                }
                if (clockOut) {
                    const totalMs = clockOut.getTime() - clockIn.getTime();
                    const recordedPausesMs = (entry.pauses || []).reduce((acc, p) => { const pauseStart = p.start ? new Date(p.start) : null; const pauseEnd = p.end ? new Date(p.end) : null; if (pauseStart && pauseEnd) { return acc + (pauseEnd.getTime() - pauseStart.getTime()); } return acc; }, 0);
                    const areaPauseMs = (area?.pauseDuration || 0) * 60000;
                    let finalPauseDeductionMs = recordedPausesMs;
                    if (entry.skippedBreak) { if (entry.skipBreakStatus === 'approved') { finalPauseDeductionMs = 0; } else { finalPauseDeductionMs = areaPauseMs; } } else { if (areaPauseMs > 0 && recordedPausesMs < areaPauseMs) { finalPauseDeductionMs = areaPauseMs; } }
                    pauseDurationMinutes = finalPauseDeductionMs / 60000; pauseHours = pauseDurationMinutes / 60; 
                    let calculatedDurationMs = totalMs > 0 ? (totalMs - finalPauseDeductionMs) : 0; if (calculatedDurationMs < 0) calculatedDurationMs = 0;
                    durationHours = calculatedDurationMs > 0 ? (calculatedDurationMs / 3600000) : 0; 
                    if (area) { areaHoursMap.set(area.id, (areaHoursMap.get(area.id) || 0) + durationHours); }
                }
                return { id: entry.id, employeeName: `${employee.name} ${employee.surname}`, employeeId: entry.employeeId, areaName: area ? area.name : 'Sconosciuta', clockInDate: clockIn.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }), clockInTimeFormatted: clockInFormatted, clockOutTimeFormatted: clockOutFormatted, duration: durationHours, pauseHours: pauseHours, note: entry.note || '', createdBy: entry.createdBy || null, skippedBreak: entry.skippedBreak, skipBreakStatus: entry.skipBreakStatus, skippedBreakReason: entry.skippedBreakReason, workAreaId: entry.workAreaId };
            }).filter(Boolean).sort((a, b) => { const dateA = formatTime(a.clockInDate, a.clockInTimeFormatted); const dateB = formatTime(b.clockInDate, b.clockOutTimeFormatted); if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) { if (a.clockInDate !== b.clockInDate) return a.clockInDate.localeCompare(b.clockInDate); return a.employeeName.localeCompare(b.employeeName); } if (dateA < dateB) return -1; if (dateA > dateB) return 1; return a.employeeName.localeCompare(b.employeeName); });
            setReports(reportData); setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`);
            const updatedAreas = allWorkAreas.map(area => ({ ...area, totalHours: (areaHoursMap.get(area.id) || 0).toFixed(2) }));
            setWorkAreasWithHours(updatedAreas);
            if(reportData.length > 0) setView('reports'); 
        } catch (error) { const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message; showNotification(`Errore generazione report: ${displayMessage || 'Errore Server.'}`, 'error'); console.error(error); }
        finally { if (isMounted) setIsLoading(false); }
        return () => { isMounted = false; };
    }, [dateRange, reportAreaFilter, reportEmployeeFilter, allEmployees, allWorkAreas, showNotification]);

    const handleReviewSkipBreak = useCallback(async (entryId, decision) => {
        if (!entryId || !decision) return;
        const confirmMsg = decision === 'approved' ? "Confermi che il dipendente NON ha fatto pausa? Verranno calcolate le ore piene." : "Rifiuti la richiesta? Verrà sottratta la pausa standard dell'area.";
        if (!window.confirm(confirmMsg)) return;
        setIsActionLoading(true);
        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const reviewFunction = httpsCallable(functions, 'reviewSkipBreakRequest');
            await reviewFunction({ timeEntryId: entryId, decision: decision, adminId: user.uid });
            showNotification(`Richiesta ${decision === 'approved' ? 'APPROVATA' : 'RIFIUTATA'} con successo.`, 'success');
            generateReport(); 
        } catch (error) { console.error("Errore revisione pausa:", error); showNotification("Errore durante l'aggiornamento della richiesta.", 'error'); } finally { setIsActionLoading(false); }
    }, [user, showNotification, generateReport]);

    const handleSaveEntryEdit = async (entryId, updatedData) => {
        setIsActionLoading(true);
        try {
            const entryRef = doc(db, "time_entries", entryId);
            const newClockInDate = new Date(`${updatedData.date}T${updatedData.clockInTime}:00`);
            let updatePayload = { workAreaId: updatedData.workAreaId, note: updatedData.note, clockInTime: Timestamp.fromDate(newClockInDate), skippedBreak: updatedData.skippedBreak, skipBreakStatus: updatedData.skippedBreak ? 'approved' : 'none' };
            if (updatedData.clockOutTime) {
                const newClockOutDate = new Date(`${updatedData.date}T${updatedData.clockOutTime}:00`);
                if (newClockOutDate <= newClockInDate) { throw new Error("L'ora di uscita deve essere successiva all'entrata."); }
                updatePayload.clockOutTime = Timestamp.fromDate(newClockOutDate); updatePayload.status = 'clocked-out'; 
            }
            updatePayload.lastModifiedBy = user.email; updatePayload.lastModifiedAt = Timestamp.now();
            await updateDoc(entryRef, updatePayload);
            showNotification("Timbratura (orari e stato pausa) aggiornata con successo!", "success");
            setEntryToEdit(null); generateReport(); 
        } catch (error) { console.error("Errore modifica:", error); showNotification("Errore: " + error.message, "error"); } finally { setIsActionLoading(false); }
    };

    const handleExportXml = useCallback((dataToExport) => {
        if (!dataToExport || dataToExport.length === 0) return showNotification("Nessun dato da esportare.", 'info'); 
        let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<ReportTimbrature>\n';
        dataToExport.forEach(entry => {
            xmlString += `  <Timbratura>\n`;
            xmlString += `    <Dipendente><![CDATA[${entry.employeeName || ''}]]></Dipendente>\n`;
            xmlString += `    <Area><![CDATA[${entry.areaName || ''}]]></Area>\n`;
            xmlString += `    <Data>${entry.clockInDate || ''}</Data>\n`;
            xmlString += `    <Entrata>${entry.clockInTimeFormatted}</Entrata>\n`; 
            xmlString += `    <Uscita>${entry.clockOutTimeFormatted}</Uscita>\n`; 
            xmlString += `    <OreNetto>${entry.duration ? entry.duration.toFixed(2) : 'N/A'}</OreNetto>\n`;
            xmlString += `    <PausaTotaleOre>${entry.pauseHours ? entry.pauseHours.toFixed(2) : '0.00'}</PausaTotaleOre>\n`; 
            xmlString += `    <StatoPausa>${entry.skippedBreak ? (entry.skipBreakStatus === 'approved' ? 'No Pausa (Approvato)' : 'Pausa Scalata (Default)') : 'Standard'}</StatoPausa>\n`;
            xmlString += `    <MotivoNota><![CDATA[${entry.note || ''}]]></MotivoNota>\n`; 
            xmlString += `  </Timbratura>\n`;
        });
        xmlString += '</ReportTimbrature>';
        try { const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" }); saveAs(blob, `${(reportTitle || 'Report').replace(/ /g, '_')}.xml`); showNotification(`File XML '${(reportTitle || 'Report').replace(/ /g, '_')}.xml' generato con successo.`, 'success'); } catch (error) { showNotification("Errore salvataggio XML.", 'error'); console.error(error); } 
    }, [reportTitle, showNotification]);
    
    const requestSort = useCallback((key) => {
        let direction = 'ascending';
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);
    
    // --- RENDER ---
    if (isLoading || !user || !userData) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Caricamento...</p></div>;
    }
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') {
       return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Accesso non autorizzato.</p></div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 w-full">
            {notification && <NotificationPopup message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Header */}
            <header className="bg-white shadow-md">
                 <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                     <CompanyLogo />
                     {adminEmployeeProfile && (
                         <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 text-center">
                             {adminActiveEntry ? (
                                 <div className="space-y-2">
                                     <div>
                                         <p className="text-sm font-semibold text-green-600">Sei al lavoro</p>
                                         {adminActiveEntry.isOnBreak && <p className="text-xs font-semibold text-yellow-600">In Pausa</p>}
                                     </div>
                                     <div className="flex gap-2 justify-center">
                                         <button onClick={handleAdminPause} 
                                            disabled={isActionLoading || (!adminActiveEntry.isOnBreak && adminActiveEntry.hasCompletedPause)} 
                                            className={`text-xs px-3 py-1 text-white rounded ${adminActiveEntry.isOnBreak ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} disabled:opacity-50`}
                                         >
                                              {adminActiveEntry.isOnBreak ? 'Termina Pausa' : 'Inizia Pausa'}
                                         </button>
                                         <button onClick={() => openModal('manualClockOut', adminEmployeeProfile)} disabled={adminActiveEntry.isOnBreak || isActionLoading} className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:opacity-50">
                                              Timbra Uscita
                                         </button>
                                     </div>
                                 </div>
                             ) : (
                                 <div>
                                     <p className="text-sm font-semibold text-red-600">Non sei al lavoro</p>
                                     <button onClick={() => openModal('manualClockIn', adminEmployeeProfile)} disabled={isActionLoading} className="mt-1 text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">Timbra Entrata</button>
                                 </div>
                             )}
                         </div>
                     )}
                     <div className="flex items-center space-x-4">
                         <span className="text-sm text-gray-600 text-right">
                             {currentUserRole === 'admin' ? 'Admin' : 'Preposto'}:<br/>
                             <span className="font-medium">{userData?.name && userData?.surname ? `${userData.name} ${userData.surname}` : user?.email}</span>
                         </span>
                         <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">Logout</button>
                     </div>
                 </div>
            </header>

            {/* Navigazione */}
            <nav className="bg-white border-b border-gray-200">
                 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                     <div className="flex justify-center">
                         <div className="flex flex-wrap justify-center py-2 sm:space-x-4">
                             <button onClick={() => handleSwitchView('dashboard')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'dashboard' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Dashboard</button>
                             <button onClick={() => handleSwitchView('employees')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'employees' || view === 'newEmployeeForm' || view === 'prepostoAddEmployeeForm' || view === 'absenceEntryForm' || view === 'editEmployeeForm' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Dipendenti</button>
                             <button onClick={() => handleSwitchView('areas')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'areas' || view === 'newAreaForm' || view === 'editAreaPauseOnly' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Aree</button>
                             {currentUserRole === 'admin' && <button onClick={() => handleSwitchView('admins')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'admins' || view === 'newAdminForm' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Admin</button>}
                             {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                <button 
                                    onClick={() => handleSwitchView('reports')} 
                                    className={`py-2 px-3 sm:border-b-2 text-sm font-medium flex items-center ${view === 'reports' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                                >
                                    Report Presenze
                                    {pendingRequestsCount > 0 && (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                            ⚠️ {pendingRequestsCount}
                                        </span>
                                    )}
                                </button>
                             )}
                         </div>
                     </div>
                 </div>
            </nav>

            <ActionHeader view={view} currentUserRole={currentUserRole} handleSwitchView={handleSwitchView} openModal={openModal} isSuperAdmin={user?.email === superAdminEmail} />

            {view === 'reports' && (
                <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                    <div className="bg-white shadow-md rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 text-center sm:text-left">Genera Report Personalizzato</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                            <div className="lg:col-span-1"><label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Da:</label><input type="date" id="startDate" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" /></div>
                            <div className="lg:col-span-1"><label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">A:</label><input type="date" id="endDate" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" /></div>
                            <div className="lg:col-span-1"><label htmlFor="areaFilter" className="block text-sm font-medium text-gray-700 mb-1">Area:</label><select id="areaFilter" value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white"><option value="all">Tutte le Aree</option>{(currentUserRole === 'admin' ? allWorkAreas : allWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id))).sort((a,b) => a.name.localeCompare(b.name)).map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select></div>
                            <div className="lg:col-span-1"><label htmlFor="employeeFilter" className="block text-sm font-medium text-gray-700 mb-1">Dipendente:</label><select id="employeeFilter" value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white"><option value="all">Tutti i Dipendenti</option>{(currentUserRole === 'admin' ? allEmployees : managedEmployees).sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (<option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>))}</select></div>
                            <div className="lg:col-span-1"><button onClick={generateReport} disabled={isLoading || isActionLoading} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm w-full disabled:opacity-50">Genera Report</button></div>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                {view === 'newEmployeeForm' && <NewEmployeeForm onDataUpdate={fetchData} user={user} setView={setView} showNotification={showNotification} />}
                
                {/* --- NUOVO: Form Modifica Dipendente (Pagina Intera) --- */}
                {view === 'editEmployeeForm' && <EditEmployeeForm 
                    employee={employeeToEdit}
                    onDataUpdate={fetchData} 
                    setView={setView} 
                    showNotification={showNotification} 
                />}
                
                {view === 'newAreaForm' && <NewAreaForm onDataUpdate={fetchData} setView={setView} showNotification={showNotification} />}
                {view === 'newAdminForm' && <NewAdminForm onDataUpdate={fetchData} user={user} setView={setView} showNotification={showNotification} />}
                {view === 'prepostoAddEmployeeForm' && <PrepostoAddEmployeeForm onDataUpdate={fetchData} user={user} setView={setView} showNotification={showNotification} workAreas={allWorkAreas} allEmployees={allEmployees} userData={userData} />}
                
                {view === 'manualEntryForm' && <ManualEntryForm 
                    onDataUpdate={fetchData} 
                    setView={setView} 
                    showNotification={showNotification} 
                    allEmployees={managedEmployees} 
                    allWorkAreas={currentUserRole === 'admin' ? allWorkAreas : allWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id))}
                    preselectedEmployee={manualEntryEmployee}
                />}

                {/* --- Vista Form Giustificativo --- */}
                {view === 'absenceEntryForm' && <AbsenceEntryForm 
                    onDataUpdate={fetchData} 
                    setView={setView} 
                    showNotification={showNotification} 
                    allEmployees={managedEmployees} 
                    preselectedEmployee={absenceEmployee}
                />}
                
                <main>
                    {view === 'dashboard' && <DashboardView 
                        totalEmployees={managedEmployees.length} 
                        activeEmployeesDetails={activeEmployeesDetails} 
                        totalDayHours={totalDayHours} 
                        workAreas={visibleWorkAreas} 
                    />}
                    
                    {view === 'employees' && <EmployeeManagementView 
                        employees={sortedAndFilteredEmployees} 
                        openModal={openModal} 
                        currentUserRole={currentUserRole} 
                        requestSort={requestSort} 
                        sortConfig={sortConfig} 
                        searchTerm={searchTerm} 
                        setSearchTerm={setSearchTerm} 
                        handleResetEmployeeDevice={handleResetEmployeeDevice} 
                        adminEmployeeId={adminEmployeeProfile?.id}
                        handleEmployeePauseClick={handleEmployeePauseClick} 
                        handleOpenManualEntry={handleOpenManualEntry}
                        handleOpenAbsenceEntry={handleOpenAbsenceEntry} 
                        handleOpenEditEmployee={handleOpenEditEmployee} 
                    />}
                    
                    {view === 'areas' && <AreaManagementView workAreas={visibleWorkAreas} openModal={openModal} currentUserRole={currentUserRole} />}
                    
                    {view === 'admins' && currentUserRole === 'admin' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} onDataUpdate={fetchData} />}
                    
                    {view === 'reports' && <ReportView 
                         reports={reports} 
                         title={reportTitle} 
                         handleExportXml={handleExportXml} 
                         dateRange={dateRange}
                         allWorkAreas={allWorkAreas}
                         allEmployees={allEmployees}
                         currentUserRole={currentUserRole}
                         userData={userData}
                         setDateRange={setDateRange}
                         setReportAreaFilter={setReportAreaFilter}
                         reportAreaFilter={reportAreaFilter}
                         reportEmployeeFilter={reportEmployeeFilter}
                         setReportEmployeeFilter={setReportEmployeeFilter}
                         generateReport={generateReport}
                         isLoading={isLoading}
                         isActionLoading={isActionLoading}
                         managedEmployees={managedEmployees}
                         showNotification={showNotification}
                         handleReviewSkipBreak={handleReviewSkipBreak} 
                         onEditEntry={(entry) => setEntryToEdit(entry)} 
                    />}
                </main>
            </div>
            
            <footer className="w-full bg-white border-t border-gray-200 py-3 mt-8">
                <p className="text-center text-xs text-gray-500">
                     &copy; {new Date().getFullYear()} TCS Italia S.r.l. Tutti i diritti riservati.
                </p>
            </footer>


            {/* Modale Modifica Timbratura */}
            {entryToEdit && (
                <EditTimeEntryModal 
                    entry={entryToEdit}
                    workAreas={allWorkAreas}
                    onClose={() => setEntryToEdit(null)}
                    onSave={handleSaveEntryEdit}
                    isLoading={isActionLoading}
                />
            )}

            {showModal && (
                 <AdminModal
                     type={modalType}
                     item={selectedItem}
                     setShowModal={setShowModal}
                     workAreas={allWorkAreas}
                     onDataUpdate={fetchData}
                     user={user}
                     superAdminEmail={superAdminEmail}
                     allEmployees={allEmployees}
                     currentUserRole={currentUserRole}
                     userData={userData} 
                     onAdminClockIn={handleAdminClockIn}
                     showNotification={showNotification} 
                 />
             )}
        </div>
    );
};

export default AdminDashboard;