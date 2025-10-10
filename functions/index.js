const { onRequest } = require("firebase-functions/v2/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

// Inizializza l'app di Firebase Admin
admin.initializeApp();
const db = admin.firestore();

/**
 * Funzione HTTP v2 (onRequest) per creare un nuovo utente (Admin/Preposto).
 * La gestione CORS è integrata nell'opzione { cors: true }.
 */
exports.createNewUser = onRequest({ cors: true }, async (req, res) => {
    // Controlla che il metodo sia POST
    if (req.method !== 'POST') {
        res.status(405).send({ error: 'Method Not Allowed' });
        return;
    }

    try {
        // NUOVI CAMPI: riceve nome, cognome, e telefono (opzionale)
        const { email, password, nome, cognome, role, telefono } = req.body;

        // NUOVA VALIDAZIONE: controlla i nuovi campi obbligatori
        if (!email || !password || !nome || !cognome || !role) {
            logger.error("Dati mancanti nella richiesta", req.body);
            res.status(400).send({ error: "Tutti i campi obbligatori (nome, cognome, email, password, ruolo) devono essere forniti." });
            return;
        }
        
        const displayName = `${nome} ${cognome}`;

        // 1. Crea l'utente in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName,
        });

        logger.info(`Utente creato in Authentication con UID: ${userRecord.uid}`);

        // 2. Imposta i custom claims per definire il ruolo
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });
        
        // Prepara i dati da salvare in Firestore
        const userData = {
            nome: nome,
            cognome: cognome,
            email: email,
            role: role,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Aggiunge il telefono solo se è stato fornito
        if (telefono) {
            userData.telefono = telefono;
        }

        // 3. Salva le informazioni aggiuntive in Firestore
        await db.collection("users").doc(userRecord.uid).set(userData);

        logger.info(`Dati utente salvati in Firestore per UID: ${userRecord.uid}`);
        
        // 4. Invia una risposta di successo
        res.status(200).send({ success: true, message: `Utente ${displayName} creato con successo.`, uid: userRecord.uid });

    } catch (error) {
        logger.error("Errore durante la creazione dell'utente:", error);
        if (error.code === 'auth/email-already-exists') {
            res.status(409).send({ error: "L'indirizzo email è già in uso." });
        } else {
            res.status(500).send({ error: "Errore interno del server durante la creazione dell'utente." });
        }
    }
});


// --- Le tue altre funzioni (onCall v2) per la timbratura ---
// Assicurati di mantenere la tua logica originale qui.

exports.clockEmployeeIn = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Devi essere autenticato per timbrare.");
    }
    // ... INSERISCI QUI LA TUA LOGICA PER LA TIMBRATURA DI ENTRATA ...
    logger.info(`Timbratura IN per ${request.auth.uid}`);
    return { success: true, message: "Timbratura di entrata registrata con successo!" };
});

exports.clockEmployeeOut = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    // ... INSERISCI QUI LA TUA LOGICA PER LA TIMBRATURA DI USCITA ...
    logger.info(`Timbratura OUT per ${request.auth.uid}`);
    return { success: true, message: "Timbratura di uscita registrata con successo!" };
});

exports.clockEmployeePause = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    // ... INSERISCI QUI LA TUA LOGICA PER LA PAUSA ...
    logger.info(`Pausa per ${request.auth.uid}`);
    return { success: true, message: "Pausa registrata!" };
});

