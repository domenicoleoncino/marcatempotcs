import React, { useState } from 'react';
import { updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
// Questo import ora funziona perché `firebase.js` è in `src/`
import { db } from '../firebase';

const ChangePassword = ({ user, onPasswordChanged }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        if (newPassword.length < 6) {
            setError("La nuova password deve essere di almeno 6 caratteri.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Le password non coincidono.");
            return;
        }

        setIsLoading(true);
        try {
            // 1. Cambia la password in Firebase Authentication
            await updatePassword(user, newPassword);
            console.log("Password aggiornata in Firebase Auth per:", user.uid);

            // 2. Aggiorna il flag in Firestore per non chiederlo più
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                mustChangePassword: false
            });
            console.log("Flag 'mustChangePassword' impostato a false in Firestore.");

            setSuccess(true); 
            // Chiama la callback per aggiornare lo stato e mostrare la dashboard
            setTimeout(() => {
                onPasswordChanged();
            }, 2000); 

        } catch (error) {
            console.error("Errore durante l'aggiornamento della password:", error);
            setError(`Errore durante l'aggiornamento: ${error.message}`);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Cambio Password Obbligatorio</h2>
                <p className="text-sm text-gray-600 mb-4 text-center">
                    Per motivi di sicurezza, devi impostare una nuova password personale al tuo primo accesso.
                </p>

                {success ? (
                    <div className="text-center text-green-600 font-medium">
                        Password aggiornata con successo! Verrai reindirizzato alla tua dashboard...
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="newPassword">
                                Nuova Password
                            </label>
                            <input
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                id="newPassword"
                                type="password"
                                placeholder="Minimo 6 caratteri"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="confirmPassword">
                                Conferma Nuova Password
                            </label>
                            <input
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                                id="confirmPassword"
                                type="password"
                                placeholder="Ripeti la password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}

                        <div className="flex items-center justify-between">
                            <button
                                className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                type="submit"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Aggiornamento...' : 'Imposta Nuova Password'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ChangePassword;
