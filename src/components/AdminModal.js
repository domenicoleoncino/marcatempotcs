import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
    doc, setDoc, collection, addDoc, updateDoc, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, superAdminEmail, user, allEmployees }) => {
    const [formData, setFormData] = useState(item ? { ...item } : {});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const isSuperAdmin = user.email === superAdminEmail;

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
        if (type === 'manualClockIn' || type === 'manualClockOut') {
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '', note: item?.activeEntry?.note || '' });
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((type === 'newEmployee' || type === 'newAdmin') && formData.password && formData.password.length < 6) {
            setError("La password deve essere di almeno 6 caratteri.");
            return;
        }
        if (type === 'deleteAdmin' && item.id === user.uid) {
            setError("Non puoi eliminare te stesso.");
            return;
        }
        if (type === 'newAdmin' && !isSuperAdmin) {
            formData.role = 'preposto';
        }

        setIsLoading(true);
        setError('');
        try {
            switch (type) {
                case 'newEmployee':
                    const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", userCred.user.uid), { email: formData.email, role: 'employee', name: formData.name, surname: formData.surname });
                    await addDoc(collection(db, "employees"), { userId: userCred.user.uid, name: formData.name, surname: formData.surname, phone: formData.phone, email: formData.email, workAreaIds: [], workAreaNames: [], deviceIds: [] });
                    break;
                case 'editEmployee':
                    await updateDoc(doc(db, "employees", item.id), { name: formData.name, surname: formData.surname, phone: formData.phone });
                    break;
                case 'deleteEmployee':
                    await deleteDoc(doc(db, "employees", item.id));
                    break;
                case 'newArea':
                    await addDoc(collection(db, "work_areas"), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
                    break;
                case 'editArea':
                    await updateDoc(doc(db, "work_areas", item.id), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
                    break;
                case 'deleteArea':
                    const batchDeleteArea = writeBatch(db);
                    const employeesToUpdate = allEmployees.filter(emp => emp.workAreaIds?.includes(item.id));
                    employeesToUpdate.forEach(emp => {
                        const empRef = doc(db, "employees", emp.id);
                        const updatedAreaIds = emp.workAreaIds.filter(id => id !== item.id);
                        const updatedAreaNames = emp.workAreaNames.filter(name => name !== item.name);
                        batchDeleteArea.update(empRef, { workAreaIds: updatedAreaIds, workAreaNames: updatedAreaNames });
                    });
                    await batchDeleteArea.commit();
                    await deleteDoc(doc(db, "work_areas", item.id));
                    break;
                case 'assignArea':
                    const selectedAreaNames = workAreas.filter(area => formData.workAreaIds?.includes(area.id)).map(area => area.name);
                    await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.workAreaIds || [], workAreaNames: selectedAreaNames });
                    break;
                case 'newAdmin':
                    const adminCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", adminCred.user.uid), { name: formData.name, surname: formData.surname, email: formData.email, role: formData.role, managedAreaIds: formData.role === 'preposto' ? [] : null, managedAreaNames: formData.role === 'preposto' ? [] : null });
                    break;
                case 'deleteAdmin':
                    if (item.email === superAdminEmail) { throw new Error("Non puoi eliminare il Super Admin."); }
                    await deleteDoc(doc(db, "users", item.id)); 
                    break;
                case 'assignManagedAreas':
                    const selectedManagedAreaNames = workAreas.filter(area => formData.managedAreaIds?.includes(area.id)).map(area => area.name);
                    await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.managedAreaIds || [], managedAreaNames: selectedManagedAreaNames });
                    break;
                case 'manualClockIn':
                    await addDoc(collection(db, "time_entries"), { employeeId: item.id, workAreaId: formData.workAreaId, clockInTime: new Date(formData.timestamp), clockOutTime: null, status: 'clocked-in', note: formData.note || null, pauses: [] });
                    break;
                case 'manualClockOut':
                    await updateDoc(doc(db, "time_entries", item.activeEntry.id), { clockOutTime: new Date(formData.timestamp), status: 'clocked-out', note: formData.note || item.activeEntry.note || null });
                    break;
                case 'resetDevice':
                    const employeeRef = doc(db, "employees", item.id);
                    await updateDoc(employeeRef, { deviceIds: [] });
                    break;
                default: break;
            }
            await onDataUpdate();
            setShowModal(false);
        } catch (err) {
            setError(err.message);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const renderForm = () => {
        // ... (Il JSX per tutti i tipi di modale va qui)
        return <div>Form for {type}</div>;
    };
    
    const primaryButtonClass = () => {
        if (type.startsWith('delete')) return 'bg-red-600 hover:bg-red-700 disabled:bg-red-300';
        if (type === 'resetDevice') return 'bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-300';
        return 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300';
    }
    const primaryButtonText = () => {
        if (type.startsWith('delete')) return 'Elimina';
        if (type === 'resetDevice') return 'Resetta';
        return 'Salva';
    }

    return (
        <div className="fixed z-10 inset-0 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true"><div className="absolute inset-0 bg-gray-500 opacity-75"></div></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">​</span>
                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <form onSubmit={handleSubmit}>
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            {renderForm()}
                            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button type="submit" disabled={isLoading} className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none sm:ml-3 sm:w-auto sm:text-sm ${primaryButtonClass()}`}>
                                {isLoading ? 'In corso...' : primaryButtonText()}
                            </button>
                            <button type="button" onClick={() => setShowModal(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm">Annulla</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AdminModal;

