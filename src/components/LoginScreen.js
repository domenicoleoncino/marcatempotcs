// src/components/LoginScreen.js

import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import CompanyLogo from './CompanyLogo';

// ===========================================
// --- STILE MAGICO (CSS INIETTATO) ---
// ===========================================
const LoginStyles = () => (
    <style>
    {`
      .login-bg { background-color: #f4f7fe; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: 'Inter', -apple-system, sans-serif; padding: 20px; }
      .login-card { background: #ffffff; width: 100%; max-width: 420px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); padding: 40px 30px; border: 1px solid #e2e8f0; animation: fadeIn 0.5s ease-out; }
      .login-title { font-size: 24px; font-weight: 800; color: #0f172a; text-align: center; margin-bottom: 24px; }
      .login-label { display: block; font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 8px; }
      .login-input { width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 15px; outline: none; transition: 0.2s; margin-bottom: 20px; box-sizing: border-box; }
      .login-input:focus { border-color: #3b82f6; background: #ffffff; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
      .login-btn { width: 100%; background: #2563eb; color: white; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 12px rgba(37,99,235,0.2); margin-top: 10px; }
      .login-btn:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37,99,235,0.3); }
      .login-btn:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }
      .forgot-btn { background: none; border: none; color: #3b82f6; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; transition: 0.2s; display: block; margin-left: auto; margin-top: -10px; margin-bottom: 20px; }
      .forgot-btn:hover { color: #1d4ed8; text-decoration: underline; }
      .login-footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; font-weight: 600; }
      .alert-error { background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px; font-size: 13px; font-weight: 600; text-align: center; border: 1px solid #fecaca; margin-bottom: 20px; }
      .alert-success { background: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
      .logo-container { display: flex; justify-content: center; margin-bottom: 30px; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
    `}
    </style>
);

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            console.error("ERRORE DETTAGLIATO DA FIREBASE:", err); 

            switch (err.code) {
                case 'auth/user-not-found':
                    setError('Nessun utente trovato con questa email.');
                    break;
                case 'auth/wrong-password':
                    setError('Password errata. Riprova.');
                    break;
                case 'auth/invalid-credential':
                    setError('Credenziali non valide (email o password errata).');
                    break;
                default:
                    setError(`Errore imprevisto: ${err.code}`);
                    break;
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePasswordReset = async () => {
        setError('');
        setSuccessMessage('');
        
        if (!email) {
            setError('Inserisci la tua email nel campo sopra per il recupero password.');
            return;
        }
        
        try {
            await new Promise(resolve => setTimeout(resolve, 500)); 
            await sendPasswordResetEmail(auth, email);
            
            // Messaggio semplice qui, il dettaglio SPAM è nel render sotto
            setSuccessMessage('Email di recupero inviata!'); 
        } catch (err) {
            setError('Impossibile inviare l\'email. Verifica che l\'indirizzo sia corretto.');
        }
    };

    return (
        <div className="login-bg">
            <LoginStyles />
            
            <div className="logo-container">
                <CompanyLogo /> 
            </div>

            <div className="login-card">
                <h2 className="login-title">Accesso Marcatempo</h2>
                
                <form onSubmit={handleLogin}>
                    <div>
                        <label htmlFor="email" className="login-label">Email</label>
                        <input 
                            id="email" 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                            className="login-input" 
                            placeholder="nome.cognome@tcsitalia.com"
                        />
                    </div>
                    
                    <div>
                        <label htmlFor="password" className="login-label">Password</label>
                        <input 
                            id="password" 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                            className="login-input" 
                            placeholder="Min. 6 caratteri"
                        />
                    </div>
                    
                    <button 
                        type="button" 
                        onClick={handlePasswordReset} 
                        className="forgot-btn"
                        disabled={isLoading}
                    >
                        ❓ Password dimenticata?
                    </button>

                    {/* MESSAGGIO ERRORE */}
                    {error && <div className="alert-error">{error}</div>}
                    
                    {/* MESSAGGIO SUCCESSO CON AVVISO SPAM */}
                    {successMessage && (
                        <div className="alert-success">
                            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#047857', fontWeight: 'bold' }}>✅ {successMessage}</p>
                            <div style={{ backgroundColor: '#d1fae5', padding: '10px', borderRadius: '6px', border: '1px solid #6ee7b7' }}>
                                <p style={{ margin: 0, fontSize: '12px', color: '#065f46' }}>
                                    ⚠️ <b>ATTENZIONE:</b> Se non la trovi, controlla la cartella <b>SPAM</b> o <b>Posta Indesiderata</b>!
                                </p>
                            </div>
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isLoading} 
                        className="login-btn"
                    >
                        {isLoading ? 'Accesso in corso...' : '👉 Accedi'}
                    </button>
                </form>
            </div>
             
            <div className="login-footer">
                <div style={{ marginBottom: '5px' }}>Created by D. Leoncino</div>
                &copy; {new Date().getFullYear()} TCS Italia S.r.l. Tutti i diritti riservati.
            </div>
        </div>
    );
};

export default LoginScreen;