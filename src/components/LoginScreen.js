// src/components/LoginScreen.js

import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import CompanyLogo from './CompanyLogo';

// ========================================================
// --- STILE MAGICO AGGIORNATO (ANTI-SBORDO MOBILE) ---
// ========================================================
const LoginStyles = () => (
    <style>
    {`
      /* Forza il calcolo corretto delle larghezze per tutti gli elementi */
      .login-bg *, .login-bg *::before, .login-bg *::after {
          box-sizing: border-box !important;
      }

      /* Sfondo con immagine e filtro blu scuro */
      .login-bg { 
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 58, 138, 0.95)), 
                      url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop') no-repeat center center;
          background-size: cover;
          min-height: 100vh; 
          display: flex; 
          flex-direction: column; 
          justify-content: center; 
          align-items: center; 
          font-family: 'Inter', -apple-system, sans-serif; 
          padding: 20px; /* Margine di sicurezza esterno */
          overflow-x: hidden; /* Evita scorrimenti orizzontali pazzi */
      }

      /* Il pannello "Effetto Vetro" (Glassmorphism) con larghezza massima garantita */
      .login-card { 
          background: rgba(255, 255, 255, 0.08); 
          backdrop-filter: blur(16px); 
          -webkit-backdrop-filter: blur(16px); 
          border: 1px solid rgba(255, 255, 255, 0.15); 
          width: 100%; 
          max-width: 400px; /* Leggermente più stretto per sicurezza */
          border-radius: 24px; 
          box-shadow: 0 10px 40px 0 rgba(0, 0, 0, 0.4); 
          padding: 40px 30px; 
          animation: fadeIn 0.8s ease-out; 
          box-sizing: border-box; /* Cruciale: include padding nel calcolo della larghezza */
      }

      /* Contenitore Logo */
      .logo-container { 
          display: flex; 
          justify-content: center; 
          margin-bottom: 30px; 
          animation: slideDown 0.6s ease-out;
          width: 100%;
      }
      .logo-pill {
          background: rgba(255, 255, 255, 0.95);
          padding: 12px 25px;
          border-radius: 16px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
          display: inline-block;
          max-width: 90%; /* Evita che il logo esca sui telefoni stretti */
          text-align: center;
      }
      .logo-pill img {
          max-width: 100%; /* Forza l'immagine a restringersi */
          height: auto;
      }

      .login-title { 
          font-size: 24px; 
          font-weight: 800; 
          color: #ffffff; 
          text-align: center; 
          margin-bottom: 24px; 
          letter-spacing: 0.5px;
      }
      
      .login-label { 
          display: block; 
          font-size: 11px; 
          font-weight: 700; 
          color: #a78bfa; /* Colore più acceso per leggibilità su vetro */
          margin-bottom: 6px; 
          text-transform: uppercase;
          letter-spacing: 1px;
          text-align: left;
      }
      
      /* Input trasparenti moderni */
      .login-input { 
          width: 100%; 
          padding: 12px 16px; 
          border-radius: 10px; 
          border: 1px solid rgba(255, 255, 255, 0.15); 
          background: rgba(0, 0, 0, 0.2); /* Sfondo scuro per contrasto input */
          color: #ffffff;
          font-size: 16px; 
          outline: none; 
          transition: all 0.3s ease; 
          margin-bottom: 18px; 
          box-sizing: border-box; 
      }
      .login-input::placeholder { color: rgba(255, 255, 255, 0.3); }
      .login-input:focus { 
          border-color: #60a5fa; 
          background: rgba(0, 0, 0, 0.3); 
          box-shadow: 0 0 0 3px rgba(96,165,250,0.2); 
      }
      
      /* Bottone Principale Glow */
      .login-btn { 
          width: 100%; 
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
          color: white; 
          border: none; 
          padding: 14px; 
          border-radius: 10px; 
          font-size: 15px; 
          font-weight: 700; 
          cursor: pointer; 
          transition: all 0.3s ease; 
          box-shadow: 0 4px 12px rgba(37,99,235,0.3); 
          margin-top: 5px; 
          text-transform: uppercase;
          letter-spacing: 1px;
          box-sizing: border-box;
      }
      .login-btn:hover:not(:disabled) { 
          transform: translateY(-1px); 
          box-shadow: 0 6px 20px rgba(37,99,235,0.5); 
      }
      .login-btn:disabled { 
          background: rgba(255,255,255,0.1) !important; 
          color: rgba(255,255,255,0.3) !important; 
          cursor: not-allowed; 
          box-shadow: none; 
          transform: none;
      }
      
      .forgot-btn { 
          background: none; 
          border: none; 
          color: #93c5fd; 
          font-size: 12px; 
          font-weight: 600; 
          cursor: pointer; 
          padding: 0; 
          transition: 0.2s; 
          display: block; 
          margin-left: auto; 
          margin-top: -10px; 
          margin-bottom: 20px; 
          text-align: right;
      }
      .forgot-btn:hover { color: #ffffff; text-decoration: underline; }
      
      .login-footer { 
          margin-top: 30px; 
          text-align: center; 
          color: rgba(255,255,255,0.4); 
          font-size: 11px; 
          font-weight: 500; 
          letter-spacing: 0.5px;
          width: 100%;
      }
      
      /* Allarmi Trasparenti */
      .alert-error { 
          background: rgba(239, 68, 68, 0.2); 
          color: #fca5a5; 
          padding: 12px; 
          border-radius: 10px; 
          font-size: 13px; 
          font-weight: 600; 
          text-align: center; 
          border: 1px solid rgba(239, 68, 68, 0.4); 
          margin-bottom: 18px; 
          box-sizing: border-box;
      }
      .alert-success { 
          background: rgba(16, 185, 129, 0.2); 
          border: 1px solid rgba(16, 185, 129, 0.4); 
          padding: 14px; 
          border-radius: 10px; 
          margin-bottom: 18px; 
          text-align: center; 
          color: white;
          box-sizing: border-box;
      }
      .alert-spam-box {
          background: rgba(0,0,0,0.3);
          padding: 8px;
          border-radius: 6px;
          margin-top: 8px;
          border: 1px solid rgba(255,255,255,0.1);
      }

      @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }

      /* --- OTTIMIZZAZIONI AGGIUNTIVE PER SCHERMI PICCOLISSIMI --- */
      @media (max-width: 360px) {
          .login-card {
              padding: 25px 20px;
              border-radius: 16px;
          }
          .login-title {
              font-size: 20px;
          }
          .login-input, .login-btn {
              font-size: 14px;
              padding: 10px;
          }
      }
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
            console.error("ERRORE LOGIN:", err.code); 

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
                case 'auth/too-many-requests':
                    setError('Troppi tentativi falliti. Riprova tra qualche minuto.');
                    break;
                default:
                    setError(`Errore di accesso. Verifica i dati.`);
                    break;
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePasswordReset = async () => {
        setError('');
        setSuccessMessage('');
        
        if (!email || !email.includes('@')) {
            setError('Inserisci la tua email aziendale corretta per il recupero.');
            return;
        }
        
        try {
            setIsLoading(true);
            await sendPasswordResetEmail(auth, email);
            setSuccessMessage('Email di recupero inviata!'); 
        } catch (err) {
            setError('Impossibile inviare l\'email. Verifica l\'indirizzo.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-bg">
            <LoginStyles />
            
            <div className="logo-container">
                <div className="logo-pill">
                    <CompanyLogo /> 
                </div>
            </div>

            <div className="login-card">
                <h2 className="login-title">Accesso Marcatempo</h2>
                
                <form onSubmit={handleLogin} autoomplete="on">
                    <div>
                        <label htmlFor="email" className="login-label">Email</label>
                        <input 
                            id="email" 
                            type="email" 
                            name="email"
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                            className="login-input" 
                            placeholder="es. m.rossi@tcsitalia.com"
                            autoComplete="email"
                        />
                    </div>
                    
                    <div>
                        <label htmlFor="password" className="login-label">Password</label>
                        <input 
                            id="password" 
                            type="password" 
                            name="password"
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                            className="login-input" 
                            placeholder="••••••••"
                            autoComplete="current-password"
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
                    
                    {/* MESSAGGIO SUCCESSO */}
                    {successMessage && (
                        <div className="alert-success">
                            <p style={{ margin: '0 0 5px 0', fontSize: '14px', fontWeight: 'bold' }}>✅ {successMessage}</p>
                            <div className="alert-spam-box">
                                <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
                                    ⚠️ <b>Controlla anche la cartella SPAM</b> se non ricevi nulla entro pochi minuti!
                                </p>
                            </div>
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isLoading} 
                        className="login-btn"
                    >
                        {isLoading ? 'Attendere...' : '👉 Accedi al Sistema'}
                    </button>
                </form>
            </div>
             
            <div className="login-footer">
                <div style={{ marginBottom: '3px' }}>Creata by D. Leoncino</div>
                &copy; {new Date().getFullYear()} TCS Italia S.r.l. - Tutti i diritti riservati.
            </div>
        </div>
    );
};

export default LoginScreen;