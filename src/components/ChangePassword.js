// src/components/ChangePassword.js

import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import CompanyLogo from './CompanyLogo';

const ChangePassword = ({ onPasswordChanged }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('Le password non coincidono.');
            return;
        }
        if (newPassword.length < 6) {
            setError('La nuova password deve essere di almeno 6 caratteri.');
            return;
        }

        setIsLoading(true);
        setError('');

        const user = auth.currentUser;
        if (!user) {
            setError('Utente non trovato. Effettua nuovamente il login.');
            setIsLoading(false);
            return;
        }

        try {
            // 1. Aggiorna la password in Firebase Authentication
            await updatePassword(user, newPassword);

            // 2. Aggiorna il flag nel documento utente su Firestore
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                requiresPasswordChange: false
            });

            // 3. Comunica al componente App che il cambio è avvenuto
            onPasswordChanged();

        } catch (err) {
            console.error(err);
            setError('Si è verificato un errore. Riprova.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 p-4">
            <div className="w-full max-w-sm bg-white p-8 rounded-lg shadow-md">
                <div className="mb-6 text-center">
                    <CompanyLogo />
                    <h2 className="mt-4 text-2xl font-bold text-gray-800">Crea una nuova password</h2>
                    <p className="text-sm text-gray-600 mt-2">Per la tua sicurezza, imposta una password personale per il tuo primo accesso.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="newPassword">Nuova Password</label>
                        <input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                        />
                    </div>
                    <div>
                        <label htmlFor="confirmPassword">Conferma Nuova Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                        />
                    </div>
                    {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                    <div>
                        <button type="submit" disabled={isLoading} className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-300">
                            {isLoading ? 'Salvataggio...' : 'Salva e Continua'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePassword;